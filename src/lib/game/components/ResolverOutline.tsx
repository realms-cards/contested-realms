"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import {
  type Object3D,
  type Raycaster,
  type Intersection,
  type Mesh,
  Shape,
  ShapeGeometry,
  MeshBasicMaterial,
  DoubleSide,
} from "three";

function noopRaycast(
  this: Object3D,
  _raycaster: Raycaster,
  _intersects: Intersection[]
): void {
  void _raycaster;
  void _intersects;
}

interface ResolverOutlineProps {
  width: number;
  height: number;
  rotationZ?: number;
  elevation?: number;
  color?: string;
  renderOrder?: number;
  opacity?: number;
  pulse?: boolean;
  pulseSpeed?: number;
  pulseMin?: number;
  pulseMax?: number;
  flat?: boolean;
}

/** Crisp outline ring with depth testing — does not draw through other cards. */
function createRoundedRectRing(
  innerWidth: number,
  innerHeight: number,
  outerWidth: number,
  outerHeight: number,
  innerRadius: number,
  outerRadius: number
): Shape {
  const outerW = outerWidth / 2;
  const outerH = outerHeight / 2;
  const innerW = innerWidth / 2;
  const innerH = innerHeight / 2;
  const outerR = Math.min(outerRadius, outerW, outerH);
  const innerR = Math.min(innerRadius, innerW, innerH);

  const shape = new Shape();

  shape.moveTo(-outerW + outerR, -outerH);
  shape.lineTo(outerW - outerR, -outerH);
  shape.quadraticCurveTo(outerW, -outerH, outerW, -outerH + outerR);
  shape.lineTo(outerW, outerH - outerR);
  shape.quadraticCurveTo(outerW, outerH, outerW - outerR, outerH);
  shape.lineTo(-outerW + outerR, outerH);
  shape.quadraticCurveTo(-outerW, outerH, -outerW, outerH - outerR);
  shape.lineTo(-outerW, -outerH + outerR);
  shape.quadraticCurveTo(-outerW, -outerH, -outerW + outerR, -outerH);

  const hole = new Shape();
  hole.moveTo(-innerW + innerR, -innerH);
  hole.quadraticCurveTo(-innerW, -innerH, -innerW, -innerH + innerR);
  hole.lineTo(-innerW, innerH - innerR);
  hole.quadraticCurveTo(-innerW, innerH, -innerW + innerR, innerH);
  hole.lineTo(innerW - innerR, innerH);
  hole.quadraticCurveTo(innerW, innerH, innerW, innerH - innerR);
  hole.lineTo(innerW, -innerH + innerR);
  hole.quadraticCurveTo(innerW, -innerH, innerW - innerR, -innerH);
  hole.lineTo(-innerW + innerR, -innerH);

  shape.holes.push(hole);
  return shape;
}

export default function ResolverOutline({
  width,
  height,
  rotationZ = 0,
  elevation = 0,
  color = "#8b5cf6",
  renderOrder = 10_000,
  opacity = 0.7,
  pulse = false,
  pulseSpeed = 0.15,
  pulseMin = 0.4,
  pulseMax = 0.8,
  flat = true,
}: ResolverOutlineProps) {
  const cornerRadius = Math.min(width, height) * 0.06;
  const outlineThickness = Math.max(0.002, Math.min(width, height) * 0.011);
  // Small outset so the outline sits just outside the card edge
  const outset = outlineThickness * 0.3;

  const meshRef = useRef<Mesh>(null);

  const geom = useMemo(() => {
    const innerW = width + outset * 2;
    const innerH = height + outset * 2;
    const outerW = innerW + outlineThickness * 2;
    const outerH = innerH + outlineThickness * 2;

    return new ShapeGeometry(
      createRoundedRectRing(
        innerW,
        innerH,
        outerW,
        outerH,
        cornerRadius + outset,
        cornerRadius + outset + outlineThickness
      )
    );
  }, [width, height, cornerRadius, outlineThickness, outset]);

  const mat = useMemo(
    () =>
      new MeshBasicMaterial({
        color,
        transparent: true,
        depthWrite: false,
        depthTest: true,
        toneMapped: false,
        side: DoubleSide,
        opacity,
      }),
    [color, opacity]
  );

  useFrame((state) => {
    if (!pulse || !meshRef.current) return;
    const t = state.clock.getElapsedTime();
    const phase = (Math.sin(t * Math.PI * 2 * pulseSpeed) + 1) / 2;
    (meshRef.current.material as MeshBasicMaterial).opacity =
      pulseMin + (pulseMax - pulseMin) * phase;
  });

  return (
    <mesh
      ref={meshRef}
      geometry={geom}
      material={mat}
      rotation-x={flat ? -Math.PI / 2 : 0}
      rotation-z={rotationZ}
      position={flat ? [0, elevation, 0] : [0, 0, elevation]}
      renderOrder={renderOrder}
      raycast={noopRaycast}
    />
  );
}
