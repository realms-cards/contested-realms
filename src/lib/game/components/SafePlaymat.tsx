"use client";

import { useTexture } from "@react-three/drei";
import { useEffect, useLayoutEffect, useMemo, useState } from "react";
import * as THREE from "three";
import { SRGBColorSpace } from "three";
import { CARD_SHORT, TILE_SIZE } from "@/lib/game/constants";

// Playmat thickness in world units (top surface sits at y=0, where cards rest)
export const PLAYMAT_THICKNESS = 0.015;

// Default playmat path
export const DEFAULT_PLAYMAT = "/playmat.jpg";

// Timeout for custom playmat loading (ms)
const PLAYMAT_LOAD_TIMEOUT = 8000;

function noopRaycast(): void {}

/**
 * The default playmat art prints its own tile grid, pile slots and avatar
 * boxes, but the grid is printed about 2.7% smaller than the 3D tile grid, so
 * tiles, cards and highlights drifted off the printed squares toward the
 * edges. Scaling the art uniformly would pull the printed pile slots off the
 * 3D piles, so the art is mapped piecewise linearly instead: every printed
 * grid line lands on its tile boundary, each side margin is pinned at the
 * pile column, and a thin strip of sky and ground is cropped top and bottom.
 *
 * The pixel knots describe public/playmat.jpg (2556x1663, continuous pixel
 * coordinates) and must be re-measured if that art changes. They only hold
 * for the standard 5x4 board; custom playmats follow the tile template.
 */
const DEFAULT_ART_W = 2556;
const DEFAULT_ART_H = 1663;
// Mat edge, left pile slot centre, the six printed column lines, right pile
// slot centre, mat edge
const DEFAULT_ART_COLUMNS_PX = [
  0, 165.7, 330.14, 708.09, 1086.6, 1464.97, 1843.09, 2221.14, 2391.37, 2556,
];
// The five printed row lines; the mat edges extend the outer rows' scale
const DEFAULT_ART_ROWS_PX = [72.92, 452.17, 831.99, 1211.85, 1591.08];

function buildCalibratedTopGeometry(
  matW: number,
  matH: number,
): THREE.PlaneGeometry {
  // Same pile column as Piles3D: grid edge + half a tile - half a card + 0.1
  const pileX = 2.5 * TILE_SIZE + TILE_SIZE / 2 - CARD_SHORT / 2 + 0.1;
  const columnsWorld = [
    -matW / 2,
    -pileX,
    ...[-2.5, -1.5, -0.5, 0.5, 1.5, 2.5].map((k) => k * TILE_SIZE),
    pileX,
    matW / 2,
  ];
  const rowLinesWorld = [-2, -1, 0, 1, 2].map((k) => k * TILE_SIZE);
  const rowsPx = DEFAULT_ART_ROWS_PX;
  const last = rowsPx.length - 1;
  const topPx =
    rowsPx[0] -
    (rowLinesWorld[0] + matH / 2) *
      ((rowsPx[1] - rowsPx[0]) / (rowLinesWorld[1] - rowLinesWorld[0]));
  const bottomPx =
    rowsPx[last] +
    (matH / 2 - rowLinesWorld[last]) *
      ((rowsPx[last] - rowsPx[last - 1]) /
        (rowLinesWorld[last] - rowLinesWorld[last - 1]));
  const rowsWorld = [-matH / 2, ...rowLinesWorld, matH / 2];
  const rowsPxAll = [topPx, ...rowsPx, bottomPx];

  // Vertex columns and rows sit exactly on the knots, and u depends only on x
  // and v only on z, so per-triangle interpolation reproduces the mapping.
  const geometry = new THREE.PlaneGeometry(
    1,
    1,
    columnsWorld.length - 1,
    rowsWorld.length - 1,
  );
  geometry.rotateX(-Math.PI / 2); // row 0 becomes the far (-z) edge
  const position = geometry.getAttribute("position");
  const uv = geometry.getAttribute("uv");
  for (let row = 0; row < rowsWorld.length; row++) {
    for (let col = 0; col < columnsWorld.length; col++) {
      const i = row * columnsWorld.length + col;
      position.setXYZ(i, columnsWorld[col], 0, rowsWorld[row]);
      // Textures load with flipY, so v = 1 is the top row of the image
      uv.setXY(
        i,
        DEFAULT_ART_COLUMNS_PX[col] / DEFAULT_ART_W,
        1 - rowsPxAll[row] / DEFAULT_ART_H,
      );
    }
  }
  position.needsUpdate = true;
  uv.needsUpdate = true;
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

type PlaymatMeshProps = {
  matW: number;
  matH: number;
  url: string;
  onLoaded?: (url: string) => void;
  onVisibleChange?: (visible: boolean) => void;
  /** Map the art so its printed grid lands on the 3D tiles (default mat, 5x4). */
  calibrated?: boolean;
};

/**
 * Internal component that actually renders the playmat mesh.
 * This is wrapped by SafePlaymat to handle loading/errors.
 */
function PlaymatMesh({
  matW,
  matH,
  url,
  onLoaded,
  onVisibleChange,
  calibrated = false,
}: PlaymatMeshProps) {
  const tex = useTexture(url);
  tex.colorSpace = SRGBColorSpace;

  // useTexture suspends until loaded, so this only runs once the art is in
  useEffect(() => {
    onLoaded?.(url);
  }, [onLoaded, url]);

  // Layout effects run once the mesh is committed to the scene and are torn
  // down when it unmounts or a Suspense boundary hides it again, so this
  // tracks whether the mat is really on screen. It must stay a layout effect:
  // React does not clean up passive effects when Suspense hides content, which
  // would keep the grid hidden while the mat is hidden too (a bare table).
  useLayoutEffect(() => {
    onVisibleChange?.(true);
    return () => onVisibleChange?.(false);
  }, [onVisibleChange]);

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
    // A calibrated mat draws its art on a separate warped top face, so the
    // box's own top face is skipped (the two would z-fight).
    const boxTopMat = calibrated
      ? new THREE.MeshBasicMaterial({ visible: false })
      : topMat;
    return {
      box: [edgeMat, edgeMat, boxTopMat, bottomMat, edgeMat, edgeMat],
      top: topMat,
    };
  }, [tex, calibrated]);

  const calibratedTop = useMemo(
    () => (calibrated ? buildCalibratedTopGeometry(matW, matH) : null),
    [calibrated, matW, matH],
  );
  useEffect(() => () => calibratedTop?.dispose(), [calibratedTop]);

  return (
    <mesh
      position={[0, -PLAYMAT_THICKNESS / 2, 0]}
      receiveShadow
      raycast={noopRaycast}
      material={materials.box}
    >
      <boxGeometry args={[matW, PLAYMAT_THICKNESS, matH]} />
      {calibratedTop && (
        <mesh
          geometry={calibratedTop}
          material={materials.top}
          position={[0, PLAYMAT_THICKNESS / 2, 0]}
          receiveShadow
          raycast={noopRaycast}
        />
      )}
    </mesh>
  );
}

