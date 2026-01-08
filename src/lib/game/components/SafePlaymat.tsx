"use client";

import { useTexture } from "@react-three/drei";
import { useEffect, useMemo, useState } from "react";
import * as THREE from "three";
import { SRGBColorSpace } from "three";

// Playmat thickness in world units
const PLAYMAT_THICKNESS = 0.015;

// Default playmat path
const DEFAULT_PLAYMAT = "/playmat.jpg";

// Timeout for custom playmat loading (ms)
const PLAYMAT_LOAD_TIMEOUT = 8000;

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
    const edgeMat = new THREE.MeshStandardMaterial({
      color: "#2a2a2a",
      roughness: 0.9,
      metalness: 0,
    });
    const topMat = new THREE.MeshStandardMaterial({
      map: tex,
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
  }, [tex]);

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
