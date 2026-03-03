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
  /** When true (default), the outline lies flat in the XZ plane (for board cards).
   *  When false, it stays in the XY plane (for upright hand cards). */
  flat?: boolean;
}

// Create a rounded rectangle outline shape (hollow ring)
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

  // Outer rounded rectangle (clockwise)
  shape.moveTo(-outerW + outerR, -outerH);
  shape.lineTo(outerW - outerR, -outerH);
  shape.quadraticCurveTo(outerW, -outerH, outerW, -outerH + outerR);
  shape.lineTo(outerW, outerH - outerR);
  shape.quadraticCurveTo(outerW, outerH, outerW - outerR, outerH);
  shape.lineTo(-outerW + outerR, outerH);
  shape.quadraticCurveTo(-outerW, outerH, -outerW, outerH - outerR);
  shape.lineTo(-outerW, -outerH + outerR);
  shape.quadraticCurveTo(-outerW, -outerH, -outerW + outerR, -outerH);

  // Inner rounded rectangle (counter-clockwise to create hole)
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

export default function CardOutline({
  width,
  height,
  rotationZ = 0,
  elevation = 0,
  color = "#93c5fd",
  renderOrder = 10_000,
  opacity = 0.8,
  pulse = false,
  pulseSpeed = 1.25,
  pulseMin = 0.4,
  pulseMax = 0.9,
  flat = true,
}: CardOutlineProps) {
  // Card corner radius (proportional to card size)
  const cornerRadius = Math.min(width, height) * 0.06;
  // Thin outline thickness
  const outlineThickness = Math.max(0.003, Math.min(width, height) * 0.015);

  const outlineMeshRef = useRef<Mesh>(null);
  const glow1MeshRef = useRef<Mesh>(null);
  const glow2MeshRef = useRef<Mesh>(null);
  const glow3MeshRef = useRef<Mesh>(null);

  // Create geometries for outline and glow layers
  const { outlineGeom, glow1Geom, glow2Geom, glow3Geom } = useMemo(() => {
    // Main outline: sits just outside the card
    const outlineInnerW = width;
    const outlineInnerH = height;
    const outlineOuterW = width + outlineThickness * 2;
    const outlineOuterH = height + outlineThickness * 2;

    // Glow layers: progressively larger rings outside the outline
    const glowStep = outlineThickness * 1.5;

    // Glow layer 1: immediately outside outline
    const glow1InnerW = outlineOuterW;
    const glow1InnerH = outlineOuterH;
    const glow1OuterW = glow1InnerW + glowStep * 2;
    const glow1OuterH = glow1InnerH + glowStep * 2;

    // Glow layer 2: further out
    const glow2InnerW = glow1OuterW;
    const glow2InnerH = glow1OuterH;
    const glow2OuterW = glow2InnerW + glowStep * 2;
    const glow2OuterH = glow2InnerH + glowStep * 2;

    // Glow layer 3: outermost (faintest)
    const glow3InnerW = glow2OuterW;
    const glow3InnerH = glow2OuterH;
    const glow3OuterW = glow3InnerW + glowStep * 2;
    const glow3OuterH = glow3InnerH + glowStep * 2;

    return {
      outlineGeom: new ShapeGeometry(
        createRoundedRectRing(
          outlineInnerW,
          outlineInnerH,
          outlineOuterW,
          outlineOuterH,
          cornerRadius,
          cornerRadius + outlineThickness
        )
      ),
      glow1Geom: new ShapeGeometry(
        createRoundedRectRing(
          glow1InnerW,
          glow1InnerH,
          glow1OuterW,
          glow1OuterH,
          cornerRadius + outlineThickness,
          cornerRadius + outlineThickness + glowStep
        )
      ),
      glow2Geom: new ShapeGeometry(
        createRoundedRectRing(
          glow2InnerW,
          glow2InnerH,
          glow2OuterW,
          glow2OuterH,
          cornerRadius + outlineThickness + glowStep,
          cornerRadius + outlineThickness + glowStep * 2
        )
      ),
      glow3Geom: new ShapeGeometry(
        createRoundedRectRing(
          glow3InnerW,
          glow3InnerH,
          glow3OuterW,
          glow3OuterH,
          cornerRadius + outlineThickness + glowStep * 2,
          cornerRadius + outlineThickness + glowStep * 3
        )
      ),
    };
  }, [width, height, cornerRadius, outlineThickness]);

  // Create materials with decreasing opacity for glow falloff
  const { outlineMat, glow1Mat, glow2Mat, glow3Mat } = useMemo(() => {
    const baseMaterialProps = {
      color,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      toneMapped: false,
      side: DoubleSide,
    };

    return {
      outlineMat: new MeshBasicMaterial({ ...baseMaterialProps, opacity }),
      glow1Mat: new MeshBasicMaterial({ ...baseMaterialProps, opacity: opacity * 0.5 }),
      glow2Mat: new MeshBasicMaterial({ ...baseMaterialProps, opacity: opacity * 0.25 }),
      glow3Mat: new MeshBasicMaterial({ ...baseMaterialProps, opacity: opacity * 0.1 }),
    };
  }, [color, opacity]);

  // Animate pulse
  useFrame((state) => {
    if (!pulse) return;
    const t = state.clock.getElapsedTime();
    const phase = (Math.sin(t * Math.PI * 2 * pulseSpeed) + 1) / 2; // 0..1
    const op = pulseMin + (pulseMax - pulseMin) * phase;

    if (outlineMeshRef.current) {
      (outlineMeshRef.current.material as MeshBasicMaterial).opacity = op;
    }
    if (glow1MeshRef.current) {
      (glow1MeshRef.current.material as MeshBasicMaterial).opacity = op * 0.5;
    }
    if (glow2MeshRef.current) {
      (glow2MeshRef.current.material as MeshBasicMaterial).opacity = op * 0.25;
    }
    if (glow3MeshRef.current) {
      (glow3MeshRef.current.material as MeshBasicMaterial).opacity = op * 0.1;
    }
  });

  return (
    <group
      rotation-x={flat ? -Math.PI / 2 : 0}
      rotation-z={rotationZ}
      position={flat ? [0, elevation, 0] : [0, 0, elevation]}
    >
      {/* Outermost glow layer (faintest) */}
      <mesh
        ref={glow3MeshRef}
        geometry={glow3Geom}
        material={glow3Mat}
        position={[0, 0, -0.003]}
        renderOrder={renderOrder}
        raycast={noopRaycast}
      />
      {/* Middle glow layer */}
      <mesh
        ref={glow2MeshRef}
        geometry={glow2Geom}
        material={glow2Mat}
        position={[0, 0, -0.002]}
        renderOrder={renderOrder}
        raycast={noopRaycast}
      />
      {/* Inner glow layer */}
      <mesh
        ref={glow1MeshRef}
        geometry={glow1Geom}
        material={glow1Mat}
        position={[0, 0, -0.001]}
        renderOrder={renderOrder}
        raycast={noopRaycast}
      />
      {/* Crisp outline (brightest) */}
      <mesh
        ref={outlineMeshRef}
        geometry={outlineGeom}
        material={outlineMat}
        renderOrder={renderOrder}
        raycast={noopRaycast}
      />
    </group>
  );
}
