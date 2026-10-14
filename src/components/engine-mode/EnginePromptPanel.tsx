"use client";

import { Icon } from "@iconify/react";
import dynamic from "next/dynamic";
import Image from "next/image";
import { useCallback, useEffect, useMemo, useState } from "react";
import CpuCardPick from "@/components/game/CpuCardPick";
import { cardImage } from "@/components/game/CpuPlayReveal";
import { RcButton } from "@/components/ui/rc-button";
import { tokenForEngineId } from "@/lib/engine-mode/actionPaths";
import { areaFootprints, edgeFootprints, edgeToken, type EngineEdge, permutationPlacements, swapSlots } from "@/lib/engine-mode/areaPrompt";
import { cardRefFor } from "@/lib/engine-mode/cardIndex";
import {
  BOARD_DIRECTION,
  boardArrowForStep,
  engineCellKey,
  type EngineDirection,
  engineToBoard,
  localizeEngineText,
} from "@/lib/engine-mode/coords";
import { HUMAN_SEAT, useEngineSession } from "@/lib/engine-mode/session";
import { useCpuBoardPicker } from "@/lib/game/cpu/boardPicker";
import type { ArrowDirection } from "@/lib/game/cpu/fieldTargets";
import { dirToken, handToken, pileToken } from "@/lib/game/cpu/pickTokens";
import { useGameStore } from "@/lib/game/store";
import type { Action, GameState as EngineState, Prompt } from "@sorcery/shared";
import { actingSeatFor, allCards, GRID_H, GRID_W } from "@sorcery/shared";
import { botAction } from "@untested-realm/bot/bot";
import { Compass, directionKey, PromptBanner, PromptDialog } from "./EnginePromptShell";
import { pickNoun, pickPlace } from "./promptNoun";

/** Harbinger's portal setup rolls D20s on a WebGL canvas: loaded only when it is on screen, so
 *  the phone 2D view does not carry three / R3F for a screen most matches never show. */
const EnginePortalScreen = dynamic(() => import("./EnginePortalScreen"), { ssr: false });

/** Prompt data shapes, per PromptKind (see the engine's pushPrompt callers). */
export interface PromptData {
  options?: string[];
  ids?: string[];
  candidates?: string[];
  count?: number;
  upTo?: boolean;
  power?: number;
  strikerId?: string;
  squares?: { x: number; y: number }[];
  /**
   * The squares are the ANCHORS of a two-by-two area, not the squares themselves — the engine
   * sets this for Earthquake, Corpse Explosion, Whirlwind, Scatter/Displace's aura shoves, a
   * 2x2 aura's placement and an oversized minion's summon.
   */
  area2x2?: boolean;
  /**
   * The choice is between BORDERS, not squares, and `squares` is absent entirely: a Wall aura
   * sits on a border and both Scatter and Displace shove one. Answered with the border's `key`.
   */
  edgeSelect?: boolean;
  edges?: EngineEdge[];
  /** sitePermutation: the area's squares that may actually move (an immovable site is a fixed point) */
  movable?: { x: number; y: number }[];
  /** sitePermutation: what currently stands on each square of the area */
  cells?: { x: number; y: number; name: string | null; movable: boolean }[];
  cards?: string[];
  pick?: number;
  skipLabel?: string;
  names?: string[];
  /** a card the prompt shows the player (chooseOption) */
  reveal?: string;
  /** what the candidates are: "unit" | "site" | "artifact" — names them in the hint */
  kind?: string;
  /** nameCard: the list is the player's collection, so say so */
  fromCollection?: boolean;
  /**
   * Direction prompts only. The engine attaches these to ANY all-cardinal chooseOption
   * (effects.ts `ask`, "GENERALIZED direction-picker preview") precisely so the client can
   * draw the lanes on the board: `from` is the origin square and `dirs` each direction's
   * reachable squares, origin first, stopping at the void or a projectile-blocking site.
   */
  from?: { x: number; y: number };
  dirs?: Partial<Record<EngineDirection, { x: number; y: number }[]>>;
}

/** One direction the player can send the effect, resolved into board space. */
interface Lane {
  /** the engine's own option string — what we must answer with */
  option: string;
  dir: EngineDirection;
  arrow: ArrowDirection;
  token: string;
  /** squares the effect would cover, origin excluded, in board cell keys */
  path: string[];
}

/**
 * Turn a direction prompt into board lanes, or null when the engine gave us no origin
 * (it only attaches `from`/`dirs` when every option is a bare n/s/e/w, so Windblast's
 * "north/south/east/west" wording and the 'hold fire' sets fall back to the compass).
 */
function lanesFor(data: PromptData, options: string[]): { origin: string; lanes: Lane[] } | null {
  const from = data.from;
  if (!from || typeof from.x !== "number") return null;
  const origin = engineCellKey(from.x, from.y);
  const lanes: Lane[] = [];
  for (const option of options) {
    const dir = directionKey(option) as EngineDirection | null;
    if (!dir) continue;
    const squares = data.dirs?.[dir] ?? [];
    // Prefer the arrow the lane actually walks: it survives any rotation mistake. A lane the
    // engine cut short (blocked, or the origin itself is void) has no second square, so fall
    // back to the rotation table; an edge-wrapped lane jumps, so only a unit step counts.
    const head = squares[1] ? engineToBoard(squares[1].x, squares[1].y) : null;
    const base = engineToBoard(from.x, from.y);
    const stepped = head ? boardArrowForStep(head.x - base.x, head.y - base.y) : null;
    const arrow = stepped ?? BOARD_DIRECTION[dir];
    lanes.push({
      option,
      dir,
      arrow,
      token: dirToken(origin, arrow),
      path: squares.slice(1).map((sq) => engineCellKey(sq.x, sq.y)),
    });
  }
  return lanes.length ? { origin, lanes } : null;
}

/** An engine option that names a board square, e.g. Chaos Twister's "lands at b3". */
interface SquareOption {
  option: string;
  at: string;
}

/**
 * Square-naming options, resolved to board cells.
 *
 * The engine writes squares with `squareLabel(x, y)` → "b3" (0-based letter, 1-based number).
 * Chaos Twister's determiner prompt is the worst case: twenty-one options, "lands at a1"
 * through "lands at e4" plus "flies off the board", which we were rendering as a wall of
 * text buttons. Anything that names squares belongs on the board instead.
 */
