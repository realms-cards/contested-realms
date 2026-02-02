"use client";

/**
 * Attack of the Realm Eater - Board Component
 *
 * Clean 3D board with white grid lines, proper lighting, and full interactivity
 */

import { useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import type { ThreeEvent } from "@react-three/fiber";
import { useMemo, useState, useCallback, useEffect, Suspense, lazy, useRef } from "react";
import * as THREE from "three";
import { AOTRE_COLORS } from "@/lib/aotre/constants";
import { useAotreStore } from "@/lib/aotre/store";
import type { TileState } from "@/lib/aotre/types/entities";
import { TILE_SIZE, CARD_LONG, CARD_SHORT } from "@/lib/game/constants";
import type { CellKey, CardRef } from "@/lib/game/store";

// Lazy load CardPlane to avoid SSR issues with R3F components
const CardPlane = lazy(() => import("@/lib/game/components/CardPlane"));

// Realm Eater GLB model path
const REALM_EATER_MODEL_PATH = "/3dmodels/aotre/realmeater.glb";

// Preload the Realm Eater model
useGLTF.preload(REALM_EATER_MODEL_PATH);

/**
 * Parse a cell key into x,y coordinates
 */
function parseKey(key: CellKey): [number, number] {
  const [x, y] = key.split(",").map(Number);
  return [x, y];
}

/**
 * White grid lines component
 */
function GridLines({ width, height }: { width: number; height: number }) {
  const lines = useMemo(() => {
    const positions: number[] = [];

    // Vertical lines
    for (let x = 0; x <= width; x++) {
      const xPos = (x - width / 2) * TILE_SIZE;
      const zStart = (-height / 2) * TILE_SIZE;
      const zEnd = (height / 2) * TILE_SIZE;
      positions.push(xPos, 0.005, zStart, xPos, 0.005, zEnd);
    }

    // Horizontal lines
    for (let y = 0; y <= height; y++) {
      const zPos = (y - height / 2) * TILE_SIZE;
      const xStart = (-width / 2) * TILE_SIZE;
      const xEnd = (width / 2) * TILE_SIZE;
      positions.push(xStart, 0.005, zPos, xEnd, 0.005, zPos);
    }

    return new Float32Array(positions);
  }, [width, height]);

  return (
    <lineSegments>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          args={[lines, 3]}
        />
      </bufferGeometry>
      <lineBasicMaterial color="#ffffff" transparent opacity={0.3} />
    </lineSegments>
  );
}

/**
 * Board base plane
 */
function BoardBase({ width, height }: { width: number; height: number }) {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} receiveShadow>
      <planeGeometry args={[width * TILE_SIZE + 0.2, height * TILE_SIZE + 0.2]} />
      <meshStandardMaterial color="#1a1a2e" roughness={0.8} metalness={0.1} />
    </mesh>
  );
}

/**
 * Animated target indicator for valid play/attack/move targets
 */
