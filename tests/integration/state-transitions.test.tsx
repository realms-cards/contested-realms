import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PermanentPositionState } from '@/lib/game/types';

/**
 * Integration Test: State Transition Validation
 * 
 * This test validates the complete state transition validation system
 * and prevents invalid transitions between permanent states.
 * 
 * CRITICAL: This test MUST FAIL initially (RED phase of TDD).
 * Only implement the functionality after confirming these tests fail.
 */

interface StateTransition {
  from: PermanentPositionState;
  to: PermanentPositionState;
  isValid: boolean;
  requiredAbility?: string;
  requiredCondition?: string;
  errorMessage?: string;
}

interface PermanentWithAbilities {
  id: number;
  state: PermanentPositionState;
  abilities: {
    canBurrow: boolean;
    canSubmerge: boolean;
    canFly: boolean;
    requiresWaterSite: boolean;
  };
  conditions: {
    atWaterSite: boolean;
    hasMovementLeft: boolean;
    isTapped: boolean;
  };
}

interface StateTransitionRule {
  from: PermanentPositionState;
  to: PermanentPositionState;
  validate: (permanent: PermanentWithAbilities) => { isValid: boolean; reason?: string };
}

// Mock components that will be implemented
const MockStateTransitionValidator = ({ 
  permanent,
  onStateChange,
  onValidationError 
}: {
  permanent: PermanentWithAbilities;
  onStateChange: (newState: PermanentPositionState) => void;
  onValidationError: (error: string) => void;
}) => {
  const transitionRules: StateTransitionRule[] = [
    // Surface transitions
    {
      from: 'surface',
      to: 'burrowed',
      validate: (p) => ({
        isValid: p.abilities.canBurrow && p.conditions.hasMovementLeft,
        reason: !p.abilities.canBurrow ? 'Cannot burrow' : !p.conditions.hasMovementLeft ? 'No movement left' : undefined
      })
    },
    {
      from: 'surface',
      to: 'submerged',
      validate: (p) => ({
        isValid: p.abilities.canSubmerge && (!p.abilities.requiresWaterSite || p.conditions.atWaterSite) && p.conditions.hasMovementLeft,
        reason: !p.abilities.canSubmerge ? 'Cannot submerge' : 
                (p.abilities.requiresWaterSite && !p.conditions.atWaterSite) ? 'Requires water site' :
                !p.conditions.hasMovementLeft ? 'No movement left' : undefined
      })
    },
    {
      from: 'surface',
      to: 'flying',
      validate: (p) => ({
        isValid: p.abilities.canFly && p.conditions.hasMovementLeft && !p.conditions.isTapped,
        reason: !p.abilities.canFly ? 'Cannot fly' :
                !p.conditions.hasMovementLeft ? 'No movement left' :
                p.conditions.isTapped ? 'Cannot fly while tapped' : undefined
      })
    },
    // Burrowed transitions
    {
      from: 'burrowed',
      to: 'surface',
      validate: (p) => ({
        isValid: p.conditions.hasMovementLeft,
        reason: !p.conditions.hasMovementLeft ? 'No movement left' : undefined
      })
    },
    {
      from: 'burrowed',
      to: 'submerged',
      validate: () => ({ isValid: false, reason: 'Cannot transition directly from burrowed to submerged' })
    },
    {
      from: 'burrowed',
      to: 'flying',
      validate: () => ({ isValid: false, reason: 'Cannot transition directly from burrowed to flying' })
    },
    // Submerged transitions
    {
      from: 'submerged',
      to: 'surface',
      validate: (p) => ({
        isValid: p.conditions.hasMovementLeft,
        reason: !p.conditions.hasMovementLeft ? 'No movement left' : undefined
      })
    },
    {
      from: 'submerged',
      to: 'burrowed',
      validate: () => ({ isValid: false, reason: 'Cannot transition directly from submerged to burrowed' })
    },
    {
      from: 'submerged',
      to: 'flying',
      validate: () => ({ isValid: false, reason: 'Cannot transition directly from submerged to flying' })
    },
    // Flying transitions
    {
      from: 'flying',
      to: 'surface',
      validate: () => ({ isValid: true }) // Can always land
    },
    {
      from: 'flying',
      to: 'burrowed',
      validate: () => ({ isValid: false, reason: 'Cannot transition directly from flying to burrowed' })
    },
    {
      from: 'flying',
      to: 'submerged',
      validate: () => ({ isValid: false, reason: 'Cannot transition directly from flying to submerged' })
    }
  ];

  const validateTransition = (newState: PermanentPositionState): { isValid: boolean; reason?: string } => {
    if (newState === permanent.state) {
      return { isValid: false, reason: 'Already in that state' };
    }

    const rule = transitionRules.find(r => r.from === permanent.state && r.to === newState);
    if (!rule) {
      return { isValid: false, reason: `No transition rule from ${permanent.state} to ${newState}` };
    }

    return rule.validate(permanent);
  };

  const getAvailableTransitions = () => {
    const possibleStates: PermanentPositionState[] = ['surface', 'burrowed', 'submerged', 'flying'];
    return possibleStates
      .filter(state => state !== permanent.state)
      .map(state => ({
        state,
        validation: validateTransition(state)
      }));
  };

  const handleTransitionAttempt = (newState: PermanentPositionState) => {
    const validation = validateTransition(newState);
    
    if (validation.isValid) {
      onStateChange(newState);
    } else {
      onValidationError(validation.reason || 'Invalid transition');
    }
  };

  return (
    <div data-testid="state-transition-validator">
      <div 
        data-testid="current-state"
        data-state={permanent.state}
      >
        Current State: {permanent.state}
      </div>

      <div data-testid="permanent-abilities">
        <div data-testid="can-burrow" data-value={permanent.abilities.canBurrow} />
        <div data-testid="can-submerge" data-value={permanent.abilities.canSubmerge} />
        <div data-testid="can-fly" data-value={permanent.abilities.canFly} />
        <div data-testid="requires-water-site" data-value={permanent.abilities.requiresWaterSite} />
      </div>

      <div data-testid="permanent-conditions">
        <div data-testid="at-water-site" data-value={permanent.conditions.atWaterSite} />
        <div data-testid="has-movement-left" data-value={permanent.conditions.hasMovementLeft} />
        <div data-testid="is-tapped" data-value={permanent.conditions.isTapped} />
      </div>

      <div data-testid="available-transitions">
        {getAvailableTransitions().map(({ state, validation }) => (
          <button
            key={state}
            data-testid={`transition-to-${state}`}
            data-valid={validation.isValid}
            data-reason={validation.reason || ''}
            disabled={!validation.isValid}
            onClick={() => handleTransitionAttempt(state)}
            title={validation.reason}
            style={{
              margin: 5,
              padding: 10,
              backgroundColor: validation.isValid ? 'lightgreen' : 'lightcoral',
              border: '2px solid #333',
              cursor: validation.isValid ? 'pointer' : 'not-allowed'
            }}
          >
            → {state}
            {!validation.isValid && ` (${validation.reason})`}
          </button>
        ))}
      </div>
    </div>
  );
};

