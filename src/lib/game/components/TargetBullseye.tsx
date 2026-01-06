import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import * as THREE from "three";

type TargetBullseyeProps = {
  position: [number, number, number];
  color?: string;
};

/**
 * Renders an animated bulls-eye indicator for magic spell targets.
 * Features concentric pulsing rings for clear target indication.
 */
export function TargetBullseye({
  position,
  color = "#ef4444",
}: TargetBullseyeProps) {
  const outerRingRef = useRef<THREE.Mesh>(null);
  const innerRingRef = useRef<THREE.Mesh>(null);
  const centerDotRef = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    const time = state.clock.elapsedTime;

    // Outer ring pulse - opacity only, no scale wobble
    if (outerRingRef.current) {
      if (outerRingRef.current.material instanceof THREE.MeshBasicMaterial) {
        outerRingRef.current.material.opacity = 0.4 + Math.sin(time * 3) * 0.25;
      }
    }

    // Inner ring pulse (offset phase) - opacity only
    if (innerRingRef.current) {
      if (innerRingRef.current.material instanceof THREE.MeshBasicMaterial) {
        innerRingRef.current.material.opacity = 0.6 + Math.sin(time * 3 + Math.PI / 2) * 0.25;
      }
    }

    // Center dot pulse
    if (centerDotRef.current) {
      if (centerDotRef.current.material instanceof THREE.MeshBasicMaterial) {
        centerDotRef.current.material.opacity = 0.8 + Math.sin(time * 4) * 0.2;
      }
    }
  });

  return (
    <group position={position}>
      {/* Outer ring */}
      <mesh ref={outerRingRef} rotation-x={-Math.PI / 2} renderOrder={10500}>
        <ringGeometry args={[0.35, 0.4, 32]} />
        <meshBasicMaterial color={color} transparent opacity={0.4} side={THREE.DoubleSide} depthTest={false} />
      </mesh>

      {/* Inner ring */}
      <mesh ref={innerRingRef} rotation-x={-Math.PI / 2} renderOrder={10500}>
        <ringGeometry args={[0.2, 0.25, 32]} />
        <meshBasicMaterial color={color} transparent opacity={0.6} side={THREE.DoubleSide} depthTest={false} />
      </mesh>

      {/* Center dot */}
      <mesh ref={centerDotRef} position={[0, 0.001, 0]} renderOrder={10500}>
        <sphereGeometry args={[0.08, 16, 16]} />
        <meshBasicMaterial color={color} transparent opacity={0.8} depthTest={false} />
      </mesh>
    </group>
  );
}
