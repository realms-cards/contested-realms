import { CARD_ASPECT, HAND_MIN_SLICE, handCardBox } from "./handStrip";

/** Hand2D's slim rail beside the cards (mana, the hand's split, draw buttons): a phone's and a roomier width. */
export const HAND_RAIL_W = { phone: 40, roomy: 52 } as const;
/** Hand2D's card area padding on each side. */
export const HAND_STRIP_PAD = 4;
/** The space that keeps the sites apart from the spells. */
export const HAND_GROUP_GAP = 12;

/**
 * How the hand fills its box:
 * - `grouped` (a phone held upright): sites and spells apart — the sites, lying on their side,
 *   in one or more columns, the spells in one to three rows beside them — using the box's whole
 *   width AND height rather than one strict row.
 * - `row` (landscape and wide): one row, sites and spells kept apart by a small gap, or two rows
 *   (one per kind) when the strip is tall enough for that to pay.
 */
export type HandLayoutMode = "grouped" | "row";

/** One card's place in the hand box, in px from the box's top-left corner. */
export interface HandSlot {
  /** display index (into the sorted hand) */
  index: number;
  x: number;
  y: number;
  w: number;
  h: number;
  landscape: boolean;
  /** an overlapped card lifts this way when hovered so it reads whole (null: no lift) */
  lift: "up" | null;
}

export interface HandLayout {
  slots: HandSlot[];
  /** the smallest upright-card height in the layout (a site's long edge counts as its height) */
  cardHeight: number;
  /** any card partly covers another */
  overlapping: boolean;
}

export interface HandLayoutInput {
  /** the box's inner size, px */
  width: number;
  height: number;
  /** one flag per card in display order: true for a site (lying on its side) */
  landscape: readonly boolean[];
  mode: HandLayoutMode;
  /** spacing between cards that do not overlap */
  gap: number;
  /** spacing between the sites and the spells, kept even when cards overlap */
  groupGap: number;
  /** readability floor for a card's height: under it, cards overlap down to HAND_MIN_SLICE instead */
  floor: number;
  /** the share of a covered card's length that stays in view when big cards overlap (0–1) */
  minVisible: number;
  /** row mode only: 2 lets a tall strip take the hand on two rows */
  maxRows?: number;
  /** the tallest an upright card may get */
  maxCardHeight?: number;
}

/** Two candidate layouts within this share of each other's size count as equally large. */
const SIZE_TOLERANCE = 0.06;
/** Row mode: a two-row layout must reach this share of the one-row size (when that one overlaps). */
const TWO_ROWS_MIN_SHARE = 0.8;
const MAX_SITE_COLUMNS = 3;
const MAX_SPELL_ROWS = 3;

type MinStep = (len: number) => number;

const stepRule = (keep: number | null): MinStep =>
  keep === null ? () => 1 : (len) => Math.min(len, Math.max(HAND_MIN_SLICE, Math.ceil(keep * len)));

interface Packed {
  /** start-to-start distance from each card to the next */
  steps: number[];
  span: number;
  overlapping: boolean;
}

/**
 * Lay `lens` along a line of `room` px: side by side with `gap` when they fit, else every
 * ordinary joint overlaps by the same amount (a group boundary keeps `groupGap`), each covered
 * card still showing `minStep(len)`. Null when that cannot fit.
 */
export function packLine(
  lens: readonly number[],
  breaks: readonly boolean[],
  room: number,
  gap: number,
  groupGap: number,
  minStep: MinStep,
): Packed | null {
  const n = lens.length;
  if (n === 0) return { steps: [], span: 0, overlapping: false };
  const total = lens.reduce((a, b) => a + b, 0);
  let fixed = 0;
  let normal = 0;
  for (let j = 0; j < n - 1; j += 1) {
    if (breaks[j]) fixed += groupGap;
    else normal += 1;
  }
  const natural = total + fixed + normal * gap;
  if (natural <= room) {
    return { steps: lens.slice(0, -1).map((len, j) => len + (breaks[j] ? groupGap : gap)), span: natural, overlapping: false };
  }
  if (normal === 0) return null;
  // shrink the gaps first; once they are gone, cards slide under their neighbours
  const overlap = Math.ceil((total + fixed - room) / normal);
  for (let j = 0; j < n - 1; j += 1) {
    if (!breaks[j] && overlap > 0 && lens[j] - overlap < minStep(lens[j])) return null;
  }
  const steps = lens.slice(0, -1).map((len, j) => (breaks[j] ? len + groupGap : len - overlap));
  return { steps, span: total + fixed - overlap * normal, overlapping: overlap > 0 };
}

