"use client";

import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import { type Object3D, type Raycaster, type Intersection, type MeshBasicMaterial } from "three";

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
  pulse?: boolean;
  pulseSpeed?: number; // cycles per second
  pulseMin?: number; // min opacity when pulsing
  pulseMax?: number; // max opacity when pulsing
}

export default function CardOutline({
  width,
  height,
  rotationZ = 0,
  elevation = 0,
  color = "#93c5fd",
  renderOrder = 10_000,
  opacity = 1,
  pulse = false,
  pulseSpeed = 1.25,
  pulseMin = 0.35,
  pulseMax = 1,
}: CardOutlineProps) {
  const outlineWidth = Math.max(0.012, width * 0.06);
  const halfWidth = width * 0.5;
  const halfHeight = height * 0.5;

  const topMat = useRef<MeshBasicMaterial | null>(null);
  const botMat = useRef<MeshBasicMaterial | null>(null);
  const leftMat = useRef<MeshBasicMaterial | null>(null);
  const rightMat = useRef<MeshBasicMaterial | null>(null);

  useFrame((state) => {
    if (!pulse) return;
    const t = state.clock.getElapsedTime();
    const phase = (Math.sin(t * Math.PI * 2 * pulseSpeed) + 1) / 2; // 0..1
    const op = pulseMin + (pulseMax - pulseMin) * phase;
    const mats = [topMat.current, botMat.current, leftMat.current, rightMat.current];
    for (const m of mats) {
      if (!m) continue;
      m.opacity = op;
      m.transparent = op < 1;
      m.needsUpdate = true;
    }
  });

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
          ref={topMat}
          color={color}
          opacity={opacity}
          depthWrite={false}
          depthTest={true}
          toneMapped={false}
          transparent={opacity < 1}
        />
      </mesh>
      {/* Bottom edge */}
      <mesh position={[0, -halfHeight, 0]} raycast={noopRaycast}>
        <planeGeometry args={[width + outlineWidth, outlineWidth]} />
        <meshBasicMaterial
          ref={botMat}
          color={color}
          opacity={opacity}
          depthWrite={false}
          depthTest={true}
          toneMapped={false}
          transparent={opacity < 1}
        />
      </mesh>
      {/* Left edge */}
      <mesh position={[-halfWidth, 0, 0]} raycast={noopRaycast}>
        <planeGeometry args={[outlineWidth, height + outlineWidth]} />
        <meshBasicMaterial
          ref={leftMat}
          color={color}
          opacity={opacity}
          depthWrite={false}
          depthTest={true}
          toneMapped={false}
          transparent={opacity < 1}
        />
      </mesh>
      {/* Right edge */}
      <mesh position={[halfWidth, 0, 0]} raycast={noopRaycast}>
        <planeGeometry args={[outlineWidth, height + outlineWidth]} />
        <meshBasicMaterial
          ref={rightMat}
          color={color}
          opacity={opacity}
          depthWrite={false}
          depthTest={true}
          toneMapped={false}
          transparent={opacity < 1}
        />
      </mesh>
    </group>
  );
}