const MockGameStateManager = ({ 
  initialState = 'surface',
  abilities = { canBurrow: true, canSubmerge: true, canFly: true, requiresWaterSite: false },
  conditions = { atWaterSite: true, hasMovementLeft: true, isTapped: false }
}: {
  initialState?: PermanentPositionState;
  abilities?: Partial<PermanentWithAbilities['abilities']>;
  conditions?: Partial<PermanentWithAbilities['conditions']>;
}) => {
  const [permanent, setPermanent] = React.useState<PermanentWithAbilities>({
    id: 1,
    state: initialState,
    abilities: { canBurrow: true, canSubmerge: true, canFly: true, requiresWaterSite: false, ...abilities },
    conditions: { atWaterSite: true, hasMovementLeft: true, isTapped: false, ...conditions }
  });

  const [lastError, setLastError] = React.useState<string | null>(null);
  const [transitionHistory, setTransitionHistory] = React.useState<Array<{
    from: PermanentPositionState;
    to: PermanentPositionState;
    timestamp: number;
  }>>([]);

  const handleStateChange = (newState: PermanentPositionState) => {
    const oldState = permanent.state;
    setPermanent(prev => ({ ...prev, state: newState }));
    setTransitionHistory(prev => [...prev, {
      from: oldState,
      to: newState,
      timestamp: Date.now()
    }]);
    setLastError(null);
  };

  const handleValidationError = (error: string) => {
    setLastError(error);
  };

  const updateConditions = (newConditions: Partial<PermanentWithAbilities['conditions']>) => {
    setPermanent(prev => ({
      ...prev,
      conditions: { ...prev.conditions, ...newConditions }
    }));
  };

  return (
    <div data-testid="game-state-manager">
      <div 
        data-testid="last-error"
        data-error={lastError || ''}
      >
        {lastError && (
          <div style={{ color: 'red', padding: 10, border: '1px solid red', margin: 10 }}>
            Error: {lastError}
          </div>
        )}
      </div>

      <div data-testid="transition-history">
        {transitionHistory.map((transition, index) => (
          <div
            key={index}
            data-testid={`history-${index}`}
            data-from={transition.from}
            data-to={transition.to}
            data-timestamp={transition.timestamp}
          />
        ))}
      </div>

      <MockStateTransitionValidator
        permanent={permanent}
        onStateChange={handleStateChange}
        onValidationError={handleValidationError}
      />

      <div data-testid="condition-controls" style={{ margin: 20, padding: 10, border: '1px solid #ccc' }}>
        <h4>Test Conditions</h4>
        <button
          data-testid="toggle-water-site"
          onClick={() => updateConditions({ atWaterSite: !permanent.conditions.atWaterSite })}
        >
          At Water Site: {permanent.conditions.atWaterSite ? 'Yes' : 'No'}
        </button>
        <button
          data-testid="toggle-movement-left"
          onClick={() => updateConditions({ hasMovementLeft: !permanent.conditions.hasMovementLeft })}
        >
          Movement Left: {permanent.conditions.hasMovementLeft ? 'Yes' : 'No'}
        </button>
        <button
          data-testid="toggle-tapped"
          onClick={() => updateConditions({ isTapped: !permanent.conditions.isTapped })}
        >
          Tapped: {permanent.conditions.isTapped ? 'Yes' : 'No'}
        </button>
      </div>
    </div>
  );
};

