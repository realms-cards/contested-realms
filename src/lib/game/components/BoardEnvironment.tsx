import { useTexture } from "@react-three/drei";
import { RigidBody, CuboidCollider } from "@react-three/rapier";
import { Suspense, useMemo } from "react";
import {
  SRGBColorSpace,
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

type BoardEnvironmentProps = {
  matW: number;
  matH: number;
  showPlaymat: boolean;
  playmatUrl?: string | null;
  showOverlay?: boolean;
};

function noopRaycast(
  this: Object3D,
  _raycaster: Raycaster,
  _intersects: Intersection[]
): void {
  void _raycaster;
  void _intersects;
}

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
  return (
    <mesh
      rotation-x={-Math.PI / 2}
      position={[0, 0, 0]}
      receiveShadow
      raycast={noopRaycast}
    >
      <planeGeometry args={[matW, matH]} />
      <meshBasicMaterial map={tex} toneMapped={false} />
    </mesh>
  );
}

function PlaymatOverlay({ matW, matH }: { matW: number; matH: number }) {
  const tex = useTexture("/playmat-overlay.png");
  tex.colorSpace = SRGBColorSpace;
  return (
    <mesh
      rotation-x={-Math.PI / 2}
      position={[0, -0.01, 0]}
      raycast={noopRaycast}
      renderOrder={-1}
    >
      <planeGeometry args={[matW, matH]} />
      <meshBasicMaterial
        map={tex}
        transparent
        toneMapped={false}
        depthWrite={false}
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
}: BoardEnvironmentProps) {
  // Memoize the URL to prevent unnecessary texture reloads
  // Use null while loading to avoid showing default then switching
  const stableUrl = useMemo(() => playmatUrl ?? null, [playmatUrl]);

  return (
    <>
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
