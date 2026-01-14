"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { TILE_SIZE } from "@/lib/game/constants";
import type { CellKey, GameState, PendingMagic } from "@/lib/game/store/types";

export type AuraPreviewOverlayProps = {
  tileX: number;
  tileY: number;
  pendingMagic: PendingMagic | null;
  magicGuidesActive: boolean;
  metaByCardId: GameState["metaByCardId"];
};

// Player colors
const P1_COLOR = new THREE.Color("#3b82f6"); // blue
const P2_COLOR = new THREE.Color("#ef4444"); // red

/**
 * Check if a spell is an Aura type based on card metadata or card data
 */
function isAuraSpell(
  pendingMagic: PendingMagic | null,
  metaByCardId: GameState["metaByCardId"]
): boolean {
  if (!pendingMagic) return false;

  const card = pendingMagic.spell?.card;
  if (!card) return false;

  // Check metadata first
  const meta = metaByCardId[card.cardId];
  const subTypes = (
    meta?.subTypes ||
    (card as { subTypes?: string }).subTypes ||
    ""
  ).toLowerCase();

  return subTypes.includes("aura");
}

/**
 * Renders a thin frame and transparent fill preview for Aura spells.
 * Shows a 2x2 area preview where cursor is the lower-right corner.
 * Only shows when Magic Interactions are enabled.
 */
export function AuraPreviewOverlay({
  tileX,
  tileY,
  pendingMagic,
  magicGuidesActive,
  metaByCardId,
}: AuraPreviewOverlayProps) {
  const frameRef = useRef<THREE.LineLoop>(null);
  const fillRef = useRef<THREE.Mesh>(null);

  const tileKey = `${tileX},${tileY}` as CellKey;

  // Check if this is the spell tile and it's an Aura
  const shouldShow = useMemo(() => {
    if (!magicGuidesActive) return false;
    if (!pendingMagic) return false;
    if (!isAuraSpell(pendingMagic, metaByCardId)) return false;

    // Only show on the tile where the spell is being cast
    const spellTileKey = `${pendingMagic.tile.x},${pendingMagic.tile.y}`;
    return spellTileKey === tileKey;
  }, [magicGuidesActive, pendingMagic, metaByCardId, tileKey]);

  // Get player color based on spell owner
  const playerColor = useMemo(() => {
    if (!pendingMagic) return P1_COLOR;
    return pendingMagic.spell.owner === 2 ? P2_COLOR : P1_COLOR;
  }, [pendingMagic]);

  // Calculate frame dimensions - 2x2 tiles with card at CENTER
  // The card is rendered at the center of its anchor tile
  // Frame is centered on the tile to show the 4 affected tiles around the card
  const { frameGeometry, fillSize } = useMemo(() => {
    if (!shouldShow) return { frameGeometry: null, fillSize: 0 };

    // Frame is 2x2 tiles, centered on the card (tile center)
    // Extends 1 tile in each direction from tile center
    const points = [
      new THREE.Vector3(-TILE_SIZE, TILE_SIZE, 0), // top-left
      new THREE.Vector3(TILE_SIZE, TILE_SIZE, 0), // top-right
      new THREE.Vector3(TILE_SIZE, -TILE_SIZE, 0), // bottom-right
      new THREE.Vector3(-TILE_SIZE, -TILE_SIZE, 0), // bottom-left
    ];

    return {
      frameGeometry: new THREE.BufferGeometry().setFromPoints(points),
      fillSize: TILE_SIZE * 2,
    };
  }, [shouldShow]);

  // Animate the frame and fill
  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    if (frameRef.current) {
      const mat = frameRef.current.material as THREE.LineBasicMaterial;
      mat.opacity = 0.8 + Math.sin(t * 4) * 0.2;
    }
    if (fillRef.current) {
      const mat = fillRef.current.material as THREE.MeshBasicMaterial;
      mat.opacity = 0.15 + Math.sin(t * 3) * 0.05;
    }
  });

  if (!shouldShow || !frameGeometry) {
    return null;
  }

  // Fill position: centered on the tile (where the card is)
  return (
    <group position={[0, 0.014, 0]} rotation-x={-Math.PI / 2}>
      {/* Transparent fill - centered on tile (card position) */}
      <mesh ref={fillRef} position={[0, 0, -0.001]}>
        <planeGeometry args={[fillSize, fillSize]} />
        <meshBasicMaterial
          color={playerColor}
          transparent
          opacity={0.18}
          depthWrite={false}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* Border frame */}
      <lineLoop ref={frameRef} geometry={frameGeometry}>
        <lineBasicMaterial
          color={playerColor}
          transparent
          opacity={0.9}
          linewidth={2}
        />
      </lineLoop>
    </group>
  );
}
