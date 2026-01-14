"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { TILE_SIZE } from "@/lib/game/constants";
import type {
  CellKey,
  GameState,
  PendingMagic,
  Permanents,
} from "@/lib/game/store/types";
import { calculate2x2AreaWithOffset } from "@/lib/game/store/atlanteanFateState";

export type AuraPreviewOverlayProps = {
  tileX: number;
  tileY: number;
  pendingMagic: PendingMagic | null;
  magicGuidesActive: boolean;
  metaByCardId: GameState["metaByCardId"];
  permanents: Permanents;
  boardWidth?: number;
  boardHeight?: number;
};

// Player colors
const P1_COLOR = new THREE.Color("#3b82f6"); // blue
const P2_COLOR = new THREE.Color("#ef4444"); // red

/**
 * Renders a pulsing highlight on each tile affected by an Aura spell.
 * Each affected tile gets its own highlight aligned to the tile grid.
 */
export function AuraPreviewOverlay({
  tileX,
  tileY,
  pendingMagic,
  metaByCardId,
  magicGuidesActive,
  permanents,
  boardWidth = 5,
  boardHeight = 4,
}: AuraPreviewOverlayProps) {
  const fillRef = useRef<THREE.Mesh>(null);

  const tileKey = `${tileX},${tileY}` as CellKey;

  // Check if this tile is affected by an Aura spell
  const isAffectedTile = useMemo(() => {
    if (!magicGuidesActive || !pendingMagic) return false;

    // Check if the spell is an Aura type
    const cardId = pendingMagic.spell.card.cardId;
    const meta = metaByCardId[cardId];
    const cardType = (
      meta?.type ||
      pendingMagic.spell.card.type ||
      ""
    ).toLowerCase();

    if (!cardType.includes("aura")) return false;

    // Find the aura on the board to get its offset
    const cellKey = `${pendingMagic.tile.x},${pendingMagic.tile.y}` as CellKey;
    const permsAtCell = permanents[cellKey];

    // Get offset from the spell's permanent if it exists, otherwise use [0, 0]
    let offX = 0;
    let offZ = 0;
    if (permsAtCell && permsAtCell.length > 0) {
      const auraPerm = permsAtCell.find((p) => p.card?.cardId === cardId);
      if (auraPerm?.offset) {
        [offX, offZ] = auraPerm.offset;
      }
    }

    // Calculate the 4 affected tiles based on position and offset
    const affectedTiles = calculate2x2AreaWithOffset(
      pendingMagic.tile.x,
      pendingMagic.tile.y,
      offX,
      offZ,
      boardWidth,
      boardHeight
    );

    return affectedTiles.includes(tileKey);
  }, [
    magicGuidesActive,
    pendingMagic,
    metaByCardId,
    permanents,
    tileKey,
    boardWidth,
    boardHeight,
  ]);

  // Get player color based on spell owner
  const playerColor = useMemo(() => {
    if (!pendingMagic) return P1_COLOR;
    return pendingMagic.spell.owner === 2 ? P2_COLOR : P1_COLOR;
  }, [pendingMagic]);

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
    <group position={[0, 0.011, 0]} rotation-x={-Math.PI / 2}>
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