/** Split `count` items into `parts` runs whose lengths differ by at most one, earlier runs longer. */
function chunks(items: readonly number[], parts: number): number[][] {
  const out: number[][] = [];
  let at = 0;
  for (let p = 0; p < parts; p += 1) {
    const size = Math.ceil((items.length - at) / (parts - p));
    out.push(items.slice(at, at + size));
    at += size;
  }
  return out.filter((c) => c.length > 0);
}

const siteShort = (h: number) => handCardBox(h, true).h;
const spellWidth = (h: number) => handCardBox(h, false).w;

interface Candidate {
  /** smallest upright height */
  min: number;
  sum: number;
  overlaps: number;
  slots: HandSlot[];
  /** grouped only: the sites' long edge and the spells' height, and which of the two overlap */
  kinds?: { site: number; spell: number; siteOver: boolean; spellOver: boolean };
}

/**
 * Portrait: what an overlapping arrangement's size is worth against cards side by side. A phone's
 * hand box is tall enough to lay most hands out whole; cards that cover each other cost their
 * names (a site's is on its hidden edge), and a raised pickable card hides its neighbour's slice.
 */
export const GROUPED_OVERLAP_COST = 0.8;

/**
 * Portrait, a hand of both kinds: the spells are what has to be read (cost, name, text), while
 * a site lying on its side is told apart by its art and its colour. So the spells' size counts
 * for most of a layout's worth, and the sites stacked in a column — slightly overlapped, the way
 * their wide format sits best — cost little: a column of three sites at a modest size beats two
 * columns that leave the spells too small to read.
 */
const SPELL_WEIGHT = 0.65;
/** What a slightly overlapped column of sites is worth against sites side by side. */
export const SITE_COLUMN_OVERLAP_COST = 0.94;

/** A candidate's size as `better` weighs it. */
const worth = (c: Candidate, overlapCost: number) => {
  const k = c.kinds;
  if (k && k.site > 0 && k.spell > 0) {
    const spell = k.spell * (k.spellOver ? overlapCost : 1);
    // a site larger than the spells buys nothing: past that its size is the spells' loss
    const site = Math.min(spell, k.site * (k.siteOver ? SITE_COLUMN_OVERLAP_COST : 1));
    return spell ** SPELL_WEIGHT * site ** (1 - SPELL_WEIGHT);
  }
  return c.min * (c.overlaps > 0 ? overlapCost : 1);
};

function better(a: Candidate, b: Candidate | null, overlapCost = 1, floor = 0): boolean {
  if (!b) return true;
  // the cost of overlap never trades a readable card for one under the floor
  if (a.min >= floor !== b.min >= floor) return a.min >= floor;
  const wa = worth(a, overlapCost);
  const wb = worth(b, overlapCost);
  if (wa > wb * (1 + SIZE_TOLERANCE)) return true;
  if (wb > wa * (1 + SIZE_TOLERANCE)) return false;
  if (a.overlaps !== b.overlaps) return a.overlaps < b.overlaps;
  return a.min + a.sum > b.min + b.sum;
}

/** The largest h in [1, hi] where `fits(h)` holds, assuming it holds for every smaller h (rounding aside). */
function largest(hi: number, fits: (h: number) => boolean): number {
  if (hi < 1) return 0;
  let lo = 0;
  let top = Math.floor(hi);
  while (lo < top) {
    const mid = Math.ceil((lo + top) / 2);
    if (fits(mid)) lo = mid;
    else top = mid - 1;
  }
  // box rounding can make fit non-monotonic by a pixel: settle on a height that truly fits
  while (lo > 0 && !fits(lo)) lo -= 1;
  return lo;
}

/** Positions for cards along a line starting at `start`, from packLine's steps. */
const offsets = (start: number, steps: readonly number[]) => {
  const out = [start];
  steps.forEach((s) => out.push(out[out.length - 1] + s));
  return out;
};

