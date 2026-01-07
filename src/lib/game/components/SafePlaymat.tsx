"use client";

import { useTexture } from "@react-three/drei";
import { useEffect, useMemo, useState } from "react";
import * as THREE from "three";
import {
  SRGBColorSpace,
  RepeatWrapping,
  LinearFilter,
  DataTexture,
} from "three";

// Playmat thickness in world units
const PLAYMAT_THICKNESS = 0.015;

// Default playmat path
const DEFAULT_PLAYMAT = "/playmat.jpg";

// Timeout for custom playmat loading (ms)
const PLAYMAT_LOAD_TIMEOUT = 8000;

/**
 * Generate a procedural fabric/cloth normal map texture.
 */
function createFabricNormalMap(
  size: number = 256,
  weaveScale: number = 8
): DataTexture {
  const data = new Uint8Array(size * size * 4);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const wx = (x / size) * weaveScale * Math.PI * 2;
      const wy = (y / size) * weaveScale * Math.PI * 2;

      const hThread = Math.sin(wy) * 0.5;
      const vThread = Math.sin(wx) * 0.5;
      const crossover = Math.sin(wx) * Math.sin(wy);
      const _bump = hThread + vThread + crossover * 0.3;
      const noise =
        (Math.sin(wx * 4) * Math.cos(wy * 4) * 0.15 +
          Math.sin(wx * 8 + wy * 8) * 0.05) *
        0.5;

      const dx =
        Math.cos(wx) * weaveScale * 0.5 +
        Math.sin(wy) * Math.cos(wx) * weaveScale * 0.3;
      const dy =
        Math.cos(wy) * weaveScale * 0.5 +
        Math.sin(wx) * Math.cos(wy) * weaveScale * 0.3;

      const nx = dx * 0.15 + noise;
      const ny = dy * 0.15 + noise;
      const nz = 1.0;
      const len = Math.sqrt(nx * nx + ny * ny + nz * nz);

      data[i] = Math.floor(((nx / len) * 0.5 + 0.5) * 255);
      data[i + 1] = Math.floor(((ny / len) * 0.5 + 0.5) * 255);
      data[i + 2] = Math.floor(((nz / len) * 0.5 + 0.5) * 255);
      data[i + 3] = 255;
    }
  }

  const texture = new DataTexture(data, size, size);
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.generateMipmaps = false;
  texture.minFilter = LinearFilter;
  texture.magFilter = LinearFilter;
  texture.needsUpdate = true;

  return texture;
}

// Cached fabric normal map
let cachedFabricNormalMap: DataTexture | null = null;
function getFabricNormalMap(): DataTexture {
  if (!cachedFabricNormalMap) {
    cachedFabricNormalMap = createFabricNormalMap(256, 12);
  }
  return cachedFabricNormalMap;
}

function noopRaycast(): void {}

type PlaymatMeshProps = {
  matW: number;
  matH: number;
  url: string;
};

/**
 * Internal component that actually renders the playmat mesh.
 * This is wrapped by SafePlaymat to handle loading/errors.
 */
function PlaymatMesh({ matW, matH, url }: PlaymatMeshProps) {
  const tex = useTexture(url);
  tex.colorSpace = SRGBColorSpace;

  const materials = useMemo(() => {
    const fabricNormal = getFabricNormalMap();
    const repeatX = Math.max(1, Math.round(matW * 8));
    const repeatY = Math.max(1, Math.round(matH * 8));
    fabricNormal.repeat.set(repeatX, repeatY);

    const edgeMat = new THREE.MeshStandardMaterial({
      color: "#2a2a2a",
      roughness: 0.9,
      metalness: 0,
    });
    const topMat = new THREE.MeshStandardMaterial({
      map: tex,
      normalMap: fabricNormal,
      normalScale: new THREE.Vector2(0.15, 0.15),
      toneMapped: false,
      roughness: 0.92,
      metalness: 0,
    });
    const bottomMat = new THREE.MeshStandardMaterial({
      color: "#1a1a1a",
      roughness: 0.95,
      metalness: 0,
    });
    return [edgeMat, edgeMat, topMat, bottomMat, edgeMat, edgeMat];
  }, [tex, matW, matH]);

  return (
    <mesh
      position={[0, -PLAYMAT_THICKNESS / 2, 0]}
      receiveShadow
      raycast={noopRaycast}
      material={materials}
    >
      <boxGeometry args={[matW, PLAYMAT_THICKNESS, matH]} />
    </mesh>
  );
}