// React import for the component
import React from 'react';

describe('Integration: State Transition Validation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Valid State Transitions', () => {
    it('should allow surface to burrowed with burrow ability', async () => {
      render(<MockGameStateManager 
        initialState="surface"
        abilities={{ canBurrow: true }}
      />);

      // Verify initial state
      expect(screen.getByTestId('current-state')).toHaveAttribute('data-state', 'surface');

      // Burrow transition should be available and valid
      const burrowButton = screen.getByTestId('transition-to-burrowed');
      expect(burrowButton).toHaveAttribute('data-valid', 'true');
      expect(burrowButton).not.toBeDisabled();

      // Execute transition
      fireEvent.click(burrowButton);

      await waitFor(() => {
        expect(screen.getByTestId('current-state')).toHaveAttribute('data-state', 'burrowed');
      });

      // Should have recorded transition history
      const history = screen.getByTestId('history-0');
      expect(history).toHaveAttribute('data-from', 'surface');
      expect(history).toHaveAttribute('data-to', 'burrowed');
    });

    it('should allow surface to submerged at water site', async () => {
      render(<MockGameStateManager 
        initialState="surface"
        abilities={{ canSubmerge: true, requiresWaterSite: true }}
        conditions={{ atWaterSite: true, hasMovementLeft: true, isTapped: false }}
      />);

      const submergeButton = screen.getByTestId('transition-to-submerged');
      expect(submergeButton).toHaveAttribute('data-valid', 'true');

      fireEvent.click(submergeButton);

      await waitFor(() => {
        expect(screen.getByTestId('current-state')).toHaveAttribute('data-state', 'submerged');
      });
    });

    it('should allow surface to flying with fly ability when untapped', async () => {
      render(<MockGameStateManager 
        initialState="surface"
        abilities={{ canFly: true }}
        conditions={{ hasMovementLeft: true, isTapped: false }}
      />);

      const flyButton = screen.getByTestId('transition-to-flying');
      expect(flyButton).toHaveAttribute('data-valid', 'true');

      fireEvent.click(flyButton);

      await waitFor(() => {
        expect(screen.getByTestId('current-state')).toHaveAttribute('data-state', 'flying');
      });
    });

    it('should allow burrowed to surface', async () => {
      render(<MockGameStateManager 
        initialState="burrowed"
        conditions={{ hasMovementLeft: true }}
      />);

      const surfaceButton = screen.getByTestId('transition-to-surface');
      expect(surfaceButton).toHaveAttribute('data-valid', 'true');

      fireEvent.click(surfaceButton);

      await waitFor(() => {
        expect(screen.getByTestId('current-state')).toHaveAttribute('data-state', 'surface');
      });
    });

    it('should allow flying to surface (landing)', async () => {
      render(<MockGameStateManager initialState="flying" />);

      const surfaceButton = screen.getByTestId('transition-to-surface');
      expect(surfaceButton).toHaveAttribute('data-valid', 'true');

      fireEvent.click(surfaceButton);

      await waitFor(() => {
        expect(screen.getByTestId('current-state')).toHaveAttribute('data-state', 'surface');
      });
    });
  });

  describe('Invalid State Transitions', () => {
    it('should prevent surface to burrowed without burrow ability', async () => {
      render(<MockGameStateManager 
        initialState="surface"
        abilities={{ canBurrow: false }}
      />);

      const burrowButton = screen.getByTestId('transition-to-burrowed');
      expect(burrowButton).toHaveAttribute('data-valid', 'false');
      expect(burrowButton).toHaveAttribute('data-reason', 'Cannot burrow');
      expect(burrowButton).toBeDisabled();

      fireEvent.click(burrowButton);

      // State should not change
      await waitFor(() => {
        expect(screen.getByTestId('current-state')).toHaveAttribute('data-state', 'surface');
      });

      // Should show error
      const errorElement = screen.getByTestId('last-error');
      expect(errorElement).toHaveAttribute('data-error', 'Cannot burrow');
    });

    it('should prevent surface to submerged at land site when requiring water', async () => {
      render(<MockGameStateManager 
        initialState="surface"
        abilities={{ canSubmerge: true, requiresWaterSite: true }}
        conditions={{ atWaterSite: false }}
      />);

      const submergeButton = screen.getByTestId('transition-to-submerged');
      expect(submergeButton).toHaveAttribute('data-valid', 'false');
      expect(submergeButton).toHaveAttribute('data-reason', 'Requires water site');
      expect(submergeButton).toBeDisabled();

      fireEvent.click(submergeButton);

      await waitFor(() => {
        expect(screen.getByTestId('current-state')).toHaveAttribute('data-state', 'surface');
        expect(screen.getByTestId('last-error')).toHaveAttribute('data-error', 'Requires water site');
      });
    });

    it('should prevent surface to flying when tapped', async () => {
      render(<MockGameStateManager 
        initialState="surface"
        abilities={{ canFly: true }}
        conditions={{ isTapped: true }}
      />);

      const flyButton = screen.getByTestId('transition-to-flying');
      expect(flyButton).toHaveAttribute('data-valid', 'false');
      expect(flyButton).toHaveAttribute('data-reason', 'Cannot fly while tapped');
    });

    it('should prevent transitions without movement', async () => {
      render(<MockGameStateManager 
        initialState="surface"
        conditions={{ hasMovementLeft: false }}
      />);

      // All movement-requiring transitions should be disabled
      const burrowButton = screen.getByTestId('transition-to-burrowed');
      const submergeButton = screen.getByTestId('transition-to-submerged');
      const flyButton = screen.getByTestId('transition-to-flying');

      expect(burrowButton).toHaveAttribute('data-reason', 'No movement left');
      expect(submergeButton).toHaveAttribute('data-reason', 'No movement left');
      expect(flyButton).toHaveAttribute('data-reason', 'No movement left');
    });
  });

  describe('Prohibited Direct Transitions', () => {
    it('should prevent burrowed to submerged direct transition', async () => {
      render(<MockGameStateManager initialState="burrowed" />);

      const submergeButton = screen.getByTestId('transition-to-submerged');
      expect(submergeButton).toHaveAttribute('data-valid', 'false');
      expect(submergeButton).toHaveAttribute('data-reason', 'Cannot transition directly from burrowed to submerged');
    });

    it('should prevent burrowed to flying direct transition', async () => {
      render(<MockGameStateManager initialState="burrowed" />);

      const flyButton = screen.getByTestId('transition-to-flying');
      expect(flyButton).toHaveAttribute('data-valid', 'false');
      expect(flyButton).toHaveAttribute('data-reason', 'Cannot transition directly from burrowed to flying');
    });

    it('should prevent submerged to burrowed direct transition', async () => {
      render(<MockGameStateManager initialState="submerged" />);

      const burrowButton = screen.getByTestId('transition-to-burrowed');
      expect(burrowButton).toHaveAttribute('data-valid', 'false');
      expect(burrowButton).toHaveAttribute('data-reason', 'Cannot transition directly from submerged to burrowed');
    });

    it('should prevent submerged to flying direct transition', async () => {
      render(<MockGameStateManager initialState="submerged" />);

      const flyButton = screen.getByTestId('transition-to-flying');
      expect(flyButton).toHaveAttribute('data-valid', 'false');
      expect(flyButton).toHaveAttribute('data-reason', 'Cannot transition directly from submerged to flying');
    });

    it('should prevent flying to burrowed direct transition', async () => {
      render(<MockGameStateManager initialState="flying" />);

      const burrowButton = screen.getByTestId('transition-to-burrowed');
      expect(burrowButton).toHaveAttribute('data-valid', 'false');
      expect(burrowButton).toHaveAttribute('data-reason', 'Cannot transition directly from flying to burrowed');
    });

    it('should prevent flying to submerged direct transition', async () => {
      render(<MockGameStateManager initialState="flying" />);

      const submergeButton = screen.getByTestId('transition-to-submerged');
      expect(submergeButton).toHaveAttribute('data-valid', 'false');
      expect(submergeButton).toHaveAttribute('data-reason', 'Cannot transition directly from flying to submerged');
    });
  });

  describe('Dynamic Condition Changes', () => {
    it('should update available transitions when conditions change', async () => {
      render(<MockGameStateManager 
        initialState="surface"
        abilities={{ canSubmerge: true, requiresWaterSite: true }}
        conditions={{ atWaterSite: true }}
      />);

      // Initially should be able to submerge at water site
      let submergeButton = screen.getByTestId('transition-to-submerged');
      expect(submergeButton).toHaveAttribute('data-valid', 'true');

      // Change to land site
      fireEvent.click(screen.getByTestId('toggle-water-site'));

      await waitFor(() => {
        const atWaterSite = screen.getByTestId('at-water-site');
        expect(atWaterSite).toHaveAttribute('data-value', 'false');
      });

      // Now submerge should be invalid
      submergeButton = screen.getByTestId('transition-to-submerged');
      expect(submergeButton).toHaveAttribute('data-valid', 'false');
      expect(submergeButton).toHaveAttribute('data-reason', 'Requires water site');
    });

    it('should disable all transitions when movement is exhausted', async () => {
      render(<MockGameStateManager initialState="surface" />);

      // Initially should have valid transitions
      const burrowButton = screen.getByTestId('transition-to-burrowed');
      expect(burrowButton).toHaveAttribute('data-valid', 'true');

      // Remove movement
      fireEvent.click(screen.getByTestId('toggle-movement-left'));

      await waitFor(() => {
        const hasMovement = screen.getByTestId('has-movement-left');
        expect(hasMovement).toHaveAttribute('data-value', 'false');
      });

      // All movement-requiring transitions should now be invalid
      const updatedBurrowButton = screen.getByTestId('transition-to-burrowed');
      expect(updatedBurrowButton).toHaveAttribute('data-valid', 'false');
      expect(updatedBurrowButton).toHaveAttribute('data-reason', 'No movement left');
    });

    it('should prevent flying when tapped status changes', async () => {
      render(<MockGameStateManager 
        initialState="surface"
        abilities={{ canFly: true }}
        conditions={{ isTapped: false }}
      />);

      // Initially should be able to fly
      let flyButton = screen.getByTestId('transition-to-flying');
      expect(flyButton).toHaveAttribute('data-valid', 'true');

      // Tap the permanent
      fireEvent.click(screen.getByTestId('toggle-tapped'));

      await waitFor(() => {
        const isTapped = screen.getByTestId('is-tapped');
        expect(isTapped).toHaveAttribute('data-value', 'true');
      });

      // Flying should now be invalid
      flyButton = screen.getByTestId('transition-to-flying');
      expect(flyButton).toHaveAttribute('data-valid', 'false');
      expect(flyButton).toHaveAttribute('data-reason', 'Cannot fly while tapped');
    });
  });

  describe('Complex Transition Sequences', () => {
    it('should handle multi-step valid transition sequences', async () => {
      render(<MockGameStateManager initialState="surface" />);

      // Surface -> Burrowed
      fireEvent.click(screen.getByTestId('transition-to-burrowed'));
      await waitFor(() => {
        expect(screen.getByTestId('current-state')).toHaveAttribute('data-state', 'burrowed');
      });

      // Burrowed -> Surface
      fireEvent.click(screen.getByTestId('transition-to-surface'));
      await waitFor(() => {
        expect(screen.getByTestId('current-state')).toHaveAttribute('data-state', 'surface');
      });

      // Surface -> Flying
      fireEvent.click(screen.getByTestId('transition-to-flying'));
      await waitFor(() => {
        expect(screen.getByTestId('current-state')).toHaveAttribute('data-state', 'flying');
      });

      // Flying -> Surface
      fireEvent.click(screen.getByTestId('transition-to-surface'));
      await waitFor(() => {
        expect(screen.getByTestId('current-state')).toHaveAttribute('data-state', 'surface');
      });

      // Verify transition history
      expect(screen.getByTestId('history-0')).toHaveAttribute('data-from', 'surface');
      expect(screen.getByTestId('history-0')).toHaveAttribute('data-to', 'burrowed');
      expect(screen.getByTestId('history-1')).toHaveAttribute('data-from', 'burrowed');
      expect(screen.getByTestId('history-1')).toHaveAttribute('data-to', 'surface');
      expect(screen.getByTestId('history-2')).toHaveAttribute('data-from', 'surface');
      expect(screen.getByTestId('history-2')).toHaveAttribute('data-to', 'flying');
      expect(screen.getByTestId('history-3')).toHaveAttribute('data-from', 'flying');
      expect(screen.getByTestId('history-3')).toHaveAttribute('data-to', 'surface');
    });

    it('should prevent invalid transition attempts in sequence', async () => {
      render(<MockGameStateManager initialState="surface" />);

      // Surface -> Burrowed (valid)
      fireEvent.click(screen.getByTestId('transition-to-burrowed'));
      await waitFor(() => {
        expect(screen.getByTestId('current-state')).toHaveAttribute('data-state', 'burrowed');
      });

      // Try Burrowed -> Flying (invalid)
      const flyButton = screen.getByTestId('transition-to-flying');
      expect(flyButton).toBeDisabled();
      fireEvent.click(flyButton);

      // Should remain burrowed and show error
      await waitFor(() => {
        expect(screen.getByTestId('current-state')).toHaveAttribute('data-state', 'burrowed');
        expect(screen.getByTestId('last-error')).toHaveAttribute('data-error', 'Cannot transition directly from burrowed to flying');
      });

      // Transition history should only have the first valid transition
      expect(screen.getByTestId('history-0')).toBeInTheDocument();
      expect(screen.queryByTestId('history-1')).not.toBeInTheDocument();
    });
  });

  describe('Edge Cases', () => {
    it('should prevent transition to same state', async () => {
      render(<MockGameStateManager initialState="surface" />);

      // There should be no button to transition to current state
      expect(screen.queryByTestId('transition-to-surface')).not.toBeInTheDocument();
    });

    it('should handle rapid transition attempts gracefully', async () => {
      render(<MockGameStateManager initialState="surface" />);

      const burrowButton = screen.getByTestId('transition-to-burrowed');
      
      // Rapid clicks
      fireEvent.click(burrowButton);
      fireEvent.click(burrowButton);
      fireEvent.click(burrowButton);

      // Should only transition once
      await waitFor(() => {
        expect(screen.getByTestId('current-state')).toHaveAttribute('data-state', 'burrowed');
        expect(screen.getAllByTestId(/^history-/)).toHaveLength(1);
      });
    });

    it('should clear errors after successful transitions', async () => {
      render(<MockGameStateManager 
        initialState="surface"
        abilities={{ canBurrow: false }}
      />);

      // Try invalid transition
      fireEvent.click(screen.getByTestId('transition-to-burrowed'));
      
      await waitFor(() => {
        expect(screen.getByTestId('last-error')).toHaveAttribute('data-error', 'Cannot burrow');
      });

      // Try valid transition (fly)
      fireEvent.click(screen.getByTestId('transition-to-flying'));

      await waitFor(() => {
        expect(screen.getByTestId('current-state')).toHaveAttribute('data-state', 'flying');
        expect(screen.getByTestId('last-error')).toHaveAttribute('data-error', ''); // Error cleared
      });
    });
  });
});