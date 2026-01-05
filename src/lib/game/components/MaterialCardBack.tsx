"use client";

import React, { useMemo } from "react";
import { CanvasTexture, LinearFilter, RepeatWrapping } from "three";
import { SLEEVE_PRESETS } from "@/lib/game/sleevePresets";

interface MaterialCardBackProps {
  presetId: string;
  width: number;
  height: number;
  rotationZ?: number;
  elevation?: number;
  interactive?: boolean;
  depthWrite?: boolean;
  castShadow?: boolean; // if true (default), cast shadows; set false for hand cards
}

// Generate a noise texture for roughness variation
// Cached globally so all cards share the same texture
let cachedNoiseTexture: CanvasTexture | null = null;

function getNoiseTexture(): CanvasTexture {
  if (cachedNoiseTexture) return cachedNoiseTexture;

  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported");

  // Create noise pattern
  const imageData = ctx.createImageData(size, size);
  const data = imageData.data;

  for (let i = 0; i < data.length; i += 4) {
    // Generate subtle noise - values between 180-255 for subtle roughness variation
    // Higher values = smoother, lower = rougher
    const noise = 180 + Math.random() * 75;
    data[i] = noise; // R
    data[i + 1] = noise; // G
    data[i + 2] = noise; // B
    data[i + 3] = 255; // A
  }

  ctx.putImageData(imageData, 0, 0);

  const texture = new CanvasTexture(canvas);
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.repeat.set(2, 3); // Tile the noise for finer detail
  // Disable mipmap generation - CanvasTexture format may not support glGenerateMipmap
  texture.generateMipmaps = false;
  texture.minFilter = LinearFilter;
  texture.magFilter = LinearFilter;
  texture.needsUpdate = true;

  cachedNoiseTexture = texture;
  return texture;
}

export default function MaterialCardBack({
  presetId,
  width,
  height,
  rotationZ = 0,
  elevation = 0.001,
  interactive = true,
  depthWrite = false,
  castShadow: shouldCastShadow = true,
}: MaterialCardBackProps) {
  const preset = useMemo(
    () => SLEEVE_PRESETS.find((p) => p.id === presetId),
    [presetId]
  );

  // Get the shared noise texture
  const noiseTexture = useMemo(() => {
    if (typeof document === "undefined") return null;
    return getNoiseTexture();
  }, []);

  if (!preset) {
    return null;
  }

  return (
    <mesh
      rotation-x={-Math.PI / 2}
      rotation-z={rotationZ}
      position={[0, elevation, 0]}
      raycast={interactive ? undefined : () => []}
      castShadow={shouldCastShadow}
      receiveShadow
    >
      <planeGeometry args={[width, height]} />
      <meshStandardMaterial
        color={preset.color}
        metalness={preset.metalness}
        roughness={preset.roughness}
        roughnessMap={noiseTexture}
        depthWrite={depthWrite}
        envMapIntensity={0.8}
      />
    </mesh>
  );
}
