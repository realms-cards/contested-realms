"use client";

/**
 * TutorialHighlight3D — 3D highlight meshes rendered inside the Canvas.
 *
 * Draws pulsing translucent planes on the board to spotlight tutorial targets.
 * Because these are real 3D objects, they track the camera automatically.
 * Follows the same pattern as AreaSelectionOverlay3D.
 */

import { Text } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { TILE_SIZE, CARD_LONG, CARD_SHORT } from "@/lib/game/constants";
import { useGameStore } from "@/lib/game/store";
import type { TutorialHighlightTarget } from "@/lib/tutorial/types";

/** Board dimensions (5×4 grid). */
const BOARD_W = 5;
const BOARD_H = 4;

/** Compute the board grid offset (same formula as Board.tsx). */
const OFFSET_X = -((BOARD_W - 1) * TILE_SIZE) / 2;
const OFFSET_Z = -((BOARD_H - 1) * TILE_SIZE) / 2;

/** Violet highlight color matching the tutorial UI theme. */
const HIGHLIGHT_COLOR = new THREE.Color("#8b5cf6");
/** Lay text flat on the board, readable from P1's camera (positive-Z side). */
const LABEL_ROTATION: [number, number, number] = [-Math.PI / 2, 0, 0];

interface TutorialHighlight3DProps {
  target: TutorialHighlightTarget | undefined;
  visible: boolean;
}

export function TutorialHighlight3D({ target, visible }: TutorialHighlight3DProps) {
  if (!target || !visible) return null;

  // Only render 3D highlights for board-relative targets
  switch (target.type) {
    case "board":
      return <BoardHighlight />;
    case "tile":
      return <TileHighlight tile={target.tile} />;
    case "tiles":
      return <MultiTileHighlight tiles={target.tiles} />;
    case "avatar":
      return <AvatarHighlight player={target.player} />;
    case "piles":
      return <PilesHighlight player={target.player} />;
    default:
      // zone, card, ui — handled by the 2D TutorialHighlight
      return null;
  }
}

/** Convert tile number (1-20) to grid coords (x 0-4, y 0-3). */
function tileToGrid(tile: number): [number, number] {
  const index = tile - 1;
  const x = index % BOARD_W;
  const y = Math.floor(index / BOARD_W);
  return [x, y];
}

/** Convert grid coords to world position. */
function gridToWorld(gx: number, gy: number): [number, number] {
  return [OFFSET_X + gx * TILE_SIZE, OFFSET_Z + gy * TILE_SIZE];
}

// ──────────────── Board Highlight ────────────────

function BoardHighlight() {
  const fillRef = useRef<THREE.Mesh>(null);

  useFrame(({ clock }) => {
    if (!fillRef.current) return;
    const t = clock.getElapsedTime();
    const mat = fillRef.current.material as THREE.MeshBasicMaterial;
    mat.opacity = 0.15 + Math.sin(t * 2.5) * 0.08;
  });

  // Cover the entire 5×4 grid with a single large plane
  const width = BOARD_W * TILE_SIZE;
  const height = BOARD_H * TILE_SIZE;
  const centerX = OFFSET_X + ((BOARD_W - 1) * TILE_SIZE) / 2;
  const centerZ = OFFSET_Z + ((BOARD_H - 1) * TILE_SIZE) / 2;

  return (
    <group position={[centerX, 0.015, centerZ]}>
      <mesh ref={fillRef} rotation-x={-Math.PI / 2}>
        <planeGeometry args={[width, height]} />
        <meshBasicMaterial
          color={HIGHLIGHT_COLOR}
          transparent
          opacity={0.15}
          depthWrite={false}
          side={THREE.DoubleSide}
        />
      </mesh>
      {/* Border */}
      <lineLoop rotation-x={-Math.PI / 2}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            args={[
              new Float32Array([
                -width / 2, height / 2, 0.001,
                width / 2, height / 2, 0.001,
                width / 2, -height / 2, 0.001,
                -width / 2, -height / 2, 0.001,
              ]),
              3,
            ]}
          />
        </bufferGeometry>
        <lineBasicMaterial color={HIGHLIGHT_COLOR} transparent opacity={0.7} linewidth={2} />
      </lineLoop>
      {/* Label */}
      <Text
        font="/fantaisie_artistiqu.ttf"
        position={[0, 0.15, height / 2 + 0.15]}
        rotation={LABEL_ROTATION}
        fontSize={0.14}
        color="white"
        anchorX="center"
        anchorY="middle"
        outlineWidth={0.008}
        outlineColor="#000"
      >
        The Realm
      </Text>
    </group>
  );
}