function squareOptionsFor(options: string[]): SquareOption[] {
  const out: SquareOption[] = [];
  for (const option of options) {
    const match = /\b([a-e])([1-4])\b/.exec(option);
    if (!match) continue;
    const x = match[1].charCodeAt(0) - 97;
    const y = Number(match[2]) - 1;
    if (x < 0 || x >= GRID_W || y < 0 || y >= GRID_H) continue;
    out.push({ option, at: engineCellKey(x, y) });
  }
  return out;
}

/**
 * A choice between squares, answered by clicking the board. Options the engine offered that
 * name no square (Chaos Twister's "flies off the board") stay as buttons in the banner.
 */
function SquarePick({
  prompt,
  options,
  squares,
  onSend,
}: {
  prompt: Prompt;
  options: string[];
  squares: SquareOption[];
  onSend: (choice: unknown) => void;
}) {
  const onPick = useMemo(
    () => (token: string) => {
      const hit = squares.find((candidate) => candidate.at === token);
      if (hit) onSend(hit.option);
    },
    [squares, onSend],
  );
  useBoardPick(`engine-prompt:${prompt.id}`, squares.map((sq) => sq.at), [], onPick);
  const extras = options.filter((option) => !squares.some((sq) => sq.option === option));
  return (
    <PromptBanner title={prompt.title} hint="Click the square on the board." counter={`${squares.length} squares`}>
      {extras.map((option) => (
        <RcButton key={option} variant="outline" size="sm" onClick={() => onSend(option)}>
          {localizeEngineText(option)}
        </RcButton>
      ))}
    </PromptBanner>
  );
}

/**
 * A projectile's direction, asked on the board instead of in a popup: four arrows around the
 * source square, and hovering one lights the squares that direction would actually reach.
 * Non-direction options in the same prompt ("hold fire", "stay") stay as buttons in the banner,
 * which is also the only way to decline.
 */
function DirectionPick({
  prompt,
  options,
  board,
  onSend,
}: {
  prompt: Prompt;
  options: string[];
  board: { origin: string; lanes: Lane[] };
  onSend: (choice: unknown) => void;
}) {
  const hovered = useCpuBoardPicker((picker) => picker.hovered);
  const byToken = useMemo(() => new Map(board.lanes.map((lane) => [lane.token, lane])), [board.lanes]);
  const onPick = useMemo(
    () => (token: string) => {
      const lane = board.lanes.find((candidate) => candidate.token === token);
      if (lane) onSend(lane.option);
    },
    [board.lanes, onSend],
  );
  // the hovered lane lights up; nothing hovered keeps the board quiet rather than lighting all four
  const preview = hovered ? (byToken.get(hovered)?.path ?? []) : [];
  const labels = useMemo(() => {
    const out: Record<string, string> = {};
    for (const lane of board.lanes) {
      out[lane.token] = lane.path.length
        ? `${lane.path.length} ${lane.path.length === 1 ? "square" : "squares"}`
        : "blocked";
    }
    return out;
  }, [board.lanes]);
  useBoardPick(
    `engine-prompt:${prompt.id}:${hovered ?? ""}`,
    board.lanes.map((lane) => lane.token),
    [board.origin, ...preview],
    onPick,
    labels,
  );
  // anything the engine offered that is not a direction is a way out — keep it in the banner
  const extras = options.filter((option) => !directionKey(option));
  const hoveredLane = hovered ? byToken.get(hovered) : undefined;
  return (
    <PromptBanner
      title={prompt.title}
      hint={
        hoveredLane
          ? hoveredLane.path.length
            ? `Reaches ${hoveredLane.path.length} ${hoveredLane.path.length === 1 ? "square" : "squares"}.`
            : "That way is blocked."
          : "Click an arrow on the board to aim."
      }
      counter={`tile ${tileNumberOf(board.origin)}`}
    >
      {extras.map((option) => (
        <RcButton key={option} variant="outline" size="sm" onClick={() => onSend(option)}>
          {localizeEngineText(option)}
        </RcButton>
      ))}
    </PromptBanner>
  );
}

/**
 * The card an engine continuation is carrying, when its prompt is about one.
 *
 * `viewFor` deliberately passes a prompt's `cont`/`ctx` to the addressed player, so a
 * placement step like Imperial Road's "Play it where?" can say WHICH site it means. Without
 * it that step is an anonymous one-line bar arriving straight after two full dialogs, which is
 * easy to miss entirely — and missing it looks exactly like the card refusing to leave your
 * hand.
 */
function promptCtxCard(game: EngineState, prompt: Prompt): string | null {
  const ctx = (prompt as { ctx?: { cardId?: unknown } }).ctx;
  const cardId = typeof ctx?.cardId === "string" ? ctx.cardId : null;
  return cardId ? (game.cards[cardId]?.name ?? null) : null;
}

/** Our 1–20 tile number for a board cell key. */
function tileNumberOf(cellKey: string): number {
  const [x, y] = cellKey.split(",").map(Number);
  return y * 5 + x + 1;
}

/** The engine's prompts and the mulligan, answered on the board where possible. */
/**
 * Which pre-game surface to show, and in what order.
 *
 * A prompt OUTRANKS the mulligan banner. The engine refuses every action while a prompt is
 * open — `game.ts` answers "Waiting for …" until the queue drains — and avatar `onSetup`
 * hooks run inside `createGame` (setup.ts:117-119). The Dragonlord pushes a `nameCard` there,
 * so showing the mulligan first left the player holding two buttons the engine would never
 * accept, with no way to reach the prompt. The computer cannot break the tie either: the
 * prompt belongs to seat 0, so `botNeedsToAct` is false for it. That stranded the match.
 */
export function preGameSurface(
  game: EngineState,
  portalsRevealed: boolean,
): "portal" | "prompt" | "mulligan" | "none" {
  const prompt = game.prompts[0];
  const mine = !!prompt && actingSeatFor(game, prompt.player) === HUMAN_SEAT;
  if (game.phase === "mulligan" && !portalsRevealed) return "portal";
  if (mine) return "prompt";
  if (game.phase === "mulligan" && !game.players[HUMAN_SEAT].keptHand) return "mulligan";
  return prompt ? "none" : "none";
}

