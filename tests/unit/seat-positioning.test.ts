/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  calculateSeatTransform,
  getDefaultSeatPosition,
  calculateMultipleSeatTransforms,
  doSeatsOverlap,
  adjustSeatsToAvoidOverlaps,
  calculateOptimalViewingAngle,
  getSeatDistanceFromBoard,
  validateSeatPosition,
  type BoardDimensions,
  type SeatPosition,
  type PlayerPositions
} from '../../src/lib/utils/seat-positioning';

describe('Seat Positioning Utilities', () => {
  const standardBoard: BoardDimensions = { width: 7, height: 5 };
  const boardCenter = { x: 3, z: 2 }; // (7-1)/2, (5-1)/2

  describe('calculateSeatTransform', () => {
    it('should calculate transform for player 1 at default position', () => {
      const result = calculateSeatTransform('p1', standardBoard);

      expect(result.position.x).toBe(0); // Centered on X axis
      expect(result.position.y).toBe(0.02); // Default seat height
      expect(result.position.z).toBeCloseTo(0.6, 1); // South of center

      // Should face toward center (0,0,0)
      expect(result.rotationY).toBeCloseTo(Math.PI, 1);
    });

    it('should calculate transform for player 2 at default position', () => {
      const result = calculateSeatTransform('p2', standardBoard);

      expect(result.position.x).toBe(0); // Centered on X axis
      expect(result.position.y).toBe(0.02); // Default seat height
      expect(result.position.z).toBeCloseTo(-0.6, 1); // North of center

      // Should face toward center (0,0,0)
      expect(result.rotationY).toBeCloseTo(0, 1);
    });

    it('should use custom player positions when provided', () => {
      const playerPositions: PlayerPositions = {
        'p1': { position: { x: 1, z: 1 } },
        'p2': { position: { x: 5, z: 3 } }
      };

      const result1 = calculateSeatTransform('p1', standardBoard, playerPositions);
      const result2 = calculateSeatTransform('p2', standardBoard, playerPositions);

      // Positions should be based on custom positions, not defaults
      expect(result1.position.x).not.toBe(0);
      expect(result1.position.z).not.toBe(result2.position.z);

      // Both should still face toward board center
      expect(Math.abs(result1.rotationY)).toBeLessThan(Math.PI);
      expect(Math.abs(result2.rotationY)).toBeLessThan(Math.PI);
    });

    it('should handle custom seat height', () => {
      const customHeight = 1.5;
      const result = calculateSeatTransform('p1', standardBoard, undefined, customHeight);

      expect(result.position.y).toBe(customHeight);
    });

    it('should calculate correct rotation angles', () => {
      // Test seat to the east of board center
      const eastPosition: PlayerPositions = {
        'test': { position: { x: 6, z: 2 } } // Same Z as center, east of center
      };

      const result = calculateSeatTransform('test', standardBoard, eastPosition);
      
      // Should face west (negative X direction)
      expect(result.rotationY).toBeCloseTo(-Math.PI / 2, 1);
    });

    it('should handle different board sizes', () => {
      const largeBoard: BoardDimensions = { width: 15, height: 11 };
      const smallBoard: BoardDimensions = { width: 3, height: 3 };

      const largeResult = calculateSeatTransform('p1', largeBoard);
      const smallResult = calculateSeatTransform('p1', smallBoard);

      // Large board should have seats further from center
      expect(Math.abs(largeResult.position.z)).toBeGreaterThan(Math.abs(smallResult.position.z));
    });
  });

  describe('getDefaultSeatPosition', () => {
    it('should place p1 south of board center', () => {
      const position = getDefaultSeatPosition('p1', boardCenter);
      
      expect(position.x).toBe(boardCenter.x);
      expect(position.z).toBe(boardCenter.z + 3);
    });

    it('should place p2 north of board center', () => {
      const position = getDefaultSeatPosition('p2', boardCenter);
      
      expect(position.x).toBe(boardCenter.x);
      expect(position.z).toBe(boardCenter.z - 3);
    });

    it('should handle player IDs with numbers', () => {
      const position1 = getDefaultSeatPosition('player1', boardCenter);
      const position2 = getDefaultSeatPosition('player2', boardCenter);
      
      expect(position1.z).toBe(boardCenter.z + 3); // Same as p1
      expect(position2.z).toBe(boardCenter.z - 3); // Same as p2
    });

    it('should place additional players in circle around board', () => {
      const position3 = getDefaultSeatPosition('p3', boardCenter);
      const position4 = getDefaultSeatPosition('p4', boardCenter);
      
      // Should be positioned around the board center
      const distance3 = Math.sqrt(
        Math.pow(position3.x - boardCenter.x, 2) + 
        Math.pow(position3.z - boardCenter.z, 2)
      );
      
      const distance4 = Math.sqrt(
        Math.pow(position4.x - boardCenter.x, 2) + 
        Math.pow(position4.z - boardCenter.z, 2)
      );

      expect(distance3).toBeCloseTo(4, 1); // Default radius
      expect(distance4).toBeCloseTo(4, 1);
      
      // Should be at different positions
      expect(position3.x).not.toBeCloseTo(position4.x, 1);
    });

    it('should handle non-numeric player IDs gracefully', () => {
      const position = getDefaultSeatPosition('unknown-player', boardCenter);
      
      // Should fallback to p3-like behavior
      const distance = Math.sqrt(
        Math.pow(position.x - boardCenter.x, 2) + 
        Math.pow(position.z - boardCenter.z, 2)
      );

      expect(distance).toBeCloseTo(4, 1);
    });
  });

  describe('calculateMultipleSeatTransforms', () => {
    it('should calculate transforms for multiple players', () => {
      const playerIds = ['p1', 'p2', 'p3'];
      const results = calculateMultipleSeatTransforms(playerIds, standardBoard);

      expect(Object.keys(results)).toEqual(['p1', 'p2', 'p3']);
      
      // Each should have position and rotation
      Object.values(results).forEach(transform => {
        expect(transform.position).toBeInstanceOf(THREE.Vector3);
        expect(typeof transform.rotationY).toBe('number');
      });

      // Players should be at different positions
      expect(results.p1.position.z).not.toBeCloseTo(results.p2.position.z, 1);
      expect(results.p2.position.x).not.toBeCloseTo(results.p3.position.x, 1);
    });

    it('should apply custom seat height to all seats', () => {
      const playerIds = ['p1', 'p2'];
      const customHeight = 2.5;
      const results = calculateMultipleSeatTransforms(playerIds, standardBoard, undefined, customHeight);

      Object.values(results).forEach(transform => {
        expect(transform.position.y).toBe(customHeight);
      });
    });

    it('should handle empty player list', () => {
      const results = calculateMultipleSeatTransforms([], standardBoard);
      expect(Object.keys(results)).toHaveLength(0);
    });
  });

  describe('doSeatsOverlap', () => {
    it('should detect overlapping seats', () => {
      const pos1: SeatPosition = { x: 0, z: 0 };
      const pos2: SeatPosition = { x: 1, z: 0 };
      
      expect(doSeatsOverlap(pos1, pos2, 2)).toBe(true); // Distance = 1, min = 2
    });

    it('should detect non-overlapping seats', () => {
      const pos1: SeatPosition = { x: 0, z: 0 };
      const pos2: SeatPosition = { x: 3, z: 0 };
      
      expect(doSeatsOverlap(pos1, pos2, 2)).toBe(false); // Distance = 3, min = 2
    });

    it('should handle exact minimum distance', () => {
      const pos1: SeatPosition = { x: 0, z: 0 };
      const pos2: SeatPosition = { x: 2, z: 0 };
      
      expect(doSeatsOverlap(pos1, pos2, 2)).toBe(false); // Distance = 2, min = 2
    });

    it('should calculate distance correctly in 2D', () => {
      const pos1: SeatPosition = { x: 0, z: 0 };
      const pos2: SeatPosition = { x: 3, z: 4 };
      
      // Distance should be 5 (3-4-5 triangle)
      expect(doSeatsOverlap(pos1, pos2, 4)).toBe(false);
      expect(doSeatsOverlap(pos1, pos2, 6)).toBe(true);
    });
  });

  describe('adjustSeatsToAvoidOverlaps', () => {
    it('should return positions without overlaps', () => {
      const playerIds = ['p1', 'p2'];
      const positions = adjustSeatsToAvoidOverlaps(playerIds, standardBoard);

      const pos1 = positions.p1.position;
      const pos2 = positions.p2.position;

      expect(doSeatsOverlap(pos1, pos2, 2)).toBe(false);
    });

    it('should handle many players without overlaps', () => {
      const playerIds = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'];
      const positions = adjustSeatsToAvoidOverlaps(playerIds, standardBoard, 1.5);

      const positionsArray = playerIds.map(id => positions[id].position);

      // Check all pairs for overlaps
      for (let i = 0; i < positionsArray.length; i++) {
        for (let j = i + 1; j < positionsArray.length; j++) {
          expect(doSeatsOverlap(positionsArray[i], positionsArray[j], 1.5)).toBe(false);
        }
      }
    });

    it('should maintain reasonable distances from board center', () => {
      const playerIds = ['p1', 'p2', 'p3', 'p4'];
      const positions = adjustSeatsToAvoidOverlaps(playerIds, standardBoard);

      const center = { x: (standardBoard.width - 1) / 2, z: (standardBoard.height - 1) / 2 };

      Object.values(positions).forEach(({ position }) => {
        const distance = getSeatDistanceFromBoard(position, center);
        expect(distance).toBeGreaterThan(1); // Not too close
        expect(distance).toBeLessThan(15); // Not too far
      });
    });

    it('should handle single player', () => {
      const positions = adjustSeatsToAvoidOverlaps(['p1'], standardBoard);
      
      expect(positions.p1).toBeDefined();
      expect(positions.p1.position.x).toBe(boardCenter.x);
      expect(positions.p1.position.z).toBe(boardCenter.z + 3);
    });
  });

  describe('calculateOptimalViewingAngle', () => {
    it('should calculate basic viewing angle toward center', () => {
      const seatPos: SeatPosition = { x: 0, z: 5 }; // South of center
      const angle = calculateOptimalViewingAngle(seatPos, boardCenter, standardBoard);

      // Should be looking roughly north (toward positive Z)
      expect(angle).toBeCloseTo(0, 1);
    });

    it('should adjust for wide boards', () => {
      const wideBoard: BoardDimensions = { width: 20, height: 5 };
      const wideBoardCenter = { x: 9.5, z: 2 };
      const seatPos: SeatPosition = { x: 9.5, z: 6 };

      const angle = calculateOptimalViewingAngle(seatPos, wideBoardCenter, wideBoard);
      
      // Should have some adjustment for the wide aspect ratio
      expect(typeof angle).toBe('number');
      expect(Math.abs(angle)).toBeLessThan(Math.PI);
    });

    it('should adjust for tall boards', () => {
      const tallBoard: BoardDimensions = { width: 5, height: 20 };
      const tallBoardCenter = { x: 2, z: 9.5 };
      const seatPos: SeatPosition = { x: 6, z: 9.5 };

      const angle = calculateOptimalViewingAngle(seatPos, tallBoardCenter, tallBoard);
      
      // Should have adjustment for tall aspect ratio
      expect(typeof angle).toBe('number');
      expect(Math.abs(angle)).toBeLessThan(Math.PI);
    });

    it('should handle square boards normally', () => {
      const squareBoard: BoardDimensions = { width: 8, height: 8 };
      const squareBoardCenter = { x: 3.5, z: 3.5 };
      const seatPos: SeatPosition = { x: 3.5, z: 7 };

      const angle = calculateOptimalViewingAngle(seatPos, squareBoardCenter, squareBoard);
      
      // Should be close to basic angle calculation
      expect(angle).toBeCloseTo(0, 1);
    });
  });

  describe('getSeatDistanceFromBoard', () => {
    it('should calculate distance correctly', () => {
      const seatPos: SeatPosition = { x: 0, z: 0 };
      const distance = getSeatDistanceFromBoard(seatPos, boardCenter);

      const expectedDistance = Math.sqrt(
        Math.pow(boardCenter.x, 2) + Math.pow(boardCenter.z, 2)
      );

      expect(distance).toBeCloseTo(expectedDistance, 2);
    });

    it('should return 0 for seat at board center', () => {
      const distance = getSeatDistanceFromBoard(boardCenter, boardCenter);
      expect(distance).toBe(0);
    });

    it('should handle negative coordinates', () => {
      const seatPos: SeatPosition = { x: -5, z: -3 };
      const distance = getSeatDistanceFromBoard(seatPos, boardCenter);
      
      expect(distance).toBeGreaterThan(0);
      expect(typeof distance).toBe('number');
    });
  });

  describe('validateSeatPosition', () => {
    it('should validate good seat position', () => {
      const goodPosition: SeatPosition = { x: 3, z: 6 }; // Reasonable distance from center
      const result = validateSeatPosition(goodPosition, standardBoard);

      expect(result.valid).toBe(true);
      expect(result.issues).toHaveLength(0);
    });

    it('should reject seat too close to board', () => {
      const tooClose: SeatPosition = { x: 3, z: 2.5 }; // Very close to center
      const result = validateSeatPosition(tooClose, standardBoard);

      expect(result.valid).toBe(false);
      expect(result.issues).toContain('Seat too close to board');
    });

    it('should reject seat too far from board', () => {
      const tooFar: SeatPosition = { x: 50, z: 2 }; // Very far from center
      const result = validateSeatPosition(tooFar, standardBoard);

      expect(result.valid).toBe(false);
      expect(result.issues).toContain('Seat too far from board');
    });

    it('should reject seat out of bounds on X axis', () => {
      const outOfBounds: SeatPosition = { x: 20, z: 2 }; // Too far on X
      const result = validateSeatPosition(outOfBounds, standardBoard);

      expect(result.valid).toBe(false);
      expect(result.issues).toContain('Seat X position out of bounds');
    });

    it('should reject seat out of bounds on Z axis', () => {
      const outOfBounds: SeatPosition = { x: 3, z: 15 }; // Too far on Z
      const result = validateSeatPosition(outOfBounds, standardBoard);

      expect(result.valid).toBe(false);
      expect(result.issues).toContain('Seat Z position out of bounds');
    });

    it('should collect multiple issues', () => {
      const badPosition: SeatPosition = { x: 25, z: 20 }; // Multiple problems
      const result = validateSeatPosition(badPosition, standardBoard);

      expect(result.valid).toBe(false);
      expect(result.issues.length).toBeGreaterThan(1);
      expect(result.issues).toContain('Seat too far from board');
      expect(result.issues).toContain('Seat X position out of bounds');
      expect(result.issues).toContain('Seat Z position out of bounds');
    });

    it('should handle different board sizes', () => {
      const largeBoard: BoardDimensions = { width: 30, height: 20 };
      const position: SeatPosition = { x: 15, z: 10 };

      const result = validateSeatPosition(position, largeBoard);
      
      // Position that would be invalid for small board should be valid for large board
      expect(result.valid).toBe(true);
    });
  });

  describe('Edge Cases and Integration', () => {
    it('should handle zero-size board gracefully', () => {
      const zeroBoard: BoardDimensions = { width: 0, height: 0 };
      
      expect(() => {
        calculateSeatTransform('p1', zeroBoard);
      }).not.toThrow();
    });

    it('should handle single-tile board', () => {
      const singleBoard: BoardDimensions = { width: 1, height: 1 };
      const transform = calculateSeatTransform('p1', singleBoard);

      expect(transform.position).toBeInstanceOf(THREE.Vector3);
      expect(typeof transform.rotationY).toBe('number');
    });

    it('should maintain consistency between functions', () => {
      const playerIds = ['p1', 'p2'];
      
      // Calculate using single function
      const transform1 = calculateSeatTransform('p1', standardBoard);
      const transform2 = calculateSeatTransform('p2', standardBoard);
      
      // Calculate using multiple function
      const multipleTransforms = calculateMultipleSeatTransforms(playerIds, standardBoard);
      
      // Results should be identical
      expect(transform1.position.x).toBeCloseTo(multipleTransforms.p1.position.x, 5);
      expect(transform1.position.z).toBeCloseTo(multipleTransforms.p1.position.z, 5);
      expect(transform1.rotationY).toBeCloseTo(multipleTransforms.p1.rotationY, 5);
      
      expect(transform2.position.x).toBeCloseTo(multipleTransforms.p2.position.x, 5);
      expect(transform2.position.z).toBeCloseTo(multipleTransforms.p2.position.z, 5);
      expect(transform2.rotationY).toBeCloseTo(multipleTransforms.p2.rotationY, 5);
    });

    it('should work well with overlap avoidance', () => {
      const playerIds = ['p1', 'p2', 'p3', 'p4'];
      const adjustedPositions = adjustSeatsToAvoidOverlaps(playerIds, standardBoard);
      
      // All positions should be valid
      Object.values(adjustedPositions).forEach(({ position }) => {
        const validation = validateSeatPosition(position, standardBoard);
        expect(validation.valid).toBe(true);
      });

      // Should be able to calculate transforms for adjusted positions
      const transforms = calculateMultipleSeatTransforms(
        playerIds,
        standardBoard,
        adjustedPositions
      );

      expect(Object.keys(transforms)).toHaveLength(4);
      Object.values(transforms).forEach(transform => {
        expect(transform.position).toBeInstanceOf(THREE.Vector3);
        expect(typeof transform.rotationY).toBe('number');
      });
    });
  });
});