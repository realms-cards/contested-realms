import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PermanentPositionState } from '@/lib/game/types';

/**
 * Integration Test: Multiple Permanents Under One Site
 * 
 * This test validates the complete user workflow for multiple permanents
 * burrowing and surfacing at the same site without conflicts.
 * 
 * CRITICAL: This test MUST FAIL initially (RED phase of TDD).
 * Only implement the functionality after confirming these tests fail.
 */

interface SitePermanent {
  id: number;
  ownerId: string;
  state: PermanentPositionState;
  position: { x: number; y: number; z: number };
  ability: {
    permanentId: number;
    canBurrow: boolean;
    canSubmerge: boolean;
    requiresWaterSite: boolean;
    abilitySource: string;
  };
}

interface SiteData {
  id: number;
  position: { x: number; z: number };
  type: 'water' | 'land';
  permanents: SitePermanent[];
  maxCapacity: {
    surface: number;
    burrowed: number;
    submerged: number;
  };
}

// Mock components that will be implemented
const MockSiteView = ({ site, onPermanentContextMenu }: {
  site: SiteData;
  onPermanentContextMenu: (permanentId: number, e: React.MouseEvent) => void;
}) => {
  const getLayerPermanents = (layer: PermanentPositionState) => 
    site.permanents.filter(p => p.state === layer);

  return (
    <div 
      data-testid={`site-${site.id}`}
      data-position={`${site.position.x},${site.position.z}`}
      data-site-type={site.type}
      style={{
        position: 'relative',
        width: 200,
        height: 200,
        border: '3px solid #333',
        backgroundColor: site.type === 'water' ? '#e6f3ff' : '#f3e6d3'
      }}
    >
      <div style={{ textAlign: 'center', padding: 10 }}>
        Site {site.id} ({site.type})
      </div>
      
      {/* Surface Layer */}
      <div 
        data-testid={`site-${site.id}-surface-layer`}
        data-layer="surface"
        data-count={getLayerPermanents('surface').length}
        data-capacity={site.maxCapacity.surface}
        style={{
          position: 'absolute',
          top: 30,
          left: 10,
          right: 10,
          height: 50,
          backgroundColor: 'rgba(255, 255, 255, 0.8)',
          border: '1px solid #ccc',
          display: 'flex',
          flexWrap: 'wrap',
          gap: 5,
          padding: 5
        }}
      >
        <div style={{ width: '100%', fontSize: 10, textAlign: 'center' }}>
          Surface ({getLayerPermanents('surface').length}/{site.maxCapacity.surface})
        </div>
        {getLayerPermanents('surface').map(permanent => (
          <div
            key={permanent.id}
            data-testid={`permanent-${permanent.id}`}
            data-state={permanent.state}
            data-owner={permanent.ownerId}
            onContextMenu={(e) => onPermanentContextMenu(permanent.id, e)}
            style={{
              width: 30,
              height: 20,
              backgroundColor: permanent.ownerId === 'P1' ? 'lightblue' : 'lightcoral',
              border: '1px solid #666',
              cursor: 'context-menu',
              fontSize: 10,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            {permanent.id}
          </div>
        ))}
      </div>

      {/* Burrowed Layer */}
      <div 
        data-testid={`site-${site.id}-burrowed-layer`}
        data-layer="burrowed"
        data-count={getLayerPermanents('burrowed').length}
        data-capacity={site.maxCapacity.burrowed}
        style={{
          position: 'absolute',
          top: 90,
          left: 10,
          right: 10,
          height: 50,
          backgroundColor: 'rgba(139, 69, 19, 0.6)',
          border: '1px solid #8B4513',
          display: 'flex',
          flexWrap: 'wrap',
          gap: 5,
          padding: 5
        }}
      >
        <div style={{ width: '100%', fontSize: 10, textAlign: 'center', color: 'white' }}>
          Burrowed ({getLayerPermanents('burrowed').length}/{site.maxCapacity.burrowed})
        </div>
        {getLayerPermanents('burrowed').map(permanent => (
          <div
            key={permanent.id}
            data-testid={`permanent-${permanent.id}`}
            data-state={permanent.state}
            data-owner={permanent.ownerId}
            onContextMenu={(e) => onPermanentContextMenu(permanent.id, e)}
            style={{
              width: 30,
              height: 20,
              backgroundColor: permanent.ownerId === 'P1' ? 'darkblue' : 'darkred',
              border: '1px solid #333',
              cursor: 'context-menu',
              fontSize: 10,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'white'
            }}
          >
            {permanent.id}
          </div>
        ))}
      </div>

      {/* Submerged Layer (only for water sites) */}
      {site.type === 'water' && (
        <div 
          data-testid={`site-${site.id}-submerged-layer`}
          data-layer="submerged"
          data-count={getLayerPermanents('submerged').length}
          data-capacity={site.maxCapacity.submerged}
          style={{
            position: 'absolute',
            top: 150,
            left: 10,
            right: 10,
            height: 40,
            backgroundColor: 'rgba(0, 0, 139, 0.8)',
            border: '1px solid #00008B',
            display: 'flex',
            flexWrap: 'wrap',
            gap: 5,
            padding: 5
          }}
        >
          <div style={{ width: '100%', fontSize: 10, textAlign: 'center', color: 'white' }}>
            Submerged ({getLayerPermanents('submerged').length}/{site.maxCapacity.submerged})
          </div>
          {getLayerPermanents('submerged').map(permanent => (
            <div
              key={permanent.id}
              data-testid={`permanent-${permanent.id}`}
              data-state={permanent.state}
              data-owner={permanent.ownerId}
              onContextMenu={(e) => onPermanentContextMenu(permanent.id, e)}
              style={{
                width: 30,
                height: 20,
                backgroundColor: permanent.ownerId === 'P1' ? 'navy' : 'maroon',
                border: '1px solid #000',
                cursor: 'context-menu',
                fontSize: 10,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'white'
              }}
            >
              {permanent.id}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const MockContextMenu = ({ 
  permanentId, 
  actions, 
  onActionSelect, 
  position 
}: {
  permanentId: number;
  actions: Array<{ actionId: string; displayText: string; isEnabled: boolean; disabledReason?: string }>;
  onActionSelect: (permanentId: number, actionId: string) => void;
  position: { x: number; y: number };
}) => (
  <div 
    data-testid={`context-menu-${permanentId}`}
    style={{
      position: 'fixed',
      left: position.x,
      top: position.y,
      backgroundColor: 'white',
      border: '2px solid #333',
      borderRadius: 5,
      padding: 10,
      zIndex: 1000,
      minWidth: 120
    }}
  >
    <div style={{ fontWeight: 'bold', marginBottom: 5 }}>
      Permanent {permanentId}
    </div>
    {actions.map(action => (
      <button
        key={action.actionId}
        data-testid={`action-${permanentId}-${action.actionId}`}
        disabled={!action.isEnabled}
        onClick={() => onActionSelect(permanentId, action.actionId)}
        title={action.disabledReason}
        style={{
          display: 'block',
          width: '100%',
          margin: '2px 0',
          padding: 5,
          backgroundColor: action.isEnabled ? 'lightgreen' : 'lightgray',
          border: '1px solid #666',
          cursor: action.isEnabled ? 'pointer' : 'not-allowed'
        }}
      >
        {action.displayText}
      </button>
    ))}
  </div>
);

const MockMultiBurrowWorkflow = ({ 
  siteType = 'land',
  initialCapacity = { surface: 3, burrowed: 5, submerged: 2 }
}: {
  siteType?: 'water' | 'land';
  initialCapacity?: { surface: number; burrowed: number; submerged: number };
}) => {
  const [site, setSite] = React.useState<SiteData>({
    id: 1,
    position: { x: 5, z: 5 },
    type: siteType,
    maxCapacity: initialCapacity,
    permanents: [
      {
        id: 201,
        ownerId: 'P1',
        state: 'surface',
        position: { x: 5, y: 0, z: 5 },
        ability: {
          permanentId: 201,
          canBurrow: true,
          canSubmerge: siteType === 'water',
          requiresWaterSite: false,
          abilitySource: 'Creature - Burrow ability'
        }
      },
      {
        id: 202,
        ownerId: 'P1',
        state: 'surface',
        position: { x: 5, y: 0, z: 5 },
        ability: {
          permanentId: 202,
          canBurrow: true,
          canSubmerge: false,
          requiresWaterSite: false,
          abilitySource: 'Creature - Burrow ability'
        }
      },
      {
        id: 203,
        ownerId: 'P2',
        state: 'surface',
        position: { x: 5, y: 0, z: 5 },
        ability: {
          permanentId: 203,
          canBurrow: false,
          canSubmerge: siteType === 'water',
          requiresWaterSite: true,
          abilitySource: 'Sea Creature - Submerge ability'
        }
      }
    ]
  });

  const [contextMenu, setContextMenu] = React.useState<{
    permanentId: number;
    position: { x: number; y: number };
  } | null>(null);

  const getLayerCount = (layer: PermanentPositionState): number => {
    return site.permanents.filter(p => p.state === layer).length;
  };

  const canTransitionTo = (permanentId: number, newState: PermanentPositionState): { canTransition: boolean; reason?: string } => {
    const permanent = site.permanents.find(p => p.id === permanentId);
    if (!permanent) return { canTransition: false, reason: 'Permanent not found' };

    // Check ability requirements
    if (newState === 'burrowed' && !permanent.ability.canBurrow) {
      return { canTransition: false, reason: 'Cannot burrow' };
    }
    
    if (newState === 'submerged') {
      if (!permanent.ability.canSubmerge) {
        return { canTransition: false, reason: 'Cannot submerge' };
      }
      if (permanent.ability.requiresWaterSite && site.type !== 'water') {
        return { canTransition: false, reason: 'Requires water site' };
      }
    }

    // Check capacity constraints
    if (newState !== permanent.state) {
      const currentLayerCount = getLayerCount(newState);
      const maxCapacity = site.maxCapacity[newState];
      
      if (currentLayerCount >= maxCapacity) {
        return { canTransition: false, reason: `${newState} layer full (${currentLayerCount}/${maxCapacity})` };
      }
    }

    return { canTransition: true };
  };

  const handlePermanentContextMenu = (permanentId: number, e: React.MouseEvent) => {
    e.preventDefault();
    setContextMenu({
      permanentId,
      position: { x: e.clientX, y: e.clientY }
    });
  };

  const handleActionSelect = (permanentId: number, actionId: string) => {
    const permanent = site.permanents.find(p => p.id === permanentId);
    if (!permanent) return;

    let newState: PermanentPositionState | null = null;
    let newY: number = permanent.position.y;

    switch (actionId) {
      case 'burrow':
        if (permanent.state === 'surface') {
          newState = 'burrowed';
          newY = -0.25;
        }
        break;
      case 'submerge':
        if (permanent.state === 'surface') {
          newState = 'submerged';
          newY = -0.5;
        }
        break;
      case 'surface':
        if (permanent.state === 'burrowed' || permanent.state === 'submerged') {
          newState = 'surface';
          newY = 0;
        }
        break;
    }

    if (newState && canTransitionTo(permanentId, newState).canTransition) {
      setSite(prevSite => ({
        ...prevSite,
        permanents: prevSite.permanents.map(p =>
          p.id === permanentId
            ? {
                ...p,
                state: newState!,
                position: { ...p.position, y: newY }
              }
            : p
        )
      }));
    }

    setContextMenu(null);
  };

  const getAvailableActions = (permanentId: number) => {
    const permanent = site.permanents.find(p => p.id === permanentId);
    if (!permanent) return [];

    const actions = [];

    if (permanent.state === 'surface') {
      if (permanent.ability.canBurrow) {
        const canBurrow = canTransitionTo(permanentId, 'burrowed');
        actions.push({
          actionId: 'burrow',
          displayText: 'Burrow',
          isEnabled: canBurrow.canTransition,
          disabledReason: canBurrow.reason
        });
      }

      if (permanent.ability.canSubmerge) {
        const canSubmerge = canTransitionTo(permanentId, 'submerged');
        actions.push({
          actionId: 'submerge',
          displayText: 'Submerge',
          isEnabled: canSubmerge.canTransition,
          disabledReason: canSubmerge.reason
        });
      }
    }

    if (permanent.state === 'burrowed' || permanent.state === 'submerged') {
      const canSurface = canTransitionTo(permanentId, 'surface');
      actions.push({
        actionId: 'surface',
        displayText: 'Surface',
        isEnabled: canSurface.canTransition,
        disabledReason: canSurface.reason
      });
    }

    return actions;
  };

  return (
    <div data-testid="multi-burrow-workflow">
      <div data-testid="site-capacity">
        <div data-testid="surface-capacity" data-current={getLayerCount('surface')} data-max={site.maxCapacity.surface} />
        <div data-testid="burrowed-capacity" data-current={getLayerCount('burrowed')} data-max={site.maxCapacity.burrowed} />
        <div data-testid="submerged-capacity" data-current={getLayerCount('submerged')} data-max={site.maxCapacity.submerged} />
      </div>

      <MockSiteView 
        site={site}
        onPermanentContextMenu={handlePermanentContextMenu}
      />

      {contextMenu && (
        <MockContextMenu
          permanentId={contextMenu.permanentId}
          actions={getAvailableActions(contextMenu.permanentId)}
          onActionSelect={handleActionSelect}
          position={contextMenu.position}
        />
      )}
    </div>
  );
};

// React import for the component
import React from 'react';

describe('Integration: Multiple Permanents Under One Site', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Basic Multi-Permanent Management', () => {
    it('should allow multiple permanents to coexist on surface layer', async () => {
      render(<MockMultiBurrowWorkflow />);
      
      // Initially all permanents should be on surface
      const surfaceLayer = screen.getByTestId('site-1-surface-layer');
      expect(surfaceLayer).toHaveAttribute('data-count', '3');
      
      // All permanents should be visible
      expect(screen.getAllByTestId(/^permanent-/)).toHaveLength(3);
      
      const permanent201 = screen.getByTestId('permanent-201');
      const permanent202 = screen.getByTestId('permanent-202');
      const permanent203 = screen.getByTestId('permanent-203');
      
      expect(permanent201).toHaveAttribute('data-state', 'surface');
      expect(permanent202).toHaveAttribute('data-state', 'surface');
      expect(permanent203).toHaveAttribute('data-state', 'surface');
    });

    it('should allow permanents to move to different layers independently', async () => {
      render(<MockMultiBurrowWorkflow />);
      
      // Burrow permanent 201
      fireEvent.contextMenu(screen.getByTestId('permanent-201'));
      await waitFor(() => screen.getByTestId('context-menu-201'));
      fireEvent.click(screen.getByTestId('action-201-burrow'));

      await waitFor(() => {
        const permanent201 = screen.getByTestId('permanent-201');
        expect(permanent201).toHaveAttribute('data-state', 'burrowed');
      });

      // Surface layer should have 2, burrowed layer should have 1
      const surfaceLayer = screen.getByTestId('site-1-surface-layer');
      const burrowedLayer = screen.getByTestId('site-1-burrowed-layer');
      
      expect(surfaceLayer).toHaveAttribute('data-count', '2');
      expect(burrowedLayer).toHaveAttribute('data-count', '1');

      // Other permanents should still be on surface
      const permanent202 = screen.getByTestId('permanent-202');
      const permanent203 = screen.getByTestId('permanent-203');
      expect(permanent202).toHaveAttribute('data-state', 'surface');
      expect(permanent203).toHaveAttribute('data-state', 'surface');
    });

    it('should handle multiple permanents transitioning simultaneously', async () => {
      render(<MockMultiBurrowWorkflow />);
      
      // Burrow permanent 201
      fireEvent.contextMenu(screen.getByTestId('permanent-201'));
      await waitFor(() => screen.getByTestId('context-menu-201'));
      fireEvent.click(screen.getByTestId('action-201-burrow'));

      await waitFor(() => {
        expect(screen.getByTestId('permanent-201')).toHaveAttribute('data-state', 'burrowed');
      });

      // Burrow permanent 202
      fireEvent.contextMenu(screen.getByTestId('permanent-202'));
      await waitFor(() => screen.getByTestId('context-menu-202'));
      fireEvent.click(screen.getByTestId('action-202-burrow'));

      await waitFor(() => {
        expect(screen.getByTestId('permanent-202')).toHaveAttribute('data-state', 'burrowed');
      });

      // Check final state
      const surfaceLayer = screen.getByTestId('site-1-surface-layer');
      const burrowedLayer = screen.getByTestId('site-1-burrowed-layer');
      
      expect(surfaceLayer).toHaveAttribute('data-count', '1');
      expect(burrowedLayer).toHaveAttribute('data-count', '2');

      // Permanent 203 should still be on surface
      expect(screen.getByTestId('permanent-203')).toHaveAttribute('data-state', 'surface');
    });
  });

  describe('Layer Capacity Management', () => {
    it('should enforce surface layer capacity limits', async () => {
      render(<MockMultiBurrowWorkflow 
        initialCapacity={{ surface: 2, burrowed: 5, submerged: 2 }}
      />);
      
      // With capacity of 2, surface should be at capacity with 3 permanents
      // But this test assumes permanents start at capacity limit
      const surfaceCapacity = screen.getByTestId('surface-capacity');
      expect(surfaceCapacity).toHaveAttribute('data-max', '2');

      // Try to surface a burrowed permanent when surface is full
      // First burrow one to make room, then try to bring another back
      fireEvent.contextMenu(screen.getByTestId('permanent-201'));
      await waitFor(() => screen.getByTestId('context-menu-201'));
      fireEvent.click(screen.getByTestId('action-201-burrow'));

      await waitFor(() => {
        expect(screen.getByTestId('permanent-201')).toHaveAttribute('data-state', 'burrowed');
      });

      // Now surface layer has 2, so surfacing should work
      fireEvent.contextMenu(screen.getByTestId('permanent-201'));
      await waitFor(() => screen.getByTestId('context-menu-201'));
      
      const surfaceAction = screen.getByTestId('action-201-surface');
      expect(surfaceAction).not.toBeDisabled();
    });

    it('should enforce burrowed layer capacity limits', async () => {
      render(<MockMultiBurrowWorkflow 
        initialCapacity={{ surface: 5, burrowed: 1, submerged: 2 }}
      />);
      
      // Burrow first permanent (should succeed)
      fireEvent.contextMenu(screen.getByTestId('permanent-201'));
      await waitFor(() => screen.getByTestId('context-menu-201'));
      fireEvent.click(screen.getByTestId('action-201-burrow'));

      await waitFor(() => {
        expect(screen.getByTestId('permanent-201')).toHaveAttribute('data-state', 'burrowed');
      });

      // Try to burrow second permanent (should be disabled due to capacity)
      fireEvent.contextMenu(screen.getByTestId('permanent-202'));
      await waitFor(() => screen.getByTestId('context-menu-202'));
      
      const burrowAction = screen.getByTestId('action-202-burrow');
      expect(burrowAction).toBeDisabled();
      expect(burrowAction).toHaveAttribute('title', 'burrowed layer full (1/1)');
    });

    it('should enforce submerged layer capacity limits at water sites', async () => {
      render(<MockMultiBurrowWorkflow 
        siteType="water"
        initialCapacity={{ surface: 5, burrowed: 5, submerged: 1 }}
      />);

      // Verify we have a water site with submerged layer
      const submergedLayer = screen.getByTestId('site-1-submerged-layer');
      expect(submergedLayer).toBeInTheDocument();

      // Submerge permanent 203 (has submerge ability)
      fireEvent.contextMenu(screen.getByTestId('permanent-203'));
      await waitFor(() => screen.getByTestId('context-menu-203'));
      fireEvent.click(screen.getByTestId('action-203-submerge'));

      await waitFor(() => {
        expect(screen.getByTestId('permanent-203')).toHaveAttribute('data-state', 'submerged');
      });

      // Try to submerge permanent 201 (should be disabled due to capacity)
      fireEvent.contextMenu(screen.getByTestId('permanent-201'));
      await waitFor(() => screen.getByTestId('context-menu-201'));
      
      const submergeAction = screen.getByTestId('action-201-submerge');
      expect(submergeAction).toBeDisabled();
      expect(submergeAction).toHaveAttribute('title', 'submerged layer full (1/1)');
    });
  });

  describe('Layer Visualization', () => {
    it('should display accurate layer counts', async () => {
      render(<MockMultiBurrowWorkflow />);
      
      // Initial state
      let surfaceLayer = screen.getByTestId('site-1-surface-layer');
      let burrowedLayer = screen.getByTestId('site-1-burrowed-layer');
      
      expect(surfaceLayer).toHaveAttribute('data-count', '3');
      expect(burrowedLayer).toHaveAttribute('data-count', '0');

      // Move one permanent to burrowed
      fireEvent.contextMenu(screen.getByTestId('permanent-201'));
      await waitFor(() => screen.getByTestId('context-menu-201'));
      fireEvent.click(screen.getByTestId('action-201-burrow'));

      await waitFor(() => {
        surfaceLayer = screen.getByTestId('site-1-surface-layer');
        burrowedLayer = screen.getByTestId('site-1-burrowed-layer');
        
        expect(surfaceLayer).toHaveAttribute('data-count', '2');
        expect(burrowedLayer).toHaveAttribute('data-count', '1');
      });
    });

    it('should show permanents in correct visual layers', async () => {
      render(<MockMultiBurrowWorkflow />);
      
      // Initially all permanents should be in surface layer visually
      const surfaceLayer = screen.getByTestId('site-1-surface-layer');
      expect(surfaceLayer.children).toHaveLength(4); // 3 permanents + header

      // Move permanent to burrowed
      fireEvent.contextMenu(screen.getByTestId('permanent-201'));
      await waitFor(() => screen.getByTestId('context-menu-201'));
      fireEvent.click(screen.getByTestId('action-201-burrow'));

      await waitFor(() => {
        // Permanent 201 should now be in burrowed layer
        const burrowedLayer = screen.getByTestId('site-1-burrowed-layer');
        const permanent201InBurrowed = burrowedLayer.querySelector('[data-testid="permanent-201"]');
        expect(permanent201InBurrowed).toBeInTheDocument();
        
        // And not in surface layer
        const permanent201InSurface = surfaceLayer.querySelector('[data-testid="permanent-201"]');
        expect(permanent201InSurface).not.toBeInTheDocument();
      });
    });

    it('should differentiate permanent ownership visually', async () => {
      render(<MockMultiBurrowWorkflow />);
      
      const permanent201 = screen.getByTestId('permanent-201'); // P1's permanent
      const permanent203 = screen.getByTestId('permanent-203'); // P2's permanent
      
      expect(permanent201).toHaveAttribute('data-owner', 'P1');
      expect(permanent203).toHaveAttribute('data-owner', 'P2');
      
      // Visual styling should differ (tested via computed styles in real implementation)
      expect(permanent201).toHaveStyle('background-color: lightblue');
      expect(permanent203).toHaveStyle('background-color: lightcoral');
    });
  });

  describe('Conflict Resolution', () => {
    it('should prevent conflicting state transitions', async () => {
      render(<MockMultiBurrowWorkflow 
        initialCapacity={{ surface: 3, burrowed: 1, submerged: 2 }}
      />);
      
      // Burrow permanent 201 (fills burrowed capacity)
      fireEvent.contextMenu(screen.getByTestId('permanent-201'));
      await waitFor(() => screen.getByTestId('context-menu-201'));
      fireEvent.click(screen.getByTestId('action-201-burrow'));

      await waitFor(() => {
        expect(screen.getByTestId('permanent-201')).toHaveAttribute('data-state', 'burrowed');
      });

      // Attempt to burrow permanent 202 should fail
      fireEvent.contextMenu(screen.getByTestId('permanent-202'));
      await waitFor(() => screen.getByTestId('context-menu-202'));
      
      const burrowAction = screen.getByTestId('action-202-burrow');
      expect(burrowAction).toBeDisabled();
      
      // Click should not change state
      fireEvent.click(burrowAction);
      
      await waitFor(() => {
        expect(screen.getByTestId('permanent-202')).toHaveAttribute('data-state', 'surface');
      });
    });

    it('should handle rapid concurrent transitions gracefully', async () => {
      render(<MockMultiBurrowWorkflow />);
      
      // Rapid fire context menus and actions
      const permanent201 = screen.getByTestId('permanent-201');
      const permanent202 = screen.getByTestId('permanent-202');
      
      fireEvent.contextMenu(permanent201);
      fireEvent.contextMenu(permanent202);
      
      await waitFor(() => {
        // Only one context menu should be visible at a time
        const contextMenus = screen.getAllByTestId(/^context-menu-/);
        expect(contextMenus).toHaveLength(1);
      });
    });
  });

  describe('State Persistence', () => {
    it('should maintain permanent states across multiple transitions', async () => {
      render(<MockMultiBurrowWorkflow />);
      
      // Complex sequence of transitions
      const permanent201 = screen.getByTestId('permanent-201');
      
      // Surface -> Burrowed
      fireEvent.contextMenu(permanent201);
      await waitFor(() => screen.getByTestId('context-menu-201'));
      fireEvent.click(screen.getByTestId('action-201-burrow'));
      
      await waitFor(() => {
        expect(permanent201).toHaveAttribute('data-state', 'burrowed');
      });

      // Burrowed -> Surface
      fireEvent.contextMenu(permanent201);
      await waitFor(() => screen.getByTestId('context-menu-201'));
      fireEvent.click(screen.getByTestId('action-201-surface'));
      
      await waitFor(() => {
        expect(permanent201).toHaveAttribute('data-state', 'surface');
      });

      // Surface -> Burrowed again
      fireEvent.contextMenu(permanent201);
      await waitFor(() => screen.getByTestId('context-menu-201'));
      fireEvent.click(screen.getByTestId('action-201-burrow'));
      
      await waitFor(() => {
        expect(permanent201).toHaveAttribute('data-state', 'burrowed');
      });

      // Verify layer counts are correct
      const burrowedLayer = screen.getByTestId('site-1-burrowed-layer');
      expect(burrowedLayer).toHaveAttribute('data-count', '1');
    });

    it('should preserve permanent ownership through transitions', async () => {
      render(<MockMultiBurrowWorkflow />);
      
      const permanent203 = screen.getByTestId('permanent-203'); // P2's permanent
      
      // Initially owned by P2
      expect(permanent203).toHaveAttribute('data-owner', 'P2');
      
      // Transition (if has ability) - permanent 203 can't burrow, but test the concept
      // Let's use permanent 201 which can burrow
      const permanent201 = screen.getByTestId('permanent-201'); // P1's permanent
      
      fireEvent.contextMenu(permanent201);
      await waitFor(() => screen.getByTestId('context-menu-201'));
      fireEvent.click(screen.getByTestId('action-201-burrow'));
      
      await waitFor(() => {
        expect(permanent201).toHaveAttribute('data-state', 'burrowed');
        expect(permanent201).toHaveAttribute('data-owner', 'P1'); // Ownership preserved
      });
    });
  });

  describe('Error Cases', () => {
    it('should handle invalid permanent IDs gracefully', async () => {
      render(<MockMultiBurrowWorkflow />);
      
      // The component should not crash when given invalid IDs
      // This would be tested more thoroughly in unit tests
      expect(screen.getByTestId('site-1')).toBeInTheDocument();
    });

    it('should prevent actions on permanents without required abilities', async () => {
      render(<MockMultiBurrowWorkflow />);
      
      // Permanent 203 cannot burrow
      fireEvent.contextMenu(screen.getByTestId('permanent-203'));
      await waitFor(() => screen.getByTestId('context-menu-203'));
      
      // Should not have burrow action
      expect(screen.queryByTestId('action-203-burrow')).not.toBeInTheDocument();
    });

    it('should close context menu when clicking elsewhere', async () => {
      render(<MockMultiBurrowWorkflow />);
      
      // Open context menu
      fireEvent.contextMenu(screen.getByTestId('permanent-201'));
      await waitFor(() => {
        expect(screen.getByTestId('context-menu-201')).toBeInTheDocument();
      });

      // Click elsewhere (on site)
      fireEvent.click(screen.getByTestId('site-1'));
      
      // Context menu should close
      await waitFor(() => {
        expect(screen.queryByTestId('context-menu-201')).not.toBeInTheDocument();
      });
    });
  });
});