function TargetIndicator({
  color,
  isHovered,
  type,
}: {
  color: string;
  isHovered: boolean;
  type: "play" | "attack" | "move";
}) {
  const outerRingRef = useRef<THREE.Mesh>(null);
  const innerRingRef = useRef<THREE.Mesh>(null);
  const pulseMeshRef = useRef<THREE.Mesh>(null);

  // Animate the rings
  useFrame((state) => {
    const t = state.clock.elapsedTime;

    // Rotate outer ring
    if (outerRingRef.current) {
      outerRingRef.current.rotation.z = t * (type === "attack" ? 1.5 : 0.5);
    }

    // Counter-rotate inner ring
    if (innerRingRef.current) {
      innerRingRef.current.rotation.z = -t * (type === "attack" ? 2 : 0.8);
    }

    // Pulse effect
    if (pulseMeshRef.current) {
      const pulse = 0.5 + Math.sin(t * 3) * 0.3;
      pulseMeshRef.current.scale.setScalar(1 + pulse * 0.15);
      const mat = pulseMeshRef.current.material as THREE.MeshBasicMaterial;
      mat.opacity = isHovered ? 0.4 + pulse * 0.3 : 0.2 + pulse * 0.2;
    }
  });

  const baseOpacity = isHovered ? 0.9 : 0.6;

  return (
    <group position={[0, 0.004, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      {/* Pulsing background glow */}
      <mesh ref={pulseMeshRef}>
        <circleGeometry args={[TILE_SIZE * 0.42, 32]} />
        <meshBasicMaterial color={color} transparent opacity={0.2} side={THREE.DoubleSide} />
      </mesh>

      {/* Outer rotating ring with segments */}
      <mesh ref={outerRingRef}>
        <ringGeometry args={[TILE_SIZE * 0.38, TILE_SIZE * 0.42, type === "attack" ? 6 : 32]} />
        <meshBasicMaterial color={color} transparent opacity={baseOpacity} side={THREE.DoubleSide} />
      </mesh>

      {/* Inner counter-rotating ring */}
      <mesh ref={innerRingRef}>
        <ringGeometry args={[TILE_SIZE * 0.28, TILE_SIZE * 0.32, type === "attack" ? 4 : 24]} />
        <meshBasicMaterial color={color} transparent opacity={baseOpacity * 0.7} side={THREE.DoubleSide} />
      </mesh>

      {/* Center dot for attacks */}
      {type === "attack" && (
        <mesh>
          <circleGeometry args={[TILE_SIZE * 0.06, 16]} />
          <meshBasicMaterial color={color} transparent opacity={baseOpacity} side={THREE.DoubleSide} />
        </mesh>
      )}

      {/* Arrow indicators for movement */}
      {type === "move" && (
        <group>
          {[0, 1, 2, 3].map((i) => (
            <mesh key={i} rotation={[0, 0, (i * Math.PI) / 2]} position={[0, 0, 0.001]}>
              <planeGeometry args={[TILE_SIZE * 0.08, TILE_SIZE * 0.12]} />
              <meshBasicMaterial color={color} transparent opacity={baseOpacity * 0.8} side={THREE.DoubleSide} />
            </mesh>
          ))}
        </group>
      )}
    </group>
  );
}

/**
 * Single tile component
 */
function AotreTile({
  cellKey,
  state,
  site,
  isRealmEaterPosition,
  isDestination,
  hasMinion: _hasMinion,
  isValidTarget,
  isAttackTarget,
  isMoveTarget,
  isHovered,
  onClick,
  onPointerEnter,
  onPointerLeave,
}: {
  cellKey: CellKey;
  state: TileState;
  site: CardRef | null;
  isRealmEaterPosition: boolean;
  isDestination: boolean;
  hasMinion: boolean;
  isValidTarget: boolean;
  isAttackTarget: boolean;
  isMoveTarget: boolean;
  isHovered: boolean;
  onClick: () => void;
  onPointerEnter: () => void;
  onPointerLeave: () => void;
}) {
  const [x, y] = parseKey(cellKey);
  const boardSize = useAotreStore((s) => s.boardSize);
  const offsetX = -((boardSize.w - 1) * TILE_SIZE) / 2;
  const offsetZ = -((boardSize.h - 1) * TILE_SIZE) / 2;

  const posX = offsetX + x * TILE_SIZE;
  const posZ = offsetZ + y * TILE_SIZE;

  // Determine tile color and highlight
  const { tileColor, highlightColor, showHighlight } = useMemo(() => {
    let color = "#2a2a3a"; // Default dark
    let highlight = "#ffffff";
    let show = false;

    if (state === "void") {
      color = "#0a0a0f";
    } else if (state === "rubble") {
      color = "#3a2a1a";
    } else {
      color = "#2a2a3a"; // Site - neutral dark (same as default)
    }

    // Attack target - red highlight
    if (isAttackTarget) {
      highlight = "#ff4444";
      show = true;
    }
    // Move target - blue highlight
    else if (isMoveTarget) {
      highlight = "#4488ff";
      show = true;
    }
    // Play card target - green highlight
    else if (isValidTarget) {
      highlight = "#44ff44";
      show = true;
    }

    return { tileColor: color, highlightColor: highlight, showHighlight: show };
  }, [state, isValidTarget, isAttackTarget, isMoveTarget]);

  const siteCardWidth = CARD_LONG;
  const siteCardHeight = CARD_SHORT;

  return (
    <group position={[posX, 0, posZ]}>
      {/* Base tile - always visible, clickable */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0.001, 0]}
        onClick={(e: ThreeEvent<MouseEvent>) => {
          e.stopPropagation();
          onClick();
        }}
        onPointerEnter={(e: ThreeEvent<PointerEvent>) => {
          e.stopPropagation();
          onPointerEnter();
        }}
        onPointerLeave={(e: ThreeEvent<PointerEvent>) => {
          e.stopPropagation();
          onPointerLeave();
        }}
        receiveShadow
      >
        <planeGeometry args={[TILE_SIZE * 0.92, TILE_SIZE * 0.92]} />
        <meshStandardMaterial
          color={tileColor}
          roughness={0.7}
          metalness={0.1}
        />
      </mesh>

      {/* Animated target indicator for valid targets */}
      {showHighlight && (
        <TargetIndicator
          color={highlightColor}
          isHovered={isHovered}
          type={isAttackTarget ? "attack" : isMoveTarget ? "move" : "play"}
        />
      )}

      {/* Hover highlight */}
      {isHovered && !showHighlight && state !== "void" && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.002, 0]}>
          <planeGeometry args={[TILE_SIZE * 0.92, TILE_SIZE * 0.92]} />
          <meshBasicMaterial color="#ffffff" transparent opacity={0.1} />
        </mesh>
      )}

      {/* Site card with texture - rotated to face player (positive Z direction) */}
      {state === "site" && site?.slug && (
        <Suspense fallback={
          <mesh rotation={[-Math.PI / 2, 0, Math.PI]} position={[0, 0.005, 0]}>
            <planeGeometry args={[siteCardWidth, siteCardHeight]} />
            <meshStandardMaterial color="#3a3a4a" />
          </mesh>
        }>
          <group position={[0, 0.005, 0]}>
            <CardPlane
              slug={site.slug}
              width={siteCardWidth}
              height={siteCardHeight}
              elevation={0.001}
              interactive={false}
              rotationZ={Math.PI}
            />
          </group>
        </Suspense>
      )}

      {/* Fallback for sites without slug - rotated to face player */}
      {state === "site" && !site?.slug && (
        <mesh rotation={[-Math.PI / 2, 0, Math.PI]} position={[0, 0.005, 0]}>
          <planeGeometry args={[siteCardWidth, siteCardHeight]} />
          <meshStandardMaterial color="#4a4a5a" />
        </mesh>
      )}

      {/* Rubble debris */}
      {state === "rubble" && (
        <group>
          {[...Array(5)].map((_, i) => (
            <mesh
              key={i}
              position={[
                (Math.random() - 0.5) * 0.3,
                0.015 + Math.random() * 0.02,
                (Math.random() - 0.5) * 0.3,
              ]}
              rotation={[Math.random(), Math.random(), Math.random()]}
              castShadow
            >
              <boxGeometry args={[0.05 + Math.random() * 0.04, 0.02 + Math.random() * 0.02, 0.04 + Math.random() * 0.03]} />
              <meshStandardMaterial color="#4a3a2a" roughness={0.9} />
            </mesh>
          ))}
        </group>
      )}

      {/* Destination marker (when RE not there) */}
      {isDestination && !isRealmEaterPosition && (
        <mesh position={[0, 0.06, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.18, 0.22, 32]} />
          <meshBasicMaterial color="#ff6600" transparent opacity={0.8} side={THREE.DoubleSide} />
        </mesh>
      )}
    </group>
  );
}

