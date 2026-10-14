import type { ArrowDirection } from "@/lib/game/cpu/fieldTargets";
import { permanentUnitToken, tileUnitTokens } from "@/lib/game/cpu/unitTokens";
import type { AvatarState, CardRef, PermanentItem, PlayerKey } from "@/lib/game/store/types";

// Pure geometry and grouping for the 2D picks layer (FieldTargets2D). Everything is in board
// pixels: cell "x,y" spans x*tile.w..(x+1)*tile.w across and y*tile.h..(y+1)*tile.h down.

export const BOARD_COLS = 5;
export const BOARD_ROWS = 4;

/** A tile's size in px. Tiles stretch to fill the board's box, so they need not be square. */
export interface TileSize { w: number; h: number }
/** The tile's smaller edge: what sizes a card, an icon, a font or a hit target inside it. */
export const tileMin = (tile: TileSize): number => Math.min(tile.w,tile.h);
/** Below this tile size two candidate cards on one tile are too small to tell apart by finger,
 *  so tapping the tile opens the TileInspector instead (the 2D stand-in for the 3D fan-out). */
const INSPECT_BELOW = 88;
/** Arrow buttons never shrink below a comfortable touch target. */
export const ARROW_MIN = 32;
const ARROW_MAX = 44;

export const cellOf = (at: string): [number, number] => {
  const [x,y] = at.split(",").map(Number);
  return [x,y];
};
/** The tile number the log uses (1-20, left-to-right, top-to-bottom). */
export const tileNumber = (at: string): number => {
  const [x,y] = cellOf(at);
  return y*BOARD_COLS+x+1;
};

export interface Box { left: number; top: number; width: number; height: number }
export function cellBox(at: string, tile: TileSize): Box {
  const [x,y] = cellOf(at);
  return {left:x*tile.w,top:y*tile.h,width:tile.w,height:tile.h};
}

/** An arrow button's edge for a tile whose smaller edge is `edge`. */
export const arrowSize = (edge: number): number => Math.min(ARROW_MAX,Math.max(ARROW_MIN,Math.round(edge*0.44)));

/**
 * Where a direction arrow's square button sits. It straddles the tile edge it points through, so
 * the four arrows of one phone-sized tile never overlap (kept wholly inside they would collide at
 * the corners below ~100px tiles) and each reads as "out through this side". It is pulled back
 * toward its own tile as far as the corners allow (at most a quarter of itself), so it leans on
 * its own tile rather than the neighbour's. An arrow on the board's rim is clamped inside so
 * nothing hangs off the board.
 */
export function arrowBox(at: string, dir: ArrowDirection, tile: TileSize, size = arrowSize(tileMin(tile))): Box {
  const [x,y] = cellOf(at);
  // N spans w/2 ± size/2 across; W spans inset ± size/2: they stay apart while inset <= edge/2 - size.
  const insetX = Math.min(size/4,Math.max(0,tile.w/2-size));
  const insetY = Math.min(size/4,Math.max(0,tile.h/2-size));
  const cx = dir === "E" ? (x+1)*tile.w-insetX : dir === "W" ? x*tile.w+insetX : (x+0.5)*tile.w;
  const cy = dir === "S" ? (y+1)*tile.h-insetY : dir === "N" ? y*tile.h+insetY : (y+0.5)*tile.h;
  const clamp = (value: number, max: number) => Math.min(Math.max(value,0),max);
  return {left:clamp(cx-size/2,BOARD_COLS*tile.w-size),top:clamp(cy-size/2,BOARD_ROWS*tile.h-size),width:size,height:size};
}
export const ARROW_ROTATION: Record<ArrowDirection, number> = {N:0,E:90,S:180,W:270};

/** Area anchors drawn at the centre of the squares they cover (the crossing for a 2x2), in px. */
export function areaAnchorPoints(areas: Readonly<Record<string, readonly string[]>>, tile: TileSize): {token: string; x: number; y: number}[] {
  return Object.entries(areas).map(([token,cells]) => {
    const points = cells.map(cellOf);
    const n = points.length || 1;
    return {token,x:(points.reduce((sum,[x]) => sum+x,0)/n+0.5)*tile.w,y:(points.reduce((sum,[,y]) => sum+y,0)/n+0.5)*tile.h};
  });
}
/** Hit box of an area marker: most of a tile, so the boxes of neighbouring crossings nearly tile the board
 *  and the preview follows the pointer, but never smaller than a touch target. */
