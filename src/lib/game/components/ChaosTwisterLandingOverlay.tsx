"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { TILE_SIZE } from "@/lib/game/constants";
import type { CellKey, PendingChaosTwister } from "@/lib/game/store/types";

export type ChaosTwisterLandingOverlayProps = {
  tileX: number;
  tileY: number;
  pendingChaosTwister: PendingChaosTwister | null;
};

// Colors for different highlight types
const COLORS = {
  minion: new THREE.Color("#a855f7"), // purple - selected minion
  targetSite: new THREE.Color("#3b82f6"), // blue - target site
  green: new THREE.Color("#22c55e"), // green - perfect landing
  yellow: new THREE.Color("#eab308"), // yellow - close landing
  red: new THREE.Color("#ef4444"), // red - missed landing
};

/**
 * Renders visual highlights for Chaos Twister:
 * - Purple glow on selected minion's tile during selection
 * - Blue glow on target site during site selection and minigame
 * - Colored impact effect on landing site during resolving
 */
export function ChaosTwisterLandingOverlay({
  tileX,
  tileY,
  pendingChaosTwister,
}: ChaosTwisterLandingOverlayProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const ringRef = useRef<THREE.Mesh>(null);

  const tileKey = `${tileX},${tileY}` as CellKey;

  // Determine what type of highlight this tile should show
  const highlightType = useMemo(() => {
    if (!pendingChaosTwister) return null;

    const phase = pendingChaosTwister.phase;

    // During selectingSite or minigame: highlight the selected minion's tile
    if (
      (phase === "selectingSite" || phase === "minigame") &&
      pendingChaosTwister.targetMinion?.at === tileKey
    ) {
      return "minion";
    }

    // During minigame: also highlight the target site
    if (phase === "minigame" && pendingChaosTwister.targetSite) {
      if (
        pendingChaosTwister.targetSite.x === tileX &&
        pendingChaosTwister.targetSite.y === tileY
      ) {
        return "targetSite";
      }
    }

    // During resolving: highlight the landing site with accuracy color
    if (phase === "resolving" && pendingChaosTwister.landingSite) {
      if (
        pendingChaosTwister.landingSite.x === tileX &&
        pendingChaosTwister.landingSite.y === tileY
      ) {
        return pendingChaosTwister.minigameResult?.accuracy || "red";
      }
    }

    return null;
  }, [pendingChaosTwister, tileX, tileY, tileKey]);

  // Get the color for this highlight
  const color = useMemo(() => {
    if (!highlightType) return COLORS.minion;
    if (highlightType === "minion") return COLORS.minion;
    if (highlightType === "targetSite") return COLORS.targetSite;
    if (highlightType === "green") return COLORS.green;
    if (highlightType === "yellow") return COLORS.yellow;
    return COLORS.red;
  }, [highlightType]);

  // Animate the effect
  useFrame(({ clock }) => {
    if (!highlightType) return;
    const t = clock.getElapsedTime();

    // Pulse the main circle
    if (meshRef.current) {
      const scale = 1 + Math.sin(t * 4) * 0.1;
      meshRef.current.scale.set(scale, scale, 1);
      const mat = meshRef.current.material as THREE.MeshBasicMaterial;
      mat.opacity = 0.4 + Math.sin(t * 3) * 0.15;
    }

    // Expand the ring outward
    if (ringRef.current) {
      const ringScale = 1 + ((t * 0.5) % 1) * 0.5;
      ringRef.current.scale.set(ringScale, ringScale, 1);
      const mat = ringRef.current.material as THREE.MeshBasicMaterial;
      mat.opacity = 0.6 * (1 - ((t * 0.5) % 1));
    }
  });

  if (!highlightType) {
    return null;
  }

  const size = TILE_SIZE * 0.85;

  return (
    <group position={[0, 0.012, 0]} rotation-x={-Math.PI / 2}>
      {/* Main pulsing circle */}
      <mesh ref={meshRef}>
        <circleGeometry args={[size * 0.45, 32]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.5}
          depthWrite={false}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* Expanding ring */}
      <mesh ref={ringRef}>
        <ringGeometry args={[size * 0.4, size * 0.45, 32]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.6}
          depthWrite={false}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* Inner indicator - tornado for minion, crosshair for target */}
      <mesh rotation-z={highlightType === "minion" ? Math.PI / 4 : 0}>
        <ringGeometry
          args={[size * 0.15, size * 0.2, highlightType === "minion" ? 6 : 32]}
        />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.7}
          depthWrite={false}
          side={THREE.DoubleSide}
        />
      </mesh>
    </group>
  );
}
