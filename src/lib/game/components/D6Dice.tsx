"use client";

import { Billboard, Text, useTexture } from "@react-three/drei";
import { useFrame, useLoader } from "@react-three/fiber";
import { useRef, useState, useEffect, useMemo } from "react";
import * as THREE from "three";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import type { PlayerKey } from "../store";

interface D6DiceProps {
  playerName: string;
  player: PlayerKey;
  position: [number, number, number];
  roll: number | null;
  isRolling: boolean;
  onRollComplete?: () => void;
  onRoll?: () => void;
  /** Custom dice color override (default: player-based blue/red) */
  customColor?: string;
}

export default function D6Dice({
  player,
  position,
  roll,
  isRolling,
  onRollComplete,
  onRoll,
  playerName,
  customColor,
}: D6DiceProps) {
  const groupRef = useRef<THREE.Group>(null);
  // Initialize rollStartTime to Date.now() if already rolling on mount
  const [rollStartTime, setRollStartTime] = useState<number>(() =>
    isRolling ? Date.now() : 0
  );
  const [hasCompletedRoll, setHasCompletedRoll] = useState(false);
  const onRollCompleteCalledRef = useRef(false);

  // Load the OBJ model
  const obj = useLoader(OBJLoader, "/3dmodels/rpg-dice/sm_K6_DiceSet_01.obj");

  // Load WebP textures (1024x1024, ~545KB total)
  const [diffuseMap, normalMap, roughnessMap, metalnessMap] = useTexture([
    "/3dmodels/rpg-dice/textures/RPGDiceSet_d.webp",
    "/3dmodels/rpg-dice/textures/RPGDiceSet_n.webp",
    "/3dmodels/rpg-dice/textures/RPGDiceSet_r.webp",
    "/3dmodels/rpg-dice/textures/RPGDiceSet_m.webp",
  ]);

  // Track the previous isRolling state to detect when a new roll starts
  const prevIsRollingRef = useRef(isRolling);

  // Start rolling when isRolling becomes true (edge trigger)
  useEffect(() => {
    // Detect rising edge: was not rolling, now is rolling
    if (isRolling && !prevIsRollingRef.current) {
      setHasCompletedRoll(false);
      setRollStartTime(Date.now());
      onRollCompleteCalledRef.current = false;
    }
    prevIsRollingRef.current = isRolling;
  }, [isRolling]);

  // Color based on player or custom override
  const defaultColor = player === "p1" ? "#3b82f6" : "#ef4444"; // blue or red
  const diceColor = customColor ?? defaultColor;
  const textColor = "#ffffff";

  // Clone the OBJ and apply textured material with player color tint
  // Also center the geometry so it rotates around its center, not a corner
  const d6Clone = useMemo(() => {
    const clone = obj.clone();
    clone.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        // Center the geometry
        child.geometry.computeBoundingBox();
        const box = child.geometry.boundingBox;
        if (box) {
          const center = new THREE.Vector3();
          box.getCenter(center);
          child.geometry.translate(-center.x, -center.y, -center.z);
        }
        // Clone diffuse map and tint it with player color
        const tintedDiffuse = diffuseMap.clone();
        child.material = new THREE.MeshStandardMaterial({
          map: tintedDiffuse,
          normalMap,
          roughnessMap,
          metalnessMap,
          color: diceColor, // Tint only the diffuse
          metalness: 0.4,
          roughness: 0.5,
        });
      }
    });
    return clone;
  }, [obj, diffuseMap, normalMap, roughnessMap, metalnessMap, diceColor]);

  // D6 face rotations - empirically calibrated from screenshots
  // From testing: roll 3→showed 1, roll 1→showed 5, roll 5→showed 4
  // Corrected mapping: assign each number the rotation that actually shows it
  const d6FaceRotations: Record<number, [number, number, number]> = useMemo(
    () => ({
      // Swapped based on screenshot observations
      1: [0, Math.PI, 0], // was assigned to 3, showed 1
      2: [-Math.PI / 2, Math.PI, 0], // was assigned to 6, shows 2 (opposite of 5)
      3: [0, Math.PI, -Math.PI / 2], // was assigned to 2, shows 3 (opposite of 4)
      4: [0, Math.PI, Math.PI / 2], // was assigned to 5, showed 4
      5: [Math.PI / 2, Math.PI, 0], // was assigned to 1, showed 5
      6: [Math.PI, Math.PI, 0], // was assigned to 4, shows 6 (opposite of 1)
    }),
    []
  );

  // Simple rotation animation
  useFrame(() => {
    if (!groupRef.current) return;

    // If not rolling or already completed, don't animate
    if (!isRolling || hasCompletedRoll) return;

    // Guard against invalid start time
    if (rollStartTime === 0) return;

    const elapsed = Date.now() - rollStartTime;
    const rollDuration = 800; // 0.8 seconds of spinning - shorter so winner can be announced

    if (elapsed < rollDuration) {
      // Simple spinning animation
      const spinSpeed = 10 * (1 - elapsed / rollDuration); // Slow down over time
      groupRef.current.rotation.x += spinSpeed * 0.02;
      groupRef.current.rotation.y += spinSpeed * 0.03;
      groupRef.current.rotation.z += spinSpeed * 0.025;
    } else if (!onRollCompleteCalledRef.current) {
      // Stop spinning and set final rotation to show rolled number
      onRollCompleteCalledRef.current = true;
      if (roll != null && d6FaceRotations[roll]) {
        const [rx, ry, rz] = d6FaceRotations[roll];
        groupRef.current.rotation.set(rx, ry, rz);
      }
      setHasCompletedRoll(true);
      onRollComplete?.();
    }
  });

  return (
    <group position={position}>
      {/* D6 Model from OBJ */}
      <group
        ref={groupRef}
        scale={[0.8, 0.8, 0.8]}
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
        <primitive object={d6Clone} />
      </group>

      {/* Show the result number above dice - uses Billboard to face any camera */}
      {roll != null && hasCompletedRoll && (
        <Billboard
          position={[0, 1.5, 0]}
          follow={true}
          lockX={false}
          lockY={false}
          lockZ={false}
        >
          <Text
            font="/fantaisie_artistiqu.ttf"
            fontSize={0.8}
            color={textColor}
            anchorX="center"
            anchorY="middle"
            outlineWidth={0.05}
            outlineColor="#000000"
            renderOrder={10}
          >
            {roll}
          </Text>
        </Billboard>
      )}

      {/* Player label below dice */}
      {playerName && (
        <Billboard
          position={[0, -1.5, 0]}
          follow={true}
          lockX={false}
          lockY={false}
          lockZ={false}
        >
          <Text
            font="/fantaisie_artistiqu.ttf"
            fontSize={0.5}
            color={diceColor}
            anchorX="center"
            anchorY="middle"
            outlineWidth={0.02}
            outlineColor="#000000"
            renderOrder={10}
          >
            {playerName}
          </Text>
        </Billboard>
      )}
    </group>
  );
}
