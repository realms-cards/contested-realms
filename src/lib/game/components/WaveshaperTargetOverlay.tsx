"use client";

import { useFrame, invalidate } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { TILE_SIZE } from "@/lib/game/constants";
import type { CellKey, PendingWaveshaper } from "@/lib/game/store/types";

export type WaveshaperTargetOverlayProps = {
  tileX: number;
  tileY: number;
  pendingWaveshaper: PendingWaveshaper | null;
};

// Waveshaper uses cyan to evoke water/flooding
const CYAN_COLOR = new THREE.Color("#22d3ee");

/**
 * Renders a pulsing highlight on tiles that are valid flood targets for the
 * Waveshaper avatar ability (sites at/adjacent to the caster's body of water).
 */
export function WaveshaperTargetOverlay({
  tileX,
  tileY,
  pendingWaveshaper,
}: WaveshaperTargetOverlayProps) {
  const fillRef = useRef<THREE.Mesh>(null);

  const tileKey = `${tileX},${tileY}` as CellKey;

  const isValidTarget = useMemo(() => {
    return (
      !!pendingWaveshaper &&
      pendingWaveshaper.phase === "selectingTarget" &&
      pendingWaveshaper.validTargets.includes(tileKey)
    );
  }, [pendingWaveshaper, tileKey]);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    if (fillRef.current) {
      const mat = fillRef.current.material as THREE.MeshBasicMaterial;
      mat.opacity = 0.35 + Math.sin(t * 4) * 0.15;
      // Pulses only on highlighted tiles (mounted per tile; frameloop="demand").
      invalidate();
    }
  });

  if (!isValidTarget) return null;

  const halfTile = TILE_SIZE / 2;

  return (
    <group position={[0, 0.015, 0]} rotation-x={-Math.PI / 2}>
      <mesh ref={fillRef} position={[0, 0, 0]}>
        <planeGeometry args={[TILE_SIZE - 0.02, TILE_SIZE - 0.02]} />
        <meshBasicMaterial
          color={CYAN_COLOR}
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
          color={CYAN_COLOR}
          transparent
          opacity={0.9}
          linewidth={2}
        />
      </lineLoop>
    </group>
  );
}
