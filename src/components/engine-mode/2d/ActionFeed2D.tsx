"use client";

import { Icon } from "@iconify/react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useVisualAid } from "@/hooks/useGraphicsSettings";
import { cardRefFor } from "@/lib/engine-mode/cardIndex";
import { opponentName, useEngineSession } from "@/lib/engine-mode/session";
import { PLAYER_COLORS } from "@/lib/game/constants";
import { useGameStore } from "@/lib/game/store";
import type { CardRef, CellKey } from "@/lib/game/store/types";
import { findCard } from "@sorcery/shared";
import { CardArt } from "./Card2D";
import { buildActionFeed, entryCells } from "./actionFeed";
import type { FeedContext, FeedEntry, FeedKind, FeedOutcome, FeedSeat, FeedTurn } from "./actionFeed";
import { fxPalette } from "./actions2d";
import { useBoard2DFocus } from "./focusStore";

const KIND_ICON: Record<FeedKind, string> = {
  play: "game-icons:stone-tower",
  cast: "game-icons:magic-swirl",
  summon: "game-icons:wolf-head",
  move: "game-icons:walking-boot",
  attack: "game-icons:crossed-swords",
  ability: "game-icons:sparkles",
  draw: "game-icons:card-draw",
  discard: "game-icons:card-discard",
  damage: "game-icons:sword-wound",
  death: "game-icons:tombstone",
  destroy: "game-icons:crumbling-ball",
  lifeLoss: "game-icons:health-decrease",
  lifeGain: "game-icons:health-increase",
  note: "game-icons:quill",
};

const cardType = (name: string): string | null => findCard(name)?.type ?? null;

type Locate = (name: string) => CellKey[];

/** One feed build shared by every reader on the page (the feed, the inspector, the status line). */
let memo: { inputs: readonly unknown[]; turns: FeedTurn[]; locate: Locate; lastId: number } | null = null;

interface Pin {
  id: number;
  before: CellKey[];
  now: CellKey[];
}

/**
 * Where a card stood before and after each log line, pinned the first time the line is seen
 * NEW (its id past the previous build's last one), keyed by id, text and card name. Pins for
 * ids past the log's end (an undo rewound it) are dropped, so a reused id is pinned afresh.
 *
 * The engine log does not say where a summon landed or where a mover came from, and the
 * board only knows where things are NOW, so these pins are the only record of it: they are
 * kept with the match (localStorage, per match id) so a reload or a resumed match still reads
 * "summons X at tile 3" and "moves from tile 13 to tile 8".
 */
const pins = new Map<string, Pin>();
let pinsMatch = "";
const PINS_KEY = "rc:engine2d:feed-pins";
/** Plenty for the feed's 200-line window; older pins can never be looked up again. */
const PINS_KEPT = 240;

function loadPins(matchId: string) {
  pins.clear();
  pinsMatch = matchId;
  if (!matchId) return;
  try {
    const raw = localStorage.getItem(PINS_KEY);
    const saved: unknown = raw ? JSON.parse(raw) : null;
    if (!saved || typeof saved !== "object" || !("match" in saved) || saved.match !== matchId || !("pins" in saved)) return;
    if (!Array.isArray(saved.pins)) return;
    for (const row of saved.pins as unknown[]) {
      if (!Array.isArray(row) || row.length !== 2 || typeof row[0] !== "string") continue;
      const pin = row[1] as Partial<Pin> | null;
      if (pin && typeof pin.id === "number" && Array.isArray(pin.before) && Array.isArray(pin.now)) {
        pins.set(row[0], { id: pin.id, before: pin.before, now: pin.now });
      }
    }
  } catch {
    // a convenience: without it the feed just names fewer tiles
  }
}

function savePins() {
  if (!pinsMatch) return;
  try {
    const rows = [...pins.entries()].sort((a, b) => a[1].id - b[1].id).slice(-PINS_KEPT);
    localStorage.setItem(PINS_KEY, JSON.stringify({ match: pinsMatch, pins: rows }));
  } catch {
    // private mode, quota: the live session still has them
  }
}

