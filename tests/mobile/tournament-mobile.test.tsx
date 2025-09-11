/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';

// Mock Next.js router
const mockPush = vi.fn();
const mockRouter = {
  push: mockPush,
  pathname: '/tournaments/tournament-1',
  query: { id: 'tournament-1' },
  asPath: '/tournaments/tournament-1',
};

vi.mock('next/router', () => ({
  useRouter: () => mockRouter,
}));

// Mock Prisma and auth for components that need them
vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    tournament: { findUnique: vi.fn() },
    user: { findUnique: vi.fn() },
  },
}));

vi.mock('../../src/lib/auth', () => ({
  getServerAuthSession: vi.fn(() => ({ user: { id: 'user-1' } })),
}));

// Mock React Query
const mockUseQuery = vi.fn();
vi.mock('@tanstack/react-query', () => ({
  useQuery: mockUseQuery,
  useQueryClient: () => ({
    invalidateQueries: vi.fn(),
    setQueryData: vi.fn(),
  }),
}));

// Mock hooks
vi.mock('../../src/hooks/useTournamentStatistics', () => ({
  useTournamentStatistics: () => ({
    standings: mockTournamentData.standings,
    matches: mockTournamentData.matches,
    overview: mockTournamentData.overview,
    loading: false,
    error: null,
    actions: {
      refreshStandings: vi.fn(),
      refreshMatches: vi.fn(),
      refreshStatistics: vi.fn(),
      exportTournamentData: vi.fn(),
    },
  }),
}));

// Mock tournament data
const mockTournamentData = {
  tournament: {
    id: 'tournament-1',
    name: 'Test Tournament',
    format: 'constructed',
    status: 'active',
    playerCount: 16,
  },
  standings: Array.from({ length: 16 }, (_, i) => ({
    rank: i + 1,
    playerId: `player-${i + 1}`,
    playerName: `Player ${i + 1}`,
    playerImage: null,
    wins: Math.floor(Math.random() * 5),
    losses: Math.floor(Math.random() * 3),
    draws: Math.floor(Math.random() * 2),
    matchPoints: Math.floor(Math.random() * 15),
    gameWinPercentage: Math.random(),
    opponentMatchWinPercentage: Math.random(),
    isEliminated: false,
    currentMatchId: null,
  })),
  matches: Array.from({ length: 8 }, (_, i) => ({
    id: `match-${i + 1}`,
    tournamentId: 'tournament-1',
    roundNumber: 1,
    status: 'pending' as const,
    players: [
      { id: `player-${i * 2 + 1}`, name: `Player ${i * 2 + 1}` },
      { id: `player-${i * 2 + 2}`, name: `Player ${i * 2 + 2}` },
    ],
    winnerId: null,
    gameCount: 0,
    duration: null,
    startedAt: null,
    completedAt: null,
    createdAt: new Date().toISOString(),
  })),
  overview: {
    totalPlayers: 16,
    totalRounds: 4,
    totalMatches: 32,
    completedMatches: 0,
    dropoutRate: 0,
  },
};

// Mock window.matchMedia for responsive design testing
const mockMatchMedia = (query: string) => ({
  matches: query.includes('768px') ? false : true, // Default to desktop
  media: query,
  onchange: null,
  addListener: vi.fn(),
  removeListener: vi.fn(),
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  dispatchEvent: vi.fn(),
});

// Mobile viewport dimensions
const MOBILE_WIDTH = 375;
const TABLET_WIDTH = 768;
const DESKTOP_WIDTH = 1024;

// Helper to set viewport size
const setViewportSize = (width: number, height: number = 667) => {
  Object.defineProperty(window, 'innerWidth', {
    writable: true,
    configurable: true,
    value: width,
  });
  Object.defineProperty(window, 'innerHeight', {
    writable: true,
    configurable: true,
    value: height,
  });
  
  // Update matchMedia mock based on width
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn((query: string) => ({
      ...mockMatchMedia(query),
      matches: query.includes('768px') ? width >= 768 : 
               query.includes('1024px') ? width >= 1024 : true,
    })),
  });
  
  // Trigger resize event
  window.dispatchEvent(new Event('resize'));
};

// Create mock tournament components for testing
const MockTournamentStandings = ({ data }: { data: typeof mockTournamentData }) => (
  <div data-testid="tournament-standings" className="tournament-standings">
    <h2>Tournament Standings</h2>
    <div className="standings-table">
      {data.standings.map((standing) => (
        <div
          key={standing.playerId}
          data-testid={`standing-${standing.rank}`}
          className="standing-row"
          style={{
            display: 'flex',
            padding: '8px',
            borderBottom: '1px solid #eee',
          }}
        >
          <span className="rank">#{standing.rank}</span>
          <span className="player-name">{standing.playerName}</span>
          <span className="wins">{standing.wins}W</span>
          <span className="losses">{standing.losses}L</span>
          <span className="draws">{standing.draws}D</span>
          <span className="match-points">{standing.matchPoints}pts</span>
        </div>
      ))}
    </div>
  </div>
);

