/**
 * Tournament Hooks Tests
 * Tests for tournament-related React hooks following TDD principles
 * 
 * IMPORTANT: These tests are written to FAIL FIRST
 * The actual hooks do not exist yet
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import type { 
  TournamentFormat,
  TournamentStatus,
  TournamentResponse 
} from '@/lib/tournament/validation';

// Mock Socket.io
const mockSocket = {
  emit: vi.fn(),
  on: vi.fn(),
  off: vi.fn(),
  disconnect: vi.fn(),
  connected: true
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

// Mock fetch
global.fetch = vi.fn();

describe('Tournament Hooks', () => {
  const mockTournament: TournamentResponse = {
    id: 'tournament-123',
    name: 'Test Tournament',
    format: 'sealed',
    status: 'registering',
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
    mockSocket.on.mockImplementation((event, handler) => {
      (mockSocket as any)[`${event}_handler`] = handler;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('useTournamentRealtime Hook', () => {
    it('should connect to tournament and return initial state', async () => {
      const { useTournamentRealtime } = await import('@/hooks/useTournamentRealtime');
      
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockTournament)
      });

      const { result } = renderHook(() => 
        useTournamentRealtime(mockTournament.id)
      );

      expect(result.current.isLoading).toBe(true);
      expect(result.current.tournament).toBe(null);
      expect(result.current.error).toBe(null);

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
        expect(result.current.tournament).toEqual(mockTournament);
      });

      // Verify socket connection
      expect(mockSocket.emit).toHaveBeenCalledWith('tournament:join', {
        tournamentId: mockTournament.id
      });
    });

    it('should handle real-time player updates', async () => {
      const { useTournamentRealtime } = await import('@/hooks/useTournamentRealtime');
      
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockTournament)
      });

      const { result } = renderHook(() => 
        useTournamentRealtime(mockTournament.id)
      );

      await waitFor(() => {
        expect(result.current.tournament).not.toBe(null);
      });

      // Simulate player joined event
      act(() => {
        const playerJoinedHandler = (mockSocket as any)['tournament:player:joined_handler'];
        playerJoinedHandler({
          playerId: 'new-player',
          playerName: 'New Player',
          currentPlayerCount: 3
        });
      });

      expect(result.current.tournament?.currentPlayers).toBe(3);
    });

    it('should handle phase transitions', async () => {
      const { useTournamentRealtime } = await import('@/hooks/useTournamentRealtime');
      
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockTournament)
      });

      const { result } = renderHook(() => 
        useTournamentRealtime(mockTournament.id)
      );

      await waitFor(() => {
        expect(result.current.tournament?.status).toBe('registering');
      });

      // Simulate phase change
      act(() => {
        const phaseChangedHandler = (mockSocket as any)['tournament:phase:changed_handler'];
        phaseChangedHandler({
          tournamentId: mockTournament.id,
          newPhase: 'preparing',
          newStatus: 'preparing',
          startedAt: new Date().toISOString()
        });
      });

      expect(result.current.tournament?.status).toBe('preparing');
      expect(result.current.tournament?.startedAt).toBeTruthy();
    });

    it('should handle connection errors', async () => {
      const { useTournamentRealtime } = await import('@/hooks/useTournamentRealtime');
      
      (global.fetch as any).mockRejectedValueOnce(new Error('Network error'));

      const { result } = renderHook(() => 
        useTournamentRealtime(mockTournament.id)
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
        expect(result.current.error).toBe('Network error');
        expect(result.current.tournament).toBe(null);
      });
    });

    it('should clean up socket listeners on unmount', async () => {
      const { useTournamentRealtime } = await import('@/hooks/useTournamentRealtime');
      
      const { unmount } = renderHook(() => 
        useTournamentRealtime(mockTournament.id)
      );

      unmount();

      expect(mockSocket.off).toHaveBeenCalledWith('tournament:player:joined');
      expect(mockSocket.off).toHaveBeenCalledWith('tournament:player:left');
      expect(mockSocket.off).toHaveBeenCalledWith('tournament:phase:changed');
    });
  });

  describe('useTournamentPreparation Hook', () => {
    it('should handle sealed preparation state', async () => {
      const { useTournamentPreparation } = await import('@/hooks/useTournamentPreparation');
      
      const sealedTournament = {
        ...mockTournament,
        format: 'sealed' as TournamentFormat,
        status: 'preparing' as TournamentStatus
      };

      const { result } = renderHook(() => 
        useTournamentPreparation(sealedTournament)
      );

      expect(result.current.preparationType).toBe('sealed');
      expect(result.current.packsOpened).toBe(false);
      expect(result.current.deckBuilt).toBe(false);
      expect(result.current.isReady).toBe(false);
    });

    it('should handle pack opening for sealed', async () => {
      const { useTournamentPreparation } = await import('@/hooks/useTournamentPreparation');
      
      const sealedTournament = {
        ...mockTournament,
        format: 'sealed' as TournamentFormat,
        status: 'preparing' as TournamentStatus
      };

      const mockPacks = [
        { cards: [{ id: 'card1' }, { id: 'card2' }] },
        { cards: [{ id: 'card3' }, { id: 'card4' }] }
      ];

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ packs: mockPacks })
      });

      const { result } = renderHook(() => 
        useTournamentPreparation(sealedTournament)
      );

      await act(async () => {
        await result.current.openPacks();
      });

      expect(result.current.packsOpened).toBe(true);
      expect(result.current.cardPool).toHaveLength(4);
      expect(global.fetch).toHaveBeenCalledWith(
        `/api/tournaments/${sealedTournament.id}/packs`,
        { method: 'POST' }
      );
    });

    it('should handle deck building', async () => {
      const { useTournamentPreparation } = await import('@/hooks/useTournamentPreparation');
      
      const sealedTournament = {
        ...mockTournament,
        format: 'sealed' as TournamentFormat,
        status: 'preparing' as TournamentStatus
      };

      const { result } = renderHook(() => 
        useTournamentPreparation(sealedTournament)
      );

      const deckList = [
        { cardId: 'card1', quantity: 2 },
        { cardId: 'card2', quantity: 1 }
      ];

      act(() => {
        result.current.updateDeck(deckList);
      });

      expect(result.current.deck).toEqual(deckList);
      expect(result.current.deckBuilt).toBe(true);
    });

    it('should submit preparation data', async () => {
      const { useTournamentPreparation } = await import('@/hooks/useTournamentPreparation');
      
      const sealedTournament = {
        ...mockTournament,
        format: 'sealed' as TournamentFormat,
        status: 'preparing' as TournamentStatus
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true })
      });

      const { result } = renderHook(() => 
        useTournamentPreparation(sealedTournament)
      );

      // Set up preparation state
      act(() => {
        result.current.updateDeck([{ cardId: 'card1', quantity: 1 }]);
      });

      await act(async () => {
        await result.current.submitPreparation();
      });

      expect(result.current.isSubmitted).toBe(true);
      expect(global.fetch).toHaveBeenCalledWith(
        `/api/tournaments/${sealedTournament.id}/preparation`,
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('deckList')
        })
      );
    });

    it('should handle preparation timeout', async () => {
      const { useTournamentPreparation } = await import('@/hooks/useTournamentPreparation');
      
      const sealedTournament = {
        ...mockTournament,
        format: 'sealed' as TournamentFormat,
        status: 'preparing' as TournamentStatus,
        settings: {
          sealed: {
            deckBuildingTimeLimit: 30
          }
        }
      };

      const { result } = renderHook(() => 
        useTournamentPreparation(sealedTournament)
      );

      expect(result.current.timeRemaining).toBe(1800); // 30 minutes in seconds

      // Simulate timeout warning
      act(() => {
        const timeoutHandler = (mockSocket as any)['tournament:preparation:timeout_warning_handler'];
        timeoutHandler({
          tournamentId: sealedTournament.id,
          timeRemaining: 300 // 5 minutes
        });
      });

      expect(result.current.timeRemaining).toBe(300);
      expect(result.current.isLowTime).toBe(true);
    });
  });

  describe('useDraftSession Hook', () => {
    it('should initialize draft session', async () => {
      const { useDraftSession } = await import('@/hooks/useDraftSession');
      
      const draftTournament = {
        ...mockTournament,
        format: 'draft' as TournamentFormat,
        status: 'preparing' as TournamentStatus
      };

      const { result } = renderHook(() => 
        useDraftSession(draftTournament.id)
      );

      expect(result.current.isActive).toBe(false);
      expect(result.current.currentPack).toBe(null);
      expect(result.current.pickNumber).toBe(0);
      expect(result.current.packNumber).toBe(0);
      expect(result.current.draftedCards).toEqual([]);
    });

    it('should handle receiving draft pack', async () => {
      const { useDraftSession } = await import('@/hooks/useDraftSession');
      
      const { result } = renderHook(() => 
        useDraftSession(mockTournament.id)
      );

      const mockPack = {
        packNumber: 1,
        pickNumber: 1,
        cards: [
          { id: 'draft1', name: 'Card A' },
          { id: 'draft2', name: 'Card B' }
        ]
      };

      // Simulate receiving pack
      act(() => {
        const packHandler = (mockSocket as any)['draft:pack-received_handler'];
        packHandler(mockPack);
      });

      expect(result.current.isActive).toBe(true);
      expect(result.current.currentPack).toEqual(mockPack.cards);
      expect(result.current.packNumber).toBe(1);
      expect(result.current.pickNumber).toBe(1);
    });

    it('should handle making picks', async () => {
      const { useDraftSession } = await import('@/hooks/useDraftSession');
      
      const { result } = renderHook(() => 
        useDraftSession(mockTournament.id)
      );

      // Set up pack first
      act(() => {
        const packHandler = (mockSocket as any)['draft:pack-received_handler'];
        packHandler({
          packNumber: 1,
          pickNumber: 1,
          cards: [{ id: 'draft1', name: 'Card A' }]
        });
      });

      await act(async () => {
        result.current.makePickt('draft1');
      });

      expect(result.current.draftedCards).toHaveLength(1);
      expect(result.current.draftedCards[0]).toEqual({ id: 'draft1', name: 'Card A' });
      
      expect(mockSocket.emit).toHaveBeenCalledWith('draft:pick-card', {
        tournamentId: mockTournament.id,
        cardId: 'draft1',
        packNumber: 1,
        pickNumber: 1
      });
    });

    it('should handle draft completion', async () => {
      const { useDraftSession } = await import('@/hooks/useDraftSession');
      
      const { result } = renderHook(() => 
        useDraftSession(mockTournament.id)
      );

      // Simulate draft completion
      act(() => {
        const draftCompleteHandler = (mockSocket as any)['draft:completed_handler'];
        draftCompleteHandler({
          tournamentId: mockTournament.id,
          finalPicks: [
            { id: 'card1', name: 'Pick 1' },
            { id: 'card2', name: 'Pick 2' }
          ]
        });
      });

      expect(result.current.isComplete).toBe(true);
      expect(result.current.draftedCards).toHaveLength(2);
    });

    it('should handle pick timer', async () => {
      const { useDraftSession } = await import('@/hooks/useDraftSession');
      
      const { result } = renderHook(() => 
        useDraftSession(mockTournament.id)
      );

      // Set initial pick timer
      act(() => {
        const timerHandler = (mockSocket as any)['draft:pick-timer_handler'];
        timerHandler({
          timeRemaining: 90
        });
      });

      expect(result.current.pickTimeRemaining).toBe(90);

      // Simulate timer update
      act(() => {
        const timerHandler = (mockSocket as any)['draft:pick-timer_handler'];
        timerHandler({
          timeRemaining: 45
        });
      });

      expect(result.current.pickTimeRemaining).toBe(45);
      expect(result.current.isLowPickTime).toBe(true); // Under 50% of 90 seconds
    });
  });

  describe('useTournamentStatistics Hook', () => {
    it('should fetch and return tournament statistics', async () => {
      const { useTournamentStatistics } = await import('@/hooks/useTournamentStatistics');
      
      const mockStatistics = {
        tournamentId: mockTournament.id,
        standings: [
          {
            playerId: 'player1',
            playerName: 'Alice',
            wins: 2,
            losses: 0,
            draws: 0,
            matchPoints: 6,
            tiebreakers: {},
            finalRanking: null
          }
        ],
        rounds: [],
        overallStats: {
          totalMatches: 4,
          completedMatches: 4,
          averageMatchDuration: 1800,
          tournamentDuration: 3600,
          totalPlayers: 8,
          roundsCompleted: 1
        }
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockStatistics)
      });

      const { result } = renderHook(() => 
        useTournamentStatistics(mockTournament.id)
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
        expect(result.current.statistics).toEqual(mockStatistics);
      });

      expect(global.fetch).toHaveBeenCalledWith(
        `/api/tournaments/${mockTournament.id}/statistics`
      );
    });

    it('should handle real-time statistics updates', async () => {
      const { useTournamentStatistics } = await import('@/hooks/useTournamentStatistics');
      
      const { result } = renderHook(() => 
        useTournamentStatistics(mockTournament.id)
      );

      const updatedStandings = [
        {
          playerId: 'player1',
          playerName: 'Alice',
          wins: 3,
          losses: 0,
          draws: 0,
          matchPoints: 9,
          tiebreakers: {},
          finalRanking: null
        }
      ];

      // Simulate real-time update
      act(() => {
        const updateHandler = (mockSocket as any)['tournament:statistics:updated_handler'];
        updateHandler({
          tournamentId: mockTournament.id,
          standings: updatedStandings,
          updateType: 'match-completed'
        });
      });

      expect(result.current.statistics?.standings).toEqual(updatedStandings);
      expect(result.current.lastUpdate).toBeTruthy();
    });

    it('should refresh statistics manually', async () => {
      const { useTournamentStatistics } = await import('@/hooks/useTournamentStatistics');
      
      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ standings: [], rounds: [], overallStats: {} })
      });

      const { result } = renderHook(() => 
        useTournamentStatistics(mockTournament.id)
      );

      await act(async () => {
        await result.current.refreshStatistics();
      });

      expect(global.fetch).toHaveBeenCalledTimes(2); // Initial load + manual refresh
    });
  });

  describe('useTournamentConnection Hook', () => {
    it('should track connection status', async () => {
      const { useTournamentConnection } = await import('@/hooks/useTournamentConnection');
      
      const { result } = renderHook(() => 
        useTournamentConnection(mockTournament.id)
      );

      expect(result.current.isConnected).toBe(true);
      expect(result.current.reconnectAttempts).toBe(0);
    });

    it('should handle disconnection', async () => {
      const { useTournamentConnection } = await import('@/hooks/useTournamentConnection');
      
      const { result } = renderHook(() => 
        useTournamentConnection(mockTournament.id)
      );

      // Simulate disconnection
      mockSocket.connected = false;
      act(() => {
        const disconnectHandler = (mockSocket as any)['disconnect_handler'];
        disconnectHandler({ reason: 'transport close' });
      });

      expect(result.current.isConnected).toBe(false);
      expect(result.current.lastDisconnectReason).toBe('transport close');
    });

    it('should handle manual reconnection', async () => {
      const { useTournamentConnection } = await import('@/hooks/useTournamentConnection');
      
      const { result } = renderHook(() => 
        useTournamentConnection(mockTournament.id)
      );

      // Disconnect first
      mockSocket.connected = false;
      act(() => {
        const disconnectHandler = (mockSocket as any)['disconnect_handler'];
        disconnectHandler({ reason: 'transport close' });
      });

      // Manual reconnect
      mockSocket.connected = true;
      await act(async () => {
        await result.current.reconnect();
      });

      expect(result.current.isConnected).toBe(true);
      expect(result.current.reconnectAttempts).toBe(1);
    });

    it('should handle automatic reconnection with backoff', async () => {
      const { useTournamentConnection } = await import('@/hooks/useTournamentConnection');
      
      vi.useFakeTimers();

      const { result } = renderHook(() => 
        useTournamentConnection(mockTournament.id, { autoReconnect: true, maxReconnectAttempts: 3 })
      );

      // Simulate disconnection
      mockSocket.connected = false;
      act(() => {
        const disconnectHandler = (mockSocket as any)['disconnect_handler'];
        disconnectHandler({ reason: 'transport close' });
      });

      expect(result.current.isReconnecting).toBe(true);

      // Fast-forward through reconnection attempts
      vi.advanceTimersByTime(1000); // First attempt
      vi.advanceTimersByTime(2000); // Second attempt (exponential backoff)
      vi.advanceTimersByTime(4000); // Third attempt

      expect(result.current.reconnectAttempts).toBe(3);

      vi.useRealTimers();
    });
  });

  describe('useTournamentMatches Hook', () => {
    it('should track current match assignments', async () => {
      const { useTournamentMatches } = await import('@/hooks/useTournamentMatches');
      
      const { result } = renderHook(() => 
        useTournamentMatches(mockTournament.id)
      );

      expect(result.current.currentMatch).toBe(null);
      expect(result.current.assignments).toEqual([]);
      expect(result.current.currentRound).toBe(0);
    });

    it('should handle match assignments', async () => {
      const { useTournamentMatches } = await import('@/hooks/useTournamentMatches');
      
      const { result } = renderHook(() => 
        useTournamentMatches(mockTournament.id)
      );

      const matchAssignment = {
        matchId: 'match-123',
        opponentId: 'opponent-456',
        opponentName: 'Strong Opponent',
        lobbyName: 'Tournament-Round1-Table2',
        roundNumber: 1
      };

      // Simulate match assignment
      act(() => {
        const assignmentHandler = (mockSocket as any)['tournament:match:assigned_handler'];
        assignmentHandler(matchAssignment);
      });

      expect(result.current.currentMatch).toEqual(matchAssignment);
      expect(result.current.currentRound).toBe(1);
    });

    it('should handle round progression', async () => {
      const { useTournamentMatches } = await import('@/hooks/useTournamentMatches');
      
      const { result } = renderHook(() => 
        useTournamentMatches(mockTournament.id)
      );

      const roundData = {
        tournamentId: mockTournament.id,
        roundNumber: 2,
        matches: [
          {
            id: 'match-456',
            player1Id: 'user-123',
            player2Id: 'opponent-789',
            player2Name: 'Next Opponent'
          }
        ]
      };

      // Simulate round start
      act(() => {
        const roundHandler = (mockSocket as any)['tournament:round:started_handler'];
        roundHandler(roundData);
      });

      expect(result.current.currentRound).toBe(2);
      expect(result.current.currentMatch?.opponentName).toBe('Next Opponent');
    });
  });
});