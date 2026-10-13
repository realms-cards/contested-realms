import type { VisualAid } from "@/hooks/useGraphicsSettings";
import { isTileToken, parsePickToken } from "@/lib/game/cpu/pickTokens";

/** How a board target is lit.
 *  - `candidate`  something you could START this turn
 *  - `continue`   the NEXT step of a choice already begun (a spell's target, its caster):
 *                 a different colour and a slower pulse, so "you are mid-action, finish or
 *                 cancel" never reads the same as "here is what you could do"
 *  - `selected`   the one you just clicked
 *  - `target`     already chosen, lit but not clickable
 *  - `source`     the caster or ability this is coming from
 *  - `area`       the FOOTPRINT of the candidate under the pointer: a 2x2 area prompt offers
 *                 anchors, and an anchor on its own says nothing about which four squares you
 *                 would be choosing */
export type FieldTone = "candidate" | "continue" | "selected" | "target" | "source" | "area";
export type ArrowDirection = "N" | "E" | "S" | "W";

/**
 * The board's colour language, per visual aid. Every renderer that paints a FieldTone — tiles,
 * arrows and the cards themselves — takes its colours from here, so the three stay in step.
 *
 * `none` is the default board: amber to start, violet mid-sequence, green picked, cyan source.
 * Amber-against-green is exactly the pair red/green colour blindness loses, and it is carrying
 * the most important distinction on the board ("you may start this" vs "you have picked this"),
 * so it is the first thing that has to change.
 *
 * `colorblind` uses the Okabe-Ito palette, chosen because its eight colours stay mutually
 * distinguishable under deuteranopia, protanopia and tritanopia alike — one palette instead of
 * one per condition. The pairs that matter most are kept on the blue/orange axis, which survives
 * every common dichromacy.
 *
 * `monochrome` has no hue to spend, so it separates the tones by LUMINANCE instead: brightest
 * for what you have committed to, stepping down through what you could still do, down to mere
 * context. That is not a nicety. Measured through the grayscale filter the app actually applies
 * (CSS uses Rec. 709 luma), the default six land on 166/153/155/155/175/153 out of 255 — the
 * entire colour language inside a 22-step band, which is no language at all. The steps below
 * are ~30 apart. Shape carries the rest: a clickable tile wears brackets and a breathing pip,
 * a merely-lit one a plain box.
 */
const TONE_PALETTES: Record<VisualAid, Record<FieldTone, string>> = {
  none: {
    candidate: "#f59e0b",
    continue: "#a78bfa",
    selected: "#22c55e",
    target: "#22c55e",
    source: "#22d3ee",
    area: "#a78bfa",
  },
  colorblind: {
    candidate: "#e69f00", // orange
    continue: "#0072b2", // blue
    selected: "#f0e442", // yellow — far brighter than anything else, so a pick is unmistakable
    target: "#009e73", // bluish green
    source: "#56b4e9", // sky
    area: "#cc79a7", // reddish purple
  },
  monochrome: {
    selected: "#ffffff", // 255 — what you have picked
    continue: "#e4e4e4", // 228 — the step you must finish
    candidate: "#c8c8c8", // 200 — what you could begin
    area: "#a0a0a0", // 160 — the ground an area would cover
    target: "#808080", // 128 — already chosen, not clickable
    source: "#5a5a5a", // 90  — where it comes from
  },
};

export function toneColors(aid: VisualAid): Record<FieldTone, string> {
  return TONE_PALETTES[aid] ?? TONE_PALETTES.none;
}
/** Grid step per direction (y grows toward p1's home row), matching the CPU rules' DIRECTIONS. */
export const ARROW_STEPS: Record<ArrowDirection, readonly [number, number]> = {N:[0,-1],E:[1,0],S:[0,1],W:[-1,0]};