export default function EnginePromptPanel() {
  const game = useEngineSession((s) => s.game);
  const rev = useEngineSession((s) => s.rev);
  const portalsRevealed = useEngineSession((s) => s.portalsRevealed);
  // Hold prompts while the turn is being announced, exactly as /play does ("Defer all game
  // overlays while Turn overlay is active"). The draw prompt used to land in the same frame as
  // the "Turn N" banner, so the turn never got its beat. TurnStartOverlay always clears this
  // within two seconds, and a click on the banner clears it at once, so nothing can wait on it.
  const announcing = useGameStore((s) => s.turnOverlayActive);
  if (!game) return null;
  if (announcing) return null;
  const prompt = game.prompts[0];
  switch (preGameSurface(game, portalsRevealed)) {
    case "portal":
      return <EnginePortalScreen />;
    case "mulligan":
      // NOT keyed on rev: the computer mulligans during this same phase, and a remount would
      // throw away the cards the player has already marked.
      return <Mulligan game={game} />;
    case "none":
      return null;
  }
  if (!prompt) return null;
  return <PromptView key={`${prompt.id}:${rev}`} game={game} prompt={prompt} />;
}

/** Make `tokens` clickable on the board for this prompt; returns the clicked token stream. */
function useBoardPick(
  request: string,
  tokens: string[],
  glow: string[],
  onPick: (token: string) => void,
  labels?: Record<string, string>,
  extra?: {
    /** squares this choice is coming FROM (the square being moved, a caster) */
    sources?: string[];
    /** tile token -> the squares picking it would cover, previewed under the pointer */
    areas?: Record<string, string[]>;
  },
) {
  const tokenKey = tokens.join("|");
  const glowKey = glow.join("|");
  const labelKey = labels ? Object.entries(labels).map(([k, v]) => `${k}=${v}`).join("|") : "";
  const sourceKey = (extra?.sources ?? []).join("|");
  const areaKey = extra?.areas ? Object.entries(extra.areas).map(([k, v]) => `${k}>${v.join(",")}`).join("|") : "";
  useEffect(() => {
    const picker = useCpuBoardPicker.getState();
    useEngineSession.getState().revealTokens(tokens);
    picker.configure(request, tokens);
    picker.setGlow(request, glow, extra?.sources ?? []);
    if (labels) picker.setLabels(request, labels);
    if (extra?.areas) picker.setAreas(request, extra.areas);
    // configure/setGlow/setLabels/setAreas read the arrays once; the keys capture their contents
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request, tokenKey, glowKey, labelKey, sourceKey, areaKey]);
  useEffect(
    () =>
      useCpuBoardPicker.subscribe((state, prev) => {
        if (state.request !== request || !state.selected || state.selected === prev.selected) return;
        const token = state.selected;
        // Only drop the selection — do NOT reconfigure under a throwaway request.
        //
        // That is what killed the board on a REFUSED pick: the ack-configure hard-reset the
        // store to an empty token list, and re-arming depended on the effect re-running. But
        // the effect's `request` is derived from the caller's state, and a refused pick (the
        // mulligan's 4th card, a chooseTargets past `count`) returns the identical array, so
        // React bails out of the render, the deps never change, and nothing ever reconfigures.
        // The board was left permanently unclickable.
        useCpuBoardPicker.getState().deselect(request);
        onPick(token);
      }),
    [request, onPick],
  );
  useEffect(() => () => useCpuBoardPicker.getState().clear(request), [request]);
}

function answer(promptId: string, choice: unknown): Action {
  return { t: "prompt", promptId, choice };
}

const MULLIGAN_MAX = 3;

/**
 * The opening hand IS the picker: click cards in your hand to mark them for the bottom,
 * click again to unmark. The banner only counts and commits — one selection surface, not two.
 */
function Mulligan({ game }: { game: EngineState }) {
  const dispatch = useEngineSession((s) => s.dispatch);
  const [back, setBack] = useState<string[]>([]);
  const hand = game.players[HUMAN_SEAT].hand;
  const toggle = useMemo(
    () => (id: string) =>
      setBack((cur) => (cur.includes(id) ? cur.filter((c) => c !== id) : cur.length < MULLIGAN_MAX ? [...cur, id] : cur)),
    [],
  );
  const onBoardPick = useMemo(() => (token: string) => toggle(token.slice("hand:p1:".length)), [toggle]);
  // every card stays clickable; the marked ones also glow green, so one click marks and
  // the next unmarks — the hand is the only selection surface.
  useBoardPick(
    `engine-mulligan:${back.join(",")}`,
    hand.map((id) => handToken("p1", id)),
    back.map((id) => handToken("p1", id)),
    onBoardPick,
  );
  const marked = back.map((id) => game.cards[id]?.name).filter(Boolean);
  return (
    <PromptBanner
      title="Your opening hand"
      hint={
        back.length
          ? `Putting back: ${marked.join(", ")}. Click a card again to keep it.`
          : `Click up to ${MULLIGAN_MAX} cards in your hand to put them on the bottom and draw replacements.`
      }
      counter={`${back.length}/${MULLIGAN_MAX}`}
    >
      {back.length > 0 && (
        <RcButton variant="outline" size="sm" onClick={() => dispatch({ t: "mulligan", back })}>
          Mulligan {back.length}
        </RcButton>
      )}
      <RcButton size="sm" onClick={() => dispatch({ t: "keepHand" })}>
        Keep hand
      </RcButton>
    </PromptBanner>
  );
}

