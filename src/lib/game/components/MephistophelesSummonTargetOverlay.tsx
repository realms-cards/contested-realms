"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { TILE_SIZE } from "@/lib/game/constants";
import { requestCosmeticFrame } from "@/lib/game/render/cosmeticFrame";
import type {
  CellKey,
  PendingMephistophelesSummon,
} from "@/lib/game/store/types";

export type MephistophelesSummonTargetOverlayProps = {
  tileX: number;
  tileY: number;
  pendingMephistophelesSummon: PendingMephistophelesSummon | null;
};

// Player colors
const P1_COLOR = new THREE.Color("#3b82f6"); // blue
const P2_COLOR = new THREE.Color("#ef4444"); // red

/**
 * Renders a pulsing highlight on tiles that are valid targets for Mephistopheles summon.
 * Shows during the "selectingSite" phase when the player has selected a card.
 * Uses player color (blue for p1, red for p2).
 */
export function MephistophelesSummonTargetOverlay({
  tileX,
  tileY,
  pendingMephistophelesSummon,
}: MephistophelesSummonTargetOverlayProps) {
  const fillRef = useRef<THREE.Mesh>(null);

  const tileKey = `${tileX},${tileY}` as CellKey;

  // Check if this tile is a valid target
  const isValidTarget = useMemo(() => {
    if (!pendingMephistophelesSummon) return false;
    if (pendingMephistophelesSummon.phase !== "selectingSite") return false;
    return pendingMephistophelesSummon.validTargets.includes(tileKey);
  }, [pendingMephistophelesSummon, tileKey]);

  // Get player color based on owner seat
  const playerColor = useMemo(() => {
    if (!pendingMephistophelesSummon) return P1_COLOR;
    return pendingMephistophelesSummon.ownerSeat === "p2" ? P2_COLOR : P1_COLOR;
  }, [pendingMephistophelesSummon]);

  // Animate the fill with pulsing effect
  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    if (fillRef.current) {
      const mat = fillRef.current.material as THREE.MeshBasicMaterial;
      // Pulse between 0.2 and 0.5 opacity for more visibility
      mat.opacity = 0.35 + Math.sin(t * 4) * 0.15;
      // Pulses only on valid-target tiles (mounted per tile; frameloop="demand").
      requestCosmeticFrame();
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
