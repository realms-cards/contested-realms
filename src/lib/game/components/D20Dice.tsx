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
  const [currentRotation, setCurrentRotation] = useState<[number, number, number]>([0, 0, 0]);
  const [targetRotation, setTargetRotation] = useState<[number, number, number]>([0, 0, 0]);
  const [rollStartTime, setRollStartTime] = useState<number>(0);
  const [hasCompletedRoll, setHasCompletedRoll] = useState(false);

  // D20 geometry - icosahedron
  const d20Geometry = new THREE.IcosahedronGeometry(0.8, 0);

  // Start rolling animation when isRolling becomes true
  useEffect(() => {
    if (isRolling && !hasCompletedRoll) {
      setRollStartTime(Date.now());
      // Generate random target rotation based on the roll result
      if (roll !== null) {
        // Different face orientations for different numbers (simplified)
        const faceRotations: Record<number, [number, number, number]> = {
          1: [0, 0, 0],
          2: [Math.PI / 2, 0, 0],
          3: [Math.PI, 0, 0],
          4: [0, Math.PI / 2, 0],
          5: [0, Math.PI, 0],
          6: [0, -Math.PI / 2, 0],
          7: [Math.PI / 3, 0, 0],
          8: [2 * Math.PI / 3, 0, 0],
          9: [0, Math.PI / 3, 0],
          10: [0, 2 * Math.PI / 3, 0],
          11: [Math.PI / 4, Math.PI / 4, 0],
          12: [Math.PI / 2, Math.PI / 2, 0],
          13: [Math.PI / 6, Math.PI / 3, 0],
          14: [Math.PI / 3, Math.PI / 6, 0],
          15: [0, 0, Math.PI / 2],
          16: [0, 0, Math.PI],
          17: [0, 0, -Math.PI / 2],
          18: [Math.PI / 2, 0, Math.PI / 2],
          19: [Math.PI / 4, Math.PI / 4, Math.PI / 4],
          20: [Math.PI, Math.PI, 0],
        };
        setTargetRotation(faceRotations[roll] || [0, 0, 0]);
      }
    }
  }, [isRolling, roll, hasCompletedRoll]);

  // Animation frame
  useFrame(() => {
    if (!meshRef.current || !isRolling) return;

    const elapsed = Date.now() - rollStartTime;
    const rollDuration = 2000; // 2 seconds

    if (elapsed < rollDuration) {
      // Rolling animation - spin rapidly with some randomness
      const spinSpeed = 20 * (1 - elapsed / rollDuration); // Slow down over time
      const wobble = Math.sin(elapsed * 0.01) * 0.1;
      
      setCurrentRotation([
        currentRotation[0] + spinSpeed * 0.016 + wobble,
        currentRotation[1] + spinSpeed * 0.019,
        currentRotation[2] + spinSpeed * 0.021 + wobble,
      ]);
      
      meshRef.current.rotation.set(...currentRotation);
    } else if (!hasCompletedRoll) {
      // Rolling complete - settle to final position
      meshRef.current.rotation.set(...targetRotation);
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
          if (!isRolling && roll === null) {
            document.body.style.cursor = 'pointer';
          }
        }}
        onPointerLeave={() => {
          document.body.style.cursor = 'default';
        }}
      >
        <meshStandardMaterial 
          color={diceColor} 
          emissive={!isRolling && roll === null ? diceColor : "#000000"}
          emissiveIntensity={!isRolling && roll === null ? 0.1 : 0}
        />
      </mesh>
      
      {/* Show the result number above the dice */}
      {roll !== null && hasCompletedRoll && (
        <Text
          position={[0, 1.5, 0]}
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
        position={[0, -1.5, 0]}
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