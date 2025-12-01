"use client";

import { useFrame } from "@react-three/fiber";
import { useRef, useMemo } from "react";
import * as THREE from "three";
import { CARD_SHORT } from "@/lib/game/constants";
import type { PortalState } from "@/lib/game/store/types";
import { isPortalTile } from "@/lib/game/store/portalState";

export type PortalOverlayProps = {
  tileX: number;
  tileY: number;
  portalState: PortalState | null;
};

// Player colors for portal overlays
const PORTAL_COLORS = {
  p1: "#3b82f6", // blue-500
  p2: "#ef4444", // red-500
} as const;

/**
 * Renders an animated ring overlay on tiles designated as portals.
 * Visible under cards but above the playmat.
 */
export function PortalOverlay({
  tileX,
  tileY,
  portalState,
}: PortalOverlayProps) {
  const ringRef = useRef<THREE.Mesh>(null);

  // Check if this tile is a portal and get owner
  const { isPortal, owner } = useMemo(
    () => isPortalTile(tileX, tileY, portalState),
    [tileX, tileY, portalState]
  );

  // Pulse animation
  useFrame(({ clock }) => {
    if (!ringRef.current || !isPortal) return;

    // Pulsing opacity and scale
    const t = clock.getElapsedTime();
    const pulse = 0.5 + 0.3 * Math.sin(t * 4); // 0.2 to 0.8 opacity range
    const scale = 1 + 0.05 * Math.sin(t * 3); // Subtle size pulse

    const material = ringRef.current.material as THREE.MeshBasicMaterial;
    material.opacity = pulse;
    ringRef.current.scale.setScalar(scale);
  });

  // Don't render if not a portal
  if (!isPortal || !owner) {
    return null;
  }

  const color = owner === "p1" ? PORTAL_COLORS.p1 : PORTAL_COLORS.p2;

  // Ring geometry - slightly smaller than card size
  const innerRadius = CARD_SHORT * 0.3;
  const outerRadius = CARD_SHORT * 0.45;

  return (
    <group position={[0, 0.001, 0]} rotation-x={-Math.PI / 2}>
      {/* Main ring */}
      <mesh ref={ringRef}>
        <ringGeometry args={[innerRadius, outerRadius, 32]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.5}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>

      {/* Inner glow circle */}
      <mesh position={[0, 0, 0.0001]}>
        <circleGeometry args={[innerRadius * 0.8, 32]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.15}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>

      {/* Outer glow ring */}
      <mesh position={[0, 0, -0.0001]}>
        <ringGeometry args={[outerRadius, outerRadius * 1.2, 32]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.1}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}
