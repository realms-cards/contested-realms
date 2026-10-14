"use client";

import { Html } from "@react-three/drei";
import { auraAreas, disableAreas, layerTints, multiSquareBodies, OVERLAY_COLORS, outlineEdges } from "@/lib/engine-mode/boardOverlays";
import type { HiddenCounts } from "@/lib/engine-mode/projection";
import { useEngineSession } from "@/lib/engine-mode/session";
import { PLAYER_COLORS, TILE_SIZE } from "@/lib/game/constants";

const GRID_W = 5;
const GRID_H = 4;
const OFFSET_X = -((GRID_W - 1) * TILE_SIZE) / 2;
const OFFSET_Z = -((GRID_H - 1) * TILE_SIZE) / 2;
const HTML_Z: [number, number] = [20, 0]; // under the DOM HUD and prompt overlays
const { water: WATER, land: LAND, disabledArea: DISABLED_AREA } = OVERLAY_COLORS;
const noRaycast = () => undefined;

function cellPosition(key: string, lift: number): [number, number, number] {
  const [x, y] = key.split(",").map(Number);
  return [OFFSET_X + x * TILE_SIZE, lift, OFFSET_Z + y * TILE_SIZE];
}

/** Line segments around the outside of a set of cells: edges not shared with another covered cell. */
function areaOutline(keys: string[], lift: number): Float32Array {
  const points: number[] = [];
  for (const { x1, y1, x2, y2 } of outlineEdges(keys)) {
    points.push(OFFSET_X + (x1 - 0.5) * TILE_SIZE, lift, OFFSET_Z + (y1 - 0.5) * TILE_SIZE);
    points.push(OFFSET_X + (x2 - 0.5) * TILE_SIZE, lift, OFFSET_Z + (y2 - 0.5) * TILE_SIZE);
  }
  return new Float32Array(points);
}

function badgeText(counts: HiddenCounts, layer: "surface" | "subsurface"): string {
  if (layer === "subsurface") return `${counts.surface} above`;
  const parts: string[] = [];
  if (counts.underground) parts.push(`${counts.underground} burrowed`);
  if (counts.underwater) parts.push(`${counts.underwater} submerged`);
  return parts.join(" · ");
}

/**
 * Board overlays the engine needs beyond our regular board: each aura's area outlined in its
 * controller's colour, multi-square bodies outlined, Babbling Brook's disabling area, and Untested Realm's subsurface view — in the subsurface view every site
 * glows by terrain (water blue, land brown) under the burrowed / submerged units; in either view a
 * badge on a tile counts the units on the other layer, and clicking it switches layers.
 */
export default function EngineLayerOverlay() {
  const game = useEngineSession((s) => s.game);
  const viewer = useEngineSession((s) => s.seat);
  useEngineSession((s) => s.rev);
  const layer = useEngineSession((s) => s.layer);
  const hidden = useEngineSession((s) => s.hidden);
  const setLayer = useEngineSession((s) => s.setLayer);
  if (!game) return null;

  // Shared with the 2D board (boardOverlays.ts) so the two views never disagree on an area —
  // and every one takes the viewer, since a board cell depends on whose board it is.
  const tints = layerTints(game, layer, viewer);
  // Oversized and stretched bodies (Mountain Giant, the Rack…): outline every occupied square;
  // the card itself is drawn once, centred over them.
  const bodies = multiSquareBodies(game, viewer);
  // Each aura's whole area, in its controller's colour (the card itself sits at the area's centre).
  const auras = layer === "surface" ? auraAreas(game, viewer) : [];
  // Babbling Brook's disabling squares, for as long as the effect lasts.
  const disables = layer === "surface" ? disableAreas(game, viewer) : [];

  return (
    <>
      {disables.map(({ id, cells }) => (
        <group key={`disable-${id}`}>
          {cells.map((cell) => (
            <mesh key={cell} position={cellPosition(cell, 0.02)} rotation-x={-Math.PI / 2} raycast={noRaycast} renderOrder={2}>
              <planeGeometry args={[TILE_SIZE, TILE_SIZE]} />
              <meshBasicMaterial color={DISABLED_AREA} transparent opacity={0.1} depthWrite={false} />
            </mesh>
          ))}
          <lineSegments raycast={noRaycast} renderOrder={3}>
            <bufferGeometry>
              <bufferAttribute attach="attributes-position" args={[areaOutline(cells, 0.035), 3]} />
            </bufferGeometry>
            <lineBasicMaterial color={DISABLED_AREA} transparent opacity={0.7} depthWrite={false} />
          </lineSegments>
        </group>
      ))}
      {bodies.map(({ id, controller, cells }) => (
        <lineSegments key={`body-${id}`} raycast={noRaycast} renderOrder={3}>
          <bufferGeometry>
            <bufferAttribute attach="attributes-position" args={[areaOutline(cells, 0.045), 3]} />
          </bufferGeometry>
          <lineBasicMaterial color={PLAYER_COLORS[controller]} transparent opacity={0.65} depthWrite={false} />
        </lineSegments>
      ))}
      {auras.map(({ id, controller, cells }) => (
        <group key={`aura-${id}`}>
          {cells.map((cell) => (
            <mesh key={cell} position={cellPosition(cell, 0.025)} rotation-x={-Math.PI / 2} raycast={noRaycast} renderOrder={2}>
              <planeGeometry args={[TILE_SIZE, TILE_SIZE]} />
              <meshBasicMaterial color={PLAYER_COLORS[controller]} transparent opacity={0.12} depthWrite={false} />
            </mesh>
          ))}
          <lineSegments raycast={noRaycast} renderOrder={3}>
            <bufferGeometry>
              <bufferAttribute attach="attributes-position" args={[areaOutline(cells, 0.04), 3]} />
            </bufferGeometry>
            <lineBasicMaterial color={PLAYER_COLORS[controller]} transparent opacity={0.8} depthWrite={false} />
          </lineSegments>
        </group>
      ))}
      {tints.map(({ cell, water }) => (
        <mesh key={`tint-${cell}`} position={cellPosition(cell, 0.03)} rotation-x={-Math.PI / 2} raycast={noRaycast} renderOrder={2}>
          <planeGeometry args={[TILE_SIZE * 0.96, TILE_SIZE * 0.96]} />
          <meshBasicMaterial color={water ? WATER : LAND} transparent opacity={0.28} depthWrite={false} />
        </mesh>
      ))}
      {Object.entries(hidden).map(([key, counts]) => {
        const [x, y, z] = cellPosition(key, 0.35);
        return (
          <Html key={`badge-${key}`} position={[x + TILE_SIZE * 0.3, y, z - TILE_SIZE * 0.38]} center zIndexRange={HTML_Z}>
            <button
              type="button"
              onClick={() => setLayer(layer === "surface" ? "subsurface" : "surface")}
              title={layer === "surface" ? "Show the subsurface layer (V)" : "Show the surface (V)"}
              className="whitespace-nowrap rounded-full border border-rc-line/22 bg-[rgba(7,10,20,0.9)] px-2 py-0.5 font-rc-mono text-[10px] tabular-nums text-rc-fg-muted shadow-rc-panel hover:border-rc-accent hover:text-rc-fg-strong"
            >
              {badgeText(counts, layer)}
            </button>
          </Html>
        );
      })}
    </>
  );
}