/** Grouped (portrait) candidates: every site-column x spell-row arrangement, sizes searched. */
function solveGrouped(input: HandLayoutInput, minStep: MinStep, cap: number): Candidate | null {
  const { width: W, height: C, landscape, gap, groupGap } = input;
  const all = landscape.map((_, i) => i);
  const sites = all.filter((i) => landscape[i]);
  const spells = all.filter((i) => !landscape[i]);
  const ns = sites.length;
  const np = spells.length;
  const sitesFirst = ns > 0 && landscape[0];
  const sideGap = ns > 0 && np > 0 ? groupGap : 0;
  let best: Candidate | null = null;
  const pool: Candidate[] = [];

  const siteColsOptions = ns > 0 ? Array.from({ length: Math.min(ns, MAX_SITE_COLUMNS) }, (_, k) => k + 1) : [0];
  const spellRowsOptions = np > 0 ? Array.from({ length: Math.min(np, MAX_SPELL_ROWS) }, (_, k) => k + 1) : [0];

  const siteColumnsFit = (cols: number[][], hs: number) =>
    cols.every((col) => packLine(col.map(() => siteShort(hs)), [], C, gap, 0, minStep) !== null);
  const spellRowsPack = (rows: number[][], hp: number, room: number) =>
    rows.map((row) => packLine(row.map(() => spellWidth(hp)), [], room, gap, 0, minStep));

  for (const siteCols of siteColsOptions) {
    const cols = siteCols > 0 ? chunks(sites, siteCols) : [];
    for (const spellRows of spellRowsOptions) {
      const rows = spellRows > 0 ? chunks(spells, spellRows) : [];
      const hsMax =
        ns > 0
          ? Math.min(cap, Math.floor((W - (siteCols - 1) * gap - (np > 0 ? sideGap + 1 : 0)) / siteCols), Math.floor(C / CARD_ASPECT) + 1)
          : 0;
      const hpCap = np > 0 ? Math.min(cap, Math.floor((C - (spellRows - 1) * gap) / spellRows)) : 0;
      // site heights from the largest that fits its column(s) downwards; spells take the width left
      const hsTop = ns > 0 ? largest(hsMax, (h) => siteShort(h) <= C && siteColumnsFit(cols, h)) : 0;
      for (let hs = hsTop; ns === 0 ? hs === 0 : hs >= 1; hs -= 1) {
        if (best && ns > 0) {
          // the best any layout with sites this small can still be worth: spells at their cap
          const bound = np > 0 ? hpCap ** SPELL_WEIGHT * Math.min(hs, hpCap) ** (1 - SPELL_WEIGHT) : hs;
          if (bound * (1 + SIZE_TOLERANCE) < worth(best, GROUPED_OVERLAP_COST)) break;
          if (hs < input.floor && best.min >= input.floor) break;
        }
        const sitesW = ns > 0 ? siteCols * hs + (siteCols - 1) * gap : 0;
        const roomW = W - sitesW - sideGap;
        if (np > 0 && roomW < 1) {
          if (ns === 0) break;
          continue;
        }
        const variants: number[] = [];
        if (np > 0) {
          const over = largest(hpCap, (h) => spellRowsPack(rows, h, roomW).every((p) => p !== null));
          const flat = largest(hpCap, (h) => spellRowsPack(rows, h, roomW).every((p) => p !== null && !p.overlapping));
          if (over > 0) variants.push(over);
          if (flat > 0 && flat !== over) variants.push(flat);
        } else variants.push(0);
        for (const hp of variants) {
          const cand = placeGrouped(input, cols, rows, hs, hp, sitesFirst, sideGap, minStep);
          if (!cand) continue;
          pool.push(cand);
          if (better(cand, best, GROUPED_OVERLAP_COST, input.floor)) best = cand;
        }
        if (ns === 0) break;
      }
    }
  }
  return pickFrom(pool, GROUPED_OVERLAP_COST, input.floor);
}

/**
 * The pool's winner, chosen against the single largest worth (so a chain of near-ties can never
 * drift down to a clearly smaller layout): among the candidates within SIZE_TOLERANCE of the
 * best, the fewest overlaps, then the largest sizes. Readable (at or above the floor) first.
 */
function pickFrom(pool: readonly Candidate[], overlapCost: number, floor: number): Candidate | null {
  if (pool.length === 0) return null;
  const readable = pool.filter((c) => c.min >= floor);
  const field = readable.length > 0 ? readable : pool;
  const top = Math.max(...field.map((c) => worth(c, overlapCost)));
  const near = field.filter((c) => worth(c, overlapCost) * (1 + SIZE_TOLERANCE) >= top);
  return near.reduce((a, b) => {
    if (a.overlaps !== b.overlaps) return a.overlaps < b.overlaps ? a : b;
    const wa = worth(a, overlapCost);
    const wb = worth(b, overlapCost);
    if (wa !== wb) return wa > wb ? a : b;
    return a.min + a.sum >= b.min + b.sum ? a : b;
  });
}

