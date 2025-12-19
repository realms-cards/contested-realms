"use client";

import React, { useMemo } from "react";
import { SLEEVE_PRESETS } from "@/lib/game/sleevePresets";

interface MaterialCardBackProps {
  presetId: string;
  width: number;
  height: number;
  rotationZ?: number;
  elevation?: number;
  interactive?: boolean;
  depthWrite?: boolean;
}

export default function MaterialCardBack({
  presetId,
  width,
  height,
  rotationZ = 0,
  elevation = 0.001,
  interactive = true,
  depthWrite = false,
}: MaterialCardBackProps) {
  const preset = useMemo(
    () => SLEEVE_PRESETS.find((p) => p.id === presetId),
    [presetId]
  );

  if (!preset) {
    return null;
  }

  return (
    <mesh
      rotation-x={-Math.PI / 2}
      rotation-z={rotationZ}
      position={[0, elevation, 0]}
      raycast={interactive ? undefined : () => []}
      castShadow
    >
      <planeGeometry args={[width, height]} />
      <meshStandardMaterial
        color={preset.color}
        metalness={preset.metalness}
        roughness={preset.roughness}
        depthWrite={depthWrite}
        envMapIntensity={1.2}
      />
    </mesh>
  );
}
