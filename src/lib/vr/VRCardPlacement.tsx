"use client";

import { useThree } from "@react-three/fiber";
import { useXR } from "@react-three/xr";
import { useCallback, useRef } from "react";
import * as THREE from "three";

interface BoardTile {
  x: number;
  z: number;
  row: number;
  col: number;
}

interface VRCardPlacementProps {
  onPlaceCard?: (tile: BoardTile, cardId: number) => void;
  onCancelPlacement?: () => void;
  /** Height of the board plane in world space */
  boardHeight?: number;
  /** Board dimensions */
  boardSize?: { width: number; height: number };
  /** Tile size */
  tileSize?: number;
}

/**
 * VR Card Placement component that handles dropping cards onto the board.
 * Converts VR controller/hand positions to board tile coordinates.
 */
export function VRCardPlacement({
  onPlaceCard,
  onCancelPlacement: _onCancelPlacement,
  boardHeight = 0,
  boardSize = { width: 7, height: 5 },
  tileSize = 1.0,
}: VRCardPlacementProps) {
  const session = useXR((state) => state.session);
  const { scene } = useThree();

  const lastValidTile = useRef<BoardTile | null>(null);

  // Convert world position to board tile coordinates
  const worldToTile = useCallback(
    (worldPos: THREE.Vector3): BoardTile | null => {
      // Find the board/playmat in the scene
      const playmat = scene.getObjectByName("playmat-mesh");
      if (!playmat) return null;

      // Get playmat world position and transform
      const playmatWorld = new THREE.Vector3();
      playmat.getWorldPosition(playmatWorld);

      // Calculate relative position on the board
      const relX = worldPos.x - playmatWorld.x;
      const relZ = worldPos.z - playmatWorld.z;

      // Convert to tile coordinates
      const halfWidth = (boardSize.width * tileSize) / 2;
      const halfHeight = (boardSize.height * tileSize) / 2;

      // Check if within board bounds
      if (
        relX < -halfWidth ||
        relX > halfWidth ||
        relZ < -halfHeight ||
        relZ > halfHeight
      ) {
        return null;
      }

      // Calculate tile indices
      const col = Math.floor((relX + halfWidth) / tileSize);
      const row = Math.floor((relZ + halfHeight) / tileSize);

      // Clamp to valid range
      const clampedCol = Math.max(0, Math.min(boardSize.width - 1, col));
      const clampedRow = Math.max(0, Math.min(boardSize.height - 1, row));

      // Calculate tile center in world space
      const tileX =
        playmatWorld.x - halfWidth + clampedCol * tileSize + tileSize / 2;
      const tileZ =
        playmatWorld.z - halfHeight + clampedRow * tileSize + tileSize / 2;

      return {
        x: tileX,
        z: tileZ,
        row: clampedRow,
        col: clampedCol,
      };
    },
    [scene, boardSize.width, boardSize.height, tileSize],
  );

  // Get the tile under a given world position
  const getTileAt = useCallback(
    (position: THREE.Vector3): BoardTile | null => {
      // Only consider positions near the board height
      if (Math.abs(position.y - boardHeight) > 0.5) {
        return null;
      }

      const tile = worldToTile(position);
      if (tile) {
        lastValidTile.current = tile;
      }
      return tile;
    },
    [worldToTile, boardHeight],
  );

  // Place a card at a position (used by parent components via ref or context)
  const _placeCardAt = useCallback(
    (position: THREE.Vector3, cardId: number): boolean => {
      const tile = getTileAt(position);
      if (!tile) return false;

      onPlaceCard?.(tile, cardId);
      return true;
    },
    [getTileAt, onPlaceCard],
  );

  if (!session) {
    return null;
  }

  return null;
}

/**
 * Hook for VR card placement logic
 */
export function useVRCardPlacement(options?: {
  boardHeight?: number;
  tileSize?: number;
}) {
  const { scene } = useThree();
  const boardHeight = options?.boardHeight ?? 0;
  const tileSize = options?.tileSize ?? 1.0;

  const worldToTile = useCallback(
    (worldPos: THREE.Vector3): BoardTile | null => {
      const playmat = scene.getObjectByName("playmat-mesh");
      if (!playmat) return null;

      const playmatWorld = new THREE.Vector3();
      playmat.getWorldPosition(playmatWorld);

      const relX = worldPos.x - playmatWorld.x;
      const relZ = worldPos.z - playmatWorld.z;

      // Assuming 7x5 board
      const boardWidth = 7;
      const boardHeightTiles = 5;
      const halfWidth = (boardWidth * tileSize) / 2;
      const halfHeight = (boardHeightTiles * tileSize) / 2;

      if (
        relX < -halfWidth ||
        relX > halfWidth ||
        relZ < -halfHeight ||
        relZ > halfHeight
      ) {
        return null;
      }

      const col = Math.floor((relX + halfWidth) / tileSize);
      const row = Math.floor((relZ + halfHeight) / tileSize);

      const clampedCol = Math.max(0, Math.min(boardWidth - 1, col));
      const clampedRow = Math.max(0, Math.min(boardHeightTiles - 1, row));

      const tileX =
        playmatWorld.x - halfWidth + clampedCol * tileSize + tileSize / 2;
      const tileZ =
        playmatWorld.z - halfHeight + clampedRow * tileSize + tileSize / 2;

      return {
        x: tileX,
        z: tileZ,
        row: clampedRow,
        col: clampedCol,
      };
    },
    [scene, tileSize],
  );

  const isOverBoard = useCallback(
    (position: THREE.Vector3): boolean => {
      if (Math.abs(position.y - boardHeight) > 0.5) {
        return false;
      }
      return worldToTile(position) !== null;
    },
    [worldToTile, boardHeight],
  );

  return {
    worldToTile,
    isOverBoard,
  };
}

export default VRCardPlacement;