/**
 * Player avatar component
 */
function PlayerAvatar({
  position,
  playerIndex,
  health,
  avatar,
}: {
  position: CellKey;
  playerIndex: number;
  health: number;
  avatar: CardRef | null;
}) {
  const [x, y] = parseKey(position);
  const boardSize = useAotreStore((s) => s.boardSize);
  const offsetX = -((boardSize.w - 1) * TILE_SIZE) / 2;
  const offsetZ = -((boardSize.h - 1) * TILE_SIZE) / 2;

  const posX = offsetX + x * TILE_SIZE;
  const posZ = offsetZ + y * TILE_SIZE;

  const colors = ["#22c55e", "#3b82f6", "#f59e0b", "#8b5cf6"];
  const color = colors[playerIndex] ?? colors[0];
  const cardWidth = CARD_SHORT;
  const cardHeight = CARD_LONG;

  return (
    <group position={[posX, 0, posZ]}>
      {avatar?.slug ? (
        <Suspense fallback={
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
            <planeGeometry args={[cardWidth, cardHeight]} />
            <meshStandardMaterial color={color} />
          </mesh>
        }>
          <group position={[0, 0.02, 0]}>
            <CardPlane
              slug={avatar.slug}
              width={cardWidth}
              height={cardHeight}
              elevation={0.001}
              interactive={false}
            />
          </group>
        </Suspense>
      ) : (
        <mesh position={[0, 0.1, 0]} castShadow>
          <cylinderGeometry args={[0.12, 0.15, 0.2, 16]} />
          <meshStandardMaterial color={color} />
        </mesh>
      )}

      {/* Health indicator */}
      <mesh position={[cardWidth / 2 + 0.06, 0.08, -cardHeight / 2]}>
        <sphereGeometry args={[0.04, 16, 16]} />
        <meshStandardMaterial
          color={health > 10 ? "#22c55e" : health > 5 ? "#f59e0b" : "#ef4444"}
          emissive={health > 10 ? "#22c55e" : health > 5 ? "#f59e0b" : "#ef4444"}
          emissiveIntensity={0.5}
        />
      </mesh>

      {/* Player color ring */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.008, 0]}>
        <ringGeometry args={[cardWidth * 0.6, cardWidth * 0.65, 32]} />
        <meshBasicMaterial color={color} transparent opacity={0.7} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

/**
 * Realm Eater entity - uses custom GLB model
 */
function RealmEaterEntity() {
  const position = useAotreStore((s) => s.realmEater.position);
  const health = useAotreStore((s) => s.realmEater.health);
  const maxHealth = useAotreStore((s) => s.realmEater.maxHealth);
  const boardSize = useAotreStore((s) => s.boardSize);
  const selectedUnit = useAotreStore((s) => s.selectedUnit);

  // Load the GLB model
  const { scene } = useGLTF(REALM_EATER_MODEL_PATH);

  const [x, y] = parseKey(position);
  const offsetX = -((boardSize.w - 1) * TILE_SIZE) / 2;
  const offsetZ = -((boardSize.h - 1) * TILE_SIZE) / 2;

  const posX = offsetX + x * TILE_SIZE;
  const posZ = offsetZ + y * TILE_SIZE;

  const healthPercent = health / maxHealth;
  const isTargetable = selectedUnit !== null;

  // Clone the scene and apply materials
  const clonedScene = useMemo(() => {
    const cloned = scene.clone(true);

    // Apply shadow settings and optional material adjustments
    cloned.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = true;
        child.receiveShadow = true;

        // Optionally enhance the material with emissive glow
        if (child.material instanceof THREE.MeshStandardMaterial) {
          child.material = child.material.clone();
          child.material.emissive = new THREE.Color(AOTRE_COLORS.realmEater);
          child.material.emissiveIntensity = 0.2;
        }
      }
    });

    return cloned;
  }, [scene]);

  return (
    <group position={[posX, 0, posZ]}>
      {/* GLB Model */}
      <group position={[0, 0.15, 0]} scale={[0.4, 0.4, 0.4]}>
        <primitive object={clonedScene} />
      </group>

      {/* Health arc - floating above the model */}
      <mesh position={[0, 0.65, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.18, 0.22, 32, 1, 0, Math.PI * 2 * healthPercent]} />
        <meshBasicMaterial
          color={healthPercent > 0.5 ? "#22c55e" : healthPercent > 0.25 ? "#f59e0b" : "#ef4444"}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* Attack target indicator */}
      {isTargetable && (
        <TargetIndicator color="#ff4444" isHovered={true} type="attack" />
      )}

      {/* Glow light */}
      <pointLight color={AOTRE_COLORS.realmEater} intensity={1.2} distance={3} />
    </group>
  );
}