function placeGrouped(
  input: HandLayoutInput,
  cols: number[][],
  rows: number[][],
  hs: number,
  hp: number,
  sitesFirst: boolean,
  sideGap: number,
  minStep: MinStep,
): Candidate | null {
  const { width: W, height: C, gap } = input;
  const slots: HandSlot[] = [];
  let overlaps = 0;
  const sitesW = cols.length > 0 ? cols.length * hs + (cols.length - 1) * gap : 0;
  const roomW = W - sitesW - sideGap;
  const packedRows = rows.map((row) => packLine(row.map(() => spellWidth(hp)), [], roomW, gap, 0, minStep));
  if (packedRows.some((p) => p === null)) return null;
  const spellsW = Math.max(0, ...packedRows.map((p) => (p ? p.span : 0)));
  const compW = sitesW + (cols.length > 0 && rows.length > 0 ? sideGap : 0) + spellsW;
  const x0 = Math.max(0, Math.floor((W - compW) / 2));
  const sitesX = sitesFirst || rows.length === 0 ? x0 : x0 + spellsW + sideGap;
  const spellsX = sitesFirst && cols.length > 0 ? x0 + sitesW + sideGap : x0;

  const sh = siteShort(hs);
  for (let c = 0; c < cols.length; c += 1) {
    const packed = packLine(cols[c].map(() => sh), [], C, gap, 0, minStep);
    if (!packed) return null;
    if (packed.overlapping) overlaps += 1;
    const ys = offsets(Math.floor((C - packed.span) / 2), packed.steps);
    cols[c].forEach((index, k) =>
      slots.push({ index, x: sitesX + c * (hs + gap), y: ys[k], w: hs, h: sh, landscape: true, lift: null }),
    );
  }
  const pw = spellWidth(hp);
  const blockH = rows.length * hp + Math.max(0, rows.length - 1) * gap;
  const y0 = Math.floor((C - blockH) / 2);
  rows.forEach((row, r) => {
    const packed = packedRows[r];
    if (!packed) return;
    if (packed.overlapping) overlaps += 1;
    const xs = offsets(spellsX + Math.floor((spellsW - packed.span) / 2), packed.steps);
    row.forEach((index, k) =>
      slots.push({ index, x: xs[k], y: y0 + r * (hp + gap), w: pw, h: hp, landscape: false, lift: packed.overlapping ? "up" : null }),
    );
  });
  const heights = [...(cols.length > 0 ? [hs] : []), ...(rows.length > 0 ? [hp] : [])];
  const siteOver = slots.some((a) => a.landscape && slots.some((b) => b !== a && b.landscape && b.x === a.x && Math.abs(b.y - a.y) < a.h));
  const spellOver = packedRows.some((p) => p?.overlapping);
  return {
    min: Math.min(...heights),
    sum: heights.reduce((a, b) => a + b, 0),
    overlaps,
    slots: slots.sort((a, b) => a.index - b.index),
    kinds: { site: cols.length > 0 ? hs : 0, spell: rows.length > 0 ? hp : 0, siteOver, spellOver },
  };
}

/** One row of the given cards (display indices) at its largest height in `room` x `cross`. */
function solveLine(input: HandLayoutInput, indices: readonly number[], room: number, cross: number, minStep: MinStep, cap: number) {
  const { landscape, gap, groupGap } = input;
  const kinds = indices.map((i) => landscape[i]);
  const breaks = kinds.slice(0, -1).map((k, j) => k !== kinds[j + 1]);
  const lensAt = (h: number) => kinds.map((l) => handCardBox(h, l).w);
  const tallest = (h: number) => Math.max(...kinds.map((l) => handCardBox(h, l).h));
  const hTop = Math.min(cap, Math.floor(cross / (kinds.some((l) => !l) ? 1 : CARD_ASPECT)) + 1);
  const h = largest(hTop, (height) => tallest(height) <= cross && packLine(lensAt(height), breaks, room, gap, groupGap, minStep) !== null);
  if (h < 1) return null;
  const packed = packLine(lensAt(h), breaks, room, gap, groupGap, minStep);
  return packed ? { h, packed, kinds } : null;
}