function PromptView({ game, prompt: rawPrompt }: { game: EngineState; prompt: Prompt }) {
  const dispatch = useEngineSession((s) => s.dispatch);
  // titles come from the engine and may name squares in engine space — show our tile numbers
  const prompt = { ...rawPrompt, title: localizeEngineText(rawPrompt.title ?? "") };
  const data = (prompt.data ?? {}) as PromptData;
  const send = (choice: unknown) => dispatch(answer(prompt.id, choice));
  const auto = () => dispatch(botAction(game, HUMAN_SEAT));
  const autoButton = (
    <RcButton variant="ghost" size="xs" onClick={auto} title="Let the engine answer this for you">
      Auto
    </RcButton>
  );

  switch (prompt.kind) {
    case "drawDeck": {
      // Courtesan Thaïs: piloting the other seat, the draw goes into ITS piles, so those are
      // the ones lit (on its seat bar), and the title says whose draw it is
      const drawSeat = prompt.player === HUMAN_SEAT ? "p1" : "p2";
      const forName = drawSeat === "p2" ? (game.players[prompt.player]?.name ?? "Computer") : null;
      return (
        <SinglePick
          request={`engine-prompt:${prompt.id}`}
          title={forName ? `Draw for ${forName}: from their spellbook or their atlas?` : prompt.title || "Draw from your spellbook or atlas"}
          tokens={[pileToken(drawSeat, "spellbook"), pileToken(drawSeat, "atlas")]}
          onPick={(token) => send(token.endsWith("atlas") ? "atlas" : "spellbook")}
        >
          <RcButton variant="outline" size="xs" onClick={() => send("spellbook")}>
            Spellbook
          </RcButton>
          <RcButton variant="outline" size="xs" onClick={() => send("atlas")}>
            Atlas
          </RcButton>
        </SinglePick>
      );
    }
    case "firstSite": {
      const ids = data.ids ?? [];
      return (
        <SinglePick
          request={`engine-prompt:${prompt.id}`}
          title={prompt.title || "Choose your first site"}
          tokens={ids.map((id) => handToken("p1", id))}
          onPick={(token) => send(token.slice("hand:p1:".length))}
        >
          {autoButton}
        </SinglePick>
      );
    }
    case "intercept": {
      const ids = data.candidates ?? [];
      return (
        <IdSinglePick
          request={`engine-prompt:${prompt.id}`}
          title={prompt.title || "Intercept with a unit?"}
          ids={ids}
          tokenOf={(id) => tokenForEngineId(game, id)}
          labelOf={(id) => twinLabel(game, id)}
          onPick={send}
        >
          <RcButton variant="outline" size="xs" onClick={() => send(null)}>
            Don&apos;t intercept
          </RcButton>
        </IdSinglePick>
      );
    }
    case "chooseSquare": {
      const squares = data.squares ?? [];
      // A border, not a square — and `squares` is empty, so this MUST come first or the prompt
      // falls through to a tile pick with nothing armed and can never be answered.
      if (data.edgeSelect && data.edges?.length)
        return <EdgePick prompt={prompt} edges={data.edges} onSend={send}>{autoButton}</EdgePick>;
      // the engine offered ANCHORS of a 2x2, which on their own say nothing about the footprint
      if (data.area2x2 && squares.length)
        return <AreaPick prompt={prompt} game={game} squares={squares} onSend={send}>{autoButton}</AreaPick>;
      return (
        <SinglePick
          request={`engine-prompt:${prompt.id}`}
          title={prompt.title || "Choose a square"}
          tokens={squares.map((sq) => engineCellKey(sq.x, sq.y))}
          card={promptCtxCard(game, prompt)}
          onPick={(token) => send(squares.find((sq) => engineCellKey(sq.x, sq.y) === token) ?? null)}
        >
          {autoButton}
        </SinglePick>
      );
    }
    case "defend":
    case "chooseTargets": {
      const ids = data.candidates ?? [];
      const max = prompt.kind === "defend" ? ids.length : (data.count ?? 1);
      const min = prompt.kind === "defend" || data.upTo ? 0 : max;
      return (
        <MultiPick
          request={`engine-prompt:${prompt.id}`}
          title={prompt.title}
          ids={ids}
          tokenOf={(id) => tokenForEngineId(game, id)}
          labelOf={(id) => twinLabel(game, id)}
          min={min}
          max={max}
          confirmLabel={(n) => (prompt.kind === "defend" ? (n ? `Defend with ${n}` : "No defenders") : "Confirm")}
          // `defend` already says "No defenders" on its own button; an optional chooseTargets
          // had nothing but an unlabelled Confirm at zero picks.
          declineLabel={prompt.kind === "chooseTargets" && data.upTo ? (data.skipLabel ?? "None") : null}
          kind={data.kind}
          onConfirm={send}
        >
          {autoButton}
        </MultiPick>
      );
    }
    case "stayInFight":
    case "yesNo":
      return (
        <PromptDialog title={prompt.title} hint="This decision is yours.">
          <div className="flex justify-center gap-3 pt-2">
            <RcButton variant="outline" size="lg" onClick={() => send(false)}>
              No
            </RcButton>
            <RcButton size="lg" onClick={() => send(true)}>
              Yes
            </RcButton>
          </div>
        </PromptDialog>
      );
    case "chooseOption":
      // a revealed card (Second Seer's top card, Lookout…) is shown, not just named
      if (data.reveal)
        return (
          <PromptDialog title={prompt.title} hint="Revealed to you.">
            <CpuCardPick title={data.reveal} items={[{ id: "reveal", card: cardRefFor(data.reveal) }]} onPick={() => undefined}>
              <div className="mt-3 flex justify-center gap-2">
                {(data.options ?? []).map((option) => (
                  <RcButton key={option} variant="outline" size="sm" onClick={() => send(option)}>
                    {localizeEngineText(option)}
                  </RcButton>
                ))}
              </div>
            </CpuCardPick>
          </PromptDialog>
        );
      {
        const options = data.options ?? [];
        const dirs = options.map((option) => ({ key: directionKey(option), label: option }));
        // A direction belongs on the board, aimed from the source square — not in a popup.
        const board = dirs.filter((d) => d.key).length >= 3 ? lanesFor(data, options) : null;
        if (board) return <DirectionPick prompt={prompt} options={options} board={board} onSend={send} />;
        // options that name squares (Chaos Twister's landing roll) are picked on the board
        const squares = squareOptionsFor(options);
        if (squares.length >= 2) return <SquarePick prompt={prompt} options={options} squares={squares} onSend={send} />;
        // no origin from the engine (Windblast's worded options, 'hold fire' sets): compass
        if (options.length >= 3 && dirs.every((d) => d.key)) {
          return (
            <PromptDialog title={prompt.title} hint="Choose a direction.">
              <Compass
                options={dirs.map((d) => ({ key: BOARD_DIRECTION[d.key as EngineDirection], label: d.label }))}
                onPick={send}
              />
            </PromptDialog>
          );
        }
        return (
          <PromptDialog title={prompt.title}>
            <div className="flex flex-wrap justify-center gap-2 pt-1">
              {options.map((option) => (
                // display localized, but answer with the engine's own option string
                <RcButton key={option} variant="outline" size="sm" onClick={() => send(option)}>
                  {localizeEngineText(option)}
                </RcButton>
              ))}
            </div>
          </PromptDialog>
        );
      }
    case "sitePermutation":
      return <SitePermutation prompt={prompt} data={data} onSend={send} auto={autoButton} />;
    case "allocateDamage":
      return <AllocateDamage game={game} prompt={prompt} data={data} onSend={send} />;
    case "chooseCards":
      return <ChooseCards prompt={prompt} data={data} onSend={send} auto={autoButton} />;
    case "orderCards":
      return <OrderCards prompt={prompt} data={data} onSend={send} />;
    case "nameCard":
      return <NameCard prompt={prompt} data={data} onSend={send} auto={autoButton} />;
    default:
      return (
        <PromptDialog title={prompt.title} hint="This step has no board picture yet.">
          <div className="flex justify-center pt-1">
            <RcButton size="sm" onClick={auto}>
              Let the engine choose
            </RcButton>
          </div>
        </PromptDialog>
      );
  }
}