// ──────────────── Tile Highlight ────────────────

function TileHighlight({ tile, label }: { tile: number; label?: string }) {
  const fillRef = useRef<THREE.Mesh>(null);
  const [gx, gy] = useMemo(() => tileToGrid(tile), [tile]);
  const [wx, wz] = useMemo(() => gridToWorld(gx, gy), [gx, gy]);

  // Look up site name from the game store for the default label
  const cellKey = `${gx},${gy}`;
  const siteName = useGameStore(
    (s) => (s.board.sites[cellKey] as { card?: { name?: string } } | undefined)?.card?.name
  );

  useFrame(({ clock }) => {
    if (!fillRef.current) return;
    const t = clock.getElapsedTime();
    const mat = fillRef.current.material as THREE.MeshBasicMaterial;
    mat.opacity = 0.25 + Math.sin(t * 3) * 0.1;
  });

  const halfTile = TILE_SIZE / 2;

  return (
    <group position={[wx, 0.015, wz]}>
      {/* Pulsing fill */}
      <mesh ref={fillRef} rotation-x={-Math.PI / 2}>
        <planeGeometry args={[TILE_SIZE - 0.02, TILE_SIZE - 0.02]} />
        <meshBasicMaterial
          color={HIGHLIGHT_COLOR}
          transparent
          opacity={0.25}
          depthWrite={false}
          side={THREE.DoubleSide}
        />
      </mesh>
      {/* Border */}
      <lineLoop rotation-x={-Math.PI / 2}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            args={[
              new Float32Array([
                -halfTile + 0.01, halfTile - 0.01, 0.001,
                halfTile - 0.01, halfTile - 0.01, 0.001,
                halfTile - 0.01, -halfTile + 0.01, 0.001,
                -halfTile + 0.01, -halfTile + 0.01, 0.001,
              ]),
              3,
            ]}
          />
        </bufferGeometry>
        <lineBasicMaterial color={HIGHLIGHT_COLOR} transparent opacity={0.8} linewidth={2} />
      </lineLoop>
      {/* Label */}
      <Text
        font="/fantaisie_artistiqu.ttf"
        position={[0, 0.15, halfTile + 0.1]}
        rotation={LABEL_ROTATION}
        fontSize={0.1}
        color="white"
        anchorX="center"
        anchorY="middle"
        outlineWidth={0.006}
        outlineColor="#000"
        maxWidth={TILE_SIZE}
        textAlign="center"
      >
        {label ?? (siteName ? `${siteName} (#${tile})` : `Tile ${tile}`)}
      </Text>
    </group>
  );
}

// ──────────────── Multi-Tile Highlight ────────────────

function MultiTileHighlight({ tiles }: { tiles: number[] }) {
  return (
    <group>
      {tiles.map((tile) => (
        <TileHighlight key={tile} tile={tile} />
      ))}
    </group>
  );
}

// ──────────────── Avatar Highlight ────────────────

// ──────────────── Piles Highlight ────────────────

/** Pile position data matching Piles3D.tsx layout. */
interface PileInfo {
  label: string;
  x: number;
  z: number;
  w: number;
  h: number;
}

