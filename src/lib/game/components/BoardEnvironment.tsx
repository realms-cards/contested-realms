import { Environment, useEnvironment, useGLTF, useTexture } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import { RigidBody, CuboidCollider } from "@react-three/rapier";
import { Suspense, useEffect, useMemo, useState } from "react";
import * as THREE from "three";
import {
  SRGBColorSpace,
  DataTexture,
  RepeatWrapping,
  LinearFilter,
  type Intersection,
  type Object3D,
  type Raycaster,
} from "three";
import { TextureErrorBoundary } from "@/components/game/TextureErrorBoundary";
import { markBoardAssetReady } from "@/lib/game/boardReveal";
import {
  DEFAULT_PLAYMAT,
  SafePlaymat,
  PLAYMAT_THICKNESS,
} from "@/lib/game/components/SafePlaymat";
import {
  EDGE_MARGIN,
  GROUND_HALF_THICK,
  WALL_HALF_HEIGHT,
  WALL_THICK,
} from "@/lib/game/constants";

/**
 * Generate a procedural fabric/cloth normal map texture.
 * Creates a weave pattern that simulates woven fabric.
 */
function createFabricNormalMap(
  size: number = 256,
  weaveScale: number = 8,
): DataTexture {
  const data = new Uint8Array(size * size * 4);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;

      // Create a weave pattern using sine waves
      const wx = (x / size) * weaveScale * Math.PI * 2;
      const wy = (y / size) * weaveScale * Math.PI * 2;

      // Horizontal and vertical thread bumps
      const hThread = Math.sin(wy) * 0.5;
      const vThread = Math.sin(wx) * 0.5;

      // Combine for a crosshatch weave effect
      // Add some variation based on position
      const crossover = Math.sin(wx) * Math.sin(wy);
      const _bump = hThread + vThread + crossover * 0.3;

      // Add fine noise for fabric texture
      const noise =
        (Math.sin(wx * 4) * Math.cos(wy * 4) * 0.15 +
          Math.sin(wx * 8 + wy * 8) * 0.05) *
        0.5;

      // Calculate normal from height field (approximate derivatives)
      const dx =
        Math.cos(wx) * weaveScale * 0.5 +
        Math.sin(wy) * Math.cos(wx) * weaveScale * 0.3;
      const dy =
        Math.cos(wy) * weaveScale * 0.5 +
        Math.sin(wx) * Math.cos(wy) * weaveScale * 0.3;

      // Normalize and convert to 0-255 range
      // Normal map: R = X, G = Y, B = Z (pointing up)
      const nx = dx * 0.15 + noise;
      const ny = dy * 0.15 + noise;
      const nz = 1.0;

      // Normalize the vector
      const len = Math.sqrt(nx * nx + ny * ny + nz * nz);

      // Map from [-1,1] to [0,255]
      data[i] = Math.floor(((nx / len) * 0.5 + 0.5) * 255);
      data[i + 1] = Math.floor(((ny / len) * 0.5 + 0.5) * 255);
      data[i + 2] = Math.floor(((nz / len) * 0.5 + 0.5) * 255);
      data[i + 3] = 255;
    }
  }

  const texture = new DataTexture(data, size, size);
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  // Disable mipmap generation - DataTexture format doesn't support glGenerateMipmap
  texture.generateMipmaps = false;
  texture.minFilter = LinearFilter;
  texture.magFilter = LinearFilter;
  texture.needsUpdate = true;

  return texture;
}

// Cached fabric normal map (created once)
let cachedFabricNormalMap: DataTexture | null = null;
function _getFabricNormalMap(): DataTexture {
  if (!cachedFabricNormalMap) {
    cachedFabricNormalMap = createFabricNormalMap(256, 12);
  }
  return cachedFabricNormalMap;
}

