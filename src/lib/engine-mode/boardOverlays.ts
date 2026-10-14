import type { CellKey, PlayerKey } from "@/lib/game/store/types";
import { findCard, isWaterSite, nearbySquaresW, occupiedSquares, siteAt } from "@sorcery/shared";
import type { GameState as EngineState } from "@sorcery/shared";
import { engineCellKey, engineToBoard, type ViewerSeat } from "./coords";
import { animatedAuras, footprintCell, layerOf, seatKey } from "./projection";
import type { BoardLayer } from "./projection";

/**
 * Board-space overlays the engine needs beyond our regular board, worked out once so the 3D
 * board (EngineLayerOverlay) and the 2D board draw exactly the same areas. Every cell here is a
 * BOARD cell key "x,y" — the engine's squares already rotated 180° (engineCellKey).
 */

/** An area of board cells owned by one seat: an aura's coverage, a multi-square body. */
export interface SeatArea {
  id: string;
  controller: PlayerKey;
  cells: CellKey[];
}

/** An area with no owner colour (Babbling Brook's disabling squares). */
export interface PlainArea {
  id: string;
  cells: CellKey[];
}

/** One site's subsurface tint in the subsurface view: water blue or land brown. */
export interface LayerTint {
  cell: CellKey;
  water: boolean;
}

/**
 * A card drawn centred over several cells rather than laid out in one tile's rows — exactly the
 * set the projection pins (`pinned` in projectView): auras that are not an Enchantress minion,
 * and units whose body covers more than one square.
 */
export interface SpanEntity {
  /** the permanent's instanceId in the projected store */
  instanceId: string;
  kind: "aura" | "body";
  controller: PlayerKey;
  /** every covered cell, deduplicated */
  cells: CellKey[];
  /** the cell the projection files the card under (`footprintCell`) */
  anchor: CellKey;
  /** board position of the footprint's centre, in cell units (cell "2,1" is centred at {x:2,y:1}) */
  centre: { x: number; y: number };
}

export type EdgeSide = "top" | "bottom" | "left" | "right";

/**
 * One outside edge of an area, in cell-corner units: cell "x,y" spans x..x+1 by y..y+1, with y
 * growing toward the near (P1) row. A 2D board multiplies by its tile size; the 3D board maps
 * a corner to world space as `OFFSET + (corner - 0.5) * TILE_SIZE`.
 */
