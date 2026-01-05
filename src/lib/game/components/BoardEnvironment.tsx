import { Environment, useGLTF, useTexture } from "@react-three/drei";
import { RigidBody, CuboidCollider } from "@react-three/rapier";
import { Suspense, useMemo } from "react";
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
  weaveScale: number = 8
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
      const bump = hThread + vThread + crossover * 0.3;

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
function getFabricNormalMap(): DataTexture {
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
  _intersects: Intersection[]
): void {
  void _raycaster;
  void _intersects;
}

// Table surface height offset - playmat Y position relative to table top
const TABLE_SURFACE_Y = 0.02;

function MahoganyTable({ scale = 1 }: { scale?: number }) {
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

  return (
    <primitive
      object={scene}
      scale={[scale, scale, scale]}
      position={[0, -6.3, 0]}
      raycast={noopRaycast}
    />
  );
}

// Preload the table model
useGLTF.preload("/3dmodels/tables/mahogany_table.glb");

// Playmat thickness in world units (1.5mm = 0.0015m, but scaled for visibility)
const PLAYMAT_THICKNESS = 0.015;

function Playmat({
  matW,
  matH,
  url,
}: {
  matW: number;
  matH: number;
  url: string;
}) {
  const tex = useTexture(url);
  tex.colorSpace = SRGBColorSpace;

  // No texture rotation needed - box is already oriented correctly
  const rotatedTex = tex;

  // Create materials for the box (no mesh rotation needed)
  // Box args: [width (X), thickness (Y), depth (Z)]
  // Face order: [+X, -X, +Y (top), -Y (bottom), +Z, -Z]
  const materials = useMemo(() => {
    // Get fabric normal map and set up tiling based on playmat size
    const fabricNormal = getFabricNormalMap();
    // Tile the fabric texture across the playmat (roughly 20 repeats across width)
    const repeatX = Math.max(1, Math.round(matW * 8));
    const repeatY = Math.max(1, Math.round(matH * 8));
    fabricNormal.repeat.set(repeatX, repeatY);

    const edgeMat = new THREE.MeshStandardMaterial({
      color: "#2a2a2a",
      roughness: 0.9,
      metalness: 0,
    });
    const topMat = new THREE.MeshStandardMaterial({
      map: rotatedTex,
      normalMap: fabricNormal,
      normalScale: new THREE.Vector2(0.15, 0.15), // Subtle fabric texture
      toneMapped: false,
      roughness: 0.92, // Slightly less rough for cloth sheen
      metalness: 0,
    });
    const bottomMat = new THREE.MeshStandardMaterial({
      color: "#1a1a1a",
      roughness: 0.95,
      metalness: 0,
    });
    // +Y (index 2) is the top face
    return [edgeMat, edgeMat, topMat, bottomMat, edgeMat, edgeMat];
  }, [rotatedTex, matW, matH]);

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
  // Memoize the URL to prevent unnecessary texture reloads
  // Use null while loading to avoid showing default then switching
  const stableUrl = useMemo(() => playmatUrl ?? null, [playmatUrl]);

  return (
    <>
      {/* HDRI environment for realistic lighting and reflections */}
      <Environment
        preset="apartment"
        background={false}
        environmentIntensity={0.3}
      />

      {/* Mahogany table underneath the playmat */}
      {showTable && (
        <Suspense fallback={null}>
          <MahoganyTable scale={0.95} />
        </Suspense>
      )}
      {showPlaymat && stableUrl && (
        <Suspense fallback={null}>
          <Playmat matW={matW} matH={matH} url={stableUrl} />
        </Suspense>
      )}
      {showOverlay && (
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