const TABLE_MODEL_URL = "/3dmodels/tables/mahogany_table.glb";
// Self-hosted copy of drei's "apartment" preset (lebombo_1k). The preset
// downloads from raw.githack.com on every match, which is slow and uncached.
const ENVIRONMENT_HDR_URL = "/hdri/lebombo_1k.hdr";
const PLAYMAT_OVERLAY_URL = "/playmat-overlay.png";

type BoardEnvironmentProps = {
  matW: number;
  matH: number;
  showPlaymat: boolean;
  playmatUrl?: string | null;
  /**
   * Opt-out for scenes that must never show the grid (deck editor, drafts).
   * Game views leave this unset: the grid overlay is always mounted and hidden
   * only while the playmat is actually on screen, so a bare table can never
   * appear without a grid — including while the playmat texture is still
   * loading or has failed.
   */
  suppressGrid?: boolean;
  showTable?: boolean;
  /** Board size in tiles, used to line the default playmat art up with tiles. */
  gridSize?: { w: number; h: number };
};

function noopRaycast(
  this: Object3D,
  _raycaster: Raycaster,
  _intersects: Intersection[],
): void {
  void _raycaster;
  void _intersects;
}

function MahoganyTable({ scale = 1, topY = 0 }: { scale?: number; topY?: number }) {
  const { scene } = useGLTF(TABLE_MODEL_URL);

  // useGLTF suspends until loaded, so this only runs once the model is in
  useEffect(() => {
    markBoardAssetReady("table");
  }, []);

  // Measure the model's own top surface so the tabletop can be pinned exactly
  // at `topY` in world space (cards rest on the y=0 plane; a hardcoded offset
  // previously left a ~0.12 gap that showed as floating cards without a playmat).
  //
  // useGLTF hands every mount the same cached scene object, and R3F leaves a
  // primitive's position/scale on it after unmount. Measuring that shared
  // object on the next board (next tutorial lesson, next match, deck editor)
  // folded the previous placement into the bounding box, so the tabletop
  // alternated between ~6 units above the board and just above it, leaving
  // the board inside or under the table. Each mount renders its own clone
  // instead (geometry and materials stay shared), reset to identity and
  // measured before any transform is applied.
  const { table, localTopY } = useMemo(() => {
    const clone = scene.clone(true);
    clone.position.set(0, 0, 0);
    clone.quaternion.identity();
    clone.scale.set(1, 1, 1);
    // clone() copies `visible`, which R3F's Suspense hiding can leave false
    clone.visible = true;
    // Stronger environment reflections on the wood, and receive card shadows
    clone.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        mesh.receiveShadow = true;
        if (mesh.material && "envMapIntensity" in mesh.material) {
          (mesh.material as THREE.MeshStandardMaterial).envMapIntensity = 1.5;
        }
      }
    });
    const box = new THREE.Box3().setFromObject(clone);
    return { table: clone, localTopY: box.max.y };
  }, [scene]);

  return (
    <primitive
      object={table}
      scale={[scale, scale, scale]}
      position={[0, topY - localTopY * scale, 0]}
      raycast={noopRaycast}
    />
  );
}

// Preload the table model
useGLTF.preload(TABLE_MODEL_URL);

/**
 * Suspends on the same HDR as <Environment> and reports once it has loaded.
 * <Environment> cannot report itself, and a sibling inside its Suspense
 * boundary is not a reliable signal.
 */
function LightingReady() {
  useEnvironment({ files: ENVIRONMENT_HDR_URL });
  useEffect(() => {
    markBoardAssetReady("lighting");
  }, []);
  return null;
}

const markPlaymatReady = () => markBoardAssetReady("playmat");

// Playmat component moved to SafePlaymat.tsx for better error handling

