"use client";

import { useTexture } from "@react-three/drei";
import type { ThreeEvent } from "@react-three/fiber";
import { SRGBColorSpace, type Object3D, type Raycaster, type Intersection } from "three";

function noopRaycast(
  this: Object3D,
  _raycaster: Raycaster,
  _intersects: Intersection[]
): void {
  void _raycaster;
  void _intersects;
}

interface CardPlaneProps {
  slug: string;
  width: number;
  height: number;
  rotationZ?: number;
  depthWrite?: boolean;
  depthTest?: boolean;
  interactive?: boolean;
  elevation?: number;
  upright?: boolean; // if true, face camera (no -PI/2 tilt)
  renderOrder?: number;
  onContextMenu?: (e: ThreeEvent<PointerEvent>) => void;
  onPointerDown?: (e: ThreeEvent<PointerEvent>) => void;
  onPointerOver?: (e: ThreeEvent<PointerEvent>) => void;
  onPointerOut?: (e: ThreeEvent<PointerEvent>) => void;
  onClick?: (e: ThreeEvent<PointerEvent>) => void;
}

export default function CardPlane({
  slug,
  width,
  height,
  rotationZ = 0,
  depthWrite = true,
  depthTest = true,
  interactive = true,
  elevation = 0.001,
  upright = false,
  renderOrder = 0,
  onContextMenu,
  onPointerDown,
  onPointerOver,
  onPointerOut,
  onClick,
}: CardPlaneProps) {
  const tex = useTexture(`/api/images/${slug}`);
  tex.colorSpace = SRGBColorSpace;
  
  return (
    <mesh
      rotation-x={upright ? 0 : -Math.PI / 2}
      rotation-z={rotationZ}
      position={[0, elevation, 0]}
      raycast={interactive ? undefined : noopRaycast}
      renderOrder={renderOrder}
      onContextMenu={onContextMenu}
      onPointerDown={onPointerDown}
      onPointerOver={onPointerOver}
      onPointerOut={onPointerOut}
      onClick={onClick}
      castShadow
    >
      <planeGeometry args={[width, height]} />
      <meshBasicMaterial map={tex} toneMapped={false} depthWrite={depthWrite} depthTest={depthTest} />
    </mesh>
  );
}