/**
 * An Enchantress-animated aura and its minion are ONE card on the board, so both ids answer to
 * the same token. When a prompt lists both, a click on the card cannot say which is meant: the
 * banner then names the two, the way actionPaths' "as an aura / as a minion" options do.
 */
function twinLabel(game: EngineState, id: string): string {
  const aura = game.auras[id];
  return aura ? `${aura.name} as an aura` : `${game.units[id]?.name ?? "It"} as a minion`;
}

/** The ids a click on `token` could mean (two for an animated aura listed with its minion). */
function idsAt(ids: readonly string[], tokenOf: (id: string) => string, token: string): string[] {
  return ids.filter((id) => tokenOf(id) === token);
}

/** The buttons that settle which of a card's twin ids a click meant. */
function TwinChoice({
  twins,
  labelOf,
  pressed,
  onPick,
}: {
  twins: string[] | null;
  labelOf: (id: string) => string;
  pressed?: (id: string) => boolean;
  onPick: (id: string) => void;
}) {
  if (!twins || twins.length < 2) return null;
  return (
    <>
      {twins.map((id) => (
        <RcButton key={id} variant="outline" size="sm" aria-pressed={pressed?.(id) ?? false} onClick={() => onPick(id)}>
          {labelOf(id)}
        </RcButton>
      ))}
    </>
  );
}

/** SinglePick over engine ids, asking which one is meant when two share a card. */
function IdSinglePick({
  request,
  title,
  ids,
  tokenOf,
  labelOf,
  onPick,
  children,
}: {
  request: string;
  title: string;
  ids: string[];
  tokenOf: (id: string) => string;
  labelOf: (id: string) => string;
  onPick: (id: string) => void;
  children?: React.ReactNode;
}) {
  const [twins, setTwins] = useState<string[] | null>(null);
  return (
    <SinglePick
      request={request}
      title={title}
      tokens={ids.map(tokenOf)}
      onPick={(token) => {
        const matches = idsAt(ids, tokenOf, token);
        if (matches.length > 1) setTwins(matches);
        else if (matches[0]) onPick(matches[0]);
      }}
    >
      <TwinChoice twins={twins} labelOf={labelOf} onPick={onPick} />
      {children}
    </SinglePick>
  );
}

function SinglePick({
  request,
  title,
  tokens,
  onPick,
  card,
  children,
}: {
  request: string;
  title: string;
  tokens: string[];
  onPick: (token: string) => void;
  /** The card this step is placing or aiming, shown so the step is unmistakable. */
  card?: string | null;
  children?: React.ReactNode;
}) {
  useBoardPick(request, tokens, [], onPick);
  const noun = pickNoun(tokens);
  return (
    <PromptBanner
      title={card ? `${title} — ${card}` : title}
      hint={
        card
          ? `${card} is waiting on you: click one of the highlighted squares on the board.`
          : noun
            ? `Click the highlighted ${noun.one} ${pickPlace(tokens)}.`
            : "Click the highlighted card, unit or tile on the board."
      }
      counter={noun ? `${tokens.length} ${tokens.length === 1 ? noun.one : noun.many}` : null}
    >
      {card && <PromptCardChip name={card} />}
      {children}
    </PromptBanner>
  );
}

/** A thumbnail of the card a prompt concerns — prompts here act on real cards, not on labels. */
function PromptCardChip({ name }: { name: string }) {
  const { src, landscape } = cardImage(cardRefFor(name));
  if (!src) return null;
  return (
    <span
      className={`relative overflow-hidden rounded-rc-md border border-rc-accent/45 bg-black/30 shadow-rc-md ${
        landscape ? "aspect-[4/3] w-16" : "aspect-[63/88] w-11"
      }`}
    >
      <Image
        src={src}
        alt=""
        fill
        unoptimized
        sizes="64px"
        draggable={false}
        className={`${landscape ? "rotate-90 scale-[1.333] origin-center object-contain" : "object-cover"} object-center`}
      />
    </span>
  );
}

function MultiPick({
  request,
  title,
  ids,
  tokenOf,
  labelOf,
  min,
  max,
  confirmLabel,
  declineLabel,
  kind,
  onConfirm,
  children,
}: {
  request: string;
  title: string;
  ids: string[];
  tokenOf: (id: string) => string;
  /** names an id when a click on its card could mean two (an animated aura and its minion) */
  labelOf: (id: string) => string;
  min: number;
  max: number;
  confirmLabel: (n: number) => string;
  /** When set, an explicit "none" button that answers with an empty pick. */
  declineLabel?: string | null;
  /** the engine's `data.kind`, so the hint names what is being clicked */
  kind?: string;
  onConfirm: (ids: string[]) => void;
  children?: React.ReactNode;
}) {
  const [chosen, setChosen] = useState<string[]>([]);
  const [twins, setTwins] = useState<string[] | null>(null);
  const toggleId = useCallback(
    (id: string) =>
      setChosen((cur) => (cur.includes(id) ? cur.filter((c) => c !== id) : cur.length < max ? [...cur, id] : cur)),
    [max],
  );
  const toggle = useMemo(
    () => (token: string) => {
      const matches = idsAt(ids, tokenOf, token);
      if (matches.length > 1) {
        setTwins(matches);
        return;
      }
      setTwins(null);
      if (matches[0]) toggleId(matches[0]);
    },
    [ids, tokenOf, toggleId],
  );
  useBoardPick(`${request}:${chosen.join(",")}`, ids.map(tokenOf), chosen.map(tokenOf), toggle);
  const ready = chosen.length >= min && chosen.length <= max;
  return (
    <PromptBanner title={title} hint={pickHint(kind, !!declineLabel)} counter={`${chosen.length}/${max}`}>
      <TwinChoice
        twins={twins}
        labelOf={labelOf}
        pressed={(id) => chosen.includes(id)}
        onPick={(id) => {
          setTwins(null);
          toggleId(id);
        }}
      />
      {children}
      {/* An optional pick's decline gets a NAME. `min` is already 0 for these, so pressing
          Confirm at zero always worked — it just looked like the thing you do when you have
          not finished choosing. combat:retarget's own title promises "(or none)". */}
      {declineLabel && (
        <RcButton variant="outline" size="sm" onClick={() => onConfirm([])}>
          {declineLabel}
        </RcButton>
      )}
      {/* With upTo and count > 1, 1 and 2 picks are legal partial answers: only zero moves to
          the outline button, so `ready` must stay as it is. */}
      <RcButton size="sm" disabled={!ready || (!!declineLabel && chosen.length === 0)} onClick={() => onConfirm(chosen)}>
        {confirmLabel(chosen.length)}
      </RcButton>
    </PromptBanner>
  );
}

