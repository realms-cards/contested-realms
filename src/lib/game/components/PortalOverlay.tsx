"use client";

import { shaderMaterial } from "@react-three/drei";
import { useFrame, extend } from "@react-three/fiber";
import { useMemo } from "react";
import * as THREE from "three";
import { TILE_SIZE } from "@/lib/game/constants";
import { isPortalTile } from "@/lib/game/store/portalState";
import type { PortalState } from "@/lib/game/store/types";

export type PortalOverlayProps = {
  tileX: number;
  tileY: number;
  portalState: PortalState | null;
};

// Swirl shader material - vortex portal effect
const SwirlMaterial = shaderMaterial(
  {
    uTime: 0,
    uColor: new THREE.Color("#22c55e"),
    uOpacity: 0.45,
  },
  // Vertex shader
  `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  // Fragment shader - creates vortex portal with 6 arms and center circle
  `
    uniform float uTime;
    uniform vec3 uColor;
    uniform float uOpacity;
    varying vec2 vUv;
    
    void main() {
      vec2 center = vUv - 0.5;
      float dist = length(center);
      float angle = atan(center.y, center.x);
      
      // Create swirl by offsetting angle based on distance and time
      // More swirl near center, less at edges
      float swirlStrength = 4.0 * (1.0 - dist * 1.5);
      float swirl = angle + swirlStrength - uTime * 0.3;
      
      // Create 6 spiral arms
      float arms = sin(swirl * 6.0) * 0.5 + 0.5;
      
      // Add secondary layer of 8 fainter arms for complexity
      float arms2 = sin(swirl * 8.0 + uTime * 0.1) * 0.3 + 0.5;
      arms = mix(arms, arms2, 0.3);
      
      // Outer ring fade
      float outerFade = smoothstep(0.5, 0.38, dist);
      
      // Inner fade - keep center visible for the circle
      float innerFade = smoothstep(0.0, 0.12, dist);
      
      // Arms visibility (fade arms toward center)
      float armsFade = outerFade * smoothstep(0.08, 0.2, dist);
      float armsAlpha = arms * armsFade * uOpacity;
      
      // Center circle - solid glowing core
      float coreRadius = 0.1;
      float coreGlow = smoothstep(coreRadius + 0.05, coreRadius - 0.02, dist);
      float coreRing = smoothstep(coreRadius - 0.02, coreRadius - 0.01, dist) * 
                       smoothstep(coreRadius + 0.03, coreRadius + 0.01, dist);
      float coreAlpha = (coreGlow * 0.6 + coreRing * 0.8) * uOpacity;
      
      // Outer rim glow
      float rimGlow = smoothstep(0.5, 0.4, dist) * smoothstep(0.3, 0.42, dist) * 0.5;
      
      // Combine all elements
      float alpha = armsAlpha + coreAlpha + rimGlow * uOpacity;
      
      // Pulse the whole effect subtly (max ~60% opacity)
      alpha *= 0.5 + 0.1 * sin(uTime * 1.5);
      
      gl_FragColor = vec4(uColor, alpha);
    }
  `
);

extend({ SwirlMaterial });

// Player colors for portal overlays
const PORTAL_COLORS = {
  p1: new THREE.Color("#3b82f6"), // blue-500
  p2: new THREE.Color("#ef4444"), // red-500
} as const;

/**
 * Renders a swirling portal vortex effect on designated tiles.
 */
export function PortalOverlay({
  tileX,
  tileY,
  portalState,
}: PortalOverlayProps) {
  // Check if portal setup is complete and this tile is a portal
  const { isPortal, owner } = useMemo(() => {
    if (!portalState || !portalState.setupComplete) {
      return { isPortal: false, owner: null };
    }
    return isPortalTile(tileX, tileY, portalState);
  }, [tileX, tileY, portalState]);

  const color = owner === "p1" ? PORTAL_COLORS.p1 : PORTAL_COLORS.p2;
  const size = TILE_SIZE * 0.9;

  // Create material instance (must be before early return for hooks order)
  const material = useMemo(() => {
    if (!isPortal) return null;
    const mat = new SwirlMaterial();
    mat.transparent = true;
    mat.depthWrite = false;
    mat.side = THREE.DoubleSide;
    mat.uniforms.uColor.value = color;
    return mat;
  }, [isPortal, color]);

  // Animate the swirl (pulse is handled in shader)
  useFrame(({ clock }) => {
    if (!material || !isPortal) return;
    material.uniforms.uTime.value = clock.getElapsedTime();
  });

  if (!isPortal || !owner || !material) {
    return null;
  }

  return (
    <mesh position={[0, 0.008, 0]} rotation-x={-Math.PI / 2}>
      <planeGeometry args={[size, size]} />
      <primitive object={material} attach="material" />
    </mesh>
  );
}
