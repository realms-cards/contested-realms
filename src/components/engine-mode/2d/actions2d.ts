import type { VisualAid } from "@/hooks/useGraphicsSettings";
import type { BoardLayer, BoardReveal, HiddenCounts } from "@/lib/engine-mode/projection";
import { BOARD_COLS, BOARD_ROWS, tileMin, type TileSize } from "./picks2d";

/**
 * The pure half of the 2D view's action bar, status line and event effects: which button is
 * the commit, what the layer toggle says, which line the status strip shows, and where each
 * piece of an engine event lands on a flat board. Kept free of React and the stores so it can
 * be tested directly.
 */

// ---------------------------------------------------------------------------------------------
// Action bar

/** Units on the other layer, summed over every cell — the count on the layer toggle. */
export function hiddenTotal(hidden: Readonly<Record<string, HiddenCounts>>): number {
  let total = 0;
  for (const counts of Object.values(hidden)) total += counts.underground + counts.underwater + counts.surface;
  return total;
}

export interface LayerToggle {
  /** short button text: the layer a tap switches TO */
  label: string;
  /** units on the layer that is not shown */
  count: number;
  /** full accessible description */
  title: string;
}

/** What the layer button says. `hiddenLayerCounts` only counts the layer that is NOT shown. */
export function layerToggle(layer: BoardLayer, hidden: Readonly<Record<string, HiddenCounts>>): LayerToggle {
  const count = hiddenTotal(hidden);
  if (layer === "surface") {
    return {
      label: "Below",
      count,
      title: count ? `Show the subsurface: ${count} burrowed or submerged (V)` : "Show the subsurface (V)",
    };
  }
  return {
    label: "Surface",
    count,
    title: count ? `Back to the surface: ${count} above (V)` : "Back to the surface (V)",
  };
}

export interface PrimaryInput {
  over: boolean;
  /** our main phase (or the turn we are piloting) with nothing pending */
  myMain: boolean;
  /** the clicks so far pick an action that Confirm would take as is */
  confirmable: boolean;
  /** a source or target has been clicked */
  picking: boolean;
  /** the board is offering any choice at all */
  active: boolean;
}

export interface PrimaryAction {
  kind: "confirm" | "endTurn" | "restart";
  label: string;
  enabled: boolean;
  /** drawn gold: THE affirmative action right now, never more than one */
  commit: boolean;
}

/**
 * The bar's leading slot. Confirm and End turn share it — the 3D rail never shows both — so
 * the slot never moves under a thumb.
 *
 * Gold is kept for the one action that is the obvious next step: Confirm when a half-picked
 * action can be taken, Play again once the game is over, and End turn only when the board has
 * nothing else left to offer. While other moves remain End turn stays an outline, so it never
 * reads as the recommended click.
 */
export function primaryAction({ over, myMain, confirmable, picking, active }: PrimaryInput): PrimaryAction {
  if (over) return { kind: "restart", label: "Play again", enabled: true, commit: true };
  if (confirmable) return { kind: "confirm", label: "Confirm", enabled: true, commit: true };
  const enabled = myMain && !picking;
  return { kind: "endTurn", label: "End turn", enabled, commit: enabled && !active };
}

// ---------------------------------------------------------------------------------------------
// Status line

export interface StatusInput {
  hovered: string | null;
  labels: Readonly<Record<string, string>>;
  /** the computer's current narration line, already expired by the caller when stale */
  narration: string | null;
  botThinking: boolean;
}

export interface StatusLine {
  text: string;
  /** hint = what the pointed-at token does; cpu = the computer's narration; thinking = it is planning */
  kind: "hint" | "cpu" | "thinking";
}

/**
 * The one line between the opponent bar and the board. What the player is pointing at wins —
 * it answers the question they are asking right now — then the computer's latest action, then
 * a plain "thinking" while it plans.
 */
export function statusLine({ hovered, labels, narration, botThinking }: StatusInput): StatusLine | null {
  const hint = hovered ? labels[hovered]?.trim() : "";
  if (hint) return { text: hint, kind: "hint" };
  const said = narration?.trim();
  if (said) return { text: said, kind: "cpu" };
  if (botThinking) return { text: "The computer is thinking…", kind: "thinking" };
  return null;
}

