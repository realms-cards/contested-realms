/**
 * Seat Positioning Utilities
 * Calculate 3D positions for player seats around the game board
 */

import * as THREE from 'three';
import { TILE_SIZE } from '../game/constants';

export interface BoardDimensions {
  width: number;
  height: number;
}

export interface SeatPosition {
  x: number;
  z: number;
}

export interface PlayerPositions {
  [playerId: string]: {
    position: SeatPosition;
  };
}

export interface SeatTransform {
  position: THREE.Vector3;
  rotationY: number;
}

/**
 * Calculate the world position and rotation for a player seat
 */
export function calculateSeatTransform(
  playerId: string,
  boardDimensions: BoardDimensions,
  playerPositions?: PlayerPositions,
  seatHeight = 0.02
): SeatTransform {
  // Calculate board center
  const center = {
    x: (boardDimensions.width - 1) / 2,
    z: (boardDimensions.height - 1) / 2,
  };

  // Get seat position from player positions or use default
  const seat = playerPositions?.[playerId]?.position ?? getDefaultSeatPosition(playerId, center);

  // Calculate world offsets to center the board
  const offsetX = -((boardDimensions.width - 1) * TILE_SIZE) / 2;
  const offsetZ = -((boardDimensions.height - 1) * TILE_SIZE) / 2;

  // Convert to world coordinates
  const worldX = offsetX + seat.x * TILE_SIZE;
  const worldZ = offsetZ + seat.z * TILE_SIZE;

  // Calculate rotation to face board center (0,0) in world coords
  const angleY = Math.atan2(0 - worldX, 0 - worldZ);

  return {
    position: new THREE.Vector3(worldX, seatHeight, worldZ),
    rotationY: angleY,
  };
}

/**
 * Get default seat position based on player ID
 */
export function getDefaultSeatPosition(playerId: string, boardCenter: SeatPosition): SeatPosition {
  // Default positioning logic
  if (playerId === 'p1' || playerId.includes('1')) {
    return {
      x: boardCenter.x,
      z: boardCenter.z + 3, // South of board
    };
  } else if (playerId === 'p2' || playerId.includes('2')) {
    return {
      x: boardCenter.x,
      z: boardCenter.z - 3, // North of board
    };
  } else {
    // For additional players, position them around the board
    const playerNumber = parseInt(playerId.replace(/\D/g, '')) || 3;
    const angle = ((playerNumber - 3) * Math.PI * 2) / 6; // Distribute around circle
    const radius = 4;
    
    return {
      x: boardCenter.x + Math.cos(angle) * radius,
      z: boardCenter.z + Math.sin(angle) * radius,
    };
  }
}

/**
 * Calculate positions for multiple seats around a board
 */
export function calculateMultipleSeatTransforms(
  playerIds: string[],
  boardDimensions: BoardDimensions,
  playerPositions?: PlayerPositions,
  seatHeight = 0.02
): Record<string, SeatTransform> {
  const transforms: Record<string, SeatTransform> = {};

  for (const playerId of playerIds) {
    transforms[playerId] = calculateSeatTransform(
      playerId,
      boardDimensions,
      playerPositions,
      seatHeight
    );
  }

  return transforms;
}

/**
 * Check if two seat positions would overlap
 */
export function doSeatsOverlap(
  pos1: SeatPosition,
  pos2: SeatPosition,
  minDistance = 2
): boolean {
  const dx = pos1.x - pos2.x;
  const dz = pos1.z - pos2.z;
  const distance = Math.sqrt(dx * dx + dz * dz);
  
  return distance < minDistance;
}

/**
 * Adjust seat positions to avoid overlaps
 */
export function adjustSeatsToAvoidOverlaps(
  playerIds: string[],
  boardDimensions: BoardDimensions,
  minDistance = 2
): PlayerPositions {
  const center = {
    x: (boardDimensions.width - 1) / 2,
    z: (boardDimensions.height - 1) / 2,
  };

  const positions: PlayerPositions = {};
  const placedPositions: SeatPosition[] = [];

  for (const playerId of playerIds) {
    let position = getDefaultSeatPosition(playerId, center);
    let attempts = 0;
    const maxAttempts = 20;

    // Try to find a non-overlapping position
    while (attempts < maxAttempts) {
      const hasOverlap = placedPositions.some(placedPos =>
        doSeatsOverlap(position, placedPos, minDistance)
      );

      if (!hasOverlap) {
        break;
      }

      // Adjust position by moving in a spiral pattern
      const angle = (attempts * Math.PI * 2) / 8;
      const radius = minDistance * (1 + attempts * 0.1);
      
      position = {
        x: center.x + Math.cos(angle) * radius,
        z: center.z + Math.sin(angle) * radius,
      };

      attempts++;
    }

    positions[playerId] = { position };
    placedPositions.push(position);
  }

  return positions;
}

/**
 * Calculate the optimal board viewing angle for a seat
 */
export function calculateOptimalViewingAngle(
  seatPosition: SeatPosition,
  boardCenter: SeatPosition,
  boardDimensions: BoardDimensions
): number {
  // Calculate angle from seat to board center
  const dx = boardCenter.x - seatPosition.x;
  const dz = boardCenter.z - seatPosition.z;
  const baseAngle = Math.atan2(dx, dz);

  // Adjust based on board aspect ratio for better viewing
  const aspectRatio = boardDimensions.width / boardDimensions.height;
  let adjustment = 0;

  if (aspectRatio > 1.5) {
    // Wide board - adjust angle for better coverage
    adjustment = Math.sin(baseAngle) * 0.2;
  } else if (aspectRatio < 0.7) {
    // Tall board - adjust angle differently
    adjustment = Math.cos(baseAngle) * 0.2;
  }

  return baseAngle + adjustment;
}

/**
 * Get the distance between a seat and the board center
 */
export function getSeatDistanceFromBoard(
  seatPosition: SeatPosition,
  boardCenter: SeatPosition
): number {
  const dx = seatPosition.x - boardCenter.x;
  const dz = seatPosition.z - boardCenter.z;
  return Math.sqrt(dx * dx + dz * dz);
}

/**
 * Validate that a seat position is reasonable for the given board
 */
export function validateSeatPosition(
  seatPosition: SeatPosition,
  boardDimensions: BoardDimensions
): {
  valid: boolean;
  issues: string[];
} {
  const issues: string[] = [];
  
  const boardCenter = {
    x: (boardDimensions.width - 1) / 2,
    z: (boardDimensions.height - 1) / 2,
  };

  const distance = getSeatDistanceFromBoard(seatPosition, boardCenter);

  // Check minimum distance
  if (distance < 1.5) {
    issues.push('Seat too close to board');
  }

  // Check maximum distance
  if (distance > 10) {
    issues.push('Seat too far from board');
  }

  // Check if seat is within reasonable bounds
  const maxX = boardDimensions.width + 5;
  const maxZ = boardDimensions.height + 5;

  if (Math.abs(seatPosition.x) > maxX) {
    issues.push('Seat X position out of bounds');
  }

  if (Math.abs(seatPosition.z) > maxZ) {
    issues.push('Seat Z position out of bounds');
  }

  return {
    valid: issues.length === 0,
    issues,
  };
}