/** Every square a card of this name stands on, on the projected board. */
function locator(
  permanents: StoreLike["permanents"],
  sites: StoreLike["sites"],
  avatars: StoreLike["avatars"],
): Locate {
  return (name) => {
    const cells: CellKey[] = [];
    for (const [cell, items] of Object.entries(permanents ?? {})) {
      if (items?.some((item) => item.card?.name === name)) cells.push(cell as CellKey);
    }
    for (const [cell, site] of Object.entries(sites ?? {})) {
      if (site?.card?.name === name && !cells.includes(cell as CellKey)) cells.push(cell as CellKey);
    }
    for (const avatar of Object.values(avatars ?? {})) {
      if (avatar?.card?.name === name && avatar.pos) {
        const cell = `${avatar.pos[0]},${avatar.pos[1]}` as CellKey;
        if (!cells.includes(cell)) cells.push(cell);
      }
    }
    return cells;
  };
}

interface StoreLike {
  permanents: ReturnType<typeof useGameStore.getState>["permanents"];
  sites: ReturnType<typeof useGameStore.getState>["board"]["sites"];
  avatars: ReturnType<typeof useGameStore.getState>["avatars"];
}

/**
 * The action feed for the current match, rebuilt when the log or the board changes. Where a
 * named card stands is read from the projected board, so tapping an entry can light it up;
 * where it stood when a line arrived is pinned (a summon's tile, a move's origin).
 */
export function useActionFeed(): FeedTurn[] {
  const events = useGameStore((s) => s.events);
  const permanents = useGameStore((s) => s.permanents);
  const sites = useGameStore((s) => s.board.sites);
  const avatars = useGameStore((s) => s.avatars);
  // [ours, theirs], whichever engine seat we hold
  const viewer = useEngineSession((s) => s.seat);
  const players = useEngineSession((s) =>
    s.game ? `${s.game.players[s.seat].name}\u0000${s.game.players[s.seat === 0 ? 1 : 0].name}` : "",
  );
  const matchId = useEngineSession((s) => s.matchId);
  // The projection numbers the lines of the engine's 200-line view from 0, so once the log is
  // longer every id shifts by one per new line. Re-based on the whole log's length they are the
  // line's real index and stay put: pins, keys and "newest" all depend on that.
  const logLength = useEngineSession((s) => s.game?.log.length ?? 0);
  // what the log cannot say (the card a toll took) and the turns played under Courtesan Thaïs
  const notes = useEngineSession((s) => s.feedNotes);
  const controlTurns = useEngineSession((s) => s.controlTurns);
  return useMemo(() => {
    const inputs = [events, permanents, sites, avatars, players, matchId, logLength, notes, controlTurns, viewer] as const;
    if (memo && memo.inputs.every((v, i) => v === inputs[i])) return memo.turns;
    const [you = "You", them = "Computer"] = players ? players.split("\u0000") : [];
    const locate = locator(permanents, sites, avatars);
    const projected = events ?? [];
    const offset = Math.max(0, logLength - projected.length);
    const list = offset ? projected.map((e) => ({ ...e, id: e.id + offset })) : projected;
    const lastId = list.length ? list[list.length - 1].id : -1;
    if (matchId !== pinsMatch) loadPins(matchId);
    // a different match or a rewound log: older pins no longer apply
    const before = memo && memo.inputs[4] === players && memo.inputs[5] === matchId ? memo : null;
    let changed = false;
    for (const [key, pin] of pins) {
      if (pin.id > lastId) {
        pins.delete(key);
        changed = true;
      }
    }
    const text = new Map(list.map((e) => [e.id, e.text]));
    const placedAt = (id: number, name: string) => {
      const key = `${id}\u0000${text.get(id) ?? ""}\u0000${name}`;
      const pinned = pins.get(key);
      if (pinned) return pinned;
      // only a line that arrived since the last build has a "before" worth trusting
      if (!before || id <= before.lastId) return null;
      const pin = { id, before: before.locate(name), now: locate(name) };
      pins.set(key, pin);
      changed = true;
      return pin;
    };
    const ctx: FeedContext = { players: [you, them], cardType, locate, placedAt, notes, controlTurns, viewer };
    const turns = buildActionFeed(list, ctx);
    if (changed) savePins();
    memo = { inputs, turns, locate, lastId };
    return turns;
  }, [events, permanents, sites, avatars, players, matchId, logLength, notes, controlTurns, viewer]);
}

