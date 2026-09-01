import { Environment, useGLTF, useTexture } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import { RigidBody, CuboidCollider } from "@react-three/rapier";
import { Suspense, useEffect, useMemo, useState, useCallback } from "react";
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
import {
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

type BoardEnvironmentProps = {
  matW: number;
  matH: number;
  showPlaymat: boolean;
  playmatUrl?: string | null;
  showOverlay?: boolean;
  showTable?: boolean;
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
  const { scene } = useGLTF("/3dmodels/tables/mahogany_table.glb");

  // Increase environment map intensity on table materials for better reflections
  // and enable shadow receiving
  scene.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) {
      const mesh = child as THREE.Mesh;
      mesh.receiveShadow = true;
      if (mesh.material && "envMapIntensity" in mesh.material) {
        (mesh.material as THREE.MeshStandardMaterial).envMapIntensity = 1.5;
      }
    }
  });

  // Measure the model's own top surface so the tabletop can be pinned exactly
  // at `topY` in world space (cards rest on the y=0 plane; a hardcoded offset
  // previously left a ~0.12 gap that showed as floating cards without a playmat).
  const localTopY = useMemo(() => {
    const box = new THREE.Box3().setFromObject(scene);
    return box.max.y;
  }, [scene]);

  return (
    <primitive
      object={scene}
      scale={[scale, scale, scale]}
      position={[0, topY - localTopY * scale, 0]}
      raycast={noopRaycast}
    />
  );
}

// Preload the table model
useGLTF.preload("/3dmodels/tables/mahogany_table.glb");

// Playmat component moved to SafePlaymat.tsx for better error handling

function PlaymatOverlay({ matW, matH }: { matW: number; matH: number }) {
  const tex = useTexture("/playmat-overlay.png");
  tex.colorSpace = SRGBColorSpace;
  return (
    <mesh
      rotation-x={-Math.PI / 2}
      position={[0, 0.001, 0]}
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
  showOverlay = true,
  showTable = true,
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

  // Track if playmat failed to load - if so, always show overlay as fallback
  const [playmatFailed, setPlaymatFailed] = useState(false);

  const handlePlaymatError = useCallback(() => {
    setPlaymatFailed(true);
  }, []);

  // `showOverlay` is a hard gate: scenes that want no grid at all (e.g. the deck
  // editor) pass false, and the playmat-failed fallback must not override it.
  const shouldShowOverlay = showOverlay && (!showPlaymat || playmatFailed);

  return (
    <>
      {/* HDRI environment for realistic lighting and reflections */}
      <Environment
        preset="apartment"
        background={false}
        environmentIntensity={0.3}
      />

      {/* Mahogany table underneath the playmat. With the playmat visible the
          tabletop tucks flush under it (slightly embedded to avoid a seam);
          with the playmat hidden it rises to just under the y=0 card plane so
          cards rest on the wood instead of floating a mat-thickness above it. */}
      {showTable && (
        <Suspense fallback={null}>
          <MahoganyTable
            scale={0.95}
            topY={showPlaymat ? -PLAYMAT_THICKNESS + 0.001 : -0.002}
          />
        </Suspense>
      )}
      {/* Playmat */}
      {showPlaymat && (
        <Suspense fallback={null}>
          <TextureErrorBoundary
            fallback={null}
            onError={(err) => {
              if (process.env.NODE_ENV !== "production") {
                console.warn(
                  "[BoardEnvironment] Playmat texture error:",
                  err.message,
                );
              }
              handlePlaymatError();
            }}
          >
            <SafePlaymat
              matW={matW}
              matH={matH}
              url={stableUrl}
              onLoadError={() => handlePlaymatError()}
            />
          </TextureErrorBoundary>
        </Suspense>
      )}
      {/* Always show overlay (grid) as fallback when playmat fails */}
      {shouldShowOverlay && (
        <Suspense fallback={null}>
          <PlaymatOverlay matW={matW} matH={matH} />
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