export interface CellEdge {
  cell: CellKey;
  side: EdgeSide;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

const waterDefs = (name: string) => ({ thresholds: { water: findCard(name)?.thresholds.water ?? 0 } });
/**
 * Every function here answers in BOARD cells, and a board cell depends on whose board it is: the
 * two seats of a player-vs-player match see the same engine square in different cells. So each
 * takes a trailing `viewer`, defaulting to seat 0 — single player, unchanged.
 */
const uniqueCells = (squares: readonly { x: number; y: number }[], viewer: ViewerSeat = 0): CellKey[] => [
  ...new Set(squares.map((sq) => engineCellKey(sq.x, sq.y, viewer))),
];

/** Each aura's whole area, in its controller's colour — animated (Enchantress) auras included. */
export function auraAreas(game: EngineState, viewer: ViewerSeat = 0): SeatArea[] {
  return Object.values(game.auras).map((aura) => ({
    id: aura.id,
    controller: seatKey(aura.controller, viewer),
    cells: uniqueCells(aura.squares, viewer),
  }));
}

/**
 * Oversized and stretched bodies (Mountain Giant, the Rack, a moeba…): every occupied square,
 * for the body outline. Carried units are left out; avatars never have one.
 */
export function multiSquareBodies(game: EngineState, viewer: ViewerSeat = 0): SeatArea[] {
  return Object.values(game.units)
    .filter((u) => !u.isAvatar && !u.carriedBy && (u.size || u.extraSquares?.length))
    .map((u) => ({ id: u.id, controller: seatKey(u.controller, viewer), cells: uniqueCells(occupiedSquares(u), viewer) }))
    .filter((b) => b.cells.length > 1);
}

/**
 * The overlay colours both boards paint with (EngineLayerOverlay in 3D, Tile2D / AreaLayer2D in
 * 2D), kept in one place so the two views can never disagree about an area.
 */
export const OVERLAY_COLORS = {
  water: "#3b82f6",
  land: "#8b5a2b",
  /** Squares where minions are disabled (Babbling Brook): its own hue, so it never reads as an aura. */
  disabledArea: "#94a3b8",
} as const;

/** The subsurface view's terrain tints (water blue / land brown) under each standing site; none on the surface. */
export function layerTints(game: EngineState, layer: BoardLayer, viewer: ViewerSeat = 0): LayerTint[] {
  if (layer !== "subsurface") return [];
  return Object.values(game.sites)
    .filter((site) => !site.isRubble)
    .map((site) => ({ cell: engineCellKey(site.x, site.y, viewer), water: isWaterSite(game, site, waterDefs) }));
}

/**
 * Babbling Brook's "minions are disabled while atop nearby sites", for as long as it lasts: the
 * engine keeps the entry in flow.areaDisables until its controller's next turn and works the
 * disable out from it on demand, so the area itself is the one thing that says where it bites.
 * It bites only "atop sites" (statics.ts disabledByEffect: `siteAt`, rubble included), so the
 * void squares in reach are left out.
 */
export function disableAreas(game: EngineState, viewer: ViewerSeat = 0): PlainArea[] {
  const flow = game.flow as { areaDisables?: { siteId?: string }[] } | undefined;
  return (flow?.areaDisables ?? []).flatMap((entry, i) => {
    const source = entry?.siteId ? game.sites[entry.siteId] : undefined;
    if (!source) return []; // the engine checks only that the site still exists
    return [{ id: `${entry.siteId}-${i}`, cells: uniqueCells(nearbySquaresW(game, source.x, source.y).filter((q) => siteAt(game, q.x, q.y)), viewer) }];
  });
}

function span(
  instanceId: string,
  kind: SpanEntity["kind"],
  controller: PlayerKey,
  squares: readonly { x: number; y: number }[],
  viewer: ViewerSeat = 0,
): SpanEntity | null {
  const anchor = footprintCell(squares, viewer);
  if (!anchor) return null;
  const board = squares.map((sq) => engineToBoard(sq.x, sq.y, viewer));
  return {
    instanceId,
    kind,
    controller,
    cells: uniqueCells(squares, viewer),
    anchor,
    centre: {
      x: board.reduce((sum, c) => sum + c.x, 0) / board.length,
      y: board.reduce((sum, c) => sum + c.y, 0) / board.length,
    },
  };
}

/**
 * The cards the projection draws centred over an area on this layer (see SpanEntity). Mirrors
 * projectView: a multi-square unit on the other layer still shows (faded) while looking at the
 * surface, and auras exist only on the surface.
 */
export function spanEntities(game: EngineState, layer: BoardLayer = "surface", viewer: ViewerSeat = 0): SpanEntity[] {
  const out: SpanEntity[] = [];
  for (const unit of Object.values(game.units)) {
    if (unit.isAvatar) continue;
    if (layerOf(unit.region) !== layer && layer !== "surface") continue;
    const body = occupiedSquares(unit);
    if (body.length < 2) continue;
    const entity = span(unit.id, "body", seatKey(unit.controller, viewer), body, viewer);
    if (entity) out.push(entity);
  }
  if (layer !== "surface") return out;
  const animated = animatedAuras(game);
  for (const aura of Object.values(game.auras)) {
    if (animated.has(aura.id)) continue; // the Enchantress minion is the card
    const entity = span(aura.id, "aura", seatKey(aura.controller, viewer), aura.squares, viewer);
    if (entity) out.push(entity);
  }
  return out;
}

/** The outside edges of a set of cells: every cell side whose neighbour is not covered too. */
export function outlineEdges(cells: readonly string[]): CellEdge[] {
  const covered = new Set(cells);
  const out: CellEdge[] = [];
  for (const cell of covered) {
    const [x, y] = cell.split(",").map(Number);
    const sides: [EdgeSide, string, number, number, number, number][] = [
      ["top", `${x},${y - 1}`, x, y, x + 1, y],
      ["bottom", `${x},${y + 1}`, x, y + 1, x + 1, y + 1],
      ["left", `${x - 1},${y}`, x, y, x, y + 1],
      ["right", `${x + 1},${y}`, x + 1, y, x + 1, y + 1],
    ];
    for (const [side, neighbour, x1, y1, x2, y2] of sides) {
      if (!covered.has(neighbour)) out.push({ cell, side, x1, y1, x2, y2 });
    }
  }
  return out;
}