function solveRow(input: HandLayoutInput, minStep: MinStep, cap: number, center = false): Candidate | null {
  const { width: W, height: C, landscape, gap, maxRows = 1 } = input;
  const all = landscape.map((_, i) => i);
  const place = (lines: { indices: readonly number[]; y: number; cross: number }[]): Candidate | null => {
    const slots: HandSlot[] = [];
    const heights: number[] = [];
    let overlaps = 0;
    for (const line of lines) {
      const fit = solveLine(input, line.indices, W, line.cross, minStep, cap);
      if (!fit) return null;
      heights.push(fit.h);
      if (fit.packed.overlapping) overlaps += 1;
      const xs = offsets(center ? Math.max(0, Math.floor((W - fit.packed.span) / 2)) : 0, fit.packed.steps);
      line.indices.forEach((index, k) => {
        const box = handCardBox(fit.h, fit.kinds[k]);
        slots.push({
          index,
          x: xs[k],
          y: line.y + Math.floor((line.cross - box.h) / 2),
          w: box.w,
          h: box.h,
          landscape: fit.kinds[k],
          lift: fit.packed.overlapping ? "up" : null,
        });
      });
    }
    return { min: Math.min(...heights), sum: heights.reduce((a, b) => a + b, 0), overlaps, slots };
  };
  const one = place([{ indices: all, y: 0, cross: C }]);
  if (maxRows < 2 || all.length < 4) return one;
  const sites = all.filter((i) => landscape[i]);
  const spells = all.filter((i) => !landscape[i]);
  const halves =
    sites.length > 0 && spells.length > 0
      ? landscape[0]
        ? [sites, spells]
        : [spells, sites]
      : [all.slice(0, Math.ceil(all.length / 2)), all.slice(Math.ceil(all.length / 2))];
  const rowCross = Math.floor((C - gap) / 2);
  if (rowCross < 1) return one;
  const two = place(halves.map((indices, r) => ({ indices, y: r * (rowCross + gap), cross: rowCross })));
  if (!two || two.overlaps > 0) return one;
  if (!one) return two;
  if (two.min > one.min) return two;
  if (one.overlaps > 0 && two.min >= one.min * TWO_ROWS_MIN_SHARE) return two;
  return one;
}

/**
 * Grouped first; a plain row (sites and spells still apart, on one or two lines) only when it
 * makes the cards clearly larger — e.g. one site beside a few spells, where a site column
 * would waste the box's height.
 */
function solvePortrait(input: HandLayoutInput, minStep: MinStep, cap: number): Candidate | null {
  const grouped = solveGrouped(input, minStep, cap);
  const row = solveRow({ ...input, maxRows: 2 }, minStep, cap, true);
  if (!row) return grouped;
  if (!grouped) return row;
  if (row.min >= input.floor !== grouped.min >= input.floor) return row.min >= input.floor ? row : grouped;
  return worth(row, GROUPED_OVERLAP_COST) > worth(grouped, GROUPED_OVERLAP_COST) * (1 + SIZE_TOLERANCE) ? row : grouped;
}

/**
 * Place every hand card in a `width` x `height` box, as large as the box allows (size first:
 * big cards that overlap, each covered one still showing `minVisible` of itself, beat small ones
 * side by side). Under the readability floor the cards overlap further, down to HAND_MIN_SLICE.
 * Sites and spells are always kept apart. Pure: Hand2D renders the slots as they come.
 */
export function layoutHand(input: HandLayoutInput): HandLayout {
  const n = input.landscape.length;
  if (n === 0 || !(input.width > 0) || !(input.height > 0)) return { slots: [], cardHeight: 0, overlapping: false };
  const cap = Math.max(1, Math.floor(input.maxCardHeight ?? Number.MAX_SAFE_INTEGER));
  const solve = input.mode === "grouped" ? solvePortrait : solveRow;
  const keep = Math.min(1, Math.max(0, input.minVisible));
  let pick = solve(input, stepRule(keep), cap);
  if (!pick || pick.min < input.floor) {
    // under the floor: overlap more (a slice per card) rather than shrink further
    const slice = solve(input, stepRule(0), Math.min(cap, Math.max(Math.floor(input.floor), pick?.min ?? 0)));
    if (slice && (!pick || slice.min > pick.min)) pick = slice;
  }
  // a hand too big even for slices: anything that fits beats nothing
  pick ??= solve(input, stepRule(null), cap);
  if (!pick) return { slots: [], cardHeight: 0, overlapping: false };
  return { slots: pick.slots, cardHeight: pick.min, overlapping: pick.overlaps > 0 };
}