function PilesHighlight({ player }: { player: "p1" | "p2" }) {
  const boardSize = useGameStore((s) => s.board.size);
  const fillRefs = useRef<(THREE.Mesh | null)[]>([null, null, null]);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    for (const mesh of fillRefs.current) {
      if (!mesh) continue;
      const mat = mesh.material as THREE.MeshBasicMaterial;
      mat.opacity = 0.2 + Math.sin(t * 2.5) * 0.1;
    }
  });

  const piles = useMemo<PileInfo[]>(() => {
    // Replicate Piles3D positioning logic
    const isBottom = player === "p2";
    const gridHalfW = (boardSize.w * TILE_SIZE) / 2;
    const gridHalfH = (boardSize.h * TILE_SIZE) / 2;

    const rightX = gridHalfW + TILE_SIZE / 2 - CARD_SHORT / 2;
    const leftX = -gridHalfW - TILE_SIZE / 2 + CARD_SHORT / 2;
    const pilesX = isBottom ? leftX - 0.1 : rightX + 0.1;

    const topEdgeZ = -gridHalfH;
    const bottomEdgeZ = gridHalfH;
    const startZ = isBottom
      ? bottomEdgeZ + TILE_SIZE * 0.8
      : topEdgeZ - TILE_SIZE * 0.8;

    const zSpacing = CARD_LONG * 1.1;
    const step = isBottom ? -zSpacing : +zSpacing;

    return [
      { label: "Atlas", x: pilesX, z: startZ + step * 4.8, w: CARD_LONG, h: CARD_SHORT },
      { label: "Spellbook", x: pilesX, z: startZ + step * 5.9, w: CARD_SHORT, h: CARD_LONG },
      { label: "Cemetery", x: pilesX, z: startZ + step * 7.2, w: CARD_SHORT, h: CARD_LONG },
    ];
  }, [player, boardSize.w, boardSize.h]);

  return (
    <group>
      {piles.map((pile, i) => (
        <group key={pile.label} position={[pile.x, 0.02, pile.z]}>
          {/* Pulsing fill */}
          <mesh
            ref={(el) => { fillRefs.current[i] = el; }}
            rotation-x={-Math.PI / 2}
          >
            <planeGeometry args={[pile.w + 0.1, pile.h + 0.1]} />
            <meshBasicMaterial
              color={HIGHLIGHT_COLOR}
              transparent
              opacity={0.2}
              depthWrite={false}
              side={THREE.DoubleSide}
            />
          </mesh>
          {/* Border */}
          <lineLoop rotation-x={-Math.PI / 2}>
            <bufferGeometry>
              <bufferAttribute
                attach="attributes-position"
                args={[
                  new Float32Array([
                    -(pile.w + 0.1) / 2, (pile.h + 0.1) / 2, 0.001,
                    (pile.w + 0.1) / 2, (pile.h + 0.1) / 2, 0.001,
                    (pile.w + 0.1) / 2, -(pile.h + 0.1) / 2, 0.001,
                    -(pile.w + 0.1) / 2, -(pile.h + 0.1) / 2, 0.001,
                  ]),
                  3,
                ]}
              />
            </bufferGeometry>
            <lineBasicMaterial color={HIGHLIGHT_COLOR} transparent opacity={0.7} linewidth={2} />
          </lineLoop>
          {/* Label */}
          <Text
            font="/fantaisie_artistiqu.ttf"
            position={[0, 0.15, (pile.h + 0.1) / 2 + 0.08]}
            rotation={LABEL_ROTATION}
            fontSize={0.09}
            color="white"
            anchorX="center"
            anchorY="middle"
            outlineWidth={0.005}
            outlineColor="#000"
          >
            {pile.label}
          </Text>
        </group>
      ))}
    </group>
  );
}

// ──────────────── Avatar Highlight ────────────────

function AvatarHighlight({ player }: { player: "p1" | "p2" }) {
  const ringRef = useRef<THREE.Mesh>(null);

  // Read the avatar position from the game store so the highlight
  // always matches where the avatar card actually renders.
  const avatarPos = useGameStore((s) => s.avatars[player]?.pos);
  const [gx, gy] = avatarPos ?? (player === "p1" ? [2, 3] : [2, 0]);
  const [wx, wz] = useMemo(() => gridToWorld(gx, gy), [gx, gy]);

  useFrame(({ clock }) => {
    if (!ringRef.current) return;
    const t = clock.getElapsedTime();
    const mat = ringRef.current.material as THREE.MeshBasicMaterial;
    mat.opacity = 0.3 + Math.sin(t * 2.5) * 0.15;
  });

  const innerRadius = TILE_SIZE * 0.45;
  const outerRadius = TILE_SIZE * 0.6;
  const label = player === "p1" ? "Your Avatar" : "Enemy Avatar";

  return (
    <group position={[wx, 0.015, wz]}>
      {/* Pulsing ring */}
      <mesh ref={ringRef} rotation-x={-Math.PI / 2}>
        <ringGeometry args={[innerRadius, outerRadius, 32]} />
        <meshBasicMaterial
          color={HIGHLIGHT_COLOR}
          transparent
          opacity={0.3}
          depthWrite={false}
          side={THREE.DoubleSide}
        />
      </mesh>
      {/* Label */}
      <Text
        font="/fantaisie_artistiqu.ttf"
        position={[0, 0.15, outerRadius + 0.1]}
        rotation={LABEL_ROTATION}
        fontSize={0.1}
        color="white"
        anchorX="center"
        anchorY="middle"
        outlineWidth={0.006}
        outlineColor="#000"
        maxWidth={TILE_SIZE * 1.5}
        textAlign="center"
      >
        {label}
      </Text>
    </group>
  );
}
