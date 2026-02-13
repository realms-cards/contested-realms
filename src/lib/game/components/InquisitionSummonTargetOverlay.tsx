"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { TILE_SIZE } from "@/lib/game/constants";
import type {
  CellKey,
  PendingInquisitionSummon,
} from "@/lib/game/store/types";

export type InquisitionSummonTargetOverlayProps = {
  tileX: number;
  tileY: number;
  pendingInquisitionSummon: PendingInquisitionSummon | null;
};

const PURPLE_COLOR = new THREE.Color("#a855f7"); // purple-500

/**
 * Renders a pulsing purple highlight on tiles that are valid targets
 * for The Inquisition passive summon placement.
 * Shows during the "selectingCell" phase.
 */
export function InquisitionSummonTargetOverlay({
  tileX,
  tileY,
  pendingInquisitionSummon,
}: InquisitionSummonTargetOverlayProps) {
  const fillRef = useRef<THREE.Mesh>(null);

  const tileKey = `${tileX},${tileY}` as CellKey;

  const isValidTarget = useMemo(() => {
    if (!pendingInquisitionSummon) return false;
    if (pendingInquisitionSummon.phase !== "selectingCell") return false;
    return pendingInquisitionSummon.validCells.includes(tileKey);
  }, [pendingInquisitionSummon, tileKey]);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    if (fillRef.current) {
      const mat = fillRef.current.material as THREE.MeshBasicMaterial;
      mat.opacity = 0.3 + Math.sin(t * 3.5) * 0.15;
    }
  });

  if (!isValidTarget) return null;

  const halfTile = TILE_SIZE / 2;

  return (
    <group position={[0, 0.015, 0]} rotation-x={-Math.PI / 2}>
      <mesh ref={fillRef} position={[0, 0, 0]}>
        <planeGeometry args={[TILE_SIZE - 0.02, TILE_SIZE - 0.02]} />
        <meshBasicMaterial
          color={PURPLE_COLOR}
          transparent
          opacity={0.3}
          depthWrite={false}
          side={THREE.DoubleSide}
        />
      </mesh>

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
          color={PURPLE_COLOR}
          transparent
          opacity={0.9}
          linewidth={2}
        />
      </lineLoop>
    </group>
  );
}
