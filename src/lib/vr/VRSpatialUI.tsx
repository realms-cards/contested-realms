"use client";

import { Text } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useXR } from "@react-three/xr";
import { useRef } from "react";
import * as THREE from "three";

interface VRLifeCounterProps {
  life: number;
  position: [number, number, number];
  color?: string;
  label?: string;
}

/**
 * 3D life counter for VR display
 */
export function VRLifeCounter({
  life,
  position,
  color = "#ffffff",
  label,
}: VRLifeCounterProps) {
  const session = useXR((state) => state.session);

  if (!session) return null;

  return (
    <group position={position}>
      {label && (
        <Text
          position={[0, 0.08, 0]}
          fontSize={0.03}
          color="#888888"
          anchorX="center"
          anchorY="bottom"
        >
          {label}
        </Text>
      )}
      <Text fontSize={0.08} color={color} anchorX="center" anchorY="middle">
        {life}
      </Text>
      <mesh position={[0, 0, -0.01]}>
        <planeGeometry args={[0.15, 0.12]} />
        <meshBasicMaterial color="#1a1a1a" opacity={0.8} transparent />
      </mesh>
    </group>
  );
}

interface VRTurnIndicatorProps {
  isYourTurn: boolean;
  phase?: string;
  position?: [number, number, number];
}

/**
 * 3D turn indicator for VR display
 */
export function VRTurnIndicator({
  isYourTurn,
  phase,
  position = [0, 0.5, -0.8],
}: VRTurnIndicatorProps) {
  const session = useXR((state) => state.session);
  const groupRef = useRef<THREE.Group>(null);
  const { camera } = useThree();

  useFrame(() => {
    if (!groupRef.current || !session) return;
    // Make the indicator face the camera
    groupRef.current.lookAt(camera.position);
  });

  if (!session) return null;

  return (
    <group ref={groupRef} position={position}>
      <Text
        fontSize={0.05}
        color={isYourTurn ? "#22c55e" : "#ef4444"}
        anchorX="center"
        anchorY="middle"
      >
        {isYourTurn ? "Your Turn" : "Opponent's Turn"}
      </Text>
      {phase && (
        <Text
          position={[0, -0.06, 0]}
          fontSize={0.03}
          color="#888888"
          anchorX="center"
          anchorY="top"
        >
          {phase}
        </Text>
      )}
      <mesh position={[0, -0.01, -0.01]}>
        <planeGeometry args={[0.3, 0.12]} />
        <meshBasicMaterial color="#1a1a1a" opacity={0.8} transparent />
      </mesh>
    </group>
  );
}

interface VRStatusBarProps {
  playerLife: number;
  opponentLife: number;
  currentTurn: 1 | 2;
  playerNumber: 1 | 2;
  phase?: string;
}

/**
 * Combined VR status bar with life counters and turn indicator
 */
export function VRStatusBar({
  playerLife,
  opponentLife,
  currentTurn,
  playerNumber,
  phase,
}: VRStatusBarProps) {
  const session = useXR((state) => state.session);
  const groupRef = useRef<THREE.Group>(null);
  const { camera } = useThree();

  useFrame(() => {
    if (!groupRef.current || !session) return;

    // Position the status bar in front of and above the player
    const forward = new THREE.Vector3(0, 0, -1);
    forward.applyQuaternion(camera.quaternion);
    forward.y = 0; // Keep horizontal
    forward.normalize();

    groupRef.current.position.set(
      camera.position.x + forward.x * 0.8,
      camera.position.y + 0.4,
      camera.position.z + forward.z * 0.8,
    );

    // Face the camera
    groupRef.current.lookAt(camera.position);
  });

  if (!session) return null;

  const isYourTurn = currentTurn === playerNumber;

  return (
    <group ref={groupRef} name="vr-status-bar">
      {/* Player life (left) */}
      <VRLifeCounter
        life={playerLife}
        position={[-0.2, 0, 0]}
        color="#22c55e"
        label="You"
      />

      {/* Turn indicator (center) */}
      <group position={[0, 0.05, 0]}>
        <Text
          fontSize={0.025}
          color={isYourTurn ? "#22c55e" : "#ef4444"}
          anchorX="center"
          anchorY="middle"
        >
          {isYourTurn ? "YOUR TURN" : "WAITING"}
        </Text>
        {phase && (
          <Text
            position={[0, -0.035, 0]}
            fontSize={0.018}
            color="#666666"
            anchorX="center"
            anchorY="top"
          >
            {phase}
          </Text>
        )}
      </group>

      {/* Opponent life (right) */}
      <VRLifeCounter
        life={opponentLife}
        position={[0.2, 0, 0]}
        color="#ef4444"
        label="Opponent"
      />

      {/* Background panel */}
      <mesh position={[0, 0, -0.02]}>
        <planeGeometry args={[0.5, 0.18]} />
        <meshBasicMaterial color="#0a0a0a" opacity={0.9} transparent />
      </mesh>
    </group>
  );
}