/** Show a feed card in the preview (the inspector, or the floating preview on a phone). */
function previewByName(name: string | null) {
  if (!name) return;
  useGameStore.getState().setPreviewCard(cardRefFor(name) as CardRef);
}

/** A small card thumbnail, landscape for sites. */
function Thumb({ name, size }: { name: string; size: number }) {
  // cardRefFor caches once the art index has loaded; before that it is cheap to rebuild
  const ref = cardRefFor(name) as CardRef;
  const site = (ref.type ?? "").toLowerCase().includes("site");
  const long = size;
  const short = Math.round((size * 63) / 88);
  return (
    <span
      aria-hidden
      className="relative mt-0.5 flex-none overflow-hidden rounded-[3px] bg-black/40"
      style={site ? { width: long, height: short } : { width: short, height: long }}
    >
      <CardArt card={ref} sizes={`${long}px`} />
    </span>
  );
}

/** The sentence with its card's name set in the card face. */
function Sentence({ text, card }: { text: string; card: string | null }): ReactNode {
  const at = card ? text.indexOf(card) : -1;
  if (!card || at < 0) return text;
  return (
    <>
      {text.slice(0, at)}
      <span className="font-fantaisie text-rc-fg-strong">{card}</span>
      {text.slice(at + card.length)}
    </>
  );
}

const seatName = (seat: FeedSeat | null, them: string) => (seat === "p1" ? "Your turn" : seat === "p2" ? `${them}'s turn` : "");

function OutcomeRow({ outcome, colors }: { outcome: FeedOutcome; colors: ReturnType<typeof fxPalette> }) {
  const hurt = outcome.kind === "damage" || outcome.kind === "death" || outcome.kind === "destroy" || outcome.kind === "lifeLoss";
  const color = hurt ? colors.damage : undefined;
  const body = (
    <>
      <Icon
        icon={KIND_ICON[outcome.kind]}
        aria-hidden
        className={`h-3.5 w-3.5 flex-none ${outcome.kind === "lifeGain" ? "text-rc-success-ink" : hurt ? "" : "text-rc-fg-subtle"}`}
        style={color ? { color } : undefined}
      />
      <span className={`min-w-0 break-words ${outcome.kind === "note" ? "text-rc-fg-subtle" : "text-rc-fg"}`}>
        <Sentence text={outcome.text} card={outcome.card} />
      </span>
    </>
  );
  const row = "flex w-full items-start gap-1.5 text-left text-[12px] leading-snug";
  if (!outcome.card && !outcome.cells.length) return <li className={row}>{body}</li>;
  return (
    <li>
      <button
        type="button"
        className={`${row} rounded-rc-sm hover:bg-white/[0.04] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-rc-accent-ring`}
        onClick={() => {
          previewByName(outcome.card);
          if (outcome.cells.length) useBoard2DFocus.getState().set(outcome.cells);
        }}
      >
        {body}
      </button>
    </li>
  );
}

const FEED_IN = "@keyframes rc-feed-in{from{background-color:rgba(252,165,165,0.22)}to{background-color:rgba(252,165,165,0.05)}}";

