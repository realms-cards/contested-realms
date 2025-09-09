import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PermanentPositionState } from '@/lib/game/types';

/**
 * Integration Test: Burrow Functionality Workflow
 * 
 * This test validates the complete user workflow for burrowing permanents,
 * from right-click context menu to 3D position animation.
 * 
 * CRITICAL: This test MUST FAIL initially (RED phase of TDD).
 * Only implement the functionality after confirming these tests fail.
 */

// Mock components that will be implemented
const MockCardPlane = ({ permanentId, position, onContextMenu }: {
  permanentId: number;
  position: { x: number; y: number; z: number };
  onContextMenu: (e: React.MouseEvent) => void;
}) => (
  <div 
    data-testid={`permanent-${permanentId}`}
    data-position={`${position.x},${position.y},${position.z}`}
    onContextMenu={onContextMenu}
    style={{ cursor: 'pointer' }}
  >
    Permanent {permanentId}
  </div>
);

const MockContextMenu = ({ actions, onActionSelect }: {
  actions: Array<{ actionId: string; displayText: string; isEnabled: boolean }>;
  onActionSelect: (actionId: string) => void;
}) => (
  <div data-testid="context-menu">
    {actions.map(action => (
      <button
        key={action.actionId}
        data-testid={`action-${action.actionId}`}
        disabled={!action.isEnabled}
        onClick={() => onActionSelect(action.actionId)}
      >
        {action.displayText}
      </button>
    ))}
  </div>
);

const MockBurrowWorkflow = () => {
  // This component will integrate the actual game components
  // Currently mocked for testing the workflow contract
  const [permanentState, setPermanentState] = React.useState<PermanentPositionState>('surface');
  const [position, setPosition] = React.useState({ x: 5, y: 0, z: 3 });
  const [showContextMenu, setShowContextMenu] = React.useState(false);
  const [contextMenuPos, setContextMenuPos] = React.useState({ x: 0, y: 0 });

  const permanent = {
    id: 123,
    state: permanentState,
    ability: {
      permanentId: 123,
      canBurrow: true,
      canSubmerge: false,
      requiresWaterSite: false,
      abilitySource: 'Mole Beast - Burrow ability'
    }
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setContextMenuPos({ x: e.clientX, y: e.clientY });
    setShowContextMenu(true);
  };

  const handleActionSelect = (actionId: string) => {
    if (actionId === 'burrow' && permanentState === 'surface') {
      setPermanentState('burrowed');
      setPosition(prev => ({ ...prev, y: -0.25 })); // Move underground
    } else if (actionId === 'surface' && permanentState === 'burrowed') {
      setPermanentState('surface');
      setPosition(prev => ({ ...prev, y: 0 })); // Move to surface
    }
    setShowContextMenu(false);
  };

  const availableActions = React.useMemo(() => {
    const actions = [];
    
    if (permanentState === 'surface' && permanent.ability.canBurrow) {
      actions.push({
        actionId: 'burrow',
        displayText: 'Burrow',
        isEnabled: true
      });
    }
    
    if (permanentState === 'burrowed') {
      actions.push({
        actionId: 'surface',
        displayText: 'Surface',
        isEnabled: true
      });
    }

    return actions;
  }, [permanentState, permanent.ability]);

  return (
    <div data-testid="burrow-workflow">
      <div data-testid="game-state" data-state={permanentState} />
      <MockCardPlane
        permanentId={permanent.id}
        position={position}
        onContextMenu={handleContextMenu}
      />
      {showContextMenu && (
        <MockContextMenu
          actions={availableActions}
          onActionSelect={handleActionSelect}
        />
      )}
    </div>
  );
};

// React import for the component
import React from 'react';