type SafePlaymatProps = {
  matW: number;
  matH: number;
  url: string | null;
  onLoadError?: (url: string, error: Error) => void;
  onPlaymatFailed?: () => void;
};

/**
 * Validates that a playmat URL is loadable before rendering.
 * Falls back to default playmat if custom one fails to load.
 *
 * This prevents crashes on devices with limited WebGL (Xbox browser, etc.)
 * where texture loading can fail and crash the entire 3D scene.
 */
export function SafePlaymat({
  matW,
  matH,
  url,
  onLoadError,
  onPlaymatFailed: _onPlaymatFailed,
}: SafePlaymatProps) {
  // Determine what URL to use - default immediately if no custom URL
  const isCustom = url && url !== DEFAULT_PLAYMAT;

  // For custom playmats, we validate first. For default, render immediately.
  const [customValidated, setCustomValidated] = useState<boolean | null>(null);
  const [validationAttempted, setValidationAttempted] = useState<string | null>(
    null
  );

  // Validate custom playmat URLs
  useEffect(() => {
    // Only validate custom URLs
    if (!isCustom || !url) {
      setCustomValidated(null);
      return;
    }

    // Already validated this URL
    if (validationAttempted === url) return;

    setValidationAttempted(url);
    setCustomValidated(null); // Reset while validating

    const img = new Image();
    img.crossOrigin = "anonymous";

    let cancelled = false;

    img.onload = () => {
      if (cancelled) return;
      cancelled = true;
      clearTimeout(timeoutId);
      img.onload = null;
      img.onerror = null;
      setCustomValidated(true);
    };

    img.onerror = () => {
      if (cancelled) return;
      cancelled = true;
      clearTimeout(timeoutId);
      img.onload = null;
      img.onerror = null;
      if (process.env.NODE_ENV !== "production") {
        console.warn(
          "[SafePlaymat] Failed to load custom playmat, using default:",
          url
        );
      }
      onLoadError?.(url, new Error("Failed to load playmat image"));
      setCustomValidated(false);
    };

    // Set a timeout for slow connections
    const timeoutId = setTimeout(() => {
      if (cancelled) return;
      cancelled = true;
      img.onload = null;
      img.onerror = null;
      if (process.env.NODE_ENV !== "production") {
        console.warn(
          "[SafePlaymat] Timeout loading custom playmat, using default:",
          url
        );
      }
      onLoadError?.(url, new Error("Playmat load timeout"));
      setCustomValidated(false);
    }, PLAYMAT_LOAD_TIMEOUT);

    img.src = url;

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
      img.onload = null;
      img.onerror = null;
    };
  }, [url, isCustom, validationAttempted, onLoadError]);

  // Determine final URL to render
  let finalUrl: string;
  if (!isCustom) {
    // No custom URL - use default immediately
    finalUrl = DEFAULT_PLAYMAT;
  } else if (customValidated === true && url) {
    // Custom URL validated successfully
    finalUrl = url;
  } else if (customValidated === false) {
    // Custom URL failed - use default
    finalUrl = DEFAULT_PLAYMAT;
  } else {
    // Still validating custom URL - show default in the meantime
    finalUrl = DEFAULT_PLAYMAT;
  }

  return <PlaymatMesh matW={matW} matH={matH} url={finalUrl} />;
}

export default SafePlaymat;