function EntryRow({
  entry,
  newest,
  compact,
  colors,
}: {
  entry: FeedEntry;
  newest: boolean;
  compact: boolean;
  colors: ReturnType<typeof fxPalette>;
}) {
  const opponent = entry.seat === "p2";
  const seatColor = entry.seat ? PLAYER_COLORS[entry.seat] : undefined;
  const cells = entryCells(entry);
  const hover = useRef(false);
  const onPick = () => {
    previewByName(entry.card);
    if (cells.length) useBoard2DFocus.getState().set(cells);
  };
  return (
    <li
      className={`relative ${opponent ? "bg-[rgba(252,165,165,0.05)]" : ""} ${newest && opponent ? "motion-safe:[animation:rc-feed-in_1.6s_ease-out]" : ""}`}
    >
      {/* the opponent's lines carry their seat colour on the edge; the words say who, too */}
      {opponent && <span aria-hidden className="absolute inset-y-0 left-0 w-[3px]" style={{ background: PLAYER_COLORS.p2 }} />}
      <button
        type="button"
        onClick={onPick}
        onPointerEnter={(e) => {
          if (e.pointerType !== "mouse" || !entry.card) return;
          hover.current = true;
          previewByName(entry.card);
        }}
        onPointerLeave={(e) => {
          if (e.pointerType !== "mouse" || !hover.current) return;
          hover.current = false;
          const shown = useGameStore.getState().previewCard;
          if (shown?.name === entry.card) useGameStore.getState().setPreviewCard(null);
        }}
        title={cells.length ? "Show on the board" : undefined}
        className={`flex w-full items-start text-left transition-colors hover:bg-white/[0.04] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-rc-accent-ring ${compact ? "gap-2 px-2.5 py-1.5" : "gap-2.5 px-3.5 py-2"}`}
      >
        {entry.card ? (
          <Thumb name={entry.card} size={compact ? 34 : opponent ? 46 : 38} />
        ) : (
          // no card to show: the action's own icon fills the thumbnail's slot (one icon, not two)
          <span aria-hidden className={`flex flex-none items-start justify-center pt-0.5 ${compact ? "w-6" : "w-[27px]"}`}>
            <Icon icon={KIND_ICON[entry.kind]} className="h-4 w-4" style={{ color: seatColor }} />
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="flex items-start gap-1.5">
            {entry.card && (
              <Icon icon={KIND_ICON[entry.kind]} aria-hidden className="mt-[3px] h-3.5 w-3.5 flex-none" style={{ color: seatColor }} />
            )}
            <span
              className={`min-w-0 break-words leading-snug ${compact ? "text-[12px]" : "text-[13px]"} ${opponent ? "text-rc-fg" : "text-rc-fg-muted"}`}
            >
              <Sentence text={entry.text} card={entry.card} />
            </span>
          </span>
        </span>
      </button>
      {entry.outcomes.length > 0 && (
        <ul
          aria-label="Result"
          className={`flex flex-col gap-0.5 ${compact ? "pb-1.5 pl-[46px] pr-2.5" : opponent ? "pb-2 pl-[62px] pr-3.5" : "pb-2 pl-[56px] pr-3.5"}`}
        >
          {entry.outcomes.map((o) => (
            <OutcomeRow key={o.id} outcome={o} colors={colors} />
          ))}
        </ul>
      )}
    </li>
  );
}

/**
 * What both seats have done, newest on top, one group per turn: a card thumbnail, the action in
 * plain words with our tile numbers, and what it caused underneath (damage, deaths, destroyed
 * sites, life). The opponent's lines are emphasised — larger thumbnails, brighter text, their
 * seat colour on the edge, and a brief glow when a new one lands — because those are the ones
 * a player has to catch.
 *
 * Tapping an entry previews its card and flashes the tiles it concerns on the board (through
 * `useBoard2DFocus`); hovering with a mouse previews without the flash.
 */
export default function ActionFeed2D({ compact = false, title = true }: { compact?: boolean; title?: boolean }) {
  const turns = useActionFeed();
  const them = useEngineSession((s) => opponentName(s.game, s.seat));
  const colors = fxPalette(useVisualAid());
  const newestId = turns[0]?.entries[0]?.id;

  // keep the newest line in view when one arrives, unless the reader has scrolled away to read
  const scroller = useRef<HTMLDivElement>(null);
  const [pinned, setPinned] = useState(true);
  useLayoutEffect(() => {
    if (pinned && scroller.current) scroller.current.scrollTop = 0;
  }, [newestId, pinned]);
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const onScroll = () => setPinned(el.scrollTop < 24);
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <section aria-label="Recent actions" className="flex min-h-0 flex-1 flex-col">
      <style>{FEED_IN}</style>
      {title && (
        <header className={`flex flex-none items-center gap-1.5 ${compact ? "px-2.5 pb-1 pt-2" : "px-3.5 pb-1.5 pt-3"}`}>
          <Icon icon="game-icons:scroll-unfurled" aria-hidden className="h-3.5 w-3.5 text-rc-fg-subtle" />
          <h2 className="font-rc-sans text-[11px] font-medium uppercase tracking-[0.12em] text-rc-fg-subtle">Recent actions</h2>
        </header>
      )}
      {/* the bottom fades out, so an entry cut by the panel's edge reads as "more below"; the
          list's own bottom padding lets the last entry scroll clear of the fade */}
      <div
        ref={scroller}
        className="thin-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain [mask-image:linear-gradient(to_bottom,#000_calc(100%-28px),transparent)]"
      >
        {turns.length === 0 ? (
          <p className={`flex items-center gap-2 text-[12px] text-rc-fg-subtle ${compact ? "px-2.5 py-2" : "px-3.5 py-3"}`}>
            <Icon icon="game-icons:quill" aria-hidden className="h-4 w-4" />
            Nothing has happened yet.
          </p>
        ) : (
          <ol className="flex flex-col pb-6">
            {turns.map((turn) => {
              const color = turn.seat ? PLAYER_COLORS[turn.seat] : undefined;
              return (
                <li key={turn.key} className="flex flex-col">
                  <div
                    // a narrow column wraps the "played by" label onto its own line rather than
                    // squeezing the turn number and the seat into slivers
                    className={`sticky top-0 z-[1] flex flex-wrap items-center gap-x-2 gap-y-0.5 border-b border-rc-line/10 bg-[rgb(10,14,26)] font-rc-sans text-[11px] uppercase tracking-[0.1em] ${compact ? "px-2.5 py-1" : "px-3.5 py-1.5"}`}
                  >
                    <span className="flex-none whitespace-nowrap font-medium text-rc-fg-muted">{turn.turn === 0 ? "Opening" : `Turn ${turn.turn}`}</span>
                    {turn.seat && (
                      <span className="flex flex-none items-center gap-1.5 whitespace-nowrap normal-case tracking-normal" style={{ color }}>
                        <span aria-hidden className="h-1.5 w-1.5 flex-none rounded-full" style={{ background: color }} />
                        <span className="text-[12px]">{seatName(turn.seat, them)}</span>
                      </span>
                    )}
                    {/* Courtesan Thaïs: the other seat made this turn's decisions */}
                    {turn.playedBy && (
                      <span
                        className="ml-auto flex flex-none items-center gap-1 whitespace-nowrap normal-case tracking-normal text-rc-fg-subtle"
                        title="Courtesan Thaïs: each player's next turn is played by the other"
                      >
                        <Icon icon="game-icons:puppet" aria-hidden className="h-3.5 w-3.5 flex-none" style={{ color: PLAYER_COLORS[turn.playedBy] }} />
                        <span className="text-[11px]">{turn.playedBy === "p1" ? "played by you" : `played by ${them}`}</span>
                      </span>
                    )}
                  </div>
                  <ol className="flex flex-col divide-y divide-rc-line/[0.07]">
                    {turn.entries.map((entry) => (
                      <EntryRow key={entry.id} entry={entry} newest={entry.id === newestId} compact={compact} colors={colors} />
                    ))}
                  </ol>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </section>
  );
}