/**
 * Minion entity with card artwork
 */
function MinionEntityMesh({
  position,
  tapped,
  card,
  index = 0,
  isTargetable,
  onClick,
}: {
  position: CellKey;
  tapped: boolean;
  card: CardRef;
  index?: number;
  isTargetable: boolean;
  onClick?: () => void;
}) {
  const boardSize = useAotreStore((s) => s.boardSize);
  const [x, y] = parseKey(position);
  const offsetX = -((boardSize.w - 1) * TILE_SIZE) / 2;
  const offsetZ = -((boardSize.h - 1) * TILE_SIZE) / 2;

  const posX = offsetX + x * TILE_SIZE;
  const posZ = offsetZ + y * TILE_SIZE;

  const stackOffset = index * 0.025;
  const tappedRotation = tapped ? -Math.PI / 2 : 0;
  const cardWidth = CARD_SHORT * 0.65;
  const cardHeight = CARD_LONG * 0.65;

  return (
    <group
      position={[posX + 0.22, 0.02 + stackOffset, posZ + 0.22]}
      onClick={(e: ThreeEvent<MouseEvent>) => {
        e.stopPropagation();
        onClick?.();
      }}
    >
      {card.slug ? (
        <Suspense fallback={
          <mesh rotation={[-Math.PI / 2, 0, tappedRotation]}>
            <planeGeometry args={[cardWidth, cardHeight]} />
            <meshStandardMaterial color={AOTRE_COLORS.minionHighlight} />
          </mesh>
        }>
          <CardPlane
            slug={card.slug}
            width={cardWidth}
            height={cardHeight}
            rotationZ={tappedRotation}
            elevation={0.001}
            interactive={false}
          />
        </Suspense>
      ) : (
        <group>
          <mesh rotation={[-Math.PI / 2, 0, tappedRotation]} position={[0, 0.01, 0]} castShadow>
            <planeGeometry args={[cardWidth, cardHeight]} />
            <meshStandardMaterial
              color={AOTRE_COLORS.minionHighlight}
              emissive={AOTRE_COLORS.minionHighlight}
              emissiveIntensity={0.15}
            />
          </mesh>
          {/* Attack/Defense markers */}
          <mesh position={[-0.05, 0.025, 0.07]}>
            <sphereGeometry args={[0.015, 8, 8]} />
            <meshStandardMaterial color="#ef4444" emissive="#ef4444" emissiveIntensity={0.6} />
          </mesh>
          <mesh position={[0.05, 0.025, 0.07]}>
            <sphereGeometry args={[0.015, 8, 8]} />
            <meshStandardMaterial color="#22c55e" emissive="#22c55e" emissiveIntensity={0.6} />
          </mesh>
        </group>
      )}

      {/* Target indicator for attacks */}
      {isTargetable && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.006, 0]}>
          <ringGeometry args={[cardWidth * 0.55, cardWidth * 0.62, 16]} />
          <meshBasicMaterial color="#ff4444" transparent opacity={0.7} side={THREE.DoubleSide} />
        </mesh>
      )}

      {/* Tapped indicator */}
      {tapped && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.004, 0]}>
          <ringGeometry args={[cardWidth * 0.48, cardWidth * 0.52, 16]} />
          <meshBasicMaterial color="#666666" transparent opacity={0.5} side={THREE.DoubleSide} />
        </mesh>
      )}

      {/* Enemy glow */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.003, 0]}>
        <ringGeometry args={[cardWidth * 0.52, cardWidth * 0.58, 16]} />
        <meshBasicMaterial
          color={AOTRE_COLORS.realmEater}
          transparent
          opacity={0.4}
          side={THREE.DoubleSide}
        />
      </mesh>
    </group>
  );
}

