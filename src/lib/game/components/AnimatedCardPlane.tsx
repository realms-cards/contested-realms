"use client";

import { useFrame } from "@react-three/fiber";
import { useRef, useEffect } from "react";
import type { Group } from "three";
import { MathUtils } from "three";
import CardPlane from "./CardPlane";

interface AnimatedCardPlaneProps {
  slug: string;
  width: number;
  height: number;
  targetPosition: [number, number, number];
  targetRotationZ?: number;
  /** Animation speed factor (0-1, higher = faster). Default 0.15 */
  lerpFactor?: number;
  /** If true, skip animation and snap to position immediately */
  instant?: boolean;
  // Pass through CardPlane props
  depthWrite?: boolean;
  depthTest?: boolean;
  polygonOffset?: boolean;
  polygonOffsetFactor?: number;
  polygonOffsetUnits?: number;
  interactive?: boolean;
  elevation?: number;
  upright?: boolean;
  renderOrder?: number;
  textureUrl?: string;
  textureRotation?: number;
  forceTextureUrl?: boolean;
  opacity?: number;
  preferRaster?: boolean;
  onContextMenu?: (e: unknown) => void;
  onPointerDown?: (e: unknown) => void;
  onPointerOver?: (e: unknown) => void;
  onPointerOut?: (e: unknown) => void;
  onPointerMove?: (e: unknown) => void;
  onPointerUp?: (e: unknown) => void;
  onDoubleClick?: (e: unknown) => void;
  onClick?: (e: unknown) => void;
  cardId?: number;
}

/**
 * A wrapper around CardPlane that smoothly animates position changes.
 * Used primarily for replay playback to create smooth card movement transitions.
 */
export default function AnimatedCardPlane({
  slug,
  width,
  height,
  targetPosition,
  targetRotationZ = 0,
  lerpFactor = 0.15,
  instant = false,
  elevation = 0.001,
  ...cardPlaneProps
}: AnimatedCardPlaneProps) {
  const groupRef = useRef<Group>(null);
  const currentPos = useRef<[number, number, number]>([...targetPosition]);
  const currentRotZ = useRef(targetRotationZ);
  const isFirstRender = useRef(true);

  // On first render or when instant is true, snap to position
  useEffect(() => {
    if (isFirstRender.current || instant) {
      currentPos.current = [...targetPosition];
      currentRotZ.current = targetRotationZ;
      if (groupRef.current) {
        groupRef.current.position.set(...targetPosition);
      }
      isFirstRender.current = false;
    }
  }, [targetPosition, targetRotationZ, instant]);

  // Animate towards target position each frame
  useFrame(() => {
    if (!groupRef.current || instant) return;

    const [tx, ty, tz] = targetPosition;
    const [cx, cy, cz] = currentPos.current;

    // Lerp position
    const nx = MathUtils.lerp(cx, tx, lerpFactor);
    const ny = MathUtils.lerp(cy, ty, lerpFactor);
    const nz = MathUtils.lerp(cz, tz, lerpFactor);

    // Lerp rotation
    const nr = MathUtils.lerp(currentRotZ.current, targetRotationZ, lerpFactor);

    // Only update if there's meaningful change
    const posDelta = Math.abs(nx - cx) + Math.abs(ny - cy) + Math.abs(nz - cz);
    const rotDelta = Math.abs(nr - currentRotZ.current);

    if (posDelta > 0.0001 || rotDelta > 0.0001) {
      currentPos.current = [nx, ny, nz];
      currentRotZ.current = nr;
      groupRef.current.position.set(nx, ny, nz);
    }
  });

  return (
    <group ref={groupRef} position={targetPosition}>
      <CardPlane
        slug={slug}
        width={width}
        height={height}
        rotationZ={currentRotZ.current}
        elevation={elevation}
        {...cardPlaneProps}
      />
    </group>
  );
}
