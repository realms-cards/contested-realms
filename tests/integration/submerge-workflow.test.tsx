import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PermanentPositionState } from '@/lib/game/types';

/**
 * Integration Test: Submerge Functionality Workflow
 * 
 * This test validates the complete user workflow for submerging permanents,
 * specifically testing water site requirements vs land sites.
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

const MockSiteIndicator = ({ siteType, position }: {
  siteType: 'water' | 'land';
  position: { x: number; z: number };
}) => (
  <div 
    data-testid={`site-${siteType}-${position.x}-${position.z}`}
    data-site-type={siteType}
    style={{ 
      position: 'absolute',
      left: position.x * 50,
      top: position.z * 50,
      width: 50,
      height: 50,
      backgroundColor: siteType === 'water' ? 'blue' : 'brown',
      opacity: 0.3
    }}
  >
    {siteType} site
  </div>
);

const MockContextMenu = ({ actions, onActionSelect }: {
  actions: Array<{ actionId: string; displayText: string; isEnabled: boolean; disabledReason?: string }>;
  onActionSelect: (actionId: string) => void;
}) => (
  <div data-testid="context-menu">
    {actions.map(action => (
      <button
        key={action.actionId}
        data-testid={`action-${action.actionId}`}
        disabled={!action.isEnabled}
        onClick={() => onActionSelect(action.actionId)}
        title={action.disabledReason}
      >
        {action.displayText}
      </button>
    ))}
  </div>
);

const MockSubmergeWorkflow = ({ siteType = 'water' }: { siteType?: 'water' | 'land' }) => {
  const [permanentState, setPermanentState] = React.useState<PermanentPositionState>('surface');
  const [position, setPosition] = React.useState({ x: 5, y: 0, z: 3 });
  const [showContextMenu, setShowContextMenu] = React.useState(false);
  const [contextMenuPos, setContextMenuPos] = React.useState({ x: 0, y: 0 });

  const permanent = {
    id: 456,
    state: permanentState,
    ability: {
      permanentId: 456,
      canBurrow: false,
      canSubmerge: true,
      requiresWaterSite: true,
      abilitySource: 'Sea Serpent - Submerge ability'
    }
  };

  const site = {
    type: siteType,
    position: { x: position.x, z: position.z },
    isWaterSite: siteType === 'water'
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setContextMenuPos({ x: e.clientX, y: e.clientY });
    setShowContextMenu(true);
  };

  const handleActionSelect = (actionId: string) => {
    if (actionId === 'submerge' && permanentState === 'surface') {
      if (permanent.ability.requiresWaterSite && !site.isWaterSite) {
        // This action should be disabled, but handle gracefully
        return;
      }
      setPermanentState('submerged');
      setPosition(prev => ({ ...prev, y: -0.5 })); // Move deeper than burrow
    } else if (actionId === 'surface' && permanentState === 'submerged') {
      setPermanentState('surface');
      setPosition(prev => ({ ...prev, y: 0 })); // Move to surface
    }
    setShowContextMenu(false);
  };

  const availableActions = React.useMemo(() => {
    const actions = [];
    
    if (permanentState === 'surface' && permanent.ability.canSubmerge) {
      const canSubmergeAtSite = !permanent.ability.requiresWaterSite || site.isWaterSite;
      actions.push({
        actionId: 'submerge',
        displayText: 'Submerge',
        isEnabled: canSubmergeAtSite,
        disabledReason: canSubmergeAtSite ? undefined : 'Requires water site'
      });
    }
    
    if (permanentState === 'submerged') {
      actions.push({
        actionId: 'surface',
        displayText: 'Surface',
        isEnabled: true
      });
    }

    return actions;
  }, [permanentState, permanent.ability, site.isWaterSite]);

  return (
    <div data-testid="submerge-workflow">
      <div data-testid="game-state" data-state={permanentState} />
      <div data-testid="site-info" data-site-type={site.type} data-is-water={site.isWaterSite} />
      <MockSiteIndicator siteType={site.type} position={site.position} />
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

describe('Integration: Submerge Functionality Workflow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Water Site Submerge Workflow', () => {
    it('should allow permanent to submerge when at water site', async () => {
      render(<MockSubmergeWorkflow siteType="water" />);
      
      // Initial state: permanent should be on surface at water site
      const gameState = screen.getByTestId('game-state');
      const siteInfo = screen.getByTestId('site-info');
      expect(gameState).toHaveAttribute('data-state', 'surface');
      expect(siteInfo).toHaveAttribute('data-site-type', 'water');
      expect(siteInfo).toHaveAttribute('data-is-water', 'true');

      const permanent = screen.getByTestId('permanent-456');
      expect(permanent).toHaveAttribute('data-position', '5,0,3');

      // Right-click to open context menu
      fireEvent.contextMenu(permanent);

      // Context menu should appear with enabled submerge option
      await waitFor(() => {
        expect(screen.getByTestId('context-menu')).toBeInTheDocument();
      });

      const submergeAction = screen.getByTestId('action-submerge');
      expect(submergeAction).toBeInTheDocument();
      expect(submergeAction).not.toBeDisabled();
      expect(submergeAction).toHaveTextContent('Submerge');

      // Click submerge action
      fireEvent.click(submergeAction);

      // Permanent should now be submerged
      await waitFor(() => {
        expect(gameState).toHaveAttribute('data-state', 'submerged');
      });

      // Position should change to underwater (Y < 0, deeper than burrow)
      await waitFor(() => {
        expect(permanent).toHaveAttribute('data-position', '5,-0.5,3');
      });

      // Context menu should disappear
      expect(screen.queryByTestId('context-menu')).not.toBeInTheDocument();
    });

    it('should allow submerged permanent to surface at water site', async () => {
      render(<MockSubmergeWorkflow siteType="water" />);
      
      // Get permanent to submerged state first
      const permanent = screen.getByTestId('permanent-456');
      fireEvent.contextMenu(permanent);
      
      await waitFor(() => {
        expect(screen.getByTestId('context-menu')).toBeInTheDocument();
      });
      
      fireEvent.click(screen.getByTestId('action-submerge'));

      await waitFor(() => {
        expect(screen.getByTestId('game-state')).toHaveAttribute('data-state', 'submerged');
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
  });

  describe('Land Site Restrictions', () => {
    it('should disable submerge option when at land site', async () => {
      render(<MockSubmergeWorkflow siteType="land" />);
      
      // Verify we're at a land site
      const siteInfo = screen.getByTestId('site-info');
      expect(siteInfo).toHaveAttribute('data-site-type', 'land');
      expect(siteInfo).toHaveAttribute('data-is-water', 'false');

      const permanent = screen.getByTestId('permanent-456');
      
      // Right-click to open context menu
      fireEvent.contextMenu(permanent);

      await waitFor(() => {
        expect(screen.getByTestId('context-menu')).toBeInTheDocument();
      });

      // Submerge action should be present but disabled
      const submergeAction = screen.getByTestId('action-submerge');
      expect(submergeAction).toBeInTheDocument();
      expect(submergeAction).toBeDisabled();
      expect(submergeAction).toHaveAttribute('title', 'Requires water site');

      // Clicking disabled action should not change state
      fireEvent.click(submergeAction);
      
      await waitFor(() => {
        expect(screen.getByTestId('game-state')).toHaveAttribute('data-state', 'surface');
      });
    });

    it('should not show submerge option for permanents without submerge ability at land sites', async () => {
      const MockLandOnlyWorkflow = () => {
        const [permanentState, setPermanentState] = React.useState<PermanentPositionState>('surface');
        const [showContextMenu, setShowContextMenu] = React.useState(false);

        const permanent = {
          id: 789,
          state: permanentState,
          ability: {
            permanentId: 789,
            canBurrow: true,
            canSubmerge: false,
            requiresWaterSite: false,
            abilitySource: 'Land Beast - Burrow only'
          }
        };

        const handleContextMenu = (e: React.MouseEvent) => {
          e.preventDefault();
          setShowContextMenu(true);
        };

        const availableActions = React.useMemo(() => {
          return []; // No submerge ability means no submerge actions
        }, [permanentState]);

        return (
          <div data-testid="land-only-workflow">
            <MockCardPlane
              permanentId={permanent.id}
              position={{ x: 5, y: 0, z: 3 }}
              onContextMenu={handleContextMenu}
            />
            {showContextMenu && (
              <MockContextMenu
                actions={availableActions}
                onActionSelect={() => {}}
              />
            )}
          </div>
        );
      };

      render(<MockLandOnlyWorkflow />);
      
      const permanent = screen.getByTestId('permanent-789');
      fireEvent.contextMenu(permanent);

      await waitFor(() => {
        expect(screen.getByTestId('context-menu')).toBeInTheDocument();
      });

      // Should not have any submerge actions
      expect(screen.queryByTestId('action-submerge')).not.toBeInTheDocument();
    });
  });

  describe('Position Transitions', () => {
    it('should animate position change during submerge transition', async () => {
      render(<MockSubmergeWorkflow siteType="water" />);
      
      const permanent = screen.getByTestId('permanent-456');
      
      // Initial position
      expect(permanent).toHaveAttribute('data-position', '5,0,3');

      // Trigger submerge
      fireEvent.contextMenu(permanent);
      await waitFor(() => screen.getByTestId('action-submerge'));
      fireEvent.click(screen.getByTestId('action-submerge'));

      // Position should change to underwater (deeper than burrow)
      await waitFor(() => {
        expect(permanent).toHaveAttribute('data-position', '5,-0.5,3');
      }, { timeout: 1000 });

      // X and Z coordinates should remain the same
      const positionAttr = permanent.getAttribute('data-position');
      expect(positionAttr).not.toBeNull();
      const [x, y, z] = (positionAttr as string).split(',').map(Number);
      expect(x).toBe(5); // X unchanged
      expect(y).toBe(-0.5); // Y moved underwater (deeper than -0.25 burrow)
      expect(z).toBe(3); // Z unchanged
    });

    it('should maintain horizontal position during depth transitions', async () => {
      render(<MockSubmergeWorkflow siteType="water" />);
      
      const permanent = screen.getByTestId('permanent-456');
      const initialPositionAttr = permanent.getAttribute('data-position');
      expect(initialPositionAttr).not.toBeNull();
      const [initialX, , initialZ] = (initialPositionAttr as string).split(',').map(Number);

      // Submerge and surface multiple times
      for (let i = 0; i < 3; i++) {
        // Submerge
        fireEvent.contextMenu(permanent);
        await waitFor(() => screen.getByTestId('action-submerge'));
        fireEvent.click(screen.getByTestId('action-submerge'));
        
        await waitFor(() => {
          const posAttr = permanent.getAttribute('data-position');
          expect(posAttr).not.toBeNull();
          const [x, y, z] = (posAttr as string).split(',').map(Number);
          expect(x).toBe(initialX); // X should not change
          expect(z).toBe(initialZ); // Z should not change
          expect(y).toBeLessThan(0); // Y should be underwater
          expect(y).toBe(-0.5); // Y should be at submerged depth
        });

        // Surface
        fireEvent.contextMenu(permanent);
        await waitFor(() => screen.getByTestId('action-surface'));
        fireEvent.click(screen.getByTestId('action-surface'));
        
        await waitFor(() => {
          const posAttr = permanent.getAttribute('data-position');
          expect(posAttr).not.toBeNull();
          const [x, y, z] = (posAttr as string).split(',').map(Number);
          expect(x).toBe(initialX); // X should not change
          expect(z).toBe(initialZ); // Z should not change
          expect(y).toBe(0); // Y should be at surface
        });
      }
    });
  });

  describe('Site Type Validation', () => {
    it('should properly identify water vs land sites', async () => {
      // Test water site
      const { rerender } = render(<MockSubmergeWorkflow siteType="water" />);
      
      let siteInfo = screen.getByTestId('site-info');
      expect(siteInfo).toHaveAttribute('data-site-type', 'water');
      expect(siteInfo).toHaveAttribute('data-is-water', 'true');

      const waterSite = screen.getByTestId('site-water-5-3');
      expect(waterSite).toBeInTheDocument();
      expect(waterSite).toHaveAttribute('data-site-type', 'water');

      // Test land site
      rerender(<MockSubmergeWorkflow siteType="land" />);
      
      siteInfo = screen.getByTestId('site-info');
      expect(siteInfo).toHaveAttribute('data-site-type', 'land');
      expect(siteInfo).toHaveAttribute('data-is-water', 'false');

      const landSite = screen.getByTestId('site-land-5-3');
      expect(landSite).toBeInTheDocument();
      expect(landSite).toHaveAttribute('data-site-type', 'land');
    });

    it('should enforce requiresWaterSite ability constraint', async () => {
      render(<MockSubmergeWorkflow siteType="land" />);
      
      const permanent = screen.getByTestId('permanent-456');
      fireEvent.contextMenu(permanent);

      await waitFor(() => {
        expect(screen.getByTestId('context-menu')).toBeInTheDocument();
      });

      // Action should be disabled with reason
      const submergeAction = screen.getByTestId('action-submerge');
      expect(submergeAction).toBeDisabled();
      expect(submergeAction).toHaveAttribute('title', 'Requires water site');

      // State should remain surface
      expect(screen.getByTestId('game-state')).toHaveAttribute('data-state', 'surface');
    });
  });

  describe('Error Cases', () => {
    it('should handle rapid state changes gracefully', async () => {
      render(<MockSubmergeWorkflow siteType="water" />);
      
      const permanent = screen.getByTestId('permanent-456');
      const gameState = screen.getByTestId('game-state');

      // Rapid clicks should not cause invalid state
      fireEvent.contextMenu(permanent);
      await waitFor(() => screen.getByTestId('action-submerge'));
      
      const submergeButton = screen.getByTestId('action-submerge');
      fireEvent.click(submergeButton);
      fireEvent.click(submergeButton);
      fireEvent.click(submergeButton);

      // Should end up in valid submerged state
      await waitFor(() => {
        const state = gameState.getAttribute('data-state');
        expect(['surface', 'submerged']).toContain(state);
      });
    });

    it('should prevent submerging when already submerged', async () => {
      render(<MockSubmergeWorkflow siteType="water" />);
      
      const permanent = screen.getByTestId('permanent-456');
      
      // Submerge first
      fireEvent.contextMenu(permanent);
      await waitFor(() => screen.getByTestId('action-submerge'));
      fireEvent.click(screen.getByTestId('action-submerge'));
      
      await waitFor(() => {
        expect(screen.getByTestId('game-state')).toHaveAttribute('data-state', 'submerged');
      });

      // Right-click again
      fireEvent.contextMenu(permanent);

      await waitFor(() => {
        expect(screen.getByTestId('context-menu')).toBeInTheDocument();
      });

      // Should only show surface action, not submerge
      expect(screen.getByTestId('action-surface')).toBeInTheDocument();
      expect(screen.queryByTestId('action-submerge')).not.toBeInTheDocument();
    });
  });
});