/**
 * Player permanent (unit on board)
 */
function PlayerPermanent({
  cellKey: position,
  card,
  index = 0,
  isSelected,
  onClick,
}: {
  cellKey: CellKey;
  card: CardRef;
  index?: number;
  isSelected: boolean;
  onClick?: () => void;
}) {
  const boardSize = useAotreStore((s) => s.boardSize);
  const [x, y] = parseKey(position);
  const offsetX = -((boardSize.w - 1) * TILE_SIZE) / 2;
  const offsetZ = -((boardSize.h - 1) * TILE_SIZE) / 2;

  const posX = offsetX + x * TILE_SIZE;
  const posZ = offsetZ + y * TILE_SIZE;

  const stackOffset = index * 0.025;
  const cardWidth = CARD_SHORT * 0.65;
  const cardHeight = CARD_LONG * 0.65;

  return (
    <group
      position={[posX - 0.22, 0.02 + stackOffset, posZ - 0.22]}
      onClick={(e: ThreeEvent<MouseEvent>) => {
        e.stopPropagation();
        onClick?.();
      }}
    >
      {card.slug ? (
        <Suspense fallback={
          <mesh rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[cardWidth, cardHeight]} />
            <meshStandardMaterial color="#3b82f6" />
          </mesh>
        }>
          <CardPlane
            slug={card.slug}
            width={cardWidth}
            height={cardHeight}
            elevation={0.001}
            interactive={false}
          />
        </Suspense>
      ) : (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]} castShadow>
          <planeGeometry args={[cardWidth, cardHeight]} />
          <meshStandardMaterial color="#3b82f6" />
        </mesh>
      )}

      {/* Selection ring */}
      {isSelected && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.006, 0]}>
          <ringGeometry args={[cardWidth * 0.55, cardWidth * 0.62, 16]} />
          <meshBasicMaterial color="#22ff44" transparent opacity={0.8} side={THREE.DoubleSide} />
        </mesh>
      )}

      {/* Player color indicator */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.003, 0]}>
        <ringGeometry args={[cardWidth * 0.52, cardWidth * 0.58, 16]} />
        <meshBasicMaterial color="#3b82f6" transparent opacity={0.5} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

