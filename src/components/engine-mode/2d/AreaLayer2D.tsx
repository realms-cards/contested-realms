"use client";

import { OVERLAY_COLORS, outlineEdges, type PlainArea, type SeatArea } from "@/lib/engine-mode/boardOverlays";
import { PLAYER_COLORS } from "@/lib/game/constants";
import type { PlayerKey } from "@/lib/game/store/types";
import { BOARD_COLS, BOARD_ROWS, tileMin, type TileSize } from "./picks2d";

const DISABLED_AREA = OVERLAY_COLORS.disabledArea;

export interface AreaLayer2DProps {
  tile: TileSize;
  /** aura areas (surface only), tinted and outlined in the controller's colour */
  auras: readonly SeatArea[];
  /** multi-square bodies, outlined only */
  bodies: readonly SeatArea[];
  /** Babbling Brook's disabling squares */
  disables: readonly PlainArea[];
}

/** One SVG path along the outside of a set of cells (an edge is drawn only where the neighbour is not covered). */
function outlinePath(cells: readonly string[], tile: TileSize): string {
  return outlineEdges(cells)
    .map(({ x1, y1, x2, y2 }) => `M${x1 * tile.w} ${y1 * tile.h}L${x2 * tile.w} ${y2 * tile.h}`)
    .join("");
}

/** The opponent's areas are dashed as well as red, so owner survives monochrome and colour blindness. */
const dashFor = (seat: PlayerKey, tile: TileSize): string | undefined =>
  seat === "p2" ? `${Math.max(3, tileMin(tile) * 0.08)} ${Math.max(2, tileMin(tile) * 0.05)}` : undefined;

/**
 * Layer 1 of the 2D board: area overlays between the tiles and the cards — the same areas the 3D
 * EngineLayerOverlay draws (both read boardOverlays.ts). Purely visual; it never takes a tap.
 */
export default function AreaLayer2D({ tile, auras, bodies, disables }: AreaLayer2DProps) {
  if (!auras.length && !bodies.length && !disables.length) return null;
  const width = tile.w * BOARD_COLS;
  const height = tile.h * BOARD_ROWS;
  const cellRect = (cell: string) => {
    const [x, y] = cell.split(",").map(Number);
    return { x: x * tile.w, y: y * tile.h };
  };
  return (
    <svg
      aria-hidden
      className="pointer-events-none absolute left-0 top-0 overflow-visible"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
    >
      {disables.map(({ id, cells }) => (
        <g key={`disable-${id}`}>
          {cells.map((cell) => {
            const { x, y } = cellRect(cell);
            return <rect key={cell} x={x} y={y} width={tile.w} height={tile.h} fill={DISABLED_AREA} fillOpacity={0.12} />;
          })}
          <path
            d={outlinePath(cells, tile)}
            stroke={DISABLED_AREA}
            strokeOpacity={0.8}
            strokeWidth={2}
            strokeDasharray="1 4"
            strokeLinecap="round"
            fill="none"
          />
        </g>
      ))}
      {auras.map(({ id, controller, cells }) => (
        <g key={`aura-${id}`}>
          {cells.map((cell) => {
            const { x, y } = cellRect(cell);
            return (
              <rect key={cell} x={x} y={y} width={tile.w} height={tile.h} fill={PLAYER_COLORS[controller]} fillOpacity={0.12} />
            );
          })}
          <path
            d={outlinePath(cells, tile)}
            stroke={PLAYER_COLORS[controller]}
            strokeOpacity={0.85}
            strokeWidth={2}
            strokeDasharray={dashFor(controller, tile)}
            fill="none"
          />
        </g>
      ))}
      {bodies.map(({ id, controller, cells }) => (
        <path
          key={`body-${id}`}
          d={outlinePath(cells, tile)}
          stroke={PLAYER_COLORS[controller]}
          strokeOpacity={0.65}
          strokeWidth={3}
          strokeDasharray={dashFor(controller, tile)}
          strokeLinecap="square"
          fill="none"
        />
      ))}
    </svg>
  );
}
