"use client";

import { Html } from "@react-three/drei";
import { engineCellKey } from "@/lib/engine-mode/coords";
import { type HiddenCounts, seatKey } from "@/lib/engine-mode/projection";
import { useEngineSession } from "@/lib/engine-mode/session";
import { PLAYER_COLORS, TILE_SIZE } from "@/lib/game/constants";
import { findCard, isWaterSite, occupiedSquares } from "@sorcery/shared";

const GRID_W = 5;
const GRID_H = 4;
const OFFSET_X = -((GRID_W - 1) * TILE_SIZE) / 2;
const OFFSET_Z = -((GRID_H - 1) * TILE_SIZE) / 2;
const HTML_Z: [number, number] = [20, 0]; // under the DOM HUD and prompt overlays
const WATER = "#3b82f6";
const LAND = "#8b5a2b";
const noRaycast = () => undefined;
const waterDefs = (name: string) => ({ thresholds: { water: findCard(name)?.thresholds.water ?? 0 } });

function cellPosition(key: string, lift: number): [number, number, number] {
  const [x, y] = key.split(",").map(Number);
  return [OFFSET_X + x * TILE_SIZE, lift, OFFSET_Z + y * TILE_SIZE];
}

/** Line segments around the outside of a set of cells: edges not shared with another covered cell. */
function areaOutline(keys: string[], lift: number): Float32Array {
  const covered = new Set(keys);
  const h = TILE_SIZE / 2;
  const points: number[] = [];
  for (const key of keys) {
    const [x, y] = key.split(",").map(Number);
    const [cx, , cz] = cellPosition(key, lift);
    const edges: [string, number, number, number, number][] = [
      [`${x},${y - 1}`, cx - h, cz - h, cx + h, cz - h],
      [`${x},${y + 1}`, cx - h, cz + h, cx + h, cz + h],
      [`${x - 1},${y}`, cx - h, cz - h, cx - h, cz + h],
      [`${x + 1},${y}`, cx + h, cz - h, cx + h, cz + h],
    ];
    for (const [neighbour, x1, z1, x2, z2] of edges) {
      if (!covered.has(neighbour)) points.push(x1, lift, z1, x2, lift, z2);
    }
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
 * controller's colour, and Untested Realm's subsurface view — in the subsurface view every site
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

  const tints =
    layer === "subsurface"
      ? Object.values(game.sites)
          .filter((site) => !site.isRubble)
          .map((site) => ({ key: engineCellKey(site.x, site.y, viewer), water: isWaterSite(game, site, waterDefs) }))
      : [];

  // Oversized and stretched bodies (Mountain Giant, the Rack…): outline every occupied square,
  // since the card itself can only sit on its anchor cell.
  const bodies = Object.values(game.units)
    .filter((u) => !u.isAvatar && !u.carriedBy && (u.size || u.extraSquares?.length))
    .map((u) => ({
      id: u.id,
      color: PLAYER_COLORS[seatKey(u.controller, viewer)],
      keys: [
        ...new Set(
          [...occupiedSquares(u), ...(u.extraSquares ?? [])].map((sq) => engineCellKey(sq.x, sq.y, viewer)),
        ),
      ],
    }))
    .filter((b) => b.keys.length > 1);

  // Each aura's whole area, in its controller's colour (the card itself sits at the area's centre).
  const auras =
    layer === "surface"
      ? Object.values(game.auras).map((aura) => ({
          id: aura.id,
          color: PLAYER_COLORS[seatKey(aura.controller, viewer)],
          keys: [...new Set(aura.squares.map((sq) => engineCellKey(sq.x, sq.y, viewer)))],
        }))
      : [];

  return (
    <>
      {bodies.map(({ id, color, keys }) => (
        <lineSegments key={`body-${id}`} raycast={noRaycast} renderOrder={3}>
          <bufferGeometry>
            <bufferAttribute attach="attributes-position" args={[areaOutline(keys, 0.045), 3]} />
          </bufferGeometry>
          <lineBasicMaterial color={color} transparent opacity={0.65} depthWrite={false} />
        </lineSegments>
      ))}
      {auras.map(({ id, color, keys }) => (
        <group key={`aura-${id}`}>
          {keys.map((key) => (
            <mesh key={key} position={cellPosition(key, 0.025)} rotation-x={-Math.PI / 2} raycast={noRaycast} renderOrder={2}>
              <planeGeometry args={[TILE_SIZE, TILE_SIZE]} />
              <meshBasicMaterial color={color} transparent opacity={0.12} depthWrite={false} />
            </mesh>
          ))}
          <lineSegments raycast={noRaycast} renderOrder={3}>
            <bufferGeometry>
              <bufferAttribute attach="attributes-position" args={[areaOutline(keys, 0.04), 3]} />
            </bufferGeometry>
            <lineBasicMaterial color={color} transparent opacity={0.8} depthWrite={false} />
          </lineSegments>
        </group>
      ))}
      {tints.map(({ key, water }) => (
        <mesh key={`tint-${key}`} position={cellPosition(key, 0.03)} rotation-x={-Math.PI / 2} raycast={noRaycast} renderOrder={2}>
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
