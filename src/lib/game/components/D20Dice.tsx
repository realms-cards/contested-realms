"use client";

import { Billboard, Text, useTexture } from "@react-three/drei";
import { useFrame, useLoader } from "@react-three/fiber";
import { useRef, useState, useEffect, useMemo } from "react";
import * as THREE from "three";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
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
  /** Key that changes on each reroll to force animation restart (handles same-value rerolls) */
  rollKey?: number;
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
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  isDuplicate = false,
  rollKey = 0,
}: D20DiceProps) {
  const groupRef = useRef<THREE.Group>(null);
  // Initialize rollStartTime to Date.now() if already rolling on mount
  const [rollStartTime, setRollStartTime] = useState<number>(() =>
    isRolling ? Date.now() : 0
  );
  const [hasCompletedRoll, setHasCompletedRoll] = useState(false);
  const onRollCompleteCalledRef = useRef(false);

  // Load the OBJ model
  const obj = useLoader(OBJLoader, "/3dmodels/rpg-dice/sm_K20_DiceSet_01.obj");

  // Load WebP textures (1024x1024, ~545KB total)
  const [diffuseMap, normalMap, roughnessMap, metalnessMap] = useTexture([
    "/3dmodels/rpg-dice/textures/RPGDiceSet_d.webp",
    "/3dmodels/rpg-dice/textures/RPGDiceSet_n.webp",
    "/3dmodels/rpg-dice/textures/RPGDiceSet_r.webp",
    "/3dmodels/rpg-dice/textures/RPGDiceSet_m.webp",
  ]);

  // Track the previous isRolling state, rollKey, and roll value to detect changes
  const prevIsRollingRef = useRef(isRolling);
  const prevRollKeyRef = useRef(rollKey);
  const prevRollRef = useRef(roll);

  // Start rolling when isRolling becomes true (edge trigger) OR when rollKey changes (explicit reroll signal)
  useEffect(() => {
    // Detect rising edge: was not rolling, now is rolling
    const risingEdge = isRolling && !prevIsRollingRef.current;
    // Detect reroll via rollKey change - this is the ONLY way to trigger a reroll animation
    // This ensures only the specific die that receives a new rollKey will animate
    const isKeyReroll =
      isRolling &&
      prevIsRollingRef.current &&
      rollKey !== prevRollKeyRef.current;

    if (risingEdge || isKeyReroll) {
      setHasCompletedRoll(false);
      setRollStartTime(Date.now());
      onRollCompleteCalledRef.current = false;
    }
    prevIsRollingRef.current = isRolling;
    prevRollKeyRef.current = rollKey;
  }, [isRolling, rollKey]);

  // Reset dice visual state when roll changes from a number to null (tie reset)
  useEffect(() => {
    const wasRolled = prevRollRef.current !== null;
    const isNowNull = roll === null;

    if (wasRolled && isNowNull && groupRef.current) {
      // Reset to a neutral position when tie reset occurs
      groupRef.current.rotation.set(0, 0, 0);
      setHasCompletedRoll(false);
      onRollCompleteCalledRef.current = false;
    }

    prevRollRef.current = roll;
  }, [roll]);

  // Color based on player or custom override
  const defaultColor = player === "p1" ? "#3b82f6" : "#ef4444"; // blue or red
  const diceColor = customColor ?? defaultColor;
  const textColor = "#ffffff";

  // Clone the OBJ and apply textured material with player color tint
  const d20Clone = useMemo(() => {
    const clone = obj.clone();
    clone.traverse((child) => {
      if (child instanceof THREE.Mesh) {
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

  // D20 face rotations - derived from known position where [0.5535, 0, 0] shows 13
  // Icosahedron has 20 triangular faces arranged in bands around Y axis
  // - Top cap: 5 faces (rotating Y by 72° = 2π/5 cycles through them)
  // - Upper band: 5 faces (inverted, offset by 36° = π/5)
  // - Lower band: 5 faces (inverted from upper)
  // - Bottom cap: 5 faces (inverted from top)
  // X rotation ~0.5535 rad (~31.7°) tilts a face horizontal
  // X rotation ~-0.5535 + π flips to opposite hemisphere
  const baseX = 0.5535; // Angle to make a face horizontal
  const yStep = (2 * Math.PI) / 5; // 72° between faces in same band
  const yOffset = Math.PI / 5; // 36° offset for alternating bands

  const d20FaceRotations: Record<number, [number, number, number]> = useMemo(
    () => ({
      // These need empirical calibration based on how numbers are painted on the model
      // Starting with 13 at [0.5535, 0, 0] and deriving others
      1: [baseX + Math.PI, yStep * 2, 0], // opposite of 20
      2: [baseX + Math.PI, yStep * 4 + yOffset, 0],
      3: [baseX + Math.PI, yStep * 1, 0],
      4: [baseX + Math.PI, yStep * 3 + yOffset, 0],
      5: [baseX + Math.PI, yStep * 0, 0],
      6: [baseX + Math.PI, yStep * 2 + yOffset, 0],
      7: [baseX + Math.PI, yStep * 4, 0],
      8: [baseX, yStep * 1 + yOffset, 0], // upper hemisphere
      9: [baseX, yStep * 3, 0],
      10: [baseX, yStep * 0 + yOffset, 0],
      11: [baseX, yStep * 2, 0],
      12: [baseX, yStep * 4 + yOffset, 0],
      13: [baseX, 0, 0], // known position
      14: [baseX, yStep * 1, 0],
      15: [baseX, yStep * 3 + yOffset, 0],
      16: [baseX, yStep * 0, 0],
      17: [baseX, yStep * 2 + yOffset, 0],
      18: [baseX, yStep * 4, 0],
      19: [baseX + Math.PI, yStep * 1 + yOffset, 0],
      20: [baseX + Math.PI, yStep * 3, 0], // opposite of 1
    }),
    [baseX, yStep, yOffset]
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
      if (roll != null && d20FaceRotations[roll]) {
        const [rx, ry, rz] = d20FaceRotations[roll];
        groupRef.current.rotation.set(rx, ry, rz);
      }
      setHasCompletedRoll(true);
      onRollComplete?.();
    }
  });

  return (
    <group position={position}>
      {/* D20 Model from OBJ */}
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
        <primitive object={d20Clone} />
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
