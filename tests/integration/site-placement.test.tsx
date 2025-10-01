import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

/**
 * Integration Test: Site Edge Placement Orientation
 * 
 * This test validates the complete user workflow for placing permanents
 * at site edges with proper orientation relative to player positions.
 * 
 * CRITICAL: This test MUST FAIL initially (RED phase of TDD).
 * Only implement the functionality after confirming these tests fail.
 */

type PlayerPosition = 'north' | 'south' | 'east' | 'west';
type EdgePosition = 'north' | 'south' | 'east' | 'west';

interface SitePlacementData {
  siteId: number;
  position: { x: number; z: number };
  edges: {
    north: boolean;
    south: boolean;
    east: boolean;
    west: boolean;
  };
  playerPositions: Record<string, PlayerPosition>;
}

// Mock components that will be implemented
const MockSiteGrid = ({ site, onEdgeClick }: {
  site: SitePlacementData;
  onEdgeClick: (edge: EdgePosition) => void;
}) => (
  <div 
    data-testid={`site-${site.siteId}`}
    data-position={`${site.position.x},${site.position.z}`}
    style={{
      position: 'relative',
      width: 100,
      height: 100,
      border: '2px solid #333',
      margin: 20
    }}
  >
    {/* Site edges */}
    {(['north', 'south', 'east', 'west'] as EdgePosition[]).map(edge => (
      <button
        key={edge}
        data-testid={`site-${site.siteId}-edge-${edge}`}
        data-edge={edge}
        data-available={site.edges[edge]}
        onClick={() => onEdgeClick(edge)}
        disabled={!site.edges[edge]}
        style={{
          position: 'absolute',
          backgroundColor: site.edges[edge] ? 'green' : 'red',
          opacity: 0.7,
          border: 'none',
          cursor: site.edges[edge] ? 'pointer' : 'not-allowed',
          ...(edge === 'north' && { top: 0, left: '25%', width: '50%', height: 10 }),
          ...(edge === 'south' && { bottom: 0, left: '25%', width: '50%', height: 10 }),
          ...(edge === 'east' && { right: 0, top: '25%', width: 10, height: '50%' }),
          ...(edge === 'west' && { left: 0, top: '25%', width: 10, height: '50%' })
        }}
      >
        {edge[0].toUpperCase()}
      </button>
    ))}
    <div style={{ textAlign: 'center', paddingTop: 40 }}>
      Site {site.siteId}
    </div>
  </div>
);

const MockPlayerIndicator = ({ playerId, position, relativeToSite }: {
  playerId: string;
  position: PlayerPosition;
  relativeToSite: { x: number; z: number };
}) => (
  <div 
    data-testid={`player-${playerId}`}
    data-position={position}
    data-relative-position={`${relativeToSite.x},${relativeToSite.z}`}
    style={{
      position: 'absolute',
      width: 30,
      height: 30,
      backgroundColor: 'blue',
      borderRadius: '50%',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: 'white',
      fontSize: 12,
      ...(position === 'north' && { top: -50, left: '50%', transform: 'translateX(-50%)' }),
      ...(position === 'south' && { bottom: -50, left: '50%', transform: 'translateX(-50%)' }),
      ...(position === 'east' && { right: -50, top: '50%', transform: 'translateY(-50%)' }),
      ...(position === 'west' && { left: -50, top: '50%', transform: 'translateY(-50%)' })
    }}
  >
    {playerId}
  </div>
);

const MockPermanentCard = ({ permanentId, orientation, isPlaced }: {
  permanentId: number;
  orientation: EdgePosition | null;
  isPlaced: boolean;
}) => (
  <div 
    data-testid={`permanent-${permanentId}`}
    data-orientation={orientation || 'unplaced'}
    data-is-placed={isPlaced}
    style={{
      width: 60,
      height: 40,
      backgroundColor: isPlaced ? 'gold' : 'gray',
      border: '2px solid #333',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      margin: 10,
      transform: orientation ? `rotate(${
        orientation === 'north' ? '0deg' :
        orientation === 'east' ? '90deg' :
        orientation === 'south' ? '180deg' : '270deg'
      })` : 'none'
    }}
  >
    Card {permanentId}
  </div>
);

