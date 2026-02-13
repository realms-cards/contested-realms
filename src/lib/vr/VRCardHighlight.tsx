"use client";

import { useFrame } from "@react-three/fiber";
import { useXR } from "@react-three/xr";
import { useRef } from "react";
import * as THREE from "three";

interface VRCardHighlightProps {
  /** Whether the card is currently hovered */
  isHovered?: boolean;
  /** Whether the card is currently grabbed */
  isGrabbed?: boolean;
  /** Card dimensions */
  width?: number;
  height?: number;
  /** Highlight colors */
  hoverColor?: string;
  grabColor?: string;
  /** Animation speed */
  pulseSpeed?: number;
}

/**
 * VR Card Highlight - Visual feedback for card hover/grab states in VR.
 * Renders a glowing outline around the card that pulses when hovered.
 */
export function VRCardHighlight({
  isHovered = false,
  isGrabbed = false,
  width = 0.7,
  height = 1.0,
  hoverColor = "#00ffff",
  grabColor = "#ffff00",
  pulseSpeed = 2.0,
}: VRCardHighlightProps) {
  const session = useXR((state) => state.session);
  const meshRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.MeshBasicMaterial>(null);

  // Animate the highlight
  useFrame((_, delta) => {
    if (!materialRef.current) return;

    const isActive = isHovered || isGrabbed;
    const targetOpacity = isActive ? (isGrabbed ? 0.8 : 0.5) : 0;

    // Smooth opacity transition
    materialRef.current.opacity +=
      (targetOpacity - materialRef.current.opacity) * delta * 5;

    // Pulse effect when hovered (not grabbed)
    if (isHovered && !isGrabbed) {
      const pulse = Math.sin(Date.now() * 0.001 * pulseSpeed) * 0.2 + 0.8;
      materialRef.current.opacity *= pulse;
    }

    // Update color
    const targetColor = isGrabbed ? grabColor : hoverColor;
    materialRef.current.color.set(targetColor);
  });

  // Only render in VR mode
  if (!session) {
    return null;
  }

  const borderWidth = 0.02;

  return (
    <group>
      {/* Outer glow */}
      <mesh ref={meshRef} position={[0, 0.001, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[width + borderWidth * 4, height + borderWidth * 4]} />
        <meshBasicMaterial
          ref={materialRef}
          color={hoverColor}
          transparent
          opacity={0}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>

      {/* Inner cutout (creates border effect) */}
      <mesh position={[0, 0.002, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[width, height]} />
        <meshBasicMaterial color="#000000" transparent opacity={0} depthWrite={false} />
      </mesh>
    </group>
  );
}

/**
 * VR Tile Highlight - Visual feedback for valid drop tiles in VR
 */
interface VRTileHighlightProps {
  position: [number, number, number];
  isValid?: boolean;
  isHovered?: boolean;
  size?: number;
}

export function VRTileHighlight({
  position,
  isValid = true,
  isHovered = false,
  size = 1.0,
}: VRTileHighlightProps) {
  const session = useXR((state) => state.session);
  const materialRef = useRef<THREE.MeshBasicMaterial>(null);

  useFrame(() => {
    if (!materialRef.current) return;

    // Pulse effect
    const pulse = Math.sin(Date.now() * 0.003) * 0.3 + 0.7;
    const baseOpacity = isHovered ? 0.6 : 0.3;
    materialRef.current.opacity = baseOpacity * pulse;

    // Color based on validity
    materialRef.current.color.set(isValid ? "#00ff00" : "#ff0000");
  });

  if (!session) {
    return null;
  }

  return (
    <mesh position={position} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[size * 0.9, size * 0.9]} />
      <meshBasicMaterial
        ref={materialRef}
        color={isValid ? "#00ff00" : "#ff0000"}
        transparent
        opacity={0.3}
        side={THREE.DoubleSide}
        depthWrite={false}
      />
    </mesh>
  );
}

/**
 * VR Drop Zone Indicator - Shows where a card will be placed
 */
interface VRDropZoneProps {
  position: [number, number, number];
  visible?: boolean;
  cardWidth?: number;
  cardHeight?: number;
}

export function VRDropZone({
  position,
  visible = false,
  cardWidth = 0.7,
  cardHeight = 1.0,
}: VRDropZoneProps) {
  const session = useXR((state) => state.session);
  const materialRef = useRef<THREE.MeshBasicMaterial>(null);
  const edgesRef = useRef<THREE.LineSegments>(null);

  useFrame(() => {
    if (materialRef.current) {
      const targetOpacity = visible ? 0.3 : 0;
      materialRef.current.opacity +=
        (targetOpacity - materialRef.current.opacity) * 0.1;
    }

    if (edgesRef.current) {
      const targetOpacity = visible ? 1.0 : 0;
      const mat = edgesRef.current.material as THREE.LineBasicMaterial;
      mat.opacity += (targetOpacity - mat.opacity) * 0.1;
    }
  });

  if (!session) {
    return null;
  }

  return (
    <group position={position}>
      {/* Semi-transparent fill */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.001, 0]}>
        <planeGeometry args={[cardWidth, cardHeight]} />
        <meshBasicMaterial
          ref={materialRef}
          color="#ffffff"
          transparent
          opacity={0}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>

      {/* Dashed border */}
      <lineSegments ref={edgesRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.002, 0]}>
        <edgesGeometry args={[new THREE.PlaneGeometry(cardWidth, cardHeight)]} />
        <lineBasicMaterial color="#ffffff" transparent opacity={0} linewidth={2} />
      </lineSegments>
    </group>
  );
}

export default VRCardHighlight;
