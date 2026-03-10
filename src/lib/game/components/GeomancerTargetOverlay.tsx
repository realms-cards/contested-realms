"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { TILE_SIZE } from "@/lib/game/constants";
import type {
  CellKey,
  PendingGeomancerFill,
  PendingGeomancerPlay,
} from "@/lib/game/store/types";

export type GeomancerTargetOverlayProps = {
  tileX: number;
  tileY: number;
  pendingGeomancerPlay: PendingGeomancerPlay | null;
  pendingGeomancerFill: PendingGeomancerFill | null;
};

// Geomancer uses amber color for both abilities
const AMBER_COLOR = new THREE.Color("#f59e0b");

/**
 * Renders a pulsing highlight on tiles that are valid targets for Geomancer abilities.
 * - Ability 2: Adjacent Rubble tiles (for replacement with atlas site)
 * - Ability 1: Adjacent void tiles (for filling with Rubble after earth site)
 */
export function GeomancerTargetOverlay({
  tileX,
  tileY,
  pendingGeomancerPlay,
  pendingGeomancerFill,
}: GeomancerTargetOverlayProps) {
  const fillRef = useRef<THREE.Mesh>(null);

  const tileKey = `${tileX},${tileY}` as CellKey;

  const isValidTarget = useMemo(() => {
    // Ability 2: Replace Rubble
    if (
      pendingGeomancerPlay &&
      pendingGeomancerPlay.phase === "selectingTarget" &&
      pendingGeomancerPlay.validTargets.includes(tileKey)
    ) {
      return true;
    }
    // Ability 1: Fill void with Rubble
    if (
      pendingGeomancerFill &&
      pendingGeomancerFill.validTargets.includes(tileKey)
    ) {
      return true;
    }
    return false;
  }, [pendingGeomancerPlay, pendingGeomancerFill, tileKey]);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    if (fillRef.current) {
      const mat = fillRef.current.material as THREE.MeshBasicMaterial;
      mat.opacity = 0.35 + Math.sin(t * 4) * 0.15;
    }
  });

  if (!isValidTarget) return null;

  const halfTile = TILE_SIZE / 2;

  return (
    <group position={[0, 0.015, 0]} rotation-x={-Math.PI / 2}>
      <mesh ref={fillRef} position={[0, 0, 0]}>
        <planeGeometry args={[TILE_SIZE - 0.02, TILE_SIZE - 0.02]} />
        <meshBasicMaterial
          color={AMBER_COLOR}
          transparent
          opacity={0.35}
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
          color={AMBER_COLOR}
          transparent
          opacity={0.9}
          linewidth={2}
        />
      </lineLoop>
    </group>
  );
}