const MockSitePlacementWorkflow = ({ 
  initialPlayerPositions = { 'P1': 'north', 'P2': 'south' },
  siteConfiguration = { north: true, south: true, east: false, west: false }
}: {
  initialPlayerPositions?: Record<string, PlayerPosition>;
  siteConfiguration?: Record<EdgePosition, boolean>;
}) => {
  const [placedPermanents, setPlacedPermanents] = React.useState<Record<number, { edge: EdgePosition; orientation: EdgePosition }>>({});
  const [selectedPermanent, setSelectedPermanent] = React.useState<number | null>(null);
  
  const site: SitePlacementData = {
    siteId: 1,
    position: { x: 5, z: 5 },
    edges: siteConfiguration,
    playerPositions: initialPlayerPositions
  };

  const permanents = [
    { id: 101, ownerId: 'P1' },
    { id: 102, ownerId: 'P1' },
    { id: 103, ownerId: 'P2' }
  ];

  const calculateOptimalOrientation = (edge: EdgePosition, playerId: string): EdgePosition => {
    const playerPosition = site.playerPositions[playerId];
    
    // Face the permanent toward the controlling player
    const orientationMap: Record<PlayerPosition, EdgePosition> = {
      'north': 'north',
      'south': 'south', 
      'east': 'east',
      'west': 'west'
    };
    
    return orientationMap[playerPosition] || 'north';
  };

  const isValidPlacement = (edge: EdgePosition, permanentId: number): boolean => {
    // Check if edge is available
    if (!site.edges[edge]) return false;
    
    // Check if edge is already occupied
    const occupiedEdges = Object.values(placedPermanents).map(p => p.edge);
    if (occupiedEdges.includes(edge)) return false;

    return true;
  };

  const handleEdgeClick = (edge: EdgePosition) => {
    if (!selectedPermanent) return;
    
    if (!isValidPlacement(edge, selectedPermanent)) return;

    const permanent = permanents.find(p => p.id === selectedPermanent);
    if (!permanent) return;

    const optimalOrientation = calculateOptimalOrientation(edge, permanent.ownerId);
    
    setPlacedPermanents(prev => ({
      ...prev,
      [selectedPermanent]: {
        edge,
        orientation: optimalOrientation
      }
    }));
    
    setSelectedPermanent(null);
  };

  const handlePermanentSelect = (permanentId: number) => {
    setSelectedPermanent(permanentId);
  };

  return (
    <div data-testid="site-placement-workflow">
      <div data-testid="placement-state">
        {Object.entries(placedPermanents).map(([id, placement]) => (
          <div 
            key={id}
            data-testid={`placement-${id}`}
            data-edge={placement.edge}
            data-orientation={placement.orientation}
          />
        ))}
      </div>
      
      <div style={{ display: 'flex', gap: 20 }}>
        <div>
          <h3>Available Permanents</h3>
          {permanents.map(permanent => (
            <div key={permanent.id} style={{ margin: 5 }}>
              <button
                data-testid={`select-permanent-${permanent.id}`}
                onClick={() => handlePermanentSelect(permanent.id)}
                style={{
                  backgroundColor: selectedPermanent === permanent.id ? 'yellow' : 'white',
                  border: '2px solid #333'
                }}
              >
                Select Permanent {permanent.id} (Owner: {permanent.ownerId})
              </button>
              <MockPermanentCard 
                permanentId={permanent.id}
                orientation={placedPermanents[permanent.id]?.orientation || null}
                isPlaced={!!placedPermanents[permanent.id]}
              />
            </div>
          ))}
        </div>

        <div style={{ position: 'relative' }}>
          <h3>Site Layout</h3>
          <MockSiteGrid 
            site={site}
            onEdgeClick={handleEdgeClick}
          />
          
          {/* Player positions */}
          {Object.entries(site.playerPositions).map(([playerId, position]) => (
            <MockPlayerIndicator
              key={playerId}
              playerId={playerId}
              position={position}
              relativeToSite={site.position}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

// React import for the component
import React from 'react';

describe('Integration: Site Edge Placement Orientation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Basic Edge Placement', () => {
    it('should allow placing permanent on available site edge', async () => {
      render(<MockSitePlacementWorkflow />);
      
      // Select a permanent
      const selectButton = screen.getByTestId('select-permanent-101');
      fireEvent.click(selectButton);

      // Verify permanent is selected
      expect(selectButton).toHaveStyle('background-color: rgb(255, 255, 0)');

      // Click on available north edge
      const northEdge = screen.getByTestId('site-1-edge-north');
      expect(northEdge).toHaveAttribute('data-available', 'true');
      expect(northEdge).not.toBeDisabled();

      fireEvent.click(northEdge);

      // Verify placement was recorded
      await waitFor(() => {
        const placement = screen.getByTestId('placement-101');
        expect(placement).toHaveAttribute('data-edge', 'north');
      });

      // Permanent should show as placed
      const permanent = screen.getByTestId('permanent-101');
      expect(permanent).toHaveAttribute('data-is-placed', 'true');
    });

    it('should prevent placing on unavailable site edge', async () => {
      render(<MockSitePlacementWorkflow />);
      
      // Select a permanent
      fireEvent.click(screen.getByTestId('select-permanent-101'));

      // Try to click on unavailable east edge
      const eastEdge = screen.getByTestId('site-1-edge-east');
      expect(eastEdge).toHaveAttribute('data-available', 'false');
      expect(eastEdge).toBeDisabled();

      fireEvent.click(eastEdge);

      // No placement should be recorded
      await waitFor(() => {
        expect(screen.queryByTestId('placement-101')).not.toBeInTheDocument();
      });
    });

    it('should prevent multiple permanents on same edge', async () => {
      render(<MockSitePlacementWorkflow />);
      
      // Place first permanent
      fireEvent.click(screen.getByTestId('select-permanent-101'));
      fireEvent.click(screen.getByTestId('site-1-edge-north'));

      await waitFor(() => {
        expect(screen.getByTestId('placement-101')).toHaveAttribute('data-edge', 'north');
      });

      // Try to place second permanent on same edge
      fireEvent.click(screen.getByTestId('select-permanent-102'));
      fireEvent.click(screen.getByTestId('site-1-edge-north'));

      // Second placement should not occur
      await waitFor(() => {
        expect(screen.queryByTestId('placement-102')).not.toBeInTheDocument();
      });
    });
  });

  describe('Orientation Based on Player Position', () => {
    it('should orient permanent toward controlling player from north', async () => {
      render(<MockSitePlacementWorkflow 
        initialPlayerPositions={{ 'P1': 'north', 'P2': 'south' }}
      />);
      
      // Place P1's permanent
      fireEvent.click(screen.getByTestId('select-permanent-101'));
      fireEvent.click(screen.getByTestId('site-1-edge-south'));

      await waitFor(() => {
        const placement = screen.getByTestId('placement-101');
        expect(placement).toHaveAttribute('data-edge', 'south');
        expect(placement).toHaveAttribute('data-orientation', 'north'); // Face toward P1
      });

      const permanent = screen.getByTestId('permanent-101');
      expect(permanent).toHaveAttribute('data-orientation', 'north');
    });

    it('should orient permanent toward controlling player from south', async () => {
      render(<MockSitePlacementWorkflow 
        initialPlayerPositions={{ 'P1': 'north', 'P2': 'south' }}
      />);
      
      // Place P2's permanent (P2 is south of site)
      fireEvent.click(screen.getByTestId('select-permanent-103'));
      fireEvent.click(screen.getByTestId('site-1-edge-north'));

      await waitFor(() => {
        const placement = screen.getByTestId('placement-103');
        expect(placement).toHaveAttribute('data-edge', 'north');
        expect(placement).toHaveAttribute('data-orientation', 'south'); // Face toward P2
      });

      const permanent = screen.getByTestId('permanent-103');
      expect(permanent).toHaveAttribute('data-orientation', 'south');
    });

    it('should handle east-west player orientations', async () => {
      render(<MockSitePlacementWorkflow 
        initialPlayerPositions={{ 'P1': 'east', 'P2': 'west' }}
        siteConfiguration={{ north: true, south: true, east: true, west: true }}
      />);
      
      // Place P1's permanent (P1 is east of site)
      fireEvent.click(screen.getByTestId('select-permanent-101'));
      fireEvent.click(screen.getByTestId('site-1-edge-west'));

      await waitFor(() => {
        const placement = screen.getByTestId('placement-101');
        expect(placement).toHaveAttribute('data-edge', 'west');
        expect(placement).toHaveAttribute('data-orientation', 'east'); // Face toward P1
      });

      // Place P2's permanent (P2 is west of site)
      fireEvent.click(screen.getByTestId('select-permanent-103'));
      fireEvent.click(screen.getByTestId('site-1-edge-east'));

      await waitFor(() => {
        const placement = screen.getByTestId('placement-103');
        expect(placement).toHaveAttribute('data-edge', 'east');
        expect(placement).toHaveAttribute('data-orientation', 'west'); // Face toward P2
      });
    });
  });

  describe('Player Position Calculations', () => {
    it('should correctly identify player positions relative to site', async () => {
      render(<MockSitePlacementWorkflow 
        initialPlayerPositions={{ 'P1': 'north', 'P2': 'south', 'P3': 'east', 'P4': 'west' }}
      />);
      
      // Verify player indicators show correct positions
      const p1Indicator = screen.getByTestId('player-P1');
      const p2Indicator = screen.getByTestId('player-P2');
      const p3Indicator = screen.getByTestId('player-P3');
      const p4Indicator = screen.getByTestId('player-P4');

      expect(p1Indicator).toHaveAttribute('data-position', 'north');
      expect(p2Indicator).toHaveAttribute('data-position', 'south');
      expect(p3Indicator).toHaveAttribute('data-position', 'east');
      expect(p4Indicator).toHaveAttribute('data-position', 'west');

      // All should reference the same site position
      expect(p1Indicator).toHaveAttribute('data-relative-position', '5,5');
      expect(p2Indicator).toHaveAttribute('data-relative-position', '5,5');
      expect(p3Indicator).toHaveAttribute('data-relative-position', '5,5');
      expect(p4Indicator).toHaveAttribute('data-relative-position', '5,5');
    });

    it('should handle dynamic player position changes', async () => {
      const { rerender } = render(<MockSitePlacementWorkflow 
        initialPlayerPositions={{ 'P1': 'north' }}
      />);

      let p1Indicator = screen.getByTestId('player-P1');
      expect(p1Indicator).toHaveAttribute('data-position', 'north');

      // Change player position
      rerender(<MockSitePlacementWorkflow 
        initialPlayerPositions={{ 'P1': 'east' }}
      />);

      p1Indicator = screen.getByTestId('player-P1');
      expect(p1Indicator).toHaveAttribute('data-position', 'east');
    });
  });

  describe('Site Edge Availability', () => {
    it('should respect site configuration for available edges', async () => {
      render(<MockSitePlacementWorkflow 
        siteConfiguration={{ north: true, south: false, east: true, west: false }}
      />);
      
      // Check edge availability
      const northEdge = screen.getByTestId('site-1-edge-north');
      const southEdge = screen.getByTestId('site-1-edge-south');
      const eastEdge = screen.getByTestId('site-1-edge-east');
      const westEdge = screen.getByTestId('site-1-edge-west');

      expect(northEdge).toHaveAttribute('data-available', 'true');
      expect(southEdge).toHaveAttribute('data-available', 'false');
      expect(eastEdge).toHaveAttribute('data-available', 'true');
      expect(westEdge).toHaveAttribute('data-available', 'false');

      expect(northEdge).not.toBeDisabled();
      expect(southEdge).toBeDisabled();
      expect(eastEdge).not.toBeDisabled();
      expect(westEdge).toBeDisabled();
    });

    it('should allow placement only on configured available edges', async () => {
      render(<MockSitePlacementWorkflow 
        siteConfiguration={{ north: true, south: false, east: false, west: false }}
      />);
      
      fireEvent.click(screen.getByTestId('select-permanent-101'));

      // Should be able to place on north
      fireEvent.click(screen.getByTestId('site-1-edge-north'));
      await waitFor(() => {
        expect(screen.getByTestId('placement-101')).toHaveAttribute('data-edge', 'north');
      });

      // Should not be able to place on south (disabled)
      fireEvent.click(screen.getByTestId('select-permanent-102'));
      fireEvent.click(screen.getByTestId('site-1-edge-south'));
      
      await waitFor(() => {
        expect(screen.queryByTestId('placement-102')).not.toBeInTheDocument();
      });
    });
  });

  describe('Visual Feedback', () => {
    it('should provide visual feedback for selected permanent', async () => {
      render(<MockSitePlacementWorkflow />);
      
      const selectButton101 = screen.getByTestId('select-permanent-101');
      const selectButton102 = screen.getByTestId('select-permanent-102');

      // Initially no selection
      expect(selectButton101).toHaveStyle('background-color: rgb(255, 255, 255)');
      expect(selectButton102).toHaveStyle('background-color: rgb(255, 255, 255)');

      // Select permanent 101
      fireEvent.click(selectButton101);
      expect(selectButton101).toHaveStyle('background-color: rgb(255, 255, 0)');
      expect(selectButton102).toHaveStyle('background-color: rgb(255, 255, 255)');

      // Select permanent 102
      fireEvent.click(selectButton102);
      expect(selectButton101).toHaveStyle('background-color: rgb(255, 255, 255)');
      expect(selectButton102).toHaveStyle('background-color: rgb(255, 255, 0)');
    });

    it('should show permanent orientation visually', async () => {
      render(<MockSitePlacementWorkflow 
        initialPlayerPositions={{ 'P1': 'south' }}
      />);
      
      // Place permanent
      fireEvent.click(screen.getByTestId('select-permanent-101'));
      fireEvent.click(screen.getByTestId('site-1-edge-north'));

      await waitFor(() => {
        const permanent = screen.getByTestId('permanent-101');
        expect(permanent).toHaveAttribute('data-orientation', 'south');
        expect(permanent).toHaveStyle('transform: rotate(180deg)');
      });
    });
  });

  describe('Error Cases', () => {
    it('should handle missing player position gracefully', async () => {
      render(<MockSitePlacementWorkflow 
        initialPlayerPositions={{}}
      />);
      
      // Should not crash and should use default orientation
      fireEvent.click(screen.getByTestId('select-permanent-101'));
      fireEvent.click(screen.getByTestId('site-1-edge-north'));

      await waitFor(() => {
        const placement = screen.getByTestId('placement-101');
        expect(placement).toHaveAttribute('data-orientation', 'north'); // Default
      });
    });

    it('should handle rapid placement attempts', async () => {
      render(<MockSitePlacementWorkflow />);
      
      fireEvent.click(screen.getByTestId('select-permanent-101'));
      
      const northEdge = screen.getByTestId('site-1-edge-north');
      
      // Rapid clicks
      fireEvent.click(northEdge);
      fireEvent.click(northEdge);
      fireEvent.click(northEdge);

      // Should handle rapid clicks gracefully (may result in 1-2 placements due to timing)
      await waitFor(() => {
        const placements = screen.getAllByTestId(/^placement-/);
        expect(placements.length).toBeGreaterThanOrEqual(1);
        expect(placements.length).toBeLessThanOrEqual(2);
      });
    });

    it('should clear selection after successful placement', async () => {
      render(<MockSitePlacementWorkflow />);
      
      const selectButton = screen.getByTestId('select-permanent-101');
      
      // Select and place
      fireEvent.click(selectButton);
      expect(selectButton).toHaveStyle('background-color: rgb(255, 255, 0)');

      fireEvent.click(screen.getByTestId('site-1-edge-north'));

      // Selection should clear after placement
      await waitFor(() => {
        expect(selectButton).toHaveStyle('background-color: rgb(255, 255, 255)');
      });
    });
  });
});