import { aura2x2Squares, edgesConnected } from "@sorcery/shared";
import type { GameState as EngineState } from "@sorcery/shared";
import { engineCellKey } from "./coords";

/**
 * The board logic behind the engine's two AREA prompts, kept out of the component so it can be
 * checked against the engine's own rules rather than through a rendered board.
 *
 * - `area2x2` chooseSquare prompts answer with an ANCHOR, and the four squares it covers are
 *   only implied. `areaFootprints` makes them explicit so the board can wash them.
 * - `sitePermutation` (Earthquake) takes the FINAL arrangement in one shot. The engine validates
 *   it as a bijection of the area and rejects the whole thing otherwise, so what we send has to
 *   be a permutation by construction.
 */

/** Anchor tile token -> the board cells picking that anchor would cover. */
export function areaFootprints(game: EngineState, anchors: readonly { x: number; y: number }[]): Record<string, string[]> {
  // Magellan Globe joins the board's edges, and then a 2x2 wraps around them
  const wrap = edgesConnected(game);
  const out: Record<string, string[]> = {};
  for (const anchor of anchors) {
    out[engineCellKey(anchor.x, anchor.y)] = aura2x2Squares(anchor, wrap).map((sq) => engineCellKey(sq.x, sq.y));
  }
  return out;
}

export interface EngineEdge {
  a: { x: number; y: number };
  b: { x: number; y: number };
  /** the engine's own identifier for the border — what the continuation matches on */
  key: string;
}

/**
 * Border token -> the two board cells it runs between.
 *
 * A Wall aura sits ON a border rather than on a square, and Scatter and Displace both shove one.
 * The engine sends those prompts as `chooseSquare` with `edgeSelect` and `edges` and NO `squares`,
 * so a client that only reads `squares` arms nothing and the prompt cannot be answered at all.
 * Feeding the pair of squares through the same area machinery puts a marker on the border itself
 * (the midpoint of the two cells) and lights both squares it divides.
 */
export function edgeFootprints(edges: readonly EngineEdge[]): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const edge of edges) {
    if (!edge?.key) continue;
    out[edgeToken(edge.key)] = [engineCellKey(edge.a.x, edge.a.y), engineCellKey(edge.b.x, edge.b.y)];
  }
  return out;
}

/** Namespaced so no other board renderer mistakes a border for a tile. */
export const edgeToken = (key: string): string => `edge:${key}`;

export interface AreaSlot {
  x: number;
  y: number;
}

/**
 * The engine's `placements`: each square of the area paired with the square whose site (and
 * normal-size contents) should land on it. `holders[i]` is the slot whose site ends up on slot
 * `i`, which is how a run of pairwise swaps is accumulated — it stays a permutation because
 * every swap is a transposition of that array.
 *
 * An untouched arrangement answers with nothing at all: the engine reads an empty answer as
 * "rearrange nothing" and skips straight to the burrow.
 */
export function permutationPlacements<T extends AreaSlot>(
  slots: readonly T[],
  holders: readonly number[],
): { x: number; y: number; sx: number; sy: number }[] {
  if (holders.every((holder, slot) => holder === slot)) return [];
  return slots.map((slot, i) => {
    const from = slots[holders[i]] ?? slot;
    return { x: slot.x, y: slot.y, sx: from.x, sy: from.y };
  });
}

/** Trade the sites on two slots. Out-of-range or identical slots leave the arrangement alone. */
export function swapSlots(holders: readonly number[], a: number, b: number): number[] {
  if (a === b || a < 0 || b < 0 || a >= holders.length || b >= holders.length) return [...holders];
  const next = [...holders];
  [next[a], next[b]] = [next[b], next[a]];
  return next;
}
