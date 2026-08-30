"use client";

import React, { useMemo } from "react";
import {
  CanvasTexture,
  LinearFilter,
  LinearMipmapLinearFilter,
  RepeatWrapping,
  SRGBColorSpace,
} from "three";
import { SLEEVE_PRESETS, type SleevePreset } from "@/lib/game/sleevePresets";

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

// PBR caps: the raw preset values (metalness up to 0.95, roughness down to
// 0.15) make the sleeve a near-mirror that reflects the bright HDRI
// environment and reads as a flat white card from most camera angles.
// Baking the colour into an albedo map and clamping the material keeps the
// colour visible while still giving the metal presets a satin sheen.
const MAX_METALNESS = 0.55;
const MIN_ROUGHNESS = 0.42;
const ENV_MAP_INTENSITY = 0.5;

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

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace("#", "");
  const full =
    clean.length === 3
      ? clean
          .split("")
          .map((c) => c + c)
          .join("")
      : clean;
  const n = Number.parseInt(full, 16);
  if (!Number.isFinite(n)) return [128, 128, 128];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function shade(
  [r, g, b]: [number, number, number],
  factor: number,
): string {
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(v * factor)));
  return `rgb(${f(r)}, ${f(g)}, ${f(b)})`;
}

// Baked albedo per preset: base colour, soft vignette, fine grain and a
// darker rim so the sleeve reads as a printed card back rather than a bare
// coloured plane. Cached per preset id; shared across all cards/canvases.
const sleeveTextureCache = new Map<string, CanvasTexture>();

function getSleeveTexture(preset: SleevePreset): CanvasTexture {
  const cached = sleeveTextureCache.get(preset.id);
  if (cached) return cached;

  const w = 256;
  const h = 358; // ~63:88 card ratio
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported");

  const rgb = hexToRgb(preset.color);

  // Base fill
  ctx.fillStyle = preset.color;
  ctx.fillRect(0, 0, w, h);

  // Soft radial vignette: slightly brighter centre, darker edges
  const vignette = ctx.createRadialGradient(
    w / 2,
    h / 2,
    Math.min(w, h) * 0.15,
    w / 2,
    h / 2,
    Math.max(w, h) * 0.75,
  );
  vignette.addColorStop(0, shade(rgb, 1.08));
  vignette.addColorStop(1, shade(rgb, 0.72));
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, w, h);

  // Fine grain
  const imageData = ctx.getImageData(0, 0, w, h);
  const data = imageData.data;
  const grain = preset.metalness > 0.5 ? 10 : 6;
  for (let i = 0; i < data.length; i += 4) {
    const n = (Math.random() - 0.5) * grain;
    data[i] = Math.max(0, Math.min(255, data[i] + n));
    data[i + 1] = Math.max(0, Math.min(255, data[i + 1] + n));
    data[i + 2] = Math.max(0, Math.min(255, data[i + 2] + n));
  }
  ctx.putImageData(imageData, 0, 0);

  // Inner border frame
  const inset = 12;
  ctx.lineWidth = 3;
  ctx.strokeStyle = shade(rgb, 0.55);
  ctx.strokeRect(inset, inset, w - inset * 2, h - inset * 2);
  ctx.lineWidth = 1;
  ctx.strokeStyle = shade(rgb, 1.25);
  ctx.strokeRect(inset + 4, inset + 4, w - (inset + 4) * 2, h - (inset + 4) * 2);

  // Outer rim
  ctx.lineWidth = 6;
  ctx.strokeStyle = shade(rgb, 0.45);
  ctx.strokeRect(0, 0, w, h);

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.generateMipmaps = true;
  texture.minFilter = LinearMipmapLinearFilter;
  texture.magFilter = LinearFilter;
  texture.anisotropy = 4;
  texture.needsUpdate = true;

  sleeveTextureCache.set(preset.id, texture);
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

  const sleeveTexture = useMemo(() => {
    if (!preset || typeof document === "undefined") return null;
    return getSleeveTexture(preset);
  }, [preset]);

  // Landscape (atlas) sleeves: the baked texture is portrait, so rotate the
  // geometry a quarter turn and swap the plane dimensions to match.
  const isLandscape = width > height;
  const planeW = isLandscape ? height : width;
  const planeH = isLandscape ? width : height;
  const geometryRotationZ = isLandscape ? Math.PI / 2 : 0;

  if (!preset) {
    return null;
  }

  return (
    <mesh
      rotation-x={upright ? 0 : -Math.PI / 2}
      rotation-z={rotationZ + geometryRotationZ}
      position={[0, elevation, 0]}
      raycast={interactive ? undefined : () => []}
      castShadow={shouldCastShadow}
      receiveShadow
    >
      <planeGeometry args={[planeW, planeH]} />
      <meshStandardMaterial
        color="#ffffff"
        map={sleeveTexture}
        metalness={Math.min(preset.metalness, MAX_METALNESS)}
        roughness={Math.max(preset.roughness, MIN_ROUGHNESS)}
        roughnessMap={noiseTexture}
        depthWrite={depthWrite}
        envMapIntensity={ENV_MAP_INTENSITY}
      />
    </mesh>
  );
}
