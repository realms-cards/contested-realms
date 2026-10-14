"use client";

import { useEffect, useMemo, useState } from "react";
import type { CardPickItem } from "@/components/game/CpuCardPick";
import { actionHint, actionPaths, narrow, pathAreas } from "@/lib/engine-mode/actionPaths";
import { auraFootprints } from "@/lib/engine-mode/areaPrompt";
import { cardRefFor } from "@/lib/engine-mode/cardIndex";
import { engineCellKey, type ViewerSeat } from "@/lib/engine-mode/coords";
import { seatKey } from "@/lib/engine-mode/projection";
import { useEngineSession } from "@/lib/engine-mode/session";
import { useCpuBoardPicker } from "@/lib/game/cpu/boardPicker";
import { handToken } from "@/lib/game/cpu/pickTokens";
import { canCast, getCard } from "@sorcery/shared";
import type { Action, GameState as EngineState, PlayerId } from "@sorcery/shared";

const REQUEST_PREFIX = "engine:";

/** One card of the hand we are playing for the opponent (Courtesan Thaïs). */
export interface PilotHandCard {
  cardId: string;
  name: string;
  /** the card's `hand:p2:<id>` pick token; starts an action only when `playable` */
  token: string;
  /** the engine offers at least one legal action that starts with this card */
  playable: boolean;
  /** why it can't be played right now (for a tooltip), when it can't */
  reason: string | null;
}

/**
 * The WHOLE hand of the seat we are piloting, in hand order: the cards the engine's legal moves
 * start from are playable through their existing hand tokens, every other card is listed too —
 * with the engine's own reason when it has one — so the pilot sees what they are working with,
 * not just the three cards that happen to be castable.
 */
export function pilotHandCards(
  game: EngineState,
  seat: PlayerId,
  startTokens: ReadonlySet<string>,
  viewer: ViewerSeat = 0,
): PilotHandCard[] {
  // The same key actionPaths builds hand tokens with — if these two disagree, `startTokens`
  // never matches and every card in the piloted hand reads as unplayable.
  const key = seatKey(seat, viewer);
  const player = game.players[seat];
  if (!player) return [];
  const avatar = game.units[player.avatarUnitId];
  return player.hand.map((cardId) => {
    const name = game.cards[cardId]?.name ?? "Card";
    const token = handToken(key, cardId);
    const playable = startTokens.has(token);
    return { cardId, name, token, playable, reason: playable ? null : unplayableReason(game, seat, cardId, name, avatar?.id, avatar?.tapped) };
  });
}

/** The piloted hand as pick rows: playable cards by their hand token, the rest inert with the reason. */
export function pilotPickItems(cards: readonly PilotHandCard[]): CardPickItem[] {
  return cards.map((c) => ({
    id: c.token,
    card: cardRefFor(c.name),
    disabled: !c.playable,
    reason: c.reason ?? undefined,
    badge: c.playable ? undefined : "Not now",
  }));
}

function unplayableReason(
  game: EngineState,
  seat: PlayerId,
  cardId: string,
  name: string,
  avatarId: string | undefined,
  avatarTapped: boolean | undefined,
): string {
  let type = "";
  try {
    type = getCard(name)?.type ?? "";
  } catch {
    type = "";
  }
  if (type === "Site") return avatarTapped ? "Their avatar has already acted this turn." : "There is nowhere to play this site right now.";
  if (game.phase !== "main" || game.prompts.length) return "Not while something else is being decided.";
  if (avatarId) {
    try {
      const check = canCast(game, seat, cardId, avatarId);
      if (!check.ok && check.reason) return check.reason;
    } catch {
      // a reason is a courtesy; fall through to the general one
    }
  }
  return "No legal way to play it right now.";
}

