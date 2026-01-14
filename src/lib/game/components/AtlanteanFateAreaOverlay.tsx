"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { TILE_SIZE } from "@/lib/game/constants";
import type { CellKey, PendingAtlanteanFate } from "@/lib/game/store/types";

export type AtlanteanFateAreaOverlayProps = {
  tileX: number;
  tileY: number;
  pendingAtlanteanFate: PendingAtlanteanFate | null;
};

// Player colors
const P1_COLOR = new THREE.Color("#3b82f6"); // blue
const P2_COLOR = new THREE.Color("#ef4444"); // red

/**
 * Renders a thin frame and transparent fill around the 2x2 area for Atlantean Fate selection.
 * Only renders on the corner tile to avoid duplication.
 */
export function AtlanteanFateAreaOverlay({
  tileX,
  tileY,
  pendingAtlanteanFate,
}: AtlanteanFateAreaOverlayProps) {
  const frameRef = useRef<THREE.LineLoop>(null);
  const fillRef = useRef<THREE.Mesh>(null);

  const tileKey = `${tileX},${tileY}` as CellKey;

  // Only render on the corner tile
  const isCornerTile = useMemo(() => {
    if (!pendingAtlanteanFate) return false;
    if (
      pendingAtlanteanFate.phase !== "selectingCorner" &&
      pendingAtlanteanFate.phase !== "confirming"
    )
      return false;

    const cornerCell =
      pendingAtlanteanFate.selectedCorner || pendingAtlanteanFate.previewCorner;
    return cornerCell === tileKey;
  }, [pendingAtlanteanFate, tileKey]);

  // Get player color based on caster seat
  const playerColor = useMemo(() => {
    if (!pendingAtlanteanFate) return P1_COLOR;
    return pendingAtlanteanFate.casterSeat === "p2" ? P2_COLOR : P1_COLOR;
  }, [pendingAtlanteanFate]);

  // Calculate frame dimensions - 2x2 tiles with card at CENTER
  // The card is rendered at the center of its anchor tile
  // Frame is centered on the tile to show the 4 affected tiles around the card
  const { frameGeometry, fillSize } = useMemo(() => {
    if (!isCornerTile || !pendingAtlanteanFate)
      return { frameGeometry: null, fillSize: 0 };

    const cornerCell =
      pendingAtlanteanFate.selectedCorner || pendingAtlanteanFate.previewCorner;
    if (!cornerCell) return { frameGeometry: null, fillSize: 0 };

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
  }, [isCornerTile, pendingAtlanteanFate]);

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

  if (!isCornerTile || !frameGeometry) {
    return null;
  }

  // Fill position: centered on the tile (where the card is)
  return (
    <group position={[0, 0.015, 0]} rotation-x={-Math.PI / 2}>
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