type SafePlaymatProps = {
  matW: number;
  matH: number;
  url: string | null;
  onLoadError?: (url: string, error: Error) => void;
  onPlaymatFailed?: () => void;
  /** Called once the playmat that will stay on screen has loaded. */
  onReady?: () => void;
  /** Reports whether the playmat mesh is currently on screen. */
  onVisibleChange?: (visible: boolean) => void;
  /** Board size in tiles; the default art is calibrated for the 5x4 board. */
  gridSize?: { w: number; h: number };
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
  onReady,
  onVisibleChange,
  gridSize,
}: SafePlaymatProps) {
  // Determine what URL to use - default immediately if no custom URL
  const isCustom = url && url !== DEFAULT_PLAYMAT;

  // For custom playmats, we validate first. For default, render immediately.
  const [customValidated, setCustomValidated] = useState<boolean | null>(null);
  const [validationAttempted, setValidationAttempted] = useState<string | null>(
    null,
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

    console.log("[SafePlaymat] Validating custom playmat URL:", url);
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
      console.log("[SafePlaymat] Custom playmat validated successfully:", url);
      setCustomValidated(true);
    };

    img.onerror = (err) => {
      if (cancelled) return;
      cancelled = true;
      clearTimeout(timeoutId);
      img.onload = null;
      img.onerror = null;
      console.warn("[SafePlaymat] Failed to load custom playmat:", url, err);
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
          url,
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

  // Ready once a custom playmat has been validated (or rejected) and the mesh
  // shows the URL that will stay, so the default never counts as final while
  // a custom one is still being checked.
  const [loadedUrl, setLoadedUrl] = useState<string | null>(null);
  const finalDecided = !isCustom || customValidated !== null;
  useEffect(() => {
    if (finalDecided && loadedUrl === finalUrl) onReady?.();
  }, [finalDecided, loadedUrl, finalUrl, onReady]);

  // Key forces React to remount PlaymatMesh when URL changes, ensuring texture updates
  return (
    <PlaymatMesh
      key={finalUrl}
      matW={matW}
      matH={matH}
      url={finalUrl}
      onLoaded={setLoadedUrl}
      onVisibleChange={onVisibleChange}
      calibrated={
        finalUrl === DEFAULT_PLAYMAT && gridSize?.w === 5 && gridSize?.h === 4
      }
    />
  );
}

export default SafePlaymat;
