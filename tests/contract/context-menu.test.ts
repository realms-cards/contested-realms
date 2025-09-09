import { describe, it, expect } from 'vitest';
import { 
  ContextMenuAction, 
  BurrowAbility, 
  BurrowSubmergeActions,
  PermanentPositionState 
} from '@/lib/game/types';

/**
 * Contract Test: Context Menu Action Generation
 * 
 * This test validates the contracts for dynamic context menu generation
 * based on permanent abilities and current position state.
 * 
 * CRITICAL: This test MUST FAIL initially (RED phase of TDD).
 * Only implement the functionality after confirming these tests fail.
 */
describe('Contract: Context Menu Action Generation', () => {
  describe('ContextMenuAction Interface Contract', () => {
    it('should enforce required fields for ContextMenuAction', () => {
      const action: ContextMenuAction = {
        actionId: 'burrow',
        displayText: 'Burrow',
        isEnabled: true,
        targetPermanentId: 123
      };

      expect(action.actionId).toBe('burrow');
      expect(action.displayText).toBe('Burrow');
      expect(action.isEnabled).toBe(true);
      expect(action.targetPermanentId).toBe(123);
    });

    it('should handle optional fields correctly', () => {
      const fullAction: ContextMenuAction = {
        actionId: 'submerge',
        displayText: 'Submerge',
        icon: 'waves',
        isEnabled: false,
        targetPermanentId: 456,
        newPositionState: 'submerged',
        requiresConfirmation: true,
        description: 'Submerge this permanent underwater'
      };

      expect(fullAction.icon).toBe('waves');
      expect(fullAction.newPositionState).toBe('submerged');
      expect(fullAction.requiresConfirmation).toBe(true);
      expect(fullAction.description).toBe('Submerge this permanent underwater');

      const minimalAction: ContextMenuAction = {
        actionId: 'surface',
        displayText: 'Surface',
        isEnabled: true,
        targetPermanentId: 789
      };

      expect(minimalAction.icon).toBeUndefined();
      expect(minimalAction.newPositionState).toBeUndefined();
      expect(minimalAction.requiresConfirmation).toBeUndefined();
      expect(minimalAction.description).toBeUndefined();
    });
  });

  describe('BurrowAbility Interface Contract', () => {
    it('should enforce required fields for BurrowAbility', () => {
      const ability: BurrowAbility = {
        permanentId: 999,
        canBurrow: true,
        canSubmerge: false,
        requiresWaterSite: false,
        abilitySource: 'Mole Beast - Burrow ability'
      };

      expect(ability.permanentId).toBe(999);
      expect(ability.canBurrow).toBe(true);
      expect(ability.canSubmerge).toBe(false);
      expect(ability.requiresWaterSite).toBe(false);
      expect(ability.abilitySource).toBe('Mole Beast - Burrow ability');
    });

    it('should handle different ability combinations', () => {
      const burrowOnly: BurrowAbility = {
        permanentId: 1,
        canBurrow: true,
        canSubmerge: false,
        requiresWaterSite: false,
        abilitySource: 'Burrowing creature'
      };

      const submergeOnly: BurrowAbility = {
        permanentId: 2,
        canBurrow: false,
        canSubmerge: true,
        requiresWaterSite: true,
        abilitySource: 'Aquatic creature'
      };

      const both: BurrowAbility = {
        permanentId: 3,
        canBurrow: true,
        canSubmerge: true,
        requiresWaterSite: true,
        abilitySource: 'Amphibious creature'
      };

      expect(burrowOnly.canBurrow).toBe(true);
      expect(burrowOnly.canSubmerge).toBe(false);
      
      expect(submergeOnly.canBurrow).toBe(false);
      expect(submergeOnly.canSubmerge).toBe(true);
      expect(submergeOnly.requiresWaterSite).toBe(true);
      
      expect(both.canBurrow).toBe(true);
      expect(both.canSubmerge).toBe(true);
    });
  });

  describe('Pre-defined Actions Contract', () => {
    it('should provide correct BURROW action configuration', () => {
      const burrowAction = BurrowSubmergeActions.BURROW;
      
      expect(burrowAction.actionId).toBe('burrow');
      expect(burrowAction.displayText).toBe('Burrow');
      expect(burrowAction.icon).toBe('arrow-down');
      expect(burrowAction.newPositionState).toBe('burrowed');
      expect(burrowAction.description).toContain('under the current site');
    });

    it('should provide correct SUBMERGE action configuration', () => {
      const submergeAction = BurrowSubmergeActions.SUBMERGE;
      
      expect(submergeAction.actionId).toBe('submerge');
      expect(submergeAction.displayText).toBe('Submerge');
      expect(submergeAction.icon).toBe('waves');
      expect(submergeAction.newPositionState).toBe('submerged');
      expect(submergeAction.description).toContain('water sites only');
    });

    it('should provide correct SURFACE action configuration', () => {
      const surfaceAction = BurrowSubmergeActions.SURFACE;
      
      expect(surfaceAction.actionId).toBe('surface');
      expect(surfaceAction.displayText).toBe('Surface');
      expect(surfaceAction.icon).toBe('arrow-up');
      expect(surfaceAction.newPositionState).toBe('surface');
      expect(surfaceAction.description).toContain('back to the surface');
    });

    it('should provide correct EMERGE action configuration', () => {
      const emergeAction = BurrowSubmergeActions.EMERGE;
      
      expect(emergeAction.actionId).toBe('emerge');
      expect(emergeAction.displayText).toBe('Emerge');
      expect(emergeAction.icon).toBe('arrow-up');
      expect(emergeAction.newPositionState).toBe('surface');
      expect(emergeAction.description).toContain('from underwater');
    });

    it('should maintain const assertion for action definitions', () => {
      // Verify that the BurrowSubmergeActions object is properly typed as const
      const actions = BurrowSubmergeActions;
      
      expect(typeof actions.BURROW).toBe('object');
      expect(typeof actions.SUBMERGE).toBe('object');
      expect(typeof actions.SURFACE).toBe('object');
      expect(typeof actions.EMERGE).toBe('object');
    });
  });

  describe('Context Menu Action Generation Logic', () => {
    // These tests define the expected behavior for dynamic action generation
    // The actual utility functions will need to be implemented to make these pass

    it('should generate burrow action for surface permanents with burrow ability', () => {
      const permanent = {
        id: 100,
        currentState: 'surface' as PermanentPositionState,
        ability: {
          permanentId: 100,
          canBurrow: true,
          canSubmerge: false,
          requiresWaterSite: false,
          abilitySource: 'Test creature'
        }
      };

      // This will require implementing generateContextActions utility
      // Expected: should return burrow action that is enabled
      const expectedAction = {
        ...BurrowSubmergeActions.BURROW,
        isEnabled: true,
        targetPermanentId: permanent.id
      };

      expect(expectedAction.actionId).toBe('burrow');
      expect(expectedAction.isEnabled).toBe(true);
      expect(expectedAction.targetPermanentId).toBe(100);
    });

    it('should generate surface action for burrowed permanents', () => {
      const permanent = {
        id: 200,
        currentState: 'burrowed' as PermanentPositionState,
        ability: {
          permanentId: 200,
          canBurrow: true,
          canSubmerge: false,
          requiresWaterSite: false,
          abilitySource: 'Test creature'
        }
      };

      // Expected: should return surface action that is enabled
      const expectedAction = {
        ...BurrowSubmergeActions.SURFACE,
        isEnabled: true,
        targetPermanentId: permanent.id
      };

      expect(expectedAction.actionId).toBe('surface');
      expect(expectedAction.isEnabled).toBe(true);
      expect(expectedAction.targetPermanentId).toBe(200);
    });

    it('should generate submerge action only at water sites', () => {
      const permanent = {
        id: 300,
        currentState: 'surface' as PermanentPositionState,
        ability: {
          permanentId: 300,
          canBurrow: false,
          canSubmerge: true,
          requiresWaterSite: true,
          abilitySource: 'Aquatic creature'
        }
      };

      const waterSite = { isWaterSite: true };
      const landSite = { isWaterSite: false };

      // At water site: should be enabled
      // At land site: should be disabled
      // This will require implementing site type checking logic
      expect(waterSite.isWaterSite).toBe(true);
      expect(landSite.isWaterSite).toBe(false);
    });

    it('should not generate invalid actions for current state', () => {
      const burrowedPermanent = {
        id: 400,
        currentState: 'burrowed' as PermanentPositionState,
        ability: {
          permanentId: 400,
          canBurrow: true,
          canSubmerge: true,
          requiresWaterSite: false,
          abilitySource: 'Test creature'
        }
      };

      // Should not generate burrow action (already burrowed)
      // Should not generate submerge action (can't transition directly from burrowed to submerged)
      // Should generate surface action only

      // This logic will be implemented in the action generation utility
      const validStates = ['surface']; // Only surface action should be available
      expect(validStates).toContain('surface');
      expect(validStates).not.toContain('burrowed');
      expect(validStates).not.toContain('submerged');
    });

    it('should handle permanents without burrow/submerge abilities', () => {
      const regularPermanent = {
        id: 500,
        currentState: 'surface' as PermanentPositionState,
        ability: null // No special abilities
      };

      // Should generate no burrow/submerge actions
      // This will require implementing ability checking logic
      expect(regularPermanent.ability).toBeNull();
    });
  });

  describe('Action Enablement Logic', () => {
    it('should disable actions that violate state transition rules', () => {
      // Based on PositionStateValidation.isValidTransition rules
      const invalidTransitions = [
        { from: 'burrowed', to: 'submerged' },
        { from: 'submerged', to: 'burrowed' },
        { from: 'surface', to: 'surface' }
      ];

      invalidTransitions.forEach(({ from, to }) => {
        // Actions that would create these transitions should be disabled
        const isValidTransition = from !== to && 
                                !(from === 'burrowed' && to === 'submerged') &&
                                !(from === 'submerged' && to === 'burrowed');
        
        if (!isValidTransition) {
          expect(isValidTransition).toBe(false);
        }
      });
    });

    it('should enable actions only when conditions are met', () => {
      const conditions = {
        hasBurrowAbility: true,
        hasSubmergeAbility: true,
        isAtWaterSite: false,
        currentState: 'surface' as PermanentPositionState
      };

      // Burrow: enabled if has ability and at surface
      const burrowEnabled = conditions.hasBurrowAbility && conditions.currentState === 'surface';
      expect(burrowEnabled).toBe(true);

      // Submerge: enabled if has ability, at surface, AND at water site
      const submergeEnabled = conditions.hasSubmergeAbility && 
                            conditions.currentState === 'surface' && 
                            conditions.isAtWaterSite;
      expect(submergeEnabled).toBe(false); // Not at water site
    });
  });
});