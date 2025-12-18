"use client";

import { Text } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useRef, useState, useEffect } from "react";
import * as THREE from "three";
import type { PlayerKey } from "../store";

interface D20DiceProps {
  playerName: string;
  player: PlayerKey;
  position: [number, number, number];
  roll: number | null;
  isRolling: boolean;
  onRollComplete?: () => void;
  onRoll?: () => void;
  /** Custom dice color override (default: player-based blue/red) */
  customColor?: string;
  /** Whether this die is highlighted as a duplicate needing reroll */
  isDuplicate?: boolean;
}

export default function D20Dice({
  player,
  position,
  roll,
  isRolling,
  onRollComplete,
  onRoll,
  playerName,
  customColor,
  isDuplicate = false,
}: D20DiceProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const [rollStartTime, setRollStartTime] = useState<number>(0);
  const [hasCompletedRoll, setHasCompletedRoll] = useState(false);

  // D20 geometry - icosahedron (bigger size for visibility)
  const d20Geometry = new THREE.IcosahedronGeometry(0.8, 0);

  // Track the previous roll value to detect actual new rolls vs syncs
  const prevRollRef = useRef<number | null>(null);

  // Start rolling when isRolling becomes true with a NEW roll value
  // Don't reset if the roll value is the same (server sync of existing roll)
  useEffect(() => {
    if (isRolling && roll !== prevRollRef.current) {
      setHasCompletedRoll(false);
      setRollStartTime(Date.now());
      prevRollRef.current = roll;
    }
  }, [isRolling, roll]);

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

  // Color based on player or custom override
  const defaultColor = player === "p1" ? "#3b82f6" : "#ef4444"; // blue or red
  const diceColor = customColor ?? defaultColor;
  const textColor = "#ffffff";
  // Highlight duplicate dice with pulsing yellow outline
  const duplicateHighlight = isDuplicate ? "#fbbf24" : undefined;

  // Subtle pulsing glow for clickable dice
  const materialRef = useRef<THREE.MeshStandardMaterial>(null);
  const isClickable = !isRolling && roll == null && onRoll;

  useFrame(({ clock }) => {
    if (!materialRef.current || !isClickable) return;
    // Subtle pulse between 0.1 and 0.3 intensity
    const pulse = 0.2 + Math.sin(clock.elapsedTime * 2.5) * 0.1;
    materialRef.current.emissiveIntensity = pulse;
  });

  return (
    <group position={position}>
      {/* D20 Mesh */}
      <mesh
        ref={meshRef}
        geometry={d20Geometry}
        onClick={(e) => {
          e.stopPropagation();
          if (!isRolling && roll == null && onRoll) {
            onRoll();
          }
        }}
        onPointerEnter={() => {
          if (!isRolling && roll == null && onRoll) {
            document.body.style.cursor = "pointer";
          }
        }}
        onPointerLeave={() => {
          document.body.style.cursor = "default";
        }}
      >
        <meshStandardMaterial
          ref={materialRef}
          color={diceColor}
          emissive={
            isDuplicate
              ? duplicateHighlight
              : isClickable
              ? diceColor
              : "#000000"
          }
          emissiveIntensity={isDuplicate ? 0.4 : isClickable ? 0.2 : 0}
        />
      </mesh>

      {/* Show the result number above the dice */}
      {roll != null && hasCompletedRoll && (
        <Text
          font="/fantaisie_artistiqu.ttf"
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
        font="/fantaisie_artistiqu.ttf"
        position={[0, -1.2, 0]}
        fontSize={0.5}
        color={diceColor}
        anchorX="center"
        anchorY="middle"
        outlineWidth={0.02}
        outlineColor="#000000"
      >
        {playerName}
      </Text>
    </group>
  );
}