/** What the player is clicking: the engine tells us with `data.kind`. */
function pickHint(kind: string | undefined, declinable: boolean): string {
  const what = kind === "site" ? "sites" : kind === "artifact" ? "artifacts" : "units";
  return declinable
    ? `Click the highlighted ${what} on the board, or decline.`
    : `Click the highlighted ${what} on the board; click one again to unpick it.`;
}

function AllocateDamage({
  game,
  prompt,
  data,
  onSend,
}: {
  game: EngineState;
  prompt: Prompt;
  data: PromptData;
  onSend: (choice: unknown) => void;
}) {
  const ids = data.candidates ?? [];
  const power = data.power ?? 0;
  const [split, setSplit] = useState<Record<string, number>>(() => (ids[0] ? { [ids[0]]: power } : {}));
  const used = Object.values(split).reduce((a, b) => a + b, 0);
  const bump = (id: string, delta: number) =>
    setSplit((cur) => {
      const next = Math.max(0, (cur[id] ?? 0) + delta);
      if (delta > 0 && used >= power) return cur;
      return { ...cur, [id]: next };
    });
  useBoardPick(`engine-prompt:${prompt.id}:glow`, [], ids.map((id) => tokenForEngineId(game, id)), () => undefined);
  return (
    <PromptDialog title={prompt.title} hint={`Split ${power} damage among the enemy.`}>
      <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
      {ids.map((id) => (
        <span key={id} className="flex items-center gap-1 rounded-rc-md border border-rc-line/12 bg-black/30 px-2 py-0.5">
          <span className="font-rc-display text-rc-accent-link">{game.units[id]?.name ?? id}</span>
          <RcButton variant="quiet" size="icon-xs" aria-label="Less damage" onClick={() => bump(id, -1)}>
            −
          </RcButton>
          <span className="w-5 text-center font-rc-mono tabular-nums text-rc-danger">{split[id] ?? 0}</span>
          <RcButton variant="quiet" size="icon-xs" aria-label="More damage" onClick={() => bump(id, 1)}>
            +
          </RcButton>
        </span>
      ))}
      </div>
      <div className="mt-4 flex justify-center">
        <RcButton size="sm" disabled={used !== power} onClick={() => onSend({ strikerId: data.strikerId, allocation: split })}>
          Strike ({used}/{power})
        </RcButton>
      </div>
    </PromptDialog>
  );
}

function ChooseCards({
  prompt,
  data,
  onSend,
  auto,
}: {
  prompt: Prompt;
  data: PromptData;
  onSend: (choice: unknown) => void;
  auto: React.ReactNode;
}) {
  const cards = data.cards ?? [];
  const pick = data.pick ?? 1;
  const [chosen, setChosen] = useState<number[]>([]);
  const items = cards.map((name, i) => ({
    id: String(i),
    card: cardRefFor(name),
    badge: chosen.includes(i) ? `Chosen ${chosen.indexOf(i) + 1}` : undefined,
  }));
  const toggle = (id: string) => {
    const i = Number(id);
    setChosen((cur) => (cur.includes(i) ? cur.filter((c) => c !== i) : cur.length < pick ? [...cur, i] : cur));
  };
  // With `upTo`, Confirm used to be enabled at ZERO picks, where it answers exactly like Skip
  // — an empty array. On Imperial Road that is indistinguishable from declining: the engine's
  // `pick` cont sees no index, quietly drops the whole offer, and the site stays in your hand
  // with no further prompt and nothing in the log. Declining is Skip's job; Confirm now needs
  // something chosen.
  const ready = data.upTo ? chosen.length > 0 && chosen.length <= pick : chosen.length === Math.min(pick, cards.length);
  const need = Math.min(pick, cards.length);
  return (
    <PromptDialog
      title={prompt.title}
      hint={data.upTo ? `Choose up to ${need} — or skip.` : `Choose ${need}.`}
      wide
    >
      <CpuCardPick
        title={`${chosen.length}/${need} chosen`}
        items={items}
        selected={null}
        selectedIds={chosen.map(String)}
        onPick={toggle}
      >
        <div className="mt-3 flex justify-center gap-2">
          {auto}
          {data.upTo && (
            <RcButton variant="outline" size="sm" onClick={() => onSend([])}>
              {data.skipLabel ?? "Skip"}
            </RcButton>
          )}
          <RcButton size="sm" disabled={!ready} onClick={() => onSend(chosen)}>
            Confirm
          </RcButton>
        </div>
      </CpuCardPick>
    </PromptDialog>
  );
}

function OrderCards({ prompt, data, onSend }: { prompt: Prompt; data: PromptData; onSend: (choice: unknown) => void }) {
  const cards = data.cards ?? [];
  const [order, setOrder] = useState<number[]>(() => cards.map((_, i) => i));
  const [held, setHeld] = useState<number | null>(null);
  // Click a card, then click where it should go: the two swap places.
  const onPick = (id: string) => {
    const pos = Number(id);
    if (held === null) return setHeld(pos);
    setOrder((cur) => {
      const next = [...cur];
      [next[held], next[pos]] = [next[pos], next[held]];
      return next;
    });
    setHeld(null);
  };
  const items = order.map((cardIndex, pos) => ({ id: String(pos), card: cardRefFor(cards[cardIndex]), badge: `${pos + 1}` }));
  return (
    <PromptDialog title={prompt.title} hint="Click two cards to swap them. The first is resolved or placed first." wide>
      <CpuCardPick title="Order" items={items} selected={held === null ? null : String(held)} onPick={onPick}>
        <div className="mt-3 flex justify-center">
          <RcButton size="sm" onClick={() => onSend(order)}>
            Confirm order
          </RcButton>
        </div>
      </CpuCardPick>
    </PromptDialog>
  );
}

