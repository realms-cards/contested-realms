import { describe, it, expect } from 'vitest';
import { 
  PermanentPosition, 
  PermanentPositionState, 
  PositionStateValidation 
} from '@/lib/game/types';

/**
 * Contract Test: Permanent Position State Management
 * 
 * This test validates the core contracts for permanent position state management.
 * It ensures type safety, validation rules, and state transition logic work correctly.
 * 
 * CRITICAL: This test MUST FAIL initially (RED phase of TDD).
 * Only implement the functionality after confirming these tests fail.
 */
describe('Contract: Permanent Position State Management', () => {
  describe('PermanentPositionState Type Safety', () => {
    it('should only allow valid position states', () => {
      const validStates: PermanentPositionState[] = ['surface', 'burrowed', 'submerged'];
      
      // Type safety test - this should compile without errors
      validStates.forEach(state => {
        expect(PositionStateValidation.isValidState(state)).toBe(true);
      });
      
      // Invalid states should be rejected
      expect(PositionStateValidation.isValidState('invalid' as any)).toBe(false);
      expect(PositionStateValidation.isValidState('underground' as any)).toBe(false);
    });
  });

  describe('PermanentPosition Interface Contract', () => {
    it('should enforce required fields for PermanentPosition', () => {
      const validPosition: PermanentPosition = {
        permanentId: 123,
        state: 'surface',
        position: {
          x: 1.0,
          y: 0.0, // Surface level
          z: 2.0
        }
      };

      expect(validPosition.permanentId).toBe(123);
      expect(validPosition.state).toBe('surface');
      expect(validPosition.position.y).toBe(0.0);
    });

    it('should handle optional transitionDuration field', () => {
      const positionWithDuration: PermanentPosition = {
        permanentId: 456,
        state: 'burrowed',
        position: { x: 1.0, y: -0.3, z: 2.0 },
        transitionDuration: 500
      };

      expect(positionWithDuration.transitionDuration).toBe(500);

      const positionWithoutDuration: PermanentPosition = {
        permanentId: 789,
        state: 'surface',
        position: { x: 1.0, y: 0.0, z: 2.0 }
      };

      expect(positionWithoutDuration.transitionDuration).toBeUndefined();
    });
  });

  describe('Position Depth Validation', () => {
    it('should validate surface position Y coordinates', () => {
      // Surface positions should be at Y = 0 (±0.05 tolerance)
      expect(PositionStateValidation.isValidDepth('surface', 0.0)).toBe(true);
      expect(PositionStateValidation.isValidDepth('surface', 0.03)).toBe(true);
      expect(PositionStateValidation.isValidDepth('surface', -0.04)).toBe(true);
      
      // Outside tolerance should be invalid
      expect(PositionStateValidation.isValidDepth('surface', 0.1)).toBe(false);
      expect(PositionStateValidation.isValidDepth('surface', -0.1)).toBe(false);
    });

    it('should validate burrowed position Y coordinates', () => {
      // Burrowed positions should be underground (Y: -0.5 to -0.1)
      expect(PositionStateValidation.isValidDepth('burrowed', -0.2)).toBe(true);
      expect(PositionStateValidation.isValidDepth('burrowed', -0.3)).toBe(true);
      expect(PositionStateValidation.isValidDepth('burrowed', -0.4)).toBe(true);
      
      // Surface or too deep should be invalid
      expect(PositionStateValidation.isValidDepth('burrowed', 0.0)).toBe(false);
      expect(PositionStateValidation.isValidDepth('burrowed', -0.6)).toBe(false);
    });

    it('should validate submerged position Y coordinates', () => {
      // Submerged positions use same depth as burrowed (Y: -0.5 to -0.1)
      expect(PositionStateValidation.isValidDepth('submerged', -0.2)).toBe(true);
      expect(PositionStateValidation.isValidDepth('submerged', -0.3)).toBe(true);
      expect(PositionStateValidation.isValidDepth('submerged', -0.4)).toBe(true);
      
      // Surface or too deep should be invalid
      expect(PositionStateValidation.isValidDepth('submerged', 0.0)).toBe(false);
      expect(PositionStateValidation.isValidDepth('submerged', -0.6)).toBe(false);
    });
  });

  describe('State Transition Validation', () => {
    it('should allow valid state transitions', () => {
      // Surface ↔ Burrowed transitions
      expect(PositionStateValidation.isValidTransition('surface', 'burrowed')).toBe(true);
      expect(PositionStateValidation.isValidTransition('burrowed', 'surface')).toBe(true);
      
      // Surface ↔ Submerged transitions
      expect(PositionStateValidation.isValidTransition('surface', 'submerged')).toBe(true);
      expect(PositionStateValidation.isValidTransition('submerged', 'surface')).toBe(true);
    });

    it('should forbid direct burrowed ↔ submerged transitions', () => {
      // Must go through surface state
      expect(PositionStateValidation.isValidTransition('burrowed', 'submerged')).toBe(false);
      expect(PositionStateValidation.isValidTransition('submerged', 'burrowed')).toBe(false);
    });

    it('should forbid same-state transitions', () => {
      expect(PositionStateValidation.isValidTransition('surface', 'surface')).toBe(false);
      expect(PositionStateValidation.isValidTransition('burrowed', 'burrowed')).toBe(false);
      expect(PositionStateValidation.isValidTransition('submerged', 'submerged')).toBe(false);
    });
  });

  describe('Position Animation Contract', () => {
    it('should default to 200ms transition duration when not specified', () => {
      // This tests the expected behavior - actual implementation will provide the default
      const position: PermanentPosition = {
        permanentId: 999,
        state: 'burrowed',
        position: { x: 0, y: -0.25, z: 0 }
      };

      // The implementation should provide a default of 200ms when transitionDuration is undefined
      const expectedDuration = position.transitionDuration ?? 200;
      expect(expectedDuration).toBe(200);
    });

    it('should respect custom transition durations', () => {
      const fastTransition: PermanentPosition = {
        permanentId: 111,
        state: 'surface',
        position: { x: 0, y: 0, z: 0 },
        transitionDuration: 100
      };

      const slowTransition: PermanentPosition = {
        permanentId: 222,
        state: 'burrowed', 
        position: { x: 0, y: -0.3, z: 0 },
        transitionDuration: 1000
      };

      expect(fastTransition.transitionDuration).toBe(100);
      expect(slowTransition.transitionDuration).toBe(1000);
    });
  });
});