/** Props for AotreBoard */
interface AotreBoardProps {
  onCardHover?: (card: { slug: string; name: string; type: string } | null) => void;
}

/**
 * Main AOTRE Board component
 */
export function AotreBoard({ onCardHover }: AotreBoardProps) {
  const tiles = useAotreStore((s) => s.tiles);
  const boardSize = useAotreStore((s) => s.boardSize);
  const realmEaterPosition = useAotreStore((s) => s.realmEater.position);
  const destination = useAotreStore((s) => s.destination.cellKey);
  const minions = useAotreStore((s) => s.minions);
  const permanents = useAotreStore((s) => s.permanents);
  const players = useAotreStore((s) => s.players);
  const playerCount = useAotreStore((s) => s.playerCount);
  const selectedHandCard = useAotreStore((s) => s.selectedHandCard);
  const selectedUnit = useAotreStore((s) => s.selectedUnit);
  const playCard = useAotreStore((s) => s.playCard);
  const moveUnit = useAotreStore((s) => s.moveUnit);
  const attack = useAotreStore((s) => s.attack);
  const clearHandSelection = useAotreStore((s) => s.clearHandSelection);
  const clearUnitSelection = useAotreStore((s) => s.clearUnitSelection);
  const selectUnit = useAotreStore((s) => s.selectUnit);
  const phase = useAotreStore((s) => s.phase);

  const [hoveredTile, setHoveredTile] = useState<CellKey | null>(null);

  // Handle tile hover for card preview
  useEffect(() => {
    if (hoveredTile && onCardHover) {
      const tile = tiles[hoveredTile];
      if (tile?.state === "site" && tile.site?.slug) {
        onCardHover({
          slug: tile.site.slug,
          name: tile.site.name ?? "Site",
          type: tile.site.type ?? "Site",
        });
      } else {
        // Check if there's a minion at this tile
        const minionAtTile = minions.find((m) => m.position === hoveredTile);
        if (minionAtTile?.card?.slug) {
          onCardHover({
            slug: minionAtTile.card.slug,
            name: minionAtTile.card.name ?? "Minion",
            type: minionAtTile.card.type ?? "Minion",
          });
        } else {
          // Check if there's a player permanent at this tile
          const permanentsAtTile = permanents[hoveredTile];
          if (permanentsAtTile?.[0]?.slug) {
            onCardHover({
              slug: permanentsAtTile[0].slug,
              name: permanentsAtTile[0].name ?? "Unit",
              type: permanentsAtTile[0].type ?? "Unit",
            });
          } else {
            onCardHover(null);
          }
        }
      }
    } else if (!hoveredTile && onCardHover) {
      onCardHover(null);
    }
  }, [hoveredTile, tiles, minions, permanents, onCardHover]);

  // Get positions with minions
  const minionPositions = useMemo(() => new Set(minions.map((m) => m.position)), [minions]);

  // Group minions by position
  const minionsByPosition = useMemo(() => {
    const grouped: Record<CellKey, typeof minions> = {};
    for (const minion of minions) {
      if (!grouped[minion.position]) grouped[minion.position] = [];
      grouped[minion.position].push(minion);
    }
    return grouped;
  }, [minions]);

  // Active player slots
  const activePlayerSlots = useMemo(() => {
    const slots = ["player1", "player2", "player3", "player4"] as const;
    return slots.slice(0, playerCount);
  }, [playerCount]);

  // Valid targets for playing cards
  const validPlayTargets = useMemo(() => {
    const valid = new Set<CellKey>();
    if (!selectedHandCard || phase !== "PlayerTurn") return valid;

    const player = players[selectedHandCard.player];
    if (!player || selectedHandCard.index >= player.hand.length) return valid;

    const card = player.hand[selectedHandCard.index];

    // Units/Minions can be played on sites
    if (card.type === "Unit" || card.type === "Minion") {
      for (const [key, tile] of Object.entries(tiles)) {
        if (tile.state === "site") valid.add(key);
      }
    }
    // Magic/Spell/Aura cards can target sites and rubble
    else if (card.type === "Magic" || card.type === "Spell" || card.type === "Aura") {
      for (const [key, tile] of Object.entries(tiles)) {
        if (tile.state === "site" || tile.state === "rubble") valid.add(key);
      }
    }
    // Site cards can be played on void or rubble tiles
    else if (card.type === "Site") {
      for (const [key, tile] of Object.entries(tiles)) {
        if (tile.state === "void" || tile.state === "rubble") valid.add(key);
      }
    }
    // Default: any non-void tile (for unknown card types)
    else {
      for (const [key, tile] of Object.entries(tiles)) {
        if (tile.state !== "void") valid.add(key);
      }
    }

    return valid;
  }, [selectedHandCard, players, tiles, phase]);

  // Valid targets for moving units
  const validMoveTargets = useMemo(() => {
    const valid = new Set<CellKey>();
    if (!selectedUnit || phase !== "PlayerTurn") return valid;

    const [sx, sy] = parseKey(selectedUnit.cellKey);
    const adjacent = [
      `${sx},${sy - 1}`, `${sx},${sy + 1}`,
      `${sx - 1},${sy}`, `${sx + 1},${sy}`,
    ];

    for (const key of adjacent) {
      const tile = tiles[key];
      if (tile && tile.state === "site") valid.add(key);
    }

    return valid;
  }, [selectedUnit, tiles, phase]);

  // Valid targets for attacking
  const validAttackTargets = useMemo(() => {
    const valid = new Set<CellKey>();
    if (!selectedUnit || phase !== "PlayerTurn") return valid;

    // Can attack minions and Realm Eater
    for (const minion of minions) {
      valid.add(minion.position);
    }
    valid.add(realmEaterPosition);

    return valid;
  }, [selectedUnit, minions, realmEaterPosition, phase]);

  // Handle tile click
  const handleTileClick = useCallback((cellKey: CellKey) => {
    if (phase !== "PlayerTurn") return;

    // Playing a card
    if (selectedHandCard && validPlayTargets.has(cellKey)) {
      const success = playCard(selectedHandCard.player, selectedHandCard.index, cellKey);
      if (success) clearHandSelection();
      return;
    }

    // Moving a unit
    if (selectedUnit && validMoveTargets.has(cellKey)) {
      const success = moveUnit(selectedUnit.cellKey, selectedUnit.index, cellKey);
      if (success) clearUnitSelection();
      return;
    }
  }, [selectedHandCard, selectedUnit, validPlayTargets, validMoveTargets, phase, playCard, moveUnit, clearHandSelection, clearUnitSelection]);

  // Handle minion click (for attacking)
  const handleMinionClick = useCallback((minionPosition: CellKey, minionIndex: number) => {
    if (phase !== "PlayerTurn") return;

    if (selectedUnit && validAttackTargets.has(minionPosition)) {
      const success = attack(selectedUnit.cellKey, selectedUnit.index, minionPosition, minionIndex);
      if (success) clearUnitSelection();
    }
  }, [selectedUnit, validAttackTargets, phase, attack, clearUnitSelection]);

  // Handle player unit click (for selection)
  const handlePlayerUnitClick = useCallback((cellKey: CellKey, unitIndex: number) => {
    if (phase !== "PlayerTurn") return;

    if (selectedUnit?.cellKey === cellKey && selectedUnit?.index === unitIndex) {
      clearUnitSelection();
    } else {
      clearHandSelection();
      selectUnit(cellKey, unitIndex);
    }
  }, [phase, selectedUnit, selectUnit, clearUnitSelection, clearHandSelection]);

  // Handle Realm Eater click (for attacking)
  const handleRealmEaterClick = useCallback(() => {
    if (phase !== "PlayerTurn") return;

    if (selectedUnit && validAttackTargets.has(realmEaterPosition)) {
      const success = attack(selectedUnit.cellKey, selectedUnit.index, realmEaterPosition);
      if (success) clearUnitSelection();
    }
  }, [selectedUnit, validAttackTargets, realmEaterPosition, phase, attack, clearUnitSelection]);

  return (
    <group>
      {/* Enhanced Lighting */}
      <ambientLight intensity={0.5} />
      <directionalLight
        position={[5, 12, 5]}
        intensity={0.8}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-far={50}
        shadow-camera-left={-10}
        shadow-camera-right={10}
        shadow-camera-top={10}
        shadow-camera-bottom={-10}
      />
      <directionalLight position={[-5, 8, -5]} intensity={0.3} />
      <pointLight position={[0, 5, 0]} intensity={0.3} color="#aaaaff" />

      {/* Board base */}
      <BoardBase width={boardSize.w} height={boardSize.h} />

      {/* White grid lines */}
      <GridLines width={boardSize.w} height={boardSize.h} />

      {/* Board tiles */}
      {Object.entries(tiles).map(([key, tile]) => (
        <AotreTile
          key={key}
          cellKey={key}
          state={tile.state}
          site={tile.site ?? null}
          isRealmEaterPosition={key === realmEaterPosition}
          isDestination={key === destination}
          hasMinion={minionPositions.has(key)}
          isValidTarget={validPlayTargets.has(key)}
          isAttackTarget={!!selectedUnit && validAttackTargets.has(key)}
          isMoveTarget={!!selectedUnit && validMoveTargets.has(key)}
          isHovered={hoveredTile === key}
          onClick={() => handleTileClick(key)}
          onPointerEnter={() => setHoveredTile(key)}
          onPointerLeave={() => setHoveredTile(null)}
        />
      ))}

      {/* Realm Eater (clickable for attacks) */}
      <group onClick={handleRealmEaterClick}>
        <RealmEaterEntity />
      </group>

      {/* Minions - clickable for attacks */}
      {Object.entries(minionsByPosition).map(([_pos, positionMinions]) =>
        positionMinions.map((minion, idx) => (
          <MinionEntityMesh
            key={minion.id}
            position={minion.position}
            tapped={minion.tapped}
            card={minion.card}
            index={idx}
            isTargetable={!!selectedUnit && validAttackTargets.has(minion.position)}
            onClick={() => handleMinionClick(minion.position, idx)}
          />
        ))
      )}

      {/* Player Permanents - clickable for selection */}
      {Object.entries(permanents).map(([cellKey, cards]) =>
        cards.map((card, idx) => (
          <PlayerPermanent
            key={`${cellKey}-${idx}`}
            cellKey={cellKey}
            card={card}
            index={idx}
            isSelected={selectedUnit?.cellKey === cellKey && selectedUnit?.index === idx}
            onClick={() => handlePlayerUnitClick(cellKey, idx)}
          />
        ))
      )}

      {/* Player Avatars */}
      {activePlayerSlots.map((slot, index) => {
        const player = players[slot];
        if (!player?.avatarPosition) return null;
        return (
          <PlayerAvatar
            key={slot}
            position={player.avatarPosition}
            playerIndex={index}
            health={player.health}
            avatar={player.avatar}
          />
        );
      })}
    </group>
  );
}
