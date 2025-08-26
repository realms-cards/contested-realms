"use client";

import { useRef, useState, useEffect } from "react";
import { useFrame } from "@react-three/fiber";
import { Text } from "@react-three/drei";
import * as THREE from "three";
import type { PlayerKey } from "../store";

interface D20DiceProps {
  player: PlayerKey;
  position: [number, number, number];
  roll: number | null;
  isRolling: boolean;
  onRollComplete?: () => void;
  onRoll?: () => void;
}

export default function D20Dice({ player, position, roll, isRolling, onRollComplete, onRoll }: D20DiceProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const [rollStartTime, setRollStartTime] = useState<number>(0);
  const [hasCompletedRoll, setHasCompletedRoll] = useState(false);

  // D20 geometry - icosahedron (bigger size for visibility)
  const d20Geometry = new THREE.IcosahedronGeometry(0.8, 0);

  // Start rolling animation when isRolling becomes true
  useEffect(() => {
    if (isRolling && !hasCompletedRoll) {
      setRollStartTime(Date.now());
    }
  }, [isRolling, roll, hasCompletedRoll]);

  // Simple rotation animation
  useFrame(() => {
    if (!meshRef.current || !isRolling || hasCompletedRoll) return;

    const elapsed = Date.now() - rollStartTime;
    const rollDuration = 800; // 0.8 seconds of spinning - shorter so winner can be announced

    if (elapsed < rollDuration) {
      // Simple spinning animation
      const spinSpeed = 10 * (1 - elapsed / rollDuration); // Slow down over time
      meshRef.current.rotation.x += spinSpeed * 0.02;
      meshRef.current.rotation.y += spinSpeed * 0.03;
      meshRef.current.rotation.z += spinSpeed * 0.025;
    } else if (!hasCompletedRoll) {
      // Stop spinning and call completion
      setHasCompletedRoll(true);
      onRollComplete?.();
    }
  });

  // Color based on player
  const diceColor = player === "p1" ? "#3b82f6" : "#ef4444"; // blue or red
  const textColor = "#ffffff";

  return (
    <group position={position}>
      {/* D20 Mesh */}
      <mesh 
        ref={meshRef} 
        geometry={d20Geometry}
        onClick={(e) => {
          e.stopPropagation();
          if (!isRolling && roll === null && onRoll) {
            onRoll();
          }
        }}
        onPointerEnter={(e) => {
          if (!isRolling && roll === null && onRoll) {
            document.body.style.cursor = 'pointer';
          }
        }}
        onPointerLeave={() => {
          document.body.style.cursor = 'default';
        }}
      >
        <meshStandardMaterial 
          color={diceColor} 
          emissive={!isRolling && roll === null && onRoll ? diceColor : "#000000"}
          emissiveIntensity={!isRolling && roll === null && onRoll ? 0.1 : 0}
        />
      </mesh>
      
      {/* Show the result number above the dice */}
      {roll !== null && hasCompletedRoll && (
        <Text
          position={[0, 1.2, 0]}
          fontSize={0.8}
          color={textColor}
          anchorX="center"
          anchorY="middle"
          outlineWidth={0.05}
          outlineColor="#000000"
        >
          {roll}
        </Text>
      )}
      
      {/* Player label */}
      <Text
        position={[0, -1.2, 0]}
        fontSize={0.5}
        color={diceColor}
        anchorX="center"
        anchorY="middle"
        outlineWidth={0.02}
        outlineColor="#000000"
      >
        P{player === "p1" ? "1" : "2"}
      </Text>
    </group>
  );
}