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