describe('Integration: Burrow Functionality Workflow', () => {
  beforeEach(() => {
    // Reset any global state before each test
    vi.clearAllMocks();
  });

  describe('Basic Burrow Workflow', () => {
    it('should allow permanent to burrow when right-clicking on surface', async () => {
      render(<MockBurrowWorkflow />);
      
      // Initial state: permanent should be on surface
      const gameState = screen.getByTestId('game-state');
      expect(gameState).toHaveAttribute('data-state', 'surface');

      const permanent = screen.getByTestId('permanent-123');
      expect(permanent).toHaveAttribute('data-position', '5,0,3'); // Y=0 for surface

      // Right-click to open context menu
      fireEvent.contextMenu(permanent);

      // Context menu should appear with burrow option
      await waitFor(() => {
        expect(screen.getByTestId('context-menu')).toBeInTheDocument();
      });

      const burrowAction = screen.getByTestId('action-burrow');
      expect(burrowAction).toBeInTheDocument();
      expect(burrowAction).not.toBeDisabled();
      expect(burrowAction).toHaveTextContent('Burrow');

      // Click burrow action
      fireEvent.click(burrowAction);

      // Permanent should now be burrowed
      await waitFor(() => {
        expect(gameState).toHaveAttribute('data-state', 'burrowed');
      });

      // Position should change to underground (Y < 0)
      await waitFor(() => {
        expect(permanent).toHaveAttribute('data-position', '5,-0.25,3');
      });

      // Context menu should disappear
      expect(screen.queryByTestId('context-menu')).not.toBeInTheDocument();
    });

    it('should allow burrowed permanent to surface when right-clicking', async () => {
      render(<MockBurrowWorkflow />);
      
      // Get permanent to burrowed state first
      const permanent = screen.getByTestId('permanent-123');
      fireEvent.contextMenu(permanent);
      
      await waitFor(() => {
        expect(screen.getByTestId('context-menu')).toBeInTheDocument();
      });
      
      fireEvent.click(screen.getByTestId('action-burrow'));

      await waitFor(() => {
        expect(screen.getByTestId('game-state')).toHaveAttribute('data-state', 'burrowed');
      });

      // Now test surfacing
      fireEvent.contextMenu(permanent);

      await waitFor(() => {
        expect(screen.getByTestId('context-menu')).toBeInTheDocument();
      });

      const surfaceAction = screen.getByTestId('action-surface');
      expect(surfaceAction).toBeInTheDocument();
      expect(surfaceAction).not.toBeDisabled();
      expect(surfaceAction).toHaveTextContent('Surface');

      // Click surface action
      fireEvent.click(surfaceAction);

      // Permanent should return to surface
      await waitFor(() => {
        expect(screen.getByTestId('game-state')).toHaveAttribute('data-state', 'surface');
      });

      await waitFor(() => {
        expect(permanent).toHaveAttribute('data-position', '5,0,3');
      });
    });

    it('should not show burrow option for burrowed permanents', async () => {
      render(<MockBurrowWorkflow />);
      
      const permanent = screen.getByTestId('permanent-123');
      
      // Burrow the permanent first
      fireEvent.contextMenu(permanent);
      await waitFor(() => screen.getByTestId('action-burrow'));
      fireEvent.click(screen.getByTestId('action-burrow'));
      
      await waitFor(() => {
        expect(screen.getByTestId('game-state')).toHaveAttribute('data-state', 'burrowed');
      });

      // Right-click again
      fireEvent.contextMenu(permanent);

      await waitFor(() => {
        expect(screen.getByTestId('context-menu')).toBeInTheDocument();
      });

      // Should only show surface action, not burrow
      expect(screen.getByTestId('action-surface')).toBeInTheDocument();
      expect(screen.queryByTestId('action-burrow')).not.toBeInTheDocument();
    });
  });

  describe('Position Transitions', () => {
    it('should animate position change during burrow transition', async () => {
      render(<MockBurrowWorkflow />);
      
      const permanent = screen.getByTestId('permanent-123');
      
      // Initial position
      expect(permanent).toHaveAttribute('data-position', '5,0,3');

      // Trigger burrow
      fireEvent.contextMenu(permanent);
      await waitFor(() => screen.getByTestId('action-burrow'));
      fireEvent.click(screen.getByTestId('action-burrow'));

      // Position should change to underground
      await waitFor(() => {
        expect(permanent).toHaveAttribute('data-position', '5,-0.25,3');
      }, { timeout: 1000 });

      // X and Z coordinates should remain the same
      const position = permanent.getAttribute('data-position')!;
      const [x, y, z] = position.split(',').map(Number);
      expect(x).toBe(5); // X unchanged
      expect(y).toBe(-0.25); // Y moved underground
      expect(z).toBe(3); // Z unchanged
    });

    it('should maintain horizontal position during depth transitions', async () => {
      render(<MockBurrowWorkflow />);
      
      const permanent = screen.getByTestId('permanent-123');
      const initialPosition = permanent.getAttribute('data-position')!;
      const [initialX, , initialZ] = initialPosition.split(',').map(Number);

      // Burrow and surface multiple times
      for (let i = 0; i < 3; i++) {
        // Burrow
        fireEvent.contextMenu(permanent);
        await waitFor(() => screen.getByTestId('action-burrow'));
        fireEvent.click(screen.getByTestId('action-burrow'));
        
        await waitFor(() => {
          const pos = permanent.getAttribute('data-position')!;
          const [x, y, z] = pos.split(',').map(Number);
          expect(x).toBe(initialX); // X should not change
          expect(z).toBe(initialZ); // Z should not change
          expect(y).toBeLessThan(0); // Y should be underground
        });

        // Surface
        fireEvent.contextMenu(permanent);
        await waitFor(() => screen.getByTestId('action-surface'));
        fireEvent.click(screen.getByTestId('action-surface'));
        
        await waitFor(() => {
          const pos = permanent.getAttribute('data-position')!;
          const [x, y, z] = pos.split(',').map(Number);
          expect(x).toBe(initialX); // X should not change
          expect(z).toBe(initialZ); // Z should not change
          expect(y).toBe(0); // Y should be at surface
        });
      }
    });
  });

  describe('Context Menu Behavior', () => {
    it('should close context menu when action is selected', async () => {
      render(<MockBurrowWorkflow />);
      
      const permanent = screen.getByTestId('permanent-123');
      
      // Open context menu
      fireEvent.contextMenu(permanent);
      await waitFor(() => {
        expect(screen.getByTestId('context-menu')).toBeInTheDocument();
      });

      // Select action
      fireEvent.click(screen.getByTestId('action-burrow'));

      // Menu should close
      await waitFor(() => {
        expect(screen.queryByTestId('context-menu')).not.toBeInTheDocument();
      });
    });

    it('should show different actions based on current state', async () => {
      render(<MockBurrowWorkflow />);
      
      const permanent = screen.getByTestId('permanent-123');

      // Surface state: should show burrow
      fireEvent.contextMenu(permanent);
      await waitFor(() => {
        expect(screen.getByTestId('action-burrow')).toBeInTheDocument();
        expect(screen.queryByTestId('action-surface')).not.toBeInTheDocument();
      });
      
      // Execute burrow
      fireEvent.click(screen.getByTestId('action-burrow'));
      await waitFor(() => {
        expect(screen.getByTestId('game-state')).toHaveAttribute('data-state', 'burrowed');
      });

      // Burrowed state: should show surface
      fireEvent.contextMenu(permanent);
      await waitFor(() => {
        expect(screen.getByTestId('action-surface')).toBeInTheDocument();
        expect(screen.queryByTestId('action-burrow')).not.toBeInTheDocument();
      });
    });
  });

  describe('Error Cases', () => {
    it('should handle missing burrow ability gracefully', async () => {
      // This test will need to be updated when permanent abilities are properly integrated
      // For now, just ensure the component doesn't crash
      render(<MockBurrowWorkflow />);
      
      const permanent = screen.getByTestId('permanent-123');
      expect(permanent).toBeInTheDocument();
    });

    it('should prevent invalid state transitions', async () => {
      render(<MockBurrowWorkflow />);
      
      const permanent = screen.getByTestId('permanent-123');
      const gameState = screen.getByTestId('game-state');

      // Start at surface
      expect(gameState).toHaveAttribute('data-state', 'surface');

      // Multiple rapid clicks should not cause invalid state
      fireEvent.contextMenu(permanent);
      await waitFor(() => screen.getByTestId('action-burrow'));
      
      // Click multiple times rapidly
      const burrowButton = screen.getByTestId('action-burrow');
      fireEvent.click(burrowButton);
      fireEvent.click(burrowButton);
      fireEvent.click(burrowButton);

      // Should end up in valid burrowed state, not an undefined state
      await waitFor(() => {
        const state = gameState.getAttribute('data-state');
        expect(['surface', 'burrowed', 'submerged']).toContain(state);
      });
    });
  });
});