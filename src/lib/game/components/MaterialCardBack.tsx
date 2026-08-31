"use client";

import React, { useEffect, useMemo } from "react";
import {
  CanvasTexture,
  LinearFilter,
  MeshStandardMaterial,
  RepeatWrapping,
} from "three";
import { CARD_THICK } from "@/lib/game/constants";
import { SLEEVE_PRESETS } from "@/lib/game/sleevePresets";
import { useCardGeometry } from "./useCardGeometry";

interface MaterialCardBackProps {
  presetId: string;
  width: number;
  height: number;
  rotationZ?: number;
  elevation?: number;
  interactive?: boolean;
  depthWrite?: boolean;
  castShadow?: boolean; // if true (default), cast shadows; set false for hand cards
  upright?: boolean; // stand the card up (hand fan) instead of laying it flat
}

// Metallic / glossy sleeve finish: the preset colour drives a PBR material that
// picks up the scene's HDRI reflections, so metal presets shine and sparkle
// with the camera angle instead of reading as a flat 2D texture.
const ENV_MAP_INTENSITY = 0.8;

// Card-stock edge — must match CardPlane's EDGE_COLOR / EDGE_ROUGHNESS so
// preset sleeves stack seamlessly with textured cards and PileBodies.
const EDGE_COLOR = "#e8e0d0";
const EDGE_ROUGHNESS = 0.9;

// Generate a noise texture for roughness variation (micro-sparkle).
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
  upright = false,
}: MaterialCardBackProps) {
  const preset = useMemo(
    () => SLEEVE_PRESETS.find((p) => p.id === presetId),
    [presetId],
  );

  // Get the shared noise texture
  const noiseTexture = useMemo(() => {
    if (typeof document === "undefined") return null;
    return getNoiseTexture();
  }, []);

  // Same rounded-corner OBJ geometry CardPlane uses, so preset sleeves line
  // up exactly with textured cards (thickness, corners, stacking offsets).
  const { geometry: cardGeometry, thicknessRatio } = useCardGeometry();

  // Landscape (atlas) sleeves: the geometry is portrait, so rotate a quarter
  // turn and scale by the short edge — identical to CardPlane.
  const isLandscape = width > height;
  const geometryRotationZ = isLandscape ? Math.PI / 2 : 0;
  const uniformScale = isLandscape ? height : width;
  const scaleZ = CARD_THICK / thicknessRatio;

  // OBJ group order: [edge, front, back]. Both faces get the sleeve finish so
  // the card looks right from either side (hand fans, flips).
  const materials = useMemo(() => {
    if (!preset || !cardGeometry) return null;
    const faceProps = {
      color: preset.color,
      metalness: preset.metalness,
      roughness: preset.roughness,
      roughnessMap: noiseTexture ?? undefined,
      envMapIntensity: ENV_MAP_INTENSITY,
      depthWrite,
    };
    const edge = new MeshStandardMaterial({
      color: EDGE_COLOR,
      roughness: EDGE_ROUGHNESS,
      metalness: 0,
      envMapIntensity: 0.3,
      depthWrite,
    });
    const front = new MeshStandardMaterial(faceProps);
    const back = new MeshStandardMaterial(faceProps);
    return [edge, front, back];
  }, [preset, cardGeometry, noiseTexture, depthWrite]);

  useEffect(() => {
    if (!materials) return;
    return () => {
      for (const m of materials) m.dispose();
    };
  }, [materials]);

  if (!preset) {
    return null;
  }

  if (cardGeometry && materials) {
    return (
      <mesh
        geometry={cardGeometry}
        material={materials}
        rotation-x={upright ? 0 : -Math.PI / 2}
        rotation-z={rotationZ + geometryRotationZ}
        position={[0, elevation + CARD_THICK / 2, 0]}
        scale={[uniformScale, uniformScale, scaleZ]}
        raycast={interactive ? undefined : () => []}
        castShadow={shouldCastShadow}
        receiveShadow
      />
    );
  }

  // Fallback while the OBJ is still loading: flat plane
  return (
    <mesh
      rotation-x={upright ? 0 : -Math.PI / 2}
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
        envMapIntensity={ENV_MAP_INTENSITY}
      />
    </mesh>
  );
}