export const areaHitSize = (tile: TileSize): number => Math.min(tileMin(tile),Math.max(40,Math.round(tileMin(tile)*0.8)));

/** What a tap on an area marker does. A mouse previews on hover and commits on click; a finger
 *  has no hover, so its first tap previews the footprint and only a second tap on the same marker
 *  places it. */
export function areaTap(token: string, hovered: string | null, pointer: "mouse" | "touch"): "preview" | "select" {
  return pointer === "mouse" || hovered === token ? "select" : "preview";
}

export interface PopoverPlacement { left: number; top: number; alignX: "start" | "center" | "end"; below: boolean }
/** An option row's popover: above its tile, or below it on the top row so it never leaves the
 *  board; flush with the tile's outer edge on the side columns so it never leaves it sideways either. */
export function popoverPlacement(at: string, tile: TileSize): PopoverPlacement {
  const [x,y] = cellOf(at);
  const below = y === 0;
  const alignX = x === 0 ? "start" : x === BOARD_COLS-1 ? "end" : "center";
  const left = alignX === "start" ? x*tile.w : alignX === "end" ? (x+1)*tile.w : (x+0.5)*tile.w;
  return {left,top:below ? (y+1)*tile.h : y*tile.h,alignX,below};
}

type PickerTiles = { tiles: readonly string[] };
type TileAvatars = Partial<Record<PlayerKey, Pick<AvatarState, "pos"> | null | undefined>>;
type TileItems = Readonly<Record<string, readonly Pick<PermanentItem, "instanceId" | "card" | "attachedTo">[]>>;

/** Clickable unit tokens per tile, in the tile's own drawing order (avatars first). */
export function unitCandidatesByTile(picker: PickerTiles, permanents: TileItems, avatars: TileAvatars): Map<string, string[]> {
  const clickable = new Set(picker.tiles);
  const out = new Map<string, string[]>();
  if (!picker.tiles.some(token => token.startsWith("unit:"))) return out;
  const cells = new Set(Object.keys(permanents));
  for (const seat of ["p1","p2"] as const) {
    const pos = avatars[seat]?.pos;
    if (pos) cells.add(`${pos[0]},${pos[1]}`);
  }
  for (const at of cells) {
    const tokens = tileUnitTokens(at,permanents[at] ?? [],avatars).filter(token => clickable.has(token));
    if (tokens.length) out.set(at,tokens);
  }
  return out;
}

/** Tiles whose candidates should be chosen through the inspector: two or more, on tiles too small to tap them apart. */
export function crowdedTiles(byTile: ReadonlyMap<string, readonly string[]>, tile: TileSize): string[] {
  if (tileMin(tile) >= INSPECT_BELOW) return [];
  return [...byTile].filter(([,tokens]) => tokens.length > 1).map(([at]) => at);
}

export interface InspectorItem { token: string; card: CardRef; seat: PlayerKey; avatar: boolean; tapped: boolean; faded: boolean }
/** The cards behind a tile's unit tokens, for the inspector sheet. Tokens whose card is gone are dropped. */
export function inspectorItems(at: string, tokens: readonly string[], permanents: Readonly<Record<string, readonly PermanentItem[]>>,
  avatars: Partial<Record<PlayerKey, AvatarState | null | undefined>>): InspectorItem[] {
  const items: InspectorItem[] = [];
  const stack = permanents[at] ?? [];
  for (const token of tokens) {
    if (token.startsWith("unit:avatar:")) {
      const seat = token.slice(12) as PlayerKey;
      const avatar = avatars[seat];
      if (avatar?.card) items.push({token,card:avatar.card,seat,avatar:true,tapped:avatar.tapped === true,faded:false});
      continue;
    }
    // The same token rule the tile itself uses, so a slot token resolves to its index.
    const index = stack.findIndex((item,i) => !item.attachedTo && permanentUnitToken(at,i,item) === token);
    const item = index >= 0 ? stack[index] : undefined;
    if (item?.card) items.push({token,card:item.card,seat:item.owner === 1 ? "p1" : "p2",avatar:false,tapped:item.tapped === true,faded:item.faded === true});
  }
  return items;
}
