/**
 * Tournament Real-time Integration Tests
 * Tests for Socket.io real-time tournament functionality
 * 
 * IMPORTANT: Following TDD principles, these tests are written to FAIL FIRST
 * The actual Socket.io integration does not exist yet
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import type { 
  TournamentFormat,
  TournamentStatus 
} from '@/lib/tournament/validation';

// Mock Socket.io with comprehensive event tracking
const mockSocket = {
  emit: vi.fn(),
  on: vi.fn(),
  off: vi.fn(),
  disconnect: vi.fn(),
  connected: true,
  id: 'mock-socket-id'
};

vi.mock('socket.io-client', () => ({
  default: vi.fn(() => mockSocket)
}));

// Mock next-auth
vi.mock('next-auth/react', () => ({
  useSession: vi.fn(() => ({
    data: { user: { id: 'user-123', name: 'Test User' } },
    status: 'authenticated'
  }))
}));

describe('Tournament Real-time Integration Tests', () => {
  const mockTournament = {
    id: 'tournament-123',
    name: 'Test Tournament',
    format: 'sealed' as TournamentFormat,
    status: 'registering' as TournamentStatus,
    maxPlayers: 8,
    currentPlayers: 2,
    creatorId: 'creator-456',
    settings: {},
    createdAt: new Date().toISOString(),
    startedAt: null,
    completedAt: null
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockSocket.connected = true;
    mockSocket.on.mockImplementation((event, handler) => {
      // Store handlers for later invocation
      (mockSocket as any)[`${event}_handler`] = handler;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Tournament Registration Real-time Updates', () => {
    it('should handle real-time player join events', async () => {
      // This will fail because the hook doesn't exist yet
      const { useTournamentRealtime } = await import('@/hooks/useTournamentRealtime');
      const { TournamentCard } = await import('@/components/tournament/TournamentCard');
      
      const TestComponent = () => {
        const { tournament, playerCount } = useTournamentRealtime(mockTournament.id);
        return (
          <div>
            <TournamentCard tournament={tournament || mockTournament} />
            <div data-testid="player-count">Players: {playerCount}</div>
          </div>
        );
      };

      render(<TestComponent />);

      // Verify socket connection and subscription
      expect(mockSocket.emit).toHaveBeenCalledWith('tournament:join', {
        tournamentId: mockTournament.id
      });
      expect(mockSocket.on).toHaveBeenCalledWith('tournament:player:joined', expect.any(Function));

      // Simulate player joining
      const playerJoinedHandler = (mockSocket as any)['tournament:player:joined_handler'];
      expect(playerJoinedHandler).toBeDefined();

      playerJoinedHandler({
        playerId: 'new-player-456',
        playerName: 'New Player',
        currentPlayerCount: 3
      });

      await waitFor(() => {
        expect(screen.getByTestId('player-count')).toHaveTextContent('Players: 3');
      });
    });

    it('should handle real-time player leave events', async () => {
      const { useTournamentRealtime } = await import('@/hooks/useTournamentRealtime');
      
      const TestComponent = () => {
        const { tournament, playerCount } = useTournamentRealtime(mockTournament.id);
        return (
          <div>
            <div data-testid="player-count">Players: {playerCount}</div>
            <div data-testid="status">{tournament?.status}</div>
          </div>
        );
      };

      render(<TestComponent />);

      // Simulate player leaving
      const playerLeftHandler = (mockSocket as any)['tournament:player:left_handler'];
      playerLeftHandler({
        playerId: 'leaving-player-789',
        playerName: 'Leaving Player',
        currentPlayerCount: 1
      });

      await waitFor(() => {
        expect(screen.getByTestId('player-count')).toHaveTextContent('Players: 1');
      });
    });

    it('should handle tournament phase transitions', async () => {
      const { useTournamentRealtime } = await import('@/hooks/useTournamentRealtime');
      
      const TestComponent = () => {
        const { tournament, phase } = useTournamentRealtime(mockTournament.id);
        return (
          <div>
            <div data-testid="phase">Phase: {phase}</div>
            <div data-testid="status">Status: {tournament?.status}</div>
          </div>
        );
      };

      render(<TestComponent />);

      // Simulate phase change to preparing
      const phaseChangedHandler = (mockSocket as any)['tournament:phase:changed_handler'];
      phaseChangedHandler({
        tournamentId: mockTournament.id,
        newPhase: 'preparing',
        newStatus: 'preparing',
        startedAt: new Date().toISOString()
      });

      await waitFor(() => {
        expect(screen.getByTestId('phase')).toHaveTextContent('Phase: preparing');
        expect(screen.getByTestId('status')).toHaveTextContent('Status: preparing');
      });
    });
  });

  describe('Tournament Preparation Real-time Updates', () => {
    it('should handle real-time preparation progress updates', async () => {
      const { useTournamentPreparation } = await import('@/hooks/useTournamentPreparation');
      
      const preparingTournament = {
        ...mockTournament,
        status: 'preparing' as TournamentStatus
      };

      const TestComponent = () => {
        const { 
          preparationData, 
          playersReady, 
          totalPlayers 
        } = useTournamentPreparation(preparingTournament.id);

        return (
          <div>
            <div data-testid="ready-count">
              Ready: {playersReady}/{totalPlayers}
            </div>
            <div data-testid="preparation-status">
              {preparationData?.status}
            </div>
          </div>
        );
      };

      render(<TestComponent />);

      expect(mockSocket.on).toHaveBeenCalledWith(
        'tournament:preparation:updated', 
        expect.any(Function)
      );

      // Simulate preparation update
      const preparationUpdateHandler = (mockSocket as any)['tournament:preparation:updated_handler'];
      preparationUpdateHandler({
        tournamentId: preparingTournament.id,
        playerId: 'player-456',
        preparationStatus: 'completed',
        deckSubmitted: true,
        readyPlayerCount: 3,
        totalPlayerCount: 6
      });

      await waitFor(() => {
        expect(screen.getByTestId('ready-count')).toHaveTextContent('Ready: 3/6');
        expect(screen.getByTestId('preparation-status')).toHaveTextContent('updated');
      });
    });

    it('should handle preparation timeout warnings', async () => {
      const { useTournamentPreparation } = await import('@/hooks/useTournamentPreparation');
      
      const preparingTournament = {
        ...mockTournament,
        status: 'preparing' as TournamentStatus
      };

      const TestComponent = () => {
        const { timeRemaining, isTimedOut } = useTournamentPreparation(preparingTournament.id);
        return (
          <div>
            <div data-testid="time-remaining">Time: {timeRemaining}s</div>
            <div data-testid="timeout-status">{isTimedOut ? 'TIMED OUT' : 'ACTIVE'}</div>
          </div>
        );
      };

      render(<TestComponent />);

      // Simulate timeout warning
      const timeoutWarningHandler = (mockSocket as any)['tournament:preparation:timeout_warning_handler'];
      timeoutWarningHandler({
        tournamentId: preparingTournament.id,
        timeRemaining: 60 // 1 minute warning
      });

      await waitFor(() => {
        expect(screen.getByTestId('time-remaining')).toHaveTextContent('Time: 60s');
      });

      // Simulate actual timeout
      const timeoutHandler = (mockSocket as any)['tournament:preparation:timeout_handler'];
      timeoutHandler({
        tournamentId: preparingTournament.id,
        eliminatedPlayers: ['player-789'],
        proceedingPlayers: ['player-123', 'player-456']
      });

      await waitFor(() => {
        expect(screen.getByTestId('timeout-status')).toHaveTextContent('TIMED OUT');
      });
    });

    it('should handle draft pack distribution', async () => {
      const { useDraftSession } = await import('@/hooks/useDraftSession');
      
      const draftTournament = {
        ...mockTournament,
        format: 'draft' as TournamentFormat,
        status: 'preparing' as TournamentStatus
      };

      const TestComponent = () => {
        const { 
          currentPack, 
          pickNumber, 
          packNumber,
          draftComplete 
        } = useDraftSession(draftTournament.id);

        return (
          <div>
            <div data-testid="pack-info">
              Pack {packNumber}, Pick {pickNumber}
            </div>
            <div data-testid="cards-count">
              {currentPack?.cards?.length || 0} cards
            </div>
            <div data-testid="draft-status">
              {draftComplete ? 'COMPLETE' : 'ACTIVE'}
            </div>
          </div>
        );
      };

      render(<TestComponent />);

      expect(mockSocket.on).toHaveBeenCalledWith('draft:pack-received', expect.any(Function));

      // Simulate receiving draft pack
      const packReceivedHandler = (mockSocket as any)['draft:pack-received_handler'];
      packReceivedHandler({
        tournamentId: draftTournament.id,
        packNumber: 1,
        pickNumber: 3,
        pack: {
          cards: [
            { id: 'card1', name: 'Test Card 1' },
            { id: 'card2', name: 'Test Card 2' },
            { id: 'card3', name: 'Test Card 3' }
          ]
        }
      });

      await waitFor(() => {
        expect(screen.getByTestId('pack-info')).toHaveTextContent('Pack 1, Pick 3');
        expect(screen.getByTestId('cards-count')).toHaveTextContent('3 cards');
        expect(screen.getByTestId('draft-status')).toHaveTextContent('ACTIVE');
      });
    });
  });

  describe('Tournament Match Phase Real-time Updates', () => {
    it('should handle round start notifications', async () => {
      const { useTournamentMatches } = await import('@/hooks/useTournamentMatches');
      
      const activeTournament = {
        ...mockTournament,
        status: 'active' as TournamentStatus
      };

      const TestComponent = () => {
        const { currentRound, myMatch } = useTournamentMatches(activeTournament.id);
        return (
          <div>
            <div data-testid="current-round">Round: {currentRound}</div>
            <div data-testid="my-match">
              {myMatch ? `vs ${myMatch.opponentName}` : 'No match'}
            </div>
          </div>
        );
      };

      render(<TestComponent />);

      expect(mockSocket.on).toHaveBeenCalledWith('tournament:round:started', expect.any(Function));

      // Simulate round start
      const roundStartedHandler = (mockSocket as any)['tournament:round:started_handler'];
      roundStartedHandler({
        tournamentId: activeTournament.id,
        roundNumber: 2,
        matches: [
          {
            id: 'match-123',
            player1Id: 'user-123',
            player1Name: 'Test User',
            player2Id: 'opponent-456',
            player2Name: 'Opponent Player'
          }
        ]
      });

      await waitFor(() => {
        expect(screen.getByTestId('current-round')).toHaveTextContent('Round: 2');
        expect(screen.getByTestId('my-match')).toHaveTextContent('vs Opponent Player');
      });
    });

    it('should handle match assignment notifications', async () => {
      const { useTournamentMatches } = await import('@/hooks/useTournamentMatches');
      
      const activeTournament = {
        ...mockTournament,
        status: 'active' as TournamentStatus
      };

      const TestComponent = () => {
        const { assignments } = useTournamentMatches(activeTournament.id);
        return (
          <div>
            {assignments.map((assignment, idx) => (
              <div key={idx} data-testid={`assignment-${idx}`}>
                {assignment.message}
              </div>
            ))}
          </div>
        );
      };

      render(<TestComponent />);

      expect(mockSocket.on).toHaveBeenCalledWith('tournament:match:assigned', expect.any(Function));

      // Simulate match assignment
      const matchAssignedHandler = (mockSocket as any)['tournament:match:assigned_handler'];
      matchAssignedHandler({
        tournamentId: activeTournament.id,
        matchId: 'match-789',
        playerId: 'user-123',
        opponentId: 'opponent-999',
        opponentName: 'Strong Opponent',
        lobbyName: 'Tournament-Round2-Table1'
      });

      await waitFor(() => {
        expect(screen.getByTestId('assignment-0')).toHaveTextContent(
          expect.stringContaining('Strong Opponent')
        );
      });
    });

    it('should handle real-time statistics updates', async () => {
      const { useTournamentStatistics } = await import('@/hooks/useTournamentStatistics');
      
      const activeTournament = {
        ...mockTournament,
        status: 'active' as TournamentStatus
      };

      const TestComponent = () => {
        const { standings, lastUpdate } = useTournamentStatistics(activeTournament.id);
        return (
          <div>
            <div data-testid="standings-count">{standings.length} players</div>
            <div data-testid="last-update">
              {lastUpdate ? 'Updated' : 'No updates'}
            </div>
            {standings.map((standing, idx) => (
              <div key={standing.playerId} data-testid={`standing-${idx}`}>
                {standing.playerName}: {standing.wins}-{standing.losses}
              </div>
            ))}
          </div>
        );
      };

      render(<TestComponent />);

      expect(mockSocket.on).toHaveBeenCalledWith(
        'tournament:statistics:updated', 
        expect.any(Function)
      );

      // Simulate statistics update
      const statisticsUpdateHandler = (mockSocket as any)['tournament:statistics:updated_handler'];
      statisticsUpdateHandler({
        tournamentId: activeTournament.id,
        standings: [
          {
            playerId: 'player-1',
            playerName: 'Leader',
            wins: 2,
            losses: 0,
            draws: 0,
            matchPoints: 6,
            tiebreakers: {},
            finalRanking: null
          },
          {
            playerId: 'player-2',
            playerName: 'Runner Up',
            wins: 1,
            losses: 1,
            draws: 0,
            matchPoints: 3,
            tiebreakers: {},
            finalRanking: null
          }
        ],
        updateType: 'match-completed'
      });

      await waitFor(() => {
        expect(screen.getByTestId('standings-count')).toHaveTextContent('2 players');
        expect(screen.getByTestId('last-update')).toHaveTextContent('Updated');
        expect(screen.getByTestId('standing-0')).toHaveTextContent('Leader: 2-0');
        expect(screen.getByTestId('standing-1')).toHaveTextContent('Runner Up: 1-1');
      });
    });
  });

  describe('Connection Management and Error Handling', () => {
    it('should handle connection loss and reconnection', async () => {
      const { useTournamentConnection } = await import('@/hooks/useTournamentConnection');
      
      const TestComponent = () => {
        const { isConnected, reconnect } = useTournamentConnection(mockTournament.id);
        return (
          <div>
            <div data-testid="connection-status">
              {isConnected ? 'CONNECTED' : 'DISCONNECTED'}
            </div>
            <button onClick={reconnect} data-testid="reconnect-button">
              Reconnect
            </button>
          </div>
        );
      };

      render(<TestComponent />);

      // Initially connected
      expect(screen.getByTestId('connection-status')).toHaveTextContent('CONNECTED');

      // Simulate disconnection
      mockSocket.connected = false;
      const disconnectHandler = (mockSocket as any)['disconnect_handler'];
      if (disconnectHandler) {
        disconnectHandler({ reason: 'transport close' });
      }

      await waitFor(() => {
        expect(screen.getByTestId('connection-status')).toHaveTextContent('DISCONNECTED');
      });

      // Test reconnection
      mockSocket.connected = true;
      const reconnectHandler = (mockSocket as any)['reconnect_handler'];
      if (reconnectHandler) {
        reconnectHandler();
      }

      await waitFor(() => {
        expect(screen.getByTestId('connection-status')).toHaveTextContent('CONNECTED');
      });
    });

    it('should handle tournament-specific errors', async () => {
      const { useTournamentRealtime } = await import('@/hooks/useTournamentRealtime');
      
      const TestComponent = () => {
        const { error, clearError } = useTournamentRealtime(mockTournament.id);
        return (
          <div>
            <div data-testid="error-message">
              {error || 'No error'}
            </div>
            <button onClick={clearError} data-testid="clear-error">
              Clear Error
            </button>
          </div>
        );
      };

      render(<TestComponent />);

      expect(mockSocket.on).toHaveBeenCalledWith('tournament:error', expect.any(Function));

      // Simulate tournament error
      const errorHandler = (mockSocket as any)['tournament:error_handler'];
      errorHandler({
        tournamentId: mockTournament.id,
        code: 'PREPARATION_FAILED',
        message: 'Failed to distribute packs',
        details: { playerId: 'user-123' }
      });

      await waitFor(() => {
        expect(screen.getByTestId('error-message')).toHaveTextContent(
          'Failed to distribute packs'
        );
      });
    });

    it('should handle rate limiting gracefully', async () => {
      const { useTournamentRealtime } = await import('@/hooks/useTournamentRealtime');
      
      const TestComponent = () => {
        const { isRateLimited } = useTournamentRealtime(mockTournament.id);
        return (
          <div data-testid="rate-limit-status">
            {isRateLimited ? 'RATE LIMITED' : 'NORMAL'}
          </div>
        );
      };

      render(<TestComponent />);

      // Simulate rate limit error
      const rateLimitHandler = (mockSocket as any)['tournament:rate-limited_handler'];
      if (!rateLimitHandler) {
        // Mock the handler if it doesn't exist
        mockSocket.on.mockImplementation((event, handler) => {
          if (event === 'tournament:rate-limited') {
            handler({ 
              message: 'Too many requests', 
              retryAfter: 5000 
            });
          }
        });
      }

      await waitFor(() => {
        expect(screen.getByTestId('rate-limit-status')).toHaveTextContent('RATE LIMITED');
      });
    });
  });

  describe('Event Cleanup and Memory Management', () => {
    it('should clean up event listeners on unmount', async () => {
      const { useTournamentRealtime } = await import('@/hooks/useTournamentRealtime');
      
      const TestComponent = () => {
        useTournamentRealtime(mockTournament.id);
        return <div>Test Component</div>;
      };

      const { unmount } = render(<TestComponent />);

      // Verify listeners were added
      expect(mockSocket.on).toHaveBeenCalledTimes(expect.any(Number));
      
      // Unmount component
      unmount();

      // Verify cleanup
      expect(mockSocket.off).toHaveBeenCalledWith('tournament:player:joined');
      expect(mockSocket.off).toHaveBeenCalledWith('tournament:player:left');
      expect(mockSocket.off).toHaveBeenCalledWith('tournament:phase:changed');
      expect(mockSocket.off).toHaveBeenCalledWith('tournament:statistics:updated');
      expect(mockSocket.off).toHaveBeenCalledWith('tournament:error');
    });

    it('should handle rapid component re-renders without memory leaks', async () => {
      const { useTournamentRealtime } = await import('@/hooks/useTournamentRealtime');
      
      let renderCount = 0;
      const TestComponent = ({ tournamentId }: { tournamentId: string }) => {
        renderCount++;
        useTournamentRealtime(tournamentId);
        return <div>Render: {renderCount}</div>;
      };

      const { rerender } = render(<TestComponent tournamentId={mockTournament.id} />);

      // Re-render with same tournament ID multiple times
      for (let i = 0; i < 5; i++) {
        rerender(<TestComponent tournamentId={mockTournament.id} />);
      }

      // Should not have exponentially increasing listeners
      const onCalls = mockSocket.on.mock.calls.length;
      const offCalls = mockSocket.off.mock.calls.length;

      // Cleanup calls should be close to setup calls
      expect(Math.abs(onCalls - offCalls)).toBeLessThan(10);
    });
  });
});