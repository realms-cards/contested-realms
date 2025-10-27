"use client";

import { type Object3D, type Raycaster, type Intersection } from "three";

function noopRaycast(
  this: Object3D,
  _raycaster: Raycaster,
  _intersects: Intersection[]
): void {
  void _raycaster;
  void _intersects;
}

interface CardOutlineProps {
  width: number;
  height: number;
  rotationZ?: number;
  elevation?: number;
  color?: string;
  renderOrder?: number;
  opacity?: number;
}

export default function CardOutline({
  width,
  height,
  rotationZ = 0,
  elevation = 0,
  color = "#93c5fd",
  renderOrder = 10_000,
  opacity = 1,
}: CardOutlineProps) {
  const outlineWidth = Math.max(0.012, width * 0.06);
  const halfWidth = width * 0.5;
  const halfHeight = height * 0.5;

  return (
    <group
      rotation-x={-Math.PI / 2}
      rotation-z={rotationZ}
      position={[0, elevation, 0]}
      renderOrder={renderOrder}
    >
      {/* Top edge */}
      <mesh position={[0, halfHeight, 0]} raycast={noopRaycast}>
        <planeGeometry args={[width + outlineWidth, outlineWidth]} />
        <meshBasicMaterial
          color={color}
          opacity={opacity}
          depthWrite={false}
          depthTest={false}
          toneMapped={false}
          transparent={opacity < 1}
        />
      </mesh>
      {/* Bottom edge */}
      <mesh position={[0, -halfHeight, 0]} raycast={noopRaycast}>
        <planeGeometry args={[width + outlineWidth, outlineWidth]} />
        <meshBasicMaterial
          color={color}
          opacity={opacity}
          depthWrite={false}
          depthTest={false}
          toneMapped={false}
          transparent={opacity < 1}
        />
      </mesh>
      {/* Left edge */}
      <mesh position={[-halfWidth, 0, 0]} raycast={noopRaycast}>
        <planeGeometry args={[outlineWidth, height + outlineWidth]} />
        <meshBasicMaterial
          color={color}
          opacity={opacity}
          depthWrite={false}
          depthTest={false}
          toneMapped={false}
          transparent={opacity < 1}
        />
      </mesh>
      {/* Right edge */}
      <mesh position={[halfWidth, 0, 0]} raycast={noopRaycast}>
        <planeGeometry args={[outlineWidth, height + outlineWidth]} />
        <meshBasicMaterial
          color={color}
          opacity={opacity}
          depthWrite={false}
          depthTest={false}
          toneMapped={false}
          transparent={opacity < 1}
        />
      </mesh>
    </group>
  );
}
