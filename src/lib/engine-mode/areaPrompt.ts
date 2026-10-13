import { aura2x2Squares, edgesConnected, getCard, getScript } from "@sorcery/shared";
import type { Action, GameState as EngineState } from "@sorcery/shared";
import { engineCellKey, type ViewerSeat } from "./coords";

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
export function areaFootprints(
  game: EngineState,
  anchors: readonly { x: number; y: number }[],
  viewer: ViewerSeat = 0,
): Record<string, string[]> {
  // Magellan Globe joins the board's edges, and then a 2x2 wraps around them
  const wrap = edgesConnected(game);
  const out: Record<string, string[]> = {};
  for (const anchor of anchors) {
    out[engineCellKey(anchor.x, anchor.y, viewer)] = aura2x2Squares(anchor, wrap).map((sq) =>
      engineCellKey(sq.x, sq.y, viewer),
    );
  }
  return out;
}

/**
 * The footprint of every Aura among `actions`, keyed by the tile token of the square it would be
 * anchored on.
 *
 * An ordinary aura cast never raises a prompt — the square is part of the action and our
 * click-path offers it as a plain tile, which told the player nothing about the four sites they
 * were about to cover. Feeding these to the picker turns those tiles into markers on the
 * crossings, with the covered sites lit under the pointer.
 *
 * An aura that covers ONE site needs no footprint (the tile it sits on says it), and a Wall
 * picks its border afterwards in its own Genesis step, so both are deliberately left out and
 * stay ordinary tiles — as are the auras in SINGLE_SQUARE_AURAS.
 */
/**
 * Auras that end up on ONE square although nothing static says so.
 *
 * The engine decides an aura's footprint twice. `singleSiteAura` / `edgeAura` are declared up
 * front and we can read them — but a Genesis may simply overwrite `aura.squares` afterwards,
 * and these two set it to the single square they were conjured on. Upstream cannot express
 * that with the flag it has: `singleSiteAura` makes the engine offer only squares that HOLD a
 * site, which is right for Salt the Earth ("conjured atop a site") and exactly wrong for Sow
 * the Earth ("needs a void square"). Upstream's own placement UI shows 2x2 markers for both.
 *
 * So the list is kept here, and `auraShapes.test.ts` re-derives it from the vendored scripts on
 * every run: if a re-vendor brings in another aura that rewrites its squares, that test fails
 * rather than the board quietly promising four sites and delivering one.
 *
 * Thunderstorm is deliberately NOT here — it only translates its squares as it drifts, so the
 * 2x2 it is placed as is honest.
 */
export const SINGLE_SQUARE_AURAS: ReadonlySet<string> = new Set(["Salt the Earth", "Sow the Earth"]);

export function auraFootprints(
  game: EngineState,
  actions: readonly Action[],
  viewer: ViewerSeat = 0,
): Record<string, string[]> {
  const anchors: { x: number; y: number }[] = [];
  const seen = new Set<string>();
  for (const action of actions) {
    if (action.t !== "castSpell" || !action.at) continue;
    const name = game.cards[action.cardId]?.name;
    if (!name || getCard(name)?.type !== "Aura") continue;
    const script = getScript(name) as { singleSiteAura?: boolean; edgeAura?: boolean } | undefined;
    if (script?.singleSiteAura || script?.edgeAura || SINGLE_SQUARE_AURAS.has(name)) continue;
    const key = `${action.at.x},${action.at.y}`;
    if (seen.has(key)) continue;
    seen.add(key);
    anchors.push({ x: action.at.x, y: action.at.y });
  }
  return anchors.length ? areaFootprints(game, anchors, viewer) : {};
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
export function edgeFootprints(edges: readonly EngineEdge[], viewer: ViewerSeat = 0): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const edge of edges) {
    if (!edge?.key) continue;
    out[edgeToken(edge.key)] = [engineCellKey(edge.a.x, edge.a.y, viewer), engineCellKey(edge.b.x, edge.b.y, viewer)];
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