export interface EngineInteraction {
  /** true while the board is offering main-phase choices */
  active: boolean;
  /** a source or target has been clicked: Cancel backs out */
  picking: boolean;
  /** the clicks so far pick an action, but more choices are possible: Confirm takes it as is */
  confirmable: Action | null;
  /** legal actions without a board click (End turn, Draw a spell…) */
  endTurn: Action | null;
  /** cards castable from the cemetery right now (driven by the HUD's cemetery panel) */
  cemetery: { token: string; cardId: string; name: string }[];
  /** the opponent's PLAYABLE hand cards, while we are playing their turn for them (Courtesan Thaïs) */
  pilotHand: { token: string; cardId: string; name: string }[];
  /** the opponent's WHOLE hand while we play their turn, playable or not (empty otherwise) */
  pilotFullHand: PilotHandCard[];
  /** start a path from a non-board token (a cemetery card) */
  begin: (token: string) => void;
  cancel: () => void;
  confirm: () => void;
}

/**
 * Drives the board picker from the engine's legal actions: the first click picks a source
 * (hand card, unit, site, atlas), each later click narrows the legal list, and the action
 * dispatches once one remains. Only the engine's own legal moves are ever offered.
 */
export function useEngineInteraction(): EngineInteraction {
  const game = useEngineSession((s) => s.game);
  const rev = useEngineSession((s) => s.rev);
  const legal = useEngineSession((s) => s.legal);
  const decisionSeat = useEngineSession((s) => s.decisionSeat);
  // the seat this client plays: every token below is a square on ITS side of the table
  const viewer = useEngineSession((s) => s.seat);
  const dispatch = useEngineSession((s) => s.dispatch);
  const [clicked, setClicked] = useState<string[]>([]);

  useEffect(() => setClicked([]), [rev]);

  const { paths, labels } = useMemo(
    () => (game && legal ? actionPaths(game, legal, decisionSeat ?? viewer, viewer) : { paths: [], labels: {} }),
    // the engine mutates `game` in place; `rev` marks each new state
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [game, legal, rev, decisionSeat, viewer],
  );
  const narrowed = useMemo(() => narrow(paths, clicked), [paths, clicked]);
  const cemetery = useMemo(() => {
    if (!game) return [];
    const seen = new Map<string, { token: string; cardId: string; name: string }>();
    for (const path of paths) {
      const first = path.steps[0];
      if (!first?.startsWith("cem:")) continue;
      const cardId = first.slice(4);
      if (!seen.has(cardId)) seen.set(cardId, { token: first, cardId, name: game.cards[cardId]?.name ?? "Card" });
    }
    return [...seen.values()];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paths, game, rev]);
  /**
   * The hand we are playing when it is not our own (Courtesan Thaïs).
   *
   * Hand3D only draws seat p1's cards, so a path that starts `hand:p2:<id>` has no renderer
   * and could never be clicked. Surfaced as a panel instead, exactly like the cemetery.
   */
  const pilotHand = useMemo(() => {
    if (!game) return [];
    const seen = new Map<string, { token: string; cardId: string; name: string }>();
    for (const path of paths) {
      const first = path.steps[0];
      if (!first?.startsWith("hand:p2:")) continue;
      const cardId = first.slice("hand:p2:".length);
      if (!seen.has(cardId)) seen.set(cardId, { token: first, cardId, name: game.cards[cardId]?.name ?? "Card" });
    }
    return [...seen.values()];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paths, game, rev]);
  const pilotFullHand = useMemo(() => {
    if (!game || decisionSeat === null || decisionSeat === viewer) return [];
    const starts = new Set<string>();
    for (const path of paths) if (path.steps[0]) starts.add(path.steps[0]);
    return pilotHandCards(game, decisionSeat, starts, viewer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paths, game, rev, decisionSeat, viewer]);
  const active = legal !== null && paths.length > 0;
  const request = `${REQUEST_PREFIX}${rev}:${narrowed.prefix.join(">")}`;

  // Publish the next choices to the board picker.
  useEffect(() => {
    const picker = useCpuBoardPicker.getState();
    if (!active) {
      // only withdraw our own choices; prompts and the mulligan configure the picker themselves
      if (picker.request.startsWith(REQUEST_PREFIX)) picker.clear(picker.request);
      return;
    }
    const chosen = narrowed.prefix.filter((t) => !t.startsWith("opt:"));
    useEngineSession.getState().revealTokens(narrowed.next);
    picker.configure(request, narrowed.next);
    // a hand card's second pick is its caster: light both as sources, the rest as chosen targets
    const sourceCount = chosen[0]?.startsWith("hand:") ? 2 : 1;
    picker.setGlow(request, chosen.slice(sourceCount), chosen.slice(0, sourceCount));
    // Every clickable token gets a hover label saying what the click will do. `labels` already
    // carries the text of anchored option buttons; anything else is described from the action
    // the token leads to, so a highlighted tile or card can explain itself.
    const nextLabels: Record<string, string> = {};
    for (const token of narrowed.next) {
      if (labels[token]) {
        nextLabels[token] = labels[token];
        continue;
      }
      if (!game) continue;
      const leadsTo = narrowed.matching.filter((path) => path.steps[narrowed.prefix.length] === token);
      if (!leadsTo.length) continue;
      const hints = new Set<string>(leadsTo.map((path) => actionHint(game, path.action)));
      nextLabels[token] = hints.size === 1 ? [...hints][0] : `${hints.size} actions here`;
    }
    picker.setLabels(request, nextLabels);
    // Once a choice has been started, what is lit is the NEXT STEP of it, not a fresh option.
    // The board colours and paces those differently so a half-finished action is obvious.
    picker.setSequence(request, narrowed.prefix.length > 0);
    // An aura covers a 2x2 of sites and is anchored on the crossing between them. Hand the
    // board those footprints and the candidate squares become markers on the crossings, each
    // lighting exactly the sites it would cover as the pointer passes over it.
    //
    // Only once the square is the step actually being asked for. Before that — while the aura
    // is merely sitting in hand, castable — every one of its anchors is still in `matching`,
    // and publishing those covered the whole board in crossings before the player had chosen
    // anything at all.
    const placingAura = narrowed.matching
      .filter((path) => {
        const next = path.steps[narrowed.prefix.length];
        const action = path.action;
        return (
          !!next &&
          action.t === "castSpell" &&
          !!action.at &&
          next === engineCellKey(action.at.x, action.at.y, viewer)
        );
      })
      .map((path) => path.action);
    // A multi-square unit's move is keyed on its new footprint's cell; the footprint itself
    // lights up the same way an aura's does. Both are board cells, so both need the viewer —
    // pathAreas reads cells actionPaths already computed for this seat.
    picker.setAreas(request, {
      ...(game && placingAura.length ? auraFootprints(game, placingAura, viewer) : {}),
      ...pathAreas(narrowed.matching, narrowed.prefix.length),
    });
    // `game` is mutated in place by the engine, so `rev` — carried inside `request` — is what
    // marks a real change; the identity of `game` never does.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, request, narrowed, labels, viewer]);

  // A board click extends the prefix.
  useEffect(
    () =>
      useCpuBoardPicker.subscribe((state, prev) => {
        if (!state.selected || state.selected === prev.selected || state.request !== request) return;
        setClicked([...narrowed.prefix, state.selected]);
      }),
    [request, narrowed.prefix],
  );

  // A fully picked action goes straight to the engine.
  useEffect(() => {
    if (narrowed.done && narrowed.next.length === 0 && narrowed.prefix.length > 0) {
      const result = dispatch(narrowed.done);
      if (!result.ok) setClicked([]);
    }
  }, [narrowed, dispatch]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setClicked([]);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(
    () => () => {
      const picker = useCpuBoardPicker.getState();
      if (picker.request.startsWith(REQUEST_PREFIX)) picker.clear(picker.request);
    },
    [],
  );

  return {
    active,
    picking: narrowed.prefix.length > 0,
    confirmable: narrowed.next.length > 0 ? narrowed.done : null,
    endTurn: legal?.find((a) => a.t === "endTurn") ?? null,
    cemetery,
    pilotHand,
    pilotFullHand,
    // only a token some legal action starts from (an inert pilot-hand card does nothing)
    begin: (token) => {
      if (paths.some((path) => path.steps[0] === token)) setClicked([token]);
    },
    cancel: () => setClicked([]),
    confirm: () => {
      if (narrowed.done) dispatch(narrowed.done);
    },
  };
}