// ---------------------------------------------------------------------------------------------
// Event effects

export type FxKind = "damage" | "affected" | "caster";

/**
 * Event colours per visual aid. Hue alone never carries the meaning: each kind also has its own
 * ring style (solid / dashed / dotted, see FX_RING_STYLE) and damage carries a number, so the
 * three stay apart in monochrome.
 */
const FX_PALETTES: Record<VisualAid, Record<FxKind, string>> = {
  none: { damage: "#f0514f", affected: "#f3cf6a", caster: "#8ad8ff" },
  colorblind: { damage: "#d55e00", affected: "#f0e442", caster: "#56b4e9" },
  monochrome: { damage: "#ffffff", affected: "#bdbdbd", caster: "#8a8a8a" },
};

export function fxPalette(aid: VisualAid): Record<FxKind, string> {
  return FX_PALETTES[aid] ?? FX_PALETTES.none;
}

export const FX_RING_STYLE: Record<FxKind, "solid" | "dashed" | "dotted"> = {
  damage: "solid",
  affected: "dashed",
  caster: "dotted",
};

/** How long a damage number lives (the 3D layer's NUMBER_MS). */
export const FX_NUMBER_MS = 1250;
/** How long a tile ring lives; it clears a little sooner so the number lands alone. */
export const FX_RING_MS = 1050;
/** How long a cast card stays readable. */
export const FX_CARD_MS = 2400;

