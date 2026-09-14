import { isTileToken, parsePickToken } from "@/lib/game/cpu/pickTokens";

/** How a board target is lit: a clickable candidate, the clicked one, a chosen target, or a caster/ability source. */
export type FieldTone = "candidate" | "selected" | "target" | "source";
export type ArrowDirection = "N" | "E" | "S" | "W";
/** Grid step per direction (y grows toward p1's home row), matching the CPU rules' DIRECTIONS. */
export const ARROW_STEPS: Record<ArrowDirection, readonly [number, number]> = {N:[0,-1],E:[1,0],S:[0,1],W:[-1,0]};

export interface ArrowTarget { token: string; at: string; dir: ArrowDirection; tone: FieldTone; clickable: boolean }
/** commit = the one affirmative action on the board (gold), outline = skip/decline style, quiet = an ordinary choice. */
export type OptionVariant = "commit" | "outline" | "quiet";
export interface OptionButton { token: string; id: string; label: string; pressed: boolean; clickable: boolean; variant: OptionVariant }
export interface OptionRow { at: string; options: OptionButton[] }
export interface FieldTargets { tiles: Map<string, FieldTone>; arrows: ArrowTarget[]; rows: OptionRow[] }
export interface FieldPickerState { tiles: readonly string[]; glow: readonly string[]; sources: readonly string[]; selected: string | null; labels: Readonly<Record<string, string>> }

const DECLINE = /^(skip|decline|no|none|stop|cancel|pass|done|end)\b/i;
const isDirection = (dir: string): dir is ArrowDirection => dir === "N" || dir === "E" || dir === "S" || dir === "W";

/** Splits the picker's tokens into what the board layer draws: tile highlights, direction arrows and tile-anchored button rows.
 * Other token kinds (units, hand cards, piles, draws) belong to other renderers and are ignored here. */
export function fieldTargets({tiles,glow,sources,selected,labels}: FieldPickerState): FieldTargets {
  const clickable = new Set(tiles);
  const tileTones = new Map<string, FieldTone>();
  // One highlight per tile: a clickable candidate outranks a chosen target, which outranks a caster or source.
  for (const token of sources) if (isTileToken(token)) tileTones.set(token,"source");
  for (const token of glow) if (isTileToken(token)) tileTones.set(token,"target");
  for (const token of tiles) if (isTileToken(token)) tileTones.set(token,token === selected ? "selected" : "candidate");

  const arrows = new Map<string, ArrowTarget>();
  const options = new Map<string, {at: string; id: string}>();
  for (const token of [...tiles,...glow]) {
    const parsed = parsePickToken(token);
    if (parsed?.kind === "dir" && isTileToken(parsed.at) && isDirection(parsed.dir)) {
      const tone: FieldTone = token === selected ? "selected" : clickable.has(token) ? "candidate" : "target";
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
