"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { TILE_SIZE } from "@/lib/game/constants";
import type {
  CellKey,
  PendingAtlanteanFate,
  Permanents,
} from "@/lib/game/store/types";
import { calculate2x2AreaWithOffset } from "@/lib/game/store/atlanteanFateState";

export type AtlanteanFateAreaOverlayProps = {
  tileX: number;
  tileY: number;
  pendingAtlanteanFate: PendingAtlanteanFate | null;
  permanents: Permanents;
  boardWidth?: number;
  boardHeight?: number;
};

// Player colors
const P1_COLOR = new THREE.Color("#3b82f6"); // blue
const P2_COLOR = new THREE.Color("#ef4444"); // red

/**
 * Renders a pulsing highlight on each tile affected by Atlantean Fate.
 * Each affected tile gets its own highlight aligned to the tile grid.
 */
export function AtlanteanFateAreaOverlay({
  tileX,
  tileY,
  pendingAtlanteanFate,
  permanents,
  boardWidth = 5,
  boardHeight = 4,
}: AtlanteanFateAreaOverlayProps) {
  const fillRef = useRef<THREE.Mesh>(null);

  const tileKey = `${tileX},${tileY}` as CellKey;

  // Check if this tile is one of the affected tiles
  const isAffectedTile = useMemo(() => {
    if (!pendingAtlanteanFate) return false;
    if (pendingAtlanteanFate.phase !== "confirming") return false;

    // Find the Atlantean Fate card on the board and get its position + offset
    const cellKey = pendingAtlanteanFate.selectedCorner;
    if (!cellKey) return false;

    const permsAtCell = permanents[cellKey];
    if (!permsAtCell || permsAtCell.length === 0) return false;

    // Find the aura permanent (should be the most recently placed)
    const auraPerm = permsAtCell.find((p) =>
      p.card?.name?.toLowerCase().includes("atlantean fate")
    );
    if (!auraPerm) return false;

    const offset = auraPerm.offset || [0, 0];
    const [offX, offZ] = offset;

    // Parse the cell key to get tile coordinates
    const [cardTileX, cardTileY] = cellKey.split(",").map(Number);

    // Calculate the 4 affected tiles based on tile position and offset
    const affectedTiles = calculate2x2AreaWithOffset(
      cardTileX,
      cardTileY,
      offX,
      offZ,
      boardWidth,
      boardHeight
    );

    return affectedTiles.includes(tileKey);
  }, [pendingAtlanteanFate, permanents, tileKey, boardWidth, boardHeight]);

  // Get player color based on caster seat
  const playerColor = useMemo(() => {
    if (!pendingAtlanteanFate) return P1_COLOR;
    return pendingAtlanteanFate.casterSeat === "p2" ? P2_COLOR : P1_COLOR;
  }, [pendingAtlanteanFate]);

  // Animate the fill with pulsing effect
  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    if (fillRef.current) {
      const mat = fillRef.current.material as THREE.MeshBasicMaterial;
      // Pulse between 0.15 and 0.35 opacity
      mat.opacity = 0.25 + Math.sin(t * 3) * 0.1;
    }
  });

  if (!isAffectedTile) {
    return null;
  }

  const halfTile = TILE_SIZE / 2;

  // Render a tile-sized highlight on this specific tile
  return (
    <group position={[0, 0.012, 0]} rotation-x={-Math.PI / 2}>
      {/* Pulsing fill for this tile */}
      <mesh ref={fillRef} position={[0, 0, 0]}>
        <planeGeometry args={[TILE_SIZE - 0.02, TILE_SIZE - 0.02]} />
        <meshBasicMaterial
          color={playerColor}
          transparent
          opacity={0.25}
          depthWrite={false}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* Border around this tile */}
      <lineLoop>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            args={[
              new Float32Array([
                -halfTile + 0.01,
                halfTile - 0.01,
                0.001,
                halfTile - 0.01,
                halfTile - 0.01,
                0.001,
                halfTile - 0.01,
                -halfTile + 0.01,
                0.001,
                -halfTile + 0.01,
                -halfTile + 0.01,
                0.001,
              ]),
              3,
            ]}
          />
        </bufferGeometry>
        <lineBasicMaterial
          color={playerColor}
          transparent
          opacity={0.8}
          linewidth={2}
        />
      </lineLoop>
    </group>
  );
}