// The grid overlay sits just below the playmat's top surface (y=0) and just
// above the bare tabletop (y=-0.004 when the playmat is hidden). While the
// playmat mesh is actually on screen it reports so and the grid is hidden
// outright: 0.0005 under the mat is only a few depth-buffer steps when zoomed
// out, so depth alone could let the grid flicker through the mat. Any state
// where the playmat isn't on screen (hidden, texture still loading, load
// failed, hidden by Suspense) reports false and reveals the grid. This is what
// guarantees "never a bare table without a grid" in game views.
const GRID_OVERLAY_Y = -0.0005;

function PlaymatOverlay({
  matW,
  matH,
  visible,
}: {
  matW: number;
  matH: number;
  visible: boolean;
}) {
  const tex = useTexture(PLAYMAT_OVERLAY_URL);
  tex.colorSpace = SRGBColorSpace;

  useEffect(() => {
    markBoardAssetReady("grid");
  }, []);
  return (
    <mesh
      rotation-x={-Math.PI / 2}
      position={[0, GRID_OVERLAY_Y, 0]}
      visible={visible}
      raycast={noopRaycast}
      renderOrder={-100}
    >
      <planeGeometry args={[matW, matH]} />
      <meshBasicMaterial
        map={tex}
        transparent
        toneMapped={false}
        depthWrite={false}
        depthTest={true}
      />
    </mesh>
  );
}

export function BoardEnvironment({
  matW,
  matH,
  showPlaymat,
  playmatUrl,
  suppressGrid = false,
  showTable = true,
  gridSize,
}: BoardEnvironmentProps) {
  // frameloop="demand": the HDRI environment, table GLB, and their material
  // tweaks land asynchronously outside React props, so nothing requests a
  // frame when they arrive. A few staggered invalidates after mount make
  // sure the finished environment is actually painted.
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    const timers = [250, 1000, 2500, 5000].map((ms) =>
      window.setTimeout(() => invalidate(), ms),
    );
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [invalidate]);

  // Memoize the URL to prevent unnecessary texture reloads
  const stableUrl = useMemo(() => playmatUrl ?? null, [playmatUrl]);

  // Whether the playmat mesh is really on screen right now (see GRID_OVERLAY_Y)
  const [playmatOnScreen, setPlaymatOnScreen] = useState(false);

  // Parts this scene does not show count as loaded for the match reveal
  useEffect(() => {
    if (!showTable) markBoardAssetReady("table");
    if (!showPlaymat) markBoardAssetReady("playmat");
    if (suppressGrid) markBoardAssetReady("grid");
  }, [showTable, showPlaymat, suppressGrid]);

  return (
    <>
      {/* HDRI environment for realistic lighting and reflections */}
      <Environment
        files={ENVIRONMENT_HDR_URL}
        background={false}
        environmentIntensity={0.3}
      />
      <Suspense fallback={null}>
        <LightingReady />
      </Suspense>

      {/* Mahogany table underneath the playmat. With the playmat visible the
          tabletop tucks flush under it (slightly embedded to avoid a seam);
          with the playmat hidden it rises to just under the y=0 card plane so
          cards rest on the wood instead of floating a mat-thickness above it.
          The 0.004 gap keeps enough depth precision between the wood and the
          grid overlay (GRID_OVERLAY_Y) at long replay zoom. */}
      {showTable && (
        <Suspense fallback={null}>
          <MahoganyTable
            scale={0.95}
            topY={showPlaymat ? -PLAYMAT_THICKNESS + 0.001 : -0.004}
          />
        </Suspense>
      )}
      {/* Playmat */}
      {showPlaymat && (
        <Suspense fallback={null}>
          <TextureErrorBoundary
            fallback={null}
            onError={(err) => {
              // A failed playmat must not hold the match reveal
              markPlaymatReady();
              if (process.env.NODE_ENV !== "production") {
                console.warn(
                  "[BoardEnvironment] Playmat texture error:",
                  err.message,
                );
              }
            }}
          >
            <SafePlaymat
              matW={matW}
              matH={matH}
              url={stableUrl}
              onReady={markPlaymatReady}
              onVisibleChange={setPlaymatOnScreen}
              gridSize={gridSize}
            />
          </TextureErrorBoundary>
        </Suspense>
      )}
      {/* Grid overlay — always mounted in game views and hidden while the
          playmat is actually on screen (see GRID_OVERLAY_Y). */}
      {!suppressGrid && (
        <Suspense fallback={null}>
          <PlaymatOverlay
            matW={matW}
            matH={matH}
            visible={!(showPlaymat && playmatOnScreen)}
          />
        </Suspense>
      )}
      <RigidBody type="fixed" colliders={false} position={[0, 0, 0]}>
        <CuboidCollider
          args={[
            matW / 2 + EDGE_MARGIN,
            GROUND_HALF_THICK,
            matH / 2 + EDGE_MARGIN,
          ]}
          position={[0, -GROUND_HALF_THICK, 0]}
          friction={1}
          restitution={0}
        />
        <CuboidCollider
          args={[WALL_THICK / 2, WALL_HALF_HEIGHT, matH / 2 + EDGE_MARGIN]}
          position={[
            -(matW / 2 + EDGE_MARGIN + WALL_THICK / 2),
            WALL_HALF_HEIGHT,
            0,
          ]}
          friction={1}
          restitution={0}
        />
        <CuboidCollider
          args={[WALL_THICK / 2, WALL_HALF_HEIGHT, matH / 2 + EDGE_MARGIN]}
          position={[
            matW / 2 + EDGE_MARGIN + WALL_THICK / 2,
            WALL_HALF_HEIGHT,
            0,
          ]}
          friction={1}
          restitution={0}
        />
        <CuboidCollider
          args={[matW / 2 + EDGE_MARGIN, WALL_HALF_HEIGHT, WALL_THICK / 2]}
          position={[
            0,
            WALL_HALF_HEIGHT,
            -(matH / 2 + EDGE_MARGIN + WALL_THICK / 2),
          ]}
          friction={1}
          restitution={0}
        />
        <CuboidCollider
          args={[matW / 2 + EDGE_MARGIN, WALL_HALF_HEIGHT, WALL_THICK / 2]}
          position={[
            0,
            WALL_HALF_HEIGHT,
            matH / 2 + EDGE_MARGIN + WALL_THICK / 2,
          ]}
          friction={1}
          restitution={0}
        />
      </RigidBody>
    </>
  );
}