export interface ArrowTarget { token: string; at: string; dir: ArrowDirection; tone: FieldTone; clickable: boolean }
/** commit = the one affirmative action on the board (gold), outline = skip/decline style, quiet = an ordinary choice. */
export type OptionVariant = "commit" | "outline" | "quiet";
export interface OptionButton { token: string; id: string; label: string; pressed: boolean; clickable: boolean; variant: OptionVariant }
export interface OptionRow { at: string; options: OptionButton[] }
export interface FieldTargets { tiles: Map<string, FieldTone>; arrows: ArrowTarget[]; rows: OptionRow[] }
export interface FieldPickerState {
  tiles: readonly string[]; glow: readonly string[]; sources: readonly string[]; selected: string | null;
  labels: Readonly<Record<string, string>>; sequence?: boolean;
  /** tile token -> the squares picking it would cover (2x2 area prompts) */
  areas?: Readonly<Record<string, readonly string[]>>;
  /** the token the pointer is over, whose area is previewed */
  hovered?: string | null;
}

const DECLINE = /^(skip|decline|no|none|stop|cancel|pass|done|end)\b/i;
const isDirection = (dir: string): dir is ArrowDirection => dir === "N" || dir === "E" || dir === "S" || dir === "W";

/** Splits the picker's tokens into what the board layer draws: tile highlights, direction arrows and tile-anchored button rows.
 * Other token kinds (units, hand cards, piles, draws) belong to other renderers and are ignored here. */
export function fieldTargets({tiles,glow,sources,selected,labels,sequence,areas,hovered}: FieldPickerState): FieldTargets {
  const clickable = new Set(tiles);
  const tileTones = new Map<string, FieldTone>();
  // One highlight per tile: a clickable candidate outranks a chosen target, which outranks a caster or source.
  for (const token of sources) if (isTileToken(token)) tileTones.set(token,"source");
  for (const token of glow) if (isTileToken(token)) tileTones.set(token,"target");
  const open: FieldTone = sequence ? "continue" : "candidate";
  // An area anchor is NOT a tile you pick: it is the intersection four squares meet at, and the
  // board draws it as a marker at that point. Painting its tile too would say "choose this
  // square", which is exactly the wrong mental model for an aura.
  for (const token of tiles) if (isTileToken(token) && !areas?.[token]) tileTones.set(token,token === selected ? "selected" : open);
  // The footprint of whichever anchor is current: the clicked one if there is one, else the one
  // under the pointer. It never overpaints a square that already means something sharper — the
  // anchor itself stays the clickable candidate it is.
  const anchor = (selected && areas?.[selected] ? selected : hovered) ?? null;
  for (const cell of (anchor && areas?.[anchor]) ?? []) {
    if (isTileToken(cell) && !tileTones.has(cell)) tileTones.set(cell,"area");
  }

  const arrows = new Map<string, ArrowTarget>();
  const options = new Map<string, {at: string; id: string}>();
  for (const token of [...tiles,...glow]) {
    const parsed = parsePickToken(token);
    if (parsed?.kind === "dir" && isTileToken(parsed.at) && isDirection(parsed.dir)) {
      const tone: FieldTone = token === selected ? "selected" : clickable.has(token) ? open : "target";
      if (!arrows.has(token)) arrows.set(token,{token,at:parsed.at,dir:parsed.dir,tone,clickable:clickable.has(token)});
    } else if (parsed?.kind === "opt" && isTileToken(parsed.at) && !options.has(token)) {
      options.set(token,{at:parsed.at,id:parsed.id});
    }
  }

  const pressedSet = new Set(glow);
  const rowsByTile = new Map<string, OptionButton[]>();
  for (const [token,{at,id}] of options) {
    const label = labels[token] || id;
    const button: OptionButton = {token,id,label,pressed:token === selected || pressedSet.has(token),clickable:clickable.has(token),
      variant:DECLINE.test(id) || DECLINE.test(label) ? "outline" : "quiet"};
    rowsByTile.set(at,[...rowsByTile.get(at) ?? [],button]);
  }
  const rows = [...rowsByTile].map(([at,buttons]) => ({at,options:buttons}));
  // Gold is an accent: only when the whole board offers exactly one affirmative action beside a decline does it get the primary style.
  const commits = rows.flatMap(row => {
    const affirmative = row.options.filter(option => option.variant === "quiet" && option.clickable);
    return affirmative.length === 1 && row.options.some(option => option.variant === "outline") ? affirmative : [];
  });
  if (commits.length === 1) commits[0].variant = "commit";
  return {tiles:tileTones,arrows:[...arrows.values()],rows};
}