export interface FxRing {
  key: string;
  kind: FxKind;
  /** top-left corner and size in px, board space (one tile) */
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface FxNumber {
  key: string;
  /** centre in px */
  x: number;
  y: number;
  text: string;
}
export interface FxCaption {
  text: string;
  /** anchor point in px: the top edge of the caption's cell, horizontally at `x` */
  x: number;
  y: number;
  /** edge columns pin the pill to their outer side so it never leaves the board */
  align: "start" | "center" | "end";
  /** below the anchor instead of above it (top row: there is no room above) */
  below: boolean;
}
export interface FxCardBox {
  /** top-left in px */
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface FxLayout {
  rings: FxRing[];
  numbers: FxNumber[];
  caption: FxCaption | null;
  /** the cell the cast card is laid on, when the reveal names a card */
  cardCell: string | null;
}

const cellOf = (key: string): [number, number] | null => {
  const [x, y] = key.split(",").map(Number);
  return Number.isInteger(x) && Number.isInteger(y) ? [x, y] : null;
};

/**
 * Where each part of a reveal goes on a board of `cols`×`rows` tiles, `tile` px each — the
 * same choices EngineEventReveal makes in 3D: the caption rides the first damaged square
 * (else the first affected one, else the caster), the caster ring is skipped when it is also
 * the first hit, and the card is laid where it was cast from.
 */
export function fxLayout(reveal: BoardReveal, tile: TileSize, cols = BOARD_COLS, rows = BOARD_ROWS): FxLayout {
  const inside = (key: string | null | undefined): key is string => {
    if (!key) return false;
    const at = cellOf(key);
    return !!at && at[0] >= 0 && at[0] < cols && at[1] >= 0 && at[1] < rows;
  };
  const ring = (key: string, kind: FxKind): FxRing => {
    const [x, y] = cellOf(key) as [number, number];
    return { key: `${kind}:${key}`, kind, x: x * tile.w, y: y * tile.h, w: tile.w, h: tile.h };
  };
  const rings: FxRing[] = [];
  const hits = reveal.hits.filter((hit) => inside(hit.at));
  const sites = reveal.sites.filter(inside);
  const caster = inside(reveal.caster) ? reveal.caster : null;
  if (caster && caster !== hits[0]?.at) rings.push(ring(caster, "caster"));
  for (const site of sites) rings.push(ring(site, "affected"));
  for (const hit of hits) rings.push(ring(hit.at, "damage"));
  const numbers = hits.map((hit) => {
    const [x, y] = cellOf(hit.at) as [number, number];
    return { key: `hit:${hit.at}`, x: (x + 0.5) * tile.w, y: (y + 0.5) * tile.h, text: `−${hit.dmg}` };
  });

  // the card names itself, so it replaces the caption rather than being labelled twice
  const text = reveal.card ? "" : reveal.name.trim();
  const captionCell = hits[0]?.at ?? sites[0] ?? caster;
  let caption: FxCaption | null = null;
  if (text && captionCell) {
    const [cx, cy] = cellOf(captionCell) as [number, number];
    const align = cols > 1 && cx === 0 ? "start" : cols > 1 && cx === cols - 1 ? "end" : "center";
    caption = {
      text,
      x: align === "start" ? cx * tile.w : align === "end" ? (cx + 1) * tile.w : (cx + 0.5) * tile.w,
      y: cy === 0 ? (cy + 1) * tile.h : cy * tile.h,
      align,
      below: cy === 0,
    };
  }
  const cardCell = reveal.card ? (caster ?? sites[0] ?? hits[0]?.at ?? null) : null;
  return { rings, numbers, caption, cardCell };
}

/** Card aspect (short / long side). */
const CARD_ASPECT = 63 / 88;

/**
 * The cast card's box: centred on its cell, `heightTiles` tall (a site lies on its side), and
 * pushed back inside the board when the cell is on an edge.
 */
export function fxCardBox(
  cell: string,
  tile: TileSize,
  landscape: boolean,
  cols = BOARD_COLS,
  rows = BOARD_ROWS,
  heightTiles = 1.5,
): FxCardBox | null {
  const at = cellOf(cell);
  if (!at) return null;
  // the card keeps its shape: sized to the tile's smaller edge, never past the board
  const long = Math.min(heightTiles * tileMin(tile), rows * tile.h, cols * tile.w);
  const short = long * CARD_ASPECT;
  const w = landscape ? long : short;
  const h = landscape ? short : long;
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
  const cx = clamp((at[0] + 0.5) * tile.w, w / 2, cols * tile.w - w / 2);
  const cy = clamp((at[1] + 0.5) * tile.h, h / 2, rows * tile.h - h / 2);
  return { x: cx - w / 2, y: cy - h / 2, w, h };
}

/**
 * Web Animations keyframes. Same curves as the 3D layer's floatStep / captionStep / ring
 * flash, expressed as offsets. `lift` scales the travel to the tile; `reduced` (the player's
 * prefers-reduced-motion) keeps only the fades.
 */
export function numberKeyframes(lift: number, reduced: boolean): Keyframe[] {
  if (reduced) {
    return [
      { offset: 0, opacity: 0 },
      { offset: 0.18, opacity: 1 },
      { offset: 0.45, opacity: 1 },
      { offset: 1, opacity: 0 },
    ];
  }
  const px = (n: number) => `${Math.round(n * lift * 10) / 10}px`;
  return [
    { offset: 0, opacity: 0, transform: `translateY(${px(6)}) scale(0.55)` },
    { offset: 0.18, opacity: 1, transform: `translateY(0px) scale(1.25)` },
    { offset: 0.45, opacity: 1, transform: `translateY(${px(-10)}) scale(1)` },
    { offset: 1, opacity: 0, transform: `translateY(${px(-34)}) scale(1.5)` },
  ];
}

export function ringKeyframes(): Keyframe[] {
  // quick flash in, long ease out
  return [
    { offset: 0, opacity: 0 },
    { offset: 0.12, opacity: 1 },
    { offset: 1, opacity: 0 },
  ];
}

export function captionKeyframes(reduced: boolean): Keyframe[] {
  if (reduced) {
    return [
      { offset: 0, opacity: 0 },
      { offset: 0.15, opacity: 1 },
      { offset: 0.78, opacity: 1 },
      { offset: 1, opacity: 0 },
    ];
  }
  return [
    { offset: 0, opacity: 0, transform: "translateY(4px)" },
    { offset: 0.15, opacity: 1, transform: "translateY(0px)" },
    { offset: 0.78, opacity: 1, transform: "translateY(0px)" },
    { offset: 1, opacity: 0, transform: "translateY(-6px)" },
  ];
}

export function cardKeyframes(reduced: boolean): Keyframe[] {
  if (reduced) {
    return [
      { offset: 0, opacity: 0 },
      { offset: 0.16, opacity: 1 },
      { offset: 0.82, opacity: 1 },
      { offset: 1, opacity: 0 },
    ];
  }
  // rises into place, holds, then lifts away
  return [
    { offset: 0, opacity: 0, transform: "translateY(8px) scale(0.84)" },
    { offset: 0.16, opacity: 1, transform: "translateY(0px) scale(1)" },
    { offset: 0.82, opacity: 1, transform: "translateY(0px) scale(1)" },
    { offset: 1, opacity: 0, transform: "translateY(-12px) scale(1.12)" },
  ];
}

// ---------------------------------------------------------------------------------------------
// Table tools

/** One roll for the tools panel: "d20: 14". `random` is injectable for tests. */
export function rollLabel(label: string, max: number, random: () => number = Math.random): string {
  const sides = Math.max(1, Math.floor(max));
  return `${label}: ${1 + Math.min(sides - 1, Math.floor(random() * sides))}`;
}

// ---------------------------------------------------------------------------------------------
// Pick guide

export interface PickGuideInput {
  /** what can be clicked next */
  next: readonly string[];
  /** the picker's hover labels: what each click does ("Summon Sacred Scarabs", "Burrowed") */
  labels: Readonly<Record<string, string>>;
  /** the card the action started from (a hand card, a unit), when known */
  source: string | null;
}

export interface PickGuide {
  /** the action being built, as a short heading */
  title: string;
  /** what the player is being asked, in plain words */
  ask: string;
}

const TILE_TOKEN = /^\d+,\d+$/;
const REGION_OPTION = /surface|burrow|submerge|underground|underwater/i;

/**
 * What a half-made main-phase action is waiting for, for the dock: "Summon Sacred Scarabs —
 * Tap a highlighted tile." The board shows WHERE; this says WHAT, so a lit board never sits
 * there unexplained. Null when nothing is being asked.
 */
export function pickGuide({ next, labels, source }: PickGuideInput): PickGuide | null {
  if (!next.length) return null;
  const options = next.filter((t) => t.startsWith("opt:"));
  const tiles = next.filter((t) => TILE_TOKEN.test(t));
  const units = next.filter((t) => t.startsWith("unit:"));
  const dirs = next.filter((t) => t.startsWith("dir:"));
  const said = [...new Set(next.filter((t) => !t.startsWith("opt:")).map((t) => labels[t]?.trim()).filter((l): l is string => !!l))];
  const named = source?.trim() || null;
  if (options.length && options.length === next.length) {
    const words = options.map((t) => labels[t]?.trim() ?? "");
    const tilesAsked = new Set(options.map((t) => t.split(":")[1])).size;
    const where = tilesAsked > 1 ? " for the tile you want" : "";
    if (words.every((w) => REGION_OPTION.test(w))) {
      return { title: named ? `Where does ${named} go?` : "Above or below?", ask: `Choose the surface or below it${where}.` };
    }
    if (words.some((w) => /^move here/i.test(w)) && words.some((w) => /attack/i.test(w))) {
      return { title: named ? `Move ${named} or attack?` : "Move or attack?", ask: `Choose what happens on that tile${where}.` };
    }
    return { title: named ? `${named}: choose one` : "Choose one", ask: `Pick one of the options below${where}.` };
  }
  const title =
    said.length === 1 ? said[0] : named ? (said.some((l) => /^move\b/i.test(l)) ? `Move ${named} or attack` : named) : "Choose";
  const kinds = [tiles.length ? "tile" : null, units.length ? "unit" : null].filter((k): k is string => !!k);
  let ask: string;
  if (dirs.length && !tiles.length && !units.length) ask = "Tap an arrow to choose the direction.";
  else if (kinds.length === 2) ask = "Tap a highlighted tile or unit.";
  else if (kinds.length === 1) ask = `Tap a highlighted ${kinds[0]}.`;
  else ask = "Choose on the board.";
  if (options.length) ask = `${ask.replace(/\.$/, "")}, or pick an option below.`;
  return { title, ask };
}