const preloadedBoardUrls = new Set<string>();
const warmingImages = new Set<HTMLImageElement>();

/**
 * Start loading the board's lighting, grid overlay and playmats before the
 * board canvas mounts (online matches only mount it once the D20 and mulligan
 * screens close), so the table is complete when play begins. The table model
 * is already preloaded when this module loads.
 */
export function preloadBoardEnvironment(
  playmatUrls: Array<string | null | undefined> = [],
): void {
  if (typeof window === "undefined") return;
  const once = (url: string, load: () => void) => {
    if (preloadedBoardUrls.has(url)) return;
    preloadedBoardUrls.add(url);
    try {
      load();
    } catch {
      preloadedBoardUrls.delete(url);
    }
  };

  once(ENVIRONMENT_HDR_URL, () =>
    useEnvironment.preload({ files: ENVIRONMENT_HDR_URL }),
  );
  once(PLAYMAT_OVERLAY_URL, () => useTexture.preload(PLAYMAT_OVERLAY_URL));
  once(DEFAULT_PLAYMAT, () => useTexture.preload(DEFAULT_PLAYMAT));

  // Custom playmats are only warmed in the HTTP cache: SafePlaymat validates
  // them with an <img> first, and a failed loader preload would stick.
  for (const url of playmatUrls) {
    if (!url || url === DEFAULT_PLAYMAT) continue;
    once(url, () => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      const done = () => warmingImages.delete(img);
      img.onload = done;
      img.onerror = done;
      warmingImages.add(img);
      img.src = url;
    });
  }
}
