import type { CardRef, CellKey, PlayerKey } from "@/lib/game/store/types";
import type { Placed } from "./layout2d";
import { tileMin, type TileSize } from "./picks2d";

/*
 * What changed on the board between two projections, for the motion layer (BoardMotion2D):
 * who moved where, who left the board and why, who arrived, who took damage. Pure, so the
 * rules are pinned by tests. Positions are in TILE units (a card centre at 2.5 is the middle of
 * the third column), so an effect already in flight survives the board being resized.
 */

/** One card on the board, in tile units. */
export interface BoardSnap {
  key: string;
  token: string;
  owner: PlayerKey;
  card: CardRef;
  cell: CellKey;
  /** card centre in tiles (x in tile widths, y in tile heights); portrait size in the tile's smaller edge (a card keeps its shape) */
  x: number;
  y: number;
  w: number;
  h: number;
  rotate: 0 | 90;
  damage: number;
}

/**
 * Why a card left the board. `alive` means it did not: it went to the other layer, was picked
 * up as a carried artifact, or the like — no effect for that.
 */
export type Fate = "alive" | "dead" | "banished" | "returned" | "gone";

export interface BoardMove {
  key: string;
  owner: PlayerKey;
  /** the card as it stood before the move: the ghost left at the origin */
  ghost: BoardSnap;
  to: BoardSnap;
}

export interface BoardRemoval {
  snap: BoardSnap;
  fate: Exclude<Fate, "alive">;
}

export interface BoardDiff {
  moves: BoardMove[];
  removed: BoardRemoval[];
  arrived: BoardSnap[];
  /** keys of cards whose damage counter rose */
  hurt: string[];
}

export const EMPTY_DIFF: BoardDiff = { moves: [], removed: [], arrived: [], hurt: [] };

export function snapBoard(placed: readonly Placed[], tile: TileSize): BoardSnap[] {
  const edge = tileMin(tile);
  if (!(edge > 0)) return [];
  return placed.map((p) => ({
    key: p.key,
    token: p.token,
    owner: p.owner,
    card: p.card,
    cell: p.cell,
    x: p.x / tile.w,
    y: p.y / tile.h,
    w: p.w / edge,
    h: p.h / edge,
    rotate: p.rotate,
    damage: p.badges.damage,
  }));
}

/**
 * Diff two snapshots by card key (`perm:<engine id>` / `avatar:<seat>`, stable across moves).
 * A card counts as moved only when its CELL changed — a re-layout on its own tile (a neighbour
 * arriving, tapping) is not a move. A vanished card is asked its `fateOf`; one still alive
 * elsewhere (other layer, carried) produces nothing.
 */
export function diffBoard(
  prev: readonly BoardSnap[] | null,
  next: readonly BoardSnap[],
  fateOf: (key: string) => Fate,
): BoardDiff {
  if (!prev) return EMPTY_DIFF;
  const before = new Map(prev.map((s) => [s.key, s]));
  const after = new Map(next.map((s) => [s.key, s]));
  const diff: BoardDiff = { moves: [], removed: [], arrived: [], hurt: [] };
  for (const snap of next) {
    const was = before.get(snap.key);
    if (!was) {
      diff.arrived.push(snap);
      continue;
    }
    if (was.cell !== snap.cell) diff.moves.push({ key: snap.key, owner: snap.owner, ghost: was, to: snap });
    if (snap.damage > was.damage) diff.hurt.push(snap.key);
  }
  for (const snap of prev) {
    if (after.has(snap.key)) continue;
    const fate = fateOf(snap.key);
    if (fate !== "alive") diff.removed.push({ snap, fate });
  }
  return diff;
}

/** The engine id behind a board card key, or null for avatars and slot keys. */
export function engineIdOfKey(key: string): string | null {
  return key.startsWith("perm:") ? key.slice(5) : null;
}

/** The pieces of engine state a card's fate is read from. */
export interface FateSource {
  units: Readonly<Record<string, unknown>>;
  artifacts: Readonly<Record<string, unknown>>;
  auras: Readonly<Record<string, unknown>>;
  sites: Readonly<Record<string, unknown>>;
  players: readonly { cemetery: readonly string[]; banished: readonly string[]; hand: readonly string[] }[];
}

/**
 * Where a card that left the board went. `cardIdOf` remembers the engine card behind a board
 * id from the previous state (the unit record is gone by now). Avatars never leave.
 */
export function fateOf(key: string, game: FateSource | null, cardIdOf: (id: string) => string | undefined): Fate {
  const id = engineIdOfKey(key);
  if (!id || !game) return "alive";
  if (game.units[id] || game.artifacts[id] || game.auras[id] || game.sites[id]) return "alive";
  const cardId = cardIdOf(id);
  if (cardId) {
    for (const player of game.players) {
      if (player.cemetery.includes(cardId)) return "dead";
      if (player.banished.includes(cardId)) return "banished";
      if (player.hand.includes(cardId)) return "returned";
    }
  }
  return "gone";
}

