"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { TILE_SIZE } from "@/lib/game/constants";
import type {
  CellKey,
  PendingMephistophelesSummon,
} from "@/lib/game/store/types";

export type MephistophelesSummonTargetOverlayProps = {
  tileX: number;
  tileY: number;
  pendingMephistophelesSummon: PendingMephistophelesSummon | null;
};

// Mephistopheles uses a red/purple theme
const MEPH_COLOR = new THREE.Color("#dc2626"); // red-600

/**
 * Renders a pulsing highlight on tiles that are valid targets for Mephistopheles summon.
 * Shows during the "selectingSite" phase when the player has selected a card.
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

  // Animate the fill with pulsing effect
  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    if (fillRef.current) {
      const mat = fillRef.current.material as THREE.MeshBasicMaterial;
      // Pulse between 0.2 and 0.5 opacity for more visibility
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
          color={MEPH_COLOR}
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
          color={MEPH_COLOR}
          transparent
          opacity={0.9}
          linewidth={2}
        />
      </lineLoop>
    </group>
  );
}