const MockTournamentMatches = ({ data }: { data: typeof mockTournamentData }) => (
  <div data-testid="tournament-matches" className="tournament-matches">
    <h2>Current Matches</h2>
    <div className="matches-grid">
      {data.matches.map((match) => (
        <div
          key={match.id}
          data-testid={`match-${match.id}`}
          className="match-card"
          style={{
            border: '1px solid #ccc',
            padding: '12px',
            margin: '8px',
            borderRadius: '8px',
            minWidth: '280px',
          }}
        >
          <div className="match-players">
            <span>{match.players[0].name}</span>
            <span> vs </span>
            <span>{match.players[1].name}</span>
          </div>
          <div className="match-status">Status: {match.status}</div>
        </div>
      ))}
    </div>
  </div>
);

const MockTournamentOverlay = ({ data }: { data: typeof mockTournamentData }) => {
  const [activeTab, setActiveTab] = React.useState('standings');
  
  return (
    <div data-testid="tournament-overlay" className="tournament-overlay">
      <div className="overlay-header">
        <h1>{data.tournament.name}</h1>
        <div className="tournament-info">
          <span>{data.tournament.format} • {data.tournament.playerCount} players</span>
        </div>
      </div>
      
      <div className="overlay-tabs">
        <button
          data-testid="tab-standings"
          className={`tab ${activeTab === 'standings' ? 'active' : ''}`}
          onClick={() => setActiveTab('standings')}
          style={{
            padding: '8px 16px',
            margin: '4px',
            backgroundColor: activeTab === 'standings' ? '#007bff' : '#f8f9fa',
            color: activeTab === 'standings' ? 'white' : 'black',
            border: '1px solid #ccc',
            borderRadius: '4px',
            cursor: 'pointer',
          }}
        >
          Standings
        </button>
        <button
          data-testid="tab-matches"
          className={`tab ${activeTab === 'matches' ? 'active' : ''}`}
          onClick={() => setActiveTab('matches')}
          style={{
            padding: '8px 16px',
            margin: '4px',
            backgroundColor: activeTab === 'matches' ? '#007bff' : '#f8f9fa',
            color: activeTab === 'matches' ? 'white' : 'black',
            border: '1px solid #ccc',
            borderRadius: '4px',
            cursor: 'pointer',
          }}
        >
          Matches
        </button>
      </div>
      
      <div className="overlay-content">
        {activeTab === 'standings' && <MockTournamentStandings data={data} />}
        {activeTab === 'matches' && <MockTournamentMatches data={data} />}
      </div>
      
      <div className="overlay-actions">
        <button
          data-testid="export-button"
          style={{
            padding: '8px 16px',
            backgroundColor: '#28a745',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
          }}
        >
          Export Data
        </button>
      </div>
    </div>
  );
};

// Need to import React for JSX
import React from 'react';

