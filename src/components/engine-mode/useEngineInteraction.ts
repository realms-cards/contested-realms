"use client";

import { useEffect, useMemo, useState } from "react";
import { actionPaths, narrow } from "@/lib/engine-mode/actionPaths";
import { useEngineSession } from "@/lib/engine-mode/session";
import { useCpuBoardPicker } from "@/lib/game/cpu/boardPicker";
import type { Action } from "@sorcery/shared";

const REQUEST_PREFIX = "engine:";

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
  /** the opponent's hand, while we are playing their turn for them (Courtesan Thaïs) */
  pilotHand: { token: string; cardId: string; name: string }[];
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
  const dispatch = useEngineSession((s) => s.dispatch);
  const [clicked, setClicked] = useState<string[]>([]);

  useEffect(() => setClicked([]), [rev]);

  const { paths, labels } = useMemo(
    () => (game && legal ? actionPaths(game, legal, decisionSeat ?? 0) : { paths: [], labels: {} }),
    // the engine mutates `game` in place; `rev` marks each new state
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [game, legal, rev, decisionSeat],
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
    const nextLabels: Record<string, string> = {};
    for (const token of narrowed.next) if (labels[token]) nextLabels[token] = labels[token];
    picker.setLabels(request, nextLabels);
  }, [active, request, narrowed, labels]);

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
    begin: (token) => setClicked([token]),
    cancel: () => setClicked([]),
    confirm: () => {
      if (narrowed.done) dispatch(narrowed.done);
    },
  };
}