// ---------------------------------------------------------------------------------------------
// Timing and geometry for the motion layer

/** A damage number rises and fades over this long. */
export const HIT_MS = 1600;
/** A movement trail and its origin ghost linger this long. */
export const TRAIL_MS = 2500;
/** A removed card crumbles over this long, after its hold. */
export const CRUMBLE_MS = 1100;
/** The tombstone stays a little after the card has gone. */
export const TOMB_MS = 1700;
/** A newly arrived opponent card glows this long. */
export const ARRIVE_MS = 1800;
/** An attack marker and strike line last this long. */
export const STRIKE_MS = 2000;
/** The red impact flash on a hit card. */
export const IMPACT_MS = 700;
/** A "look here" tile flash (the action feed's focus request). */
export const FOCUS_MS = 1800;
/** A source -> target line draws itself and fades over this long. */
export const BEAM_MS = 1500;

export interface Segment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/**
 * A line from one point to another, trimmed at both ends so it starts outside the source card
 * and its arrowhead stops short of the target instead of hiding under it. Null when the two are
 * too close for a line to say anything.
 */
export function trimmedSegment(
  from: { x: number; y: number },
  to: { x: number; y: number },
  startGap: number,
  endGap: number,
): Segment | null {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  if (length <= startGap + endGap + 4) return null;
  const ux = dx / length;
  const uy = dy / length;
  return { x1: from.x + ux * startGap, y1: from.y + uy * startGap, x2: to.x - ux * endGap, y2: to.y - uy * endGap };
}

/** The centre of a board cell, in px. */
export function cellCentre(cell: string, tile: TileSize): { x: number; y: number } | null {
  const [x, y] = cell.split(",").map(Number);
  if (!Number.isInteger(x) || !Number.isInteger(y)) return null;
  return { x: (x + 0.5) * tile.w, y: (y + 0.5) * tile.h };
}

/**
 * The board pieces an attack narration names: the computer's `publish` lights the attacker
 * first and the victim (a unit token, or the attacked square) last. Null when the narration
 * is not an attack or names fewer than two things.
 */
export function attackOf(text: string, glow: readonly string[]): { attacker: string; target: string } | null {
  if (!/\battacks\b/.test(text) || glow.length < 2) return null;
  const attacker = glow[0];
  const target = glow[glow.length - 1];
  return attacker && target && attacker !== target ? { attacker, target } : null;
}

/** Web Animations keyframes for the big damage number: punches in, rises, fades. */
export function hitKeyframes(lift: number, reduced: boolean): Keyframe[] {
  if (reduced) {
    return [
      { offset: 0, opacity: 0 },
      { offset: 0.1, opacity: 1 },
      { offset: 0.7, opacity: 1 },
      { offset: 1, opacity: 0 },
    ];
  }
  const px = (n: number) => `${Math.round(n * lift * 10) / 10}px`;
  return [
    { offset: 0, opacity: 0, transform: `translateY(${px(4)}) scale(0.4)` },
    { offset: 0.1, opacity: 1, transform: "translateY(0px) scale(1.35)" },
    { offset: 0.22, opacity: 1, transform: `translateY(${px(-4)}) scale(1)` },
    { offset: 0.7, opacity: 1, transform: `translateY(${px(-22)}) scale(1)` },
    { offset: 1, opacity: 0, transform: `translateY(${px(-36)}) scale(1.08)` },
  ];
}

/** The removed card: holds (still readable) for `holdShare` of the run, then crumbles away. */
export function crumbleKeyframes(holdShare: number, reduced: boolean): Keyframe[] {
  const hold = Math.min(0.85, Math.max(0, holdShare));
  if (reduced) {
    return [
      { offset: 0, opacity: 0.9 },
      { offset: hold, opacity: 0.9 },
      { offset: 1, opacity: 0 },
    ];
  }
  const mid = hold + (1 - hold) * 0.35;
  return [
    { offset: 0, opacity: 0.95, filter: "grayscale(0) blur(0px)", transform: "translateY(0px) scale(1) rotate(0deg)" },
    { offset: hold, opacity: 0.95, filter: "grayscale(0.2) blur(0px)", transform: "translateY(0px) scale(1) rotate(0deg)" },
    { offset: mid, opacity: 0.8, filter: "grayscale(1) blur(0.5px)", transform: "translateY(1px) scale(0.97) rotate(-2deg)" },
    { offset: 1, opacity: 0, filter: "grayscale(1) blur(3px)", transform: "translateY(8px) scale(0.82) rotate(4deg)" },
  ];
}