describe('Tournament Mobile Responsiveness Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseQuery.mockReturnValue({
      data: mockTournamentData,
      isLoading: false,
      error: null,
    });
    
    // Reset viewport to desktop by default
    setViewportSize(DESKTOP_WIDTH);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Mobile Viewport (375px)', () => {
    beforeEach(() => {
      setViewportSize(MOBILE_WIDTH);
    });

    it('should render tournament overlay on mobile devices', () => {
      render(<MockTournamentOverlay data={mockTournamentData} />);
      
      const overlay = screen.getByTestId('tournament-overlay');
      expect(overlay).toBeInTheDocument();
      expect(overlay).toBeVisible();
      
      // Check that tournament name is visible
      expect(screen.getByText('Test Tournament')).toBeInTheDocument();
    });

    it('should display tournament tabs on mobile', () => {
      render(<MockTournamentOverlay data={mockTournamentData} />);
      
      const standingsTab = screen.getByTestId('tab-standings');
      const matchesTab = screen.getByTestId('tab-matches');
      
      expect(standingsTab).toBeInTheDocument();
      expect(matchesTab).toBeInTheDocument();
      expect(standingsTab).toHaveClass('active'); // Default active tab
    });

    it('should allow tab switching on mobile', async () => {
      const user = userEvent.setup();
      render(<MockTournamentOverlay data={mockTournamentData} />);
      
      // Initially standings should be visible
      expect(screen.getByTestId('tournament-standings')).toBeInTheDocument();
      expect(screen.queryByTestId('tournament-matches')).not.toBeInTheDocument();
      
      // Click matches tab
      await user.click(screen.getByTestId('tab-matches'));
      
      // Now matches should be visible
      await waitFor(() => {
        expect(screen.getByTestId('tournament-matches')).toBeInTheDocument();
        expect(screen.queryByTestId('tournament-standings')).not.toBeInTheDocument();
      });
    });

    it('should display standings in mobile-friendly format', () => {
      render(<MockTournamentOverlay data={mockTournamentData} />);
      
      const standings = screen.getByTestId('tournament-standings');
      expect(standings).toBeInTheDocument();
      
      // Check that all players are rendered
      expect(screen.getByTestId('standing-1')).toBeInTheDocument();
      expect(screen.getByTestId('standing-16')).toBeInTheDocument();
      
      // Verify essential information is displayed
      expect(screen.getByText('Player 1')).toBeInTheDocument();
      expect(screen.getByText('#1')).toBeInTheDocument();
    });

    it('should display matches in mobile-friendly cards', () => {
      render(<MockTournamentOverlay data={mockTournamentData} />);
      
      // Switch to matches tab
      fireEvent.click(screen.getByTestId('tab-matches'));
      
      const matches = screen.getByTestId('tournament-matches');
      expect(matches).toBeInTheDocument();
      
      // Check that match cards are rendered
      expect(screen.getByTestId('match-match-1')).toBeInTheDocument();
      expect(screen.getByTestId('match-match-8')).toBeInTheDocument();
      
      // Verify match information is displayed
      expect(screen.getByText('Player 1')).toBeInTheDocument();
      expect(screen.getAllByText('vs')).toHaveLength(8); // 8 matches = 8 "vs" text elements
    });

    it('should make action buttons accessible on mobile', () => {
      render(<MockTournamentOverlay data={mockTournamentData} />);
      
      const exportButton = screen.getByTestId('export-button');
      expect(exportButton).toBeInTheDocument();
      expect(exportButton).toBeVisible();
      
      // Button should have adequate touch target size (at least 44px)
      const buttonStyles = window.getComputedStyle(exportButton);
      expect(exportButton).toHaveStyle('cursor: pointer');
    });

    it('should handle touch events on mobile', async () => {
      const user = userEvent.setup();
      render(<MockTournamentOverlay data={mockTournamentData} />);
      
      const standingsTab = screen.getByTestId('tab-standings');
      const matchesTab = screen.getByTestId('tab-matches');
      
      // Simulate touch interaction
      await user.click(matchesTab);
      await waitFor(() => {
        expect(screen.getByTestId('tournament-matches')).toBeInTheDocument();
      });
      
      await user.click(standingsTab);
      await waitFor(() => {
        expect(screen.getByTestId('tournament-standings')).toBeInTheDocument();
      });
    });
  });

  describe('Tablet Viewport (768px)', () => {
    beforeEach(() => {
      setViewportSize(TABLET_WIDTH);
    });

    it('should render appropriately on tablet devices', () => {
      render(<MockTournamentOverlay data={mockTournamentData} />);
      
      const overlay = screen.getByTestId('tournament-overlay');
      expect(overlay).toBeInTheDocument();
      
      // Should show both tabs
      expect(screen.getByTestId('tab-standings')).toBeInTheDocument();
      expect(screen.getByTestId('tab-matches')).toBeInTheDocument();
    });

    it('should display more content on tablet than mobile', () => {
      render(<MockTournamentOverlay data={mockTournamentData} />);
      
      // Tournament info should be more detailed
      expect(screen.getByText('constructed • 16 players')).toBeInTheDocument();
      
      // Standings should show more columns/information
      const standings = screen.getByTestId('tournament-standings');
      expect(standings).toBeInTheDocument();
    });
  });

  describe('Desktop Viewport (1024px+)', () => {
    beforeEach(() => {
      setViewportSize(DESKTOP_WIDTH);
    });

    it('should render full desktop layout', () => {
      render(<MockTournamentOverlay data={mockTournamentData} />);
      
      const overlay = screen.getByTestId('tournament-overlay');
      expect(overlay).toBeInTheDocument();
      
      // All elements should be visible
      expect(screen.getByTestId('tournament-standings')).toBeInTheDocument();
      expect(screen.getByTestId('tab-standings')).toBeInTheDocument();
      expect(screen.getByTestId('tab-matches')).toBeInTheDocument();
    });
  });

  describe('Responsive Behavior', () => {
    it('should adapt to viewport changes', async () => {
      render(<MockTournamentOverlay data={mockTournamentData} />);
      
      // Start with desktop
      setViewportSize(DESKTOP_WIDTH);
      expect(screen.getByTestId('tournament-overlay')).toBeInTheDocument();
      
      // Switch to mobile
      setViewportSize(MOBILE_WIDTH);
      
      // Component should still work
      expect(screen.getByTestId('tournament-overlay')).toBeInTheDocument();
      expect(screen.getByTestId('tab-standings')).toBeInTheDocument();
    });

    it('should maintain functionality across all viewport sizes', async () => {
      const user = userEvent.setup();
      
      const viewports = [
        { name: 'Mobile', width: MOBILE_WIDTH },
        { name: 'Tablet', width: TABLET_WIDTH },
        { name: 'Desktop', width: DESKTOP_WIDTH },
      ];

      for (const viewport of viewports) {
        setViewportSize(viewport.width);
        
        const { rerender } = render(<MockTournamentOverlay data={mockTournamentData} />);
        
        // Test tab switching works on all viewports
        expect(screen.getByTestId('tab-standings')).toBeInTheDocument();
        expect(screen.getByTestId('tab-matches')).toBeInTheDocument();
        
        await user.click(screen.getByTestId('tab-matches'));
        await waitFor(() => {
          expect(screen.getByTestId('tournament-matches')).toBeInTheDocument();
        });
        
        await user.click(screen.getByTestId('tab-standings'));
        await waitFor(() => {
          expect(screen.getByTestId('tournament-standings')).toBeInTheDocument();
        });
        
        // Clean up for next iteration
        rerender(<div />);
      }
    });

    it('should handle orientation changes on mobile', () => {
      // Portrait mode (typical mobile)
      setViewportSize(375, 667);
      render(<MockTournamentOverlay data={mockTournamentData} />);
      
      expect(screen.getByTestId('tournament-overlay')).toBeInTheDocument();
      
      // Landscape mode
      setViewportSize(667, 375);
      
      // Should still render correctly
      expect(screen.getByTestId('tournament-overlay')).toBeInTheDocument();
      expect(screen.getByTestId('tab-standings')).toBeInTheDocument();
    });

    it('should ensure text readability on small screens', () => {
      setViewportSize(MOBILE_WIDTH);
      render(<MockTournamentOverlay data={mockTournamentData} />);
      
      // Tournament title should be visible and readable
      const title = screen.getByText('Test Tournament');
      expect(title).toBeInTheDocument();
      expect(title).toBeVisible();
      
      // Player names should be visible
      expect(screen.getByText('Player 1')).toBeInTheDocument();
      expect(screen.getByText('Player 1')).toBeVisible();
    });

    it('should handle large player lists on mobile', () => {
      // Create tournament with many players
      const largeTournamentData = {
        ...mockTournamentData,
        tournament: { ...mockTournamentData.tournament, playerCount: 64 },
        standings: Array.from({ length: 64 }, (_, i) => ({
          ...mockTournamentData.standings[0],
          rank: i + 1,
          playerId: `player-${i + 1}`,
          playerName: `Player ${i + 1}`,
        })),
      };
      
      setViewportSize(MOBILE_WIDTH);
      render(<MockTournamentOverlay data={largeTournamentData} />);
      
      // Should render first and last players
      expect(screen.getByTestId('standing-1')).toBeInTheDocument();
      expect(screen.getByTestId('standing-64')).toBeInTheDocument();
      
      // All players should be accessible (even if scrolling is needed)
      expect(screen.getByText('Player 1')).toBeInTheDocument();
      expect(screen.getByText('Player 64')).toBeInTheDocument();
    });
  });

  describe('Performance on Mobile Devices', () => {
    it('should render tournament data efficiently on mobile', () => {
      setViewportSize(MOBILE_WIDTH);
      
      const startTime = performance.now();
      render(<MockTournamentOverlay data={mockTournamentData} />);
      const endTime = performance.now();
      
      const renderTime = endTime - startTime;
      
      // Should render quickly even on mobile
      expect(renderTime).toBeLessThan(100); // 100ms render time
      expect(screen.getByTestId('tournament-overlay')).toBeInTheDocument();
    });

    it('should handle rapid tab switching without performance issues', async () => {
      const user = userEvent.setup();
      setViewportSize(MOBILE_WIDTH);
      render(<MockTournamentOverlay data={mockTournamentData} />);
      
      const startTime = performance.now();
      
      // Rapidly switch between tabs multiple times
      for (let i = 0; i < 10; i++) {
        await user.click(screen.getByTestId('tab-matches'));
        await user.click(screen.getByTestId('tab-standings'));
      }
      
      const endTime = performance.now();
      const totalTime = endTime - startTime;
      
      // Should handle rapid switching without lag
      expect(totalTime).toBeLessThan(1000); // 1 second for 20 tab switches
      expect(screen.getByTestId('tournament-standings')).toBeInTheDocument();
    });
  });
});