/**
 * Which kind of nameCard prompt this is.
 *
 * Decided on the PRESENCE of `names`, not its truthiness: an empty list is still a
 * constrained prompt, and treating it as free-form would reopen the hole this closes the
 * next time the vendor changes. Twelve ask sites — ten carry `names`, only Feast for Crows
 * and Hyter Sprites are genuinely free-form.
 */
export function nameCardMode(data: PromptData): "list" | "free" {
  return "names" in data && Array.isArray(data.names) ? "list" : "free";
}

/**
 * Name a card.
 *
 * The vendor's own comments ask for "a clickable card grid … not a free-text field"
 * (legion-of-gall.ts, dragonlord.ts), and our house rule says the same. Two modes:
 *
 *  - a list the engine supplied: a grid, and NO cancel. This is the Legion of Gall fix —
 *    its cont re-asks with `taken` unchanged on any non-string, so the old Cancel (which
 *    sent "") looped the prompt forever. Four other sites pass the answer straight to
 *    `getCard`, which THROWS on "". Auto is therefore the only exit, and it is always
 *    present: the bot handles nameCard and picks from the list.
 *  - genuinely free-form: a searchable field plus a real "Name nothing".
 */
function NameCard({
  prompt,
  data,
  onSend,
  auto,
}: {
  prompt: Prompt;
  data: PromptData;
  onSend: (choice: unknown) => void;
  auto: React.ReactNode;
}) {
  const mode = nameCardMode(data);
  const [value, setValue] = useState("");
  // a name can repeat at count > 1; the grid keys by index, so dedupe first
  const offered = useMemo(() => [...new Set(data.names ?? [])], [data.names]);
  const every = useMemo(() => allCards.filter((c) => !c.token).map((c) => c.name), []);
  const search = value.trim().toLowerCase();
  const matches = useMemo(
    () => (search ? every.filter((name) => name.toLowerCase().includes(search)).slice(0, 24) : []),
    [every, search],
  );
  const where = data.fromCollection ? "from your collection" : null;

  if (mode === "list") {
    return (
      <PromptDialog title={prompt.title} hint={where ? `Choose a card ${where}.` : "Choose a card."} wide>
        {offered.length === 0 ? (
          <div className="py-4 text-center text-sm text-rc-fg-muted">
            There is nothing to choose from — let the engine settle it.
            <div className="mt-3 flex justify-center">{auto}</div>
          </div>
        ) : (
          <CpuCardPick
            title={where ? `Your collection (${offered.length})` : `${offered.length} to choose from`}
            items={offered.map((name, i) => ({ id: String(i), card: cardRefFor(name) }))}
            onPick={(id) => onSend(offered[Number(id)])}
          >
            {/* No cancel here on purpose: an empty answer either loops this prompt forever
                (Legion of Gall) or throws inside getCard. Auto is the way out. */}
            <div className="mt-3 flex justify-center">{auto}</div>
          </CpuCardPick>
        )}
      </PromptDialog>
    );
  }

  return (
    <PromptDialog title={prompt.title} hint="Search for a card by name." wide>
      <div className="flex flex-col items-center gap-3 pt-1">
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Card name"
          autoFocus
          className="h-9 w-72 rounded-rc-md border border-rc-line/22 bg-black/40 px-3 text-sm text-rc-fg"
        />
        {matches.length > 0 && (
          <CpuCardPick
            title={`${matches.length} match${matches.length === 1 ? "" : "es"}`}
            items={matches.map((name, i) => ({ id: String(i), card: cardRefFor(name) }))}
            onPick={(id) => onSend(matches[Number(id)])}
          />
        )}
        <div className="flex justify-center gap-2">
          {auto}
          {/* Free-form sites guard with `typeof name !== "string" || !name` and simply return,
              so declining here is safe and says what it does. */}
          {/* `null`, not `""`: an empty string passes the `typeof name !== "string"` guards and
              reaches `getCard("")`, which throws (db.ts:88-92). `null` fails those guards first
              and every free-form continuation simply returns. */}
          <RcButton variant="outline" size="sm" onClick={() => onSend(null)}>
            Name nothing
          </RcButton>
        </div>
      </div>
    </PromptDialog>
  );
}


/**
 * A two-by-two AREA, chosen by its anchor square.
 *
 * The engine answers these with the anchor alone (`area2x2`), which is all it needs — but an
 * anchor on the board tells the player nothing about which four squares they are about to
 * pick. Hovering one washes its whole footprint, so Earthquake, Corpse Explosion, Whirlwind,
 * a 2x2 aura's placement and an oversized minion's summon are all aimed by eye.
 *
 * The footprint goes to the picker as an `areas` map rather than as glow re-armed per hover:
 * re-keying the request on hover would reconfigure the board, and `configure` clears `hovered`
 * — the preview would clear itself on the frame it appeared.
 */
function AreaPick({
  prompt,
  game,
  squares,
  onSend,
  children,
}: {
  prompt: Prompt;
  game: EngineState;
  squares: { x: number; y: number }[];
  onSend: (choice: unknown) => void;
  children?: React.ReactNode;
}) {
  const hovered = useCpuBoardPicker((picker) => picker.hovered);
  const areas = useMemo(() => areaFootprints(game, squares), [game, squares]);
  const onPick = useMemo(
    () => (token: string) => {
      const hit = squares.find((anchor) => engineCellKey(anchor.x, anchor.y) === token);
      if (hit) onSend(hit);
    },
    [squares, onSend],
  );
  const tokens = useMemo(() => Object.keys(areas), [areas]);
  useBoardPick(`engine-prompt:${prompt.id}`, tokens, [], onPick, undefined, { areas });
  const preview = hovered ? (areas[hovered] ?? []) : [];
  return (
    <PromptBanner
      title={prompt.title}
      hint={
        preview.length
          ? `Covers tiles ${preview.map(tileNumberOf).sort((a, b) => a - b).join(", ")}.`
          : "Hover a highlighted square to see the two-by-two it would cover, then click it."
      }
      counter={`${tokens.length} ${tokens.length === 1 ? "area" : "areas"}`}
    >
      {children}
    </PromptBanner>
  );
}

