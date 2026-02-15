"use client";

import { Text } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { TILE_SIZE } from "@/lib/game/constants";
import type { CellKey } from "@/lib/game/store/types";

const BASE_FONT = 0.07;
const LABEL_ROTATION: [number, number, number] = [-Math.PI / 2, 0, Math.PI];

export type AreaSelectionOverlay3DProps = {
  tileX: number;
  tileY: number;
  /** List of affected cell keys (e.g. ["0,0", "1,0", "0,1", "1,1"]) */
  affectedCells: CellKey[];
  /** Color for the overlay highlight */
  color: string;
  /** Whether the overlay is active */
  active: boolean;
  /** Card name shown on the tile (1.5× base size) */
  labelName?: string;
  /** Damage / ATK info shown on the tile (3× base size) */
  labelDamage?: string;
};

/**
 * Renders a pulsing 3D highlight on a tile if it's in the affected area.
 * Used by Earthquake and Corpse Explosion to show the selected 2x2 area.
 */
export function AreaSelectionOverlay3D({
  tileX,
  tileY,
  affectedCells,
  color,
  active,
  labelName,
  labelDamage,
}: AreaSelectionOverlay3DProps) {
  const fillRef = useRef<THREE.Mesh>(null);

  const tileKey = `${tileX},${tileY}` as CellKey;
  const isAffected = active && affectedCells.includes(tileKey);

  const meshColor = useMemo(() => new THREE.Color(color), [color]);

  const halfTile = TILE_SIZE / 2;
  const hasLabel = Boolean(labelName || labelDamage);

  // Animate fill with pulsing effect
  useFrame(({ clock }) => {
    if (!fillRef.current) return;
    const t = clock.getElapsedTime();
    const mat = fillRef.current.material as THREE.MeshBasicMaterial;
    mat.opacity = 0.25 + Math.sin(t * 3) * 0.1;
  });

  if (!isAffected) return null;

  return (
    <>
      <group position={[0, 0.012, 0]} rotation-x={-Math.PI / 2}>
        {/* Pulsing fill */}
        <mesh ref={fillRef}>
          <planeGeometry args={[TILE_SIZE - 0.02, TILE_SIZE - 0.02]} />
          <meshBasicMaterial
            color={meshColor}
            transparent
            opacity={0.25}
            depthWrite={false}
            side={THREE.DoubleSide}
          />
        </mesh>

        {/* Border */}
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
            color={meshColor}
            transparent
            opacity={0.8}
            linewidth={2}
          />
        </lineLoop>
      </group>

      {/* Card name — 1.5× base size */}
      {hasLabel && labelName && (
        <Text
          font="/fantaisie_artistiqu.ttf"
          position={[0, 0.15, labelDamage ? -TILE_SIZE * 0.18 : 0]}
          rotation={LABEL_ROTATION}
          fontSize={BASE_FONT * 1.5}
          color="white"
          anchorX="center"
          anchorY="middle"
          outlineWidth={0.006}
          outlineColor="#000"
          maxWidth={TILE_SIZE - 0.08}
          textAlign="center"
        >
          {labelName}
        </Text>
      )}

      {/* Damage info — 3× base size */}
      {hasLabel && labelDamage && (
        <Text
          font="/fantaisie_artistiqu.ttf"
          position={[0, 0.15, labelName ? TILE_SIZE * 0.18 : 0]}
          rotation={LABEL_ROTATION}
          fontSize={BASE_FONT * 3}
          color="#fca5a5"
          anchorX="center"
          anchorY="middle"
          outlineWidth={0.008}
          outlineColor="#000"
          maxWidth={TILE_SIZE - 0.08}
          textAlign="center"
        >
          {labelDamage}
        </Text>
      )}
    </>
  );
}
