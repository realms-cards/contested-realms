import { Suspense } from "react";
import { useTexture } from "@react-three/drei";
import { SRGBColorSpace, type Intersection, type Object3D, type Raycaster } from "three";
import { RigidBody, CuboidCollider } from "@react-three/rapier";
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
};

function noopRaycast(
  this: Object3D,
  _raycaster: Raycaster,
  _intersects: Intersection[]
): void {
  void _raycaster;
  void _intersects;
}

function Playmat({ matW, matH }: { matW: number; matH: number }) {
  const tex = useTexture("/api/assets/playmat.jpg");
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

export function BoardEnvironment({ matW, matH, showPlaymat }: BoardEnvironmentProps) {
  return (
    <>
      {showPlaymat && (
        <Suspense fallback={null}>
          <Playmat matW={matW} matH={matH} />
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