/**
 * A choice between BORDERS of squares, picked on the board.
 *
 * A Wall aura lies on a border rather than on a square, and Scatter and Displace both push one
 * along. The engine phrases that as a `chooseSquare` carrying `edgeSelect` + `edges` and no
 * `squares` at all, which our square branch read as "no candidates": the banner asked for a
 * click, the board armed nothing, and the prompt sat there unanswerable with the match stuck
 * behind it. Each border gets a marker on the border itself, and hovering lights the two
 * squares it divides.
 */
function EdgePick({
  prompt,
  edges,
  onSend,
  children,
}: {
  prompt: Prompt;
  edges: EngineEdge[];
  onSend: (choice: unknown) => void;
  children?: React.ReactNode;
}) {
  const hovered = useCpuBoardPicker((picker) => picker.hovered);
  const areas = useMemo(() => edgeFootprints(edges), [edges]);
  const onPick = useMemo(
    () => (token: string) => {
      const edge = edges.find((candidate) => edgeToken(candidate.key) === token);
      // the continuations match on the key, accepting either the bare string or { key }
      if (edge) onSend(edge.key);
    },
    [edges, onSend],
  );
  const tokens = useMemo(() => Object.keys(areas), [areas]);
  useBoardPick(`engine-prompt:${prompt.id}`, tokens, [], onPick, undefined, { areas });
  const preview = hovered ? (areas[hovered] ?? []) : [];
  return (
    <PromptBanner
      title={prompt.title}
      hint={
        preview.length
          ? `The border between tiles ${preview.map(tileNumberOf).sort((a, b) => a - b).join(" and ")}.`
          : "Click one of the border markers on the board."
      }
      counter={`${tokens.length} ${tokens.length === 1 ? "border" : "borders"}`}
    >
      {children}
    </PromptBanner>
  );
}

/**
 * Earthquake's rearrangement: "You may rearrange sites within a two-by-two area."
 *
 * The engine takes the FINAL arrangement in one shot (`placements`, each square naming the
 * square whose site lands on it) and only validates it, so the swapping is entirely ours to
 * author. It is done the way /play does it: click a square, click another, their sites trade
 * places, repeat. The panel shows the cards as they will stand, because the board itself does
 * not move until the whole thing resolves.
 *
 * Immovable sites (Bedrock, a Bluecap Knockers site) are fixed points — lit on the board but
 * never clickable, since a permutation that moves one is rejected wholesale.
 */
function SitePermutation({
  prompt,
  data,
  onSend,
  auto,
}: {
  prompt: Prompt;
  data: PromptData;
  onSend: (choice: unknown) => void;
  auto?: React.ReactNode;
}) {
  /** The area's squares in reading order on OUR board, so the grid matches what is on screen. */
  const slots = useMemo(() => {
    const cells = data.cells ?? (data.squares ?? []).map((sq) => ({ ...sq, name: null, movable: true }));
    return cells
      .map((cell) => ({ ...cell, at: engineCellKey(cell.x, cell.y) }))
      .sort((a, b) => tileNumberOf(a.at) - tileNumberOf(b.at));
  }, [data.cells, data.squares]);
  /** `holders[i]` is the slot whose site currently stands on slot `i`; identity = nothing moved. */
  const [holders, setHolders] = useState<number[]>(() => slots.map((_, i) => i));
  const [from, setFrom] = useState<number | null>(null);
  // a fresh prompt (a second Earthquake) must not inherit the last one's arrangement
  useEffect(() => {
    setHolders(slots.map((_, i) => i));
    setFrom(null);
  }, [prompt.id, slots]);

  const swap = useMemo(
    () => (slot: number) => {
      if (!slots[slot]?.movable) return;
      setFrom((pending) => {
        if (pending === null) return slot;
        if (pending === slot) return null;
        setHolders((current) => swapSlots(current, pending, slot));
        return null;
      });
    },
    [slots],
  );
  const onPick = useMemo(
    () => (token: string) => {
      const slot = slots.findIndex((candidate) => candidate.at === token);
      if (slot >= 0) swap(slot);
    },
    [slots, swap],
  );

  const movableTokens = useMemo(() => slots.filter((slot) => slot.movable).map((slot) => slot.at), [slots]);
  const fixedTokens = useMemo(() => slots.filter((slot) => !slot.movable).map((slot) => slot.at), [slots]);
  const sources = from === null ? [] : [slots[from].at];
  useBoardPick(
    `engine-prompt:${prompt.id}:${from ?? ""}`,
    movableTokens,
    fixedTokens,
    onPick,
    undefined,
    { sources },
  );

  const moved = holders.filter((holder, slot) => holder !== slot).length;
  const send = () => onSend({ placements: permutationPlacements(slots, holders) });
  return (
    <PromptDialog
      title={prompt.title}
      hint={
        from === null
          ? "Click a square on the board, then the square to trade it with. Leave it as it is to rearrange nothing."
          : `Moving the site on tile ${tileNumberOf(slots[from].at)} — click where it should go.`
      }
    >
      <div className="mx-auto grid w-[min(20rem,70vw)] grid-cols-2 gap-2 pt-1">
        {slots.map((slot, i) => {
          const holder = slots[holders[i]];
          const pending = from === i;
          return (
            <button
              key={slot.at}
              type="button"
              disabled={!slot.movable}
              onClick={() => swap(i)}
              className={`flex items-center gap-2 rounded-rc-md border px-2 py-1.5 text-left transition-colors ${
                pending
                  ? "border-rc-accent-link/70 bg-rc-accent-link/10"
                  : slot.movable
                    ? "border-rc-line/25 hover:border-rc-accent/45"
                    : "border-rc-line/15 opacity-60"
              }`}
            >
              <span className="font-rc-mono text-[11px] tabular-nums text-rc-fg-subtle">{tileNumberOf(slot.at)}</span>
              <span className="min-w-0 flex-1 truncate font-rc-display text-[13px] text-rc-fg-strong">
                {holder.name ?? "void"}
              </span>
              {!slot.movable && (
                <Icon icon="game-icons:stone-block" className="h-3.5 w-3.5 flex-none text-rc-fg-subtle" aria-hidden />
              )}
            </button>
          );
        })}
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
        <RcButton size="sm" onClick={send}>
          {moved ? "Rearrange" : "Leave as it is"}
        </RcButton>
        {moved > 0 && (
          <RcButton
            variant="outline"
            size="sm"
            onClick={() => {
              setHolders(slots.map((_, i) => i));
              setFrom(null);
            }}
          >
            Reset
          </RcButton>
        )}
        {auto}
      </div>
    </PromptDialog>
  );
}
