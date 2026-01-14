"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { TILE_SIZE } from "@/lib/game/constants";
import type { CellKey, PendingPathfinderPlay } from "@/lib/game/store/types";

export type PathfinderTargetOverlayProps = {
  tileX: number;
  tileY: number;
  pendingPathfinderPlay: PendingPathfinderPlay | null;
};

// Player colors
const P1_COLOR = new THREE.Color("#3b82f6"); // blue
const P2_COLOR = new THREE.Color("#ef4444"); // red

/**
 * Renders a pulsing highlight on tiles that are valid targets for Pathfinder.
 * Shows during the "selectingTarget" phase - adjacent void or Rubble tiles.
 * Uses player color (blue for p1, red for p2).
 */
export function PathfinderTargetOverlay({
  tileX,
  tileY,
  pendingPathfinderPlay,
}: PathfinderTargetOverlayProps) {
  const fillRef = useRef<THREE.Mesh>(null);

  const tileKey = `${tileX},${tileY}` as CellKey;

  // Check if this tile is a valid target
  const isValidTarget = useMemo(() => {
    if (!pendingPathfinderPlay) return false;
    if (pendingPathfinderPlay.phase !== "selectingTarget") return false;
    return pendingPathfinderPlay.validTargets.includes(tileKey);
  }, [pendingPathfinderPlay, tileKey]);

  // Get player color based on owner seat
  const playerColor = useMemo(() => {
    if (!pendingPathfinderPlay) return P1_COLOR;
    return pendingPathfinderPlay.ownerSeat === "p2" ? P2_COLOR : P1_COLOR;
  }, [pendingPathfinderPlay]);

  // Animate the fill with pulsing effect
  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    if (fillRef.current) {
      const mat = fillRef.current.material as THREE.MeshBasicMaterial;
      // Pulse between 0.2 and 0.5 opacity for visibility
      mat.opacity = 0.35 + Math.sin(t * 4) * 0.15;
    }
  });

  if (!isValidTarget) {
    return null;
  }

  const halfTile = TILE_SIZE / 2;

  // Render a tile-sized highlight on this specific tile
  return (
    <group position={[0, 0.015, 0]} rotation-x={-Math.PI / 2}>
      {/* Pulsing fill for this tile */}
      <mesh ref={fillRef} position={[0, 0, 0]}>
        <planeGeometry args={[TILE_SIZE - 0.02, TILE_SIZE - 0.02]} />
        <meshBasicMaterial
          color={playerColor}
          transparent
          opacity={0.35}
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
          opacity={0.9}
          linewidth={2}
        />
      </lineLoop>
    </group>
  );
}
