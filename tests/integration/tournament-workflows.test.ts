/**
 * Tournament Integration Tests
 * Tests for complete tournament workflows from registration to completion
 * 
 * IMPORTANT: Following TDD principles, these tests are written to FAIL FIRST
 * The actual implementation does not exist yet - these define expected behavior
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { 
  TournamentFormat,
  TournamentStatus,
  CreateTournamentRequest 
} from '@/lib/tournament/validation';

// Mock Socket.io client
const mockSocket = {
  emit: vi.fn(),
  on: vi.fn(),
  off: vi.fn(),
  disconnect: vi.fn()
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

// Mock fetch for API calls
global.fetch = vi.fn();

describe('Tournament Integration Workflows', () => {
  const mockTournament = {
    id: 'tournament-123',
    name: 'Test Tournament',
    format: 'sealed' as TournamentFormat,
    status: 'registering' as TournamentStatus,
    maxPlayers: 8,
    currentPlayers: 0,
    creatorId: 'creator-456',
    settings: {
      sealed: {
        packConfiguration: [{ setId: 'alpha', packCount: 6 }],
        deckBuildingTimeLimit: 30
      }
    },
    createdAt: new Date().toISOString(),
    startedAt: null,
    completedAt: null
  };

  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Tournament Creation Workflow', () => {
    it('should complete full tournament creation flow', async () => {
      // This will fail because the component doesn't exist yet
      const { CreateTournamentModal } = await import('@/components/tournament/CreateTournamentModal');
      
      const mockOnCreate = vi.fn();
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockTournament)
      });

      render(<CreateTournamentModal isOpen={true} onClose={vi.fn()} onCreate={mockOnCreate} />);

      // Fill in tournament details
      fireEvent.change(screen.getByLabelText(/tournament name/i), {
        target: { value: 'Test Tournament' }
      });
      
      fireEvent.change(screen.getByLabelText(/format/i), {
        target: { value: 'sealed' }
      });
      
      fireEvent.change(screen.getByLabelText(/max players/i), {
        target: { value: '8' }
      });

      // Configure sealed settings
      fireEvent.change(screen.getByLabelText(/pack count/i), {
        target: { value: '6' }
      });
      
      fireEvent.change(screen.getByLabelText(/deck building time/i), {
        target: { value: '30' }
      });

      // Submit form
      fireEvent.click(screen.getByRole('button', { name: /create tournament/i }));

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith('/api/tournaments', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: 'Test Tournament',
            format: 'sealed',
            maxPlayers: 8,
            settings: {
              sealed: {
                packConfiguration: [{ setId: 'alpha', packCount: 6 }],
                deckBuildingTimeLimit: 30
              }
            }
          })
        });
        expect(mockOnCreate).toHaveBeenCalledWith(mockTournament);
      });
    });

    it('should validate tournament settings before creation', async () => {
      const { CreateTournamentModal } = await import('@/components/tournament/CreateTournamentModal');
      
      render(<CreateTournamentModal isOpen={true} onClose={vi.fn()} onCreate={vi.fn()} />);

      // Try to create with invalid data
      fireEvent.change(screen.getByLabelText(/tournament name/i), {
        target: { value: 'X' } // Too short
      });
      
      fireEvent.click(screen.getByRole('button', { name: /create tournament/i }));

      await waitFor(() => {
        expect(screen.getByText(/tournament name must be at least/i)).toBeInTheDocument();
      });
      
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('should handle API errors gracefully', async () => {
      const { CreateTournamentModal } = await import('@/components/tournament/CreateTournamentModal');
      
      (global.fetch as any).mockRejectedValueOnce(new Error('Network error'));

      render(<CreateTournamentModal isOpen={true} onClose={vi.fn()} onCreate={vi.fn()} />);

      // Fill valid data
      fireEvent.change(screen.getByLabelText(/tournament name/i), {
        target: { value: 'Valid Tournament' }
      });
      
      fireEvent.click(screen.getByRole('button', { name: /create tournament/i }));

      await waitFor(() => {
        expect(screen.getByText(/failed to create tournament/i)).toBeInTheDocument();
      });
    });
  });

  describe('Tournament Registration Workflow', () => {
    it('should handle complete registration flow', async () => {
      // This will fail because the component doesn't exist yet
      const { TournamentCard } = await import('@/components/tournament/TournamentCard');
      
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          id: 'registration-123',
          tournamentId: mockTournament.id,
          playerId: 'user-123',
          playerName: 'Test User',
          registeredAt: new Date().toISOString(),
          preparationStatus: 'notStarted',
          deckSubmitted: false
        })
      });

      render(<TournamentCard tournament={mockTournament} />);

      // Click join button
      fireEvent.click(screen.getByRole('button', { name: /join tournament/i }));

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          `/api/tournaments/${mockTournament.id}/join`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({})
          }
        );
        
        expect(screen.getByText(/successfully joined/i)).toBeInTheDocument();
      });
    });

    it('should prevent registration when tournament is full', async () => {
      const { TournamentCard } = await import('@/components/tournament/TournamentCard');
      
      const fullTournament = { ...mockTournament, currentPlayers: 8 };

      render(<TournamentCard tournament={fullTournament} />);

      const joinButton = screen.getByRole('button', { name: /join tournament/i });
      expect(joinButton).toBeDisabled();
      expect(screen.getByText(/tournament is full/i)).toBeInTheDocument();
    });

    it('should handle registration errors', async () => {
      const { TournamentCard } = await import('@/components/tournament/TournamentCard');
      
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ message: 'Already registered for this tournament' })
      });

      render(<TournamentCard tournament={mockTournament} />);

      fireEvent.click(screen.getByRole('button', { name: /join tournament/i }));

      await waitFor(() => {
        expect(screen.getByText(/already registered/i)).toBeInTheDocument();
      });
    });
  });

  describe('Tournament Preparation Phase Workflow', () => {
    it('should handle sealed preparation workflow', async () => {
      // This will fail because the component doesn't exist yet
      const { SealedPreparationScreen } = await import('@/components/tournament/SealedPreparationScreen');
      
      const preparingTournament = {
        ...mockTournament,
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

      render(<SealedPreparationScreen tournament={preparingTournament} />);

      // Open packs
      fireEvent.click(screen.getByRole('button', { name: /open packs/i }));

      await waitFor(() => {
        expect(screen.getByText(/packs opened/i)).toBeInTheDocument();
        mockPacks.flat().forEach(pack => {
          pack.cards.forEach(card => {
            expect(screen.getByTestId(`card-${card.id}`)).toBeInTheDocument();
          });
        });
      });

      // Build deck (simplified - drag cards to deck area)
      const card1 = screen.getByTestId('card-card1');
      const deckArea = screen.getByTestId('deck-area');
      
      fireEvent.dragStart(card1);
      fireEvent.dragOver(deckArea);
      fireEvent.drop(deckArea);

      // Submit deck
      fireEvent.click(screen.getByRole('button', { name: /submit deck/i }));

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          `/api/tournaments/${preparingTournament.id}/preparation`,
          expect.objectContaining({
            method: 'POST',
            body: expect.stringContaining('deckList')
          })
        );
      });
    });

    it('should enforce deck building time limit', async () => {
      const { SealedPreparationScreen } = await import('@/components/tournament/SealedPreparationScreen');
      
      const preparingTournament = {
        ...mockTournament,
        status: 'preparing' as TournamentStatus,
        settings: {
          sealed: {
            packConfiguration: [{ setId: 'alpha', packCount: 6 }],
            deckBuildingTimeLimit: 1 // 1 minute for testing
          }
        }
      };

      render(<SealedPreparationScreen tournament={preparingTournament} />);

      // Should show countdown timer
      expect(screen.getByText(/time remaining/i)).toBeInTheDocument();
      
      // Wait for time to expire (mocked)
      vi.advanceTimersByTime(60000); // 1 minute

      await waitFor(() => {
        expect(screen.getByText(/time expired/i)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /submit deck/i })).toBeDisabled();
      });
    });

    it('should handle draft preparation workflow', async () => {
      const { DraftPreparationScreen } = await import('@/components/tournament/DraftPreparationScreen');
      
      const draftTournament = {
        ...mockTournament,
        format: 'draft' as TournamentFormat,
        status: 'preparing' as TournamentStatus,
        settings: {
          draft: {
            packConfiguration: [{ setId: 'alpha', packCount: 3 }],
            draftTimeLimit: 90,
            deckBuildingTimeLimit: 30
          }
        }
      };

      const mockDraftPack = {
        cards: [{ id: 'draft1' }, { id: 'draft2' }, { id: 'draft3' }]
      };

      mockSocket.on.mockImplementation((event, callback) => {
        if (event === 'draft:pack-received') {
          callback(mockDraftPack);
        }
      });

      render(<DraftPreparationScreen tournament={draftTournament} />);

      await waitFor(() => {
        expect(screen.getByText(/draft in progress/i)).toBeInTheDocument();
        expect(screen.getByText(/pick a card/i)).toBeInTheDocument();
      });

      // Pick first card
      fireEvent.click(screen.getByTestId('card-draft1'));

      expect(mockSocket.emit).toHaveBeenCalledWith('draft:pick-card', {
        cardId: 'draft1',
        packNumber: 1,
        pickNumber: 1
      });
    });
  });

  describe('Tournament Match Phase Workflow', () => {
    it('should display tournament statistics and standings', async () => {
      // This will fail because the component doesn't exist yet
      const { TournamentStatisticsOverlay } = await import('@/components/tournament/TournamentStatisticsOverlay');
      
      const activeTournament = {
        ...mockTournament,
        status: 'active' as TournamentStatus
      };

      const mockStatistics = {
        tournamentId: activeTournament.id,
        standings: [
          {
            playerId: 'player1',
            playerName: 'Player One',
            wins: 2,
            losses: 0,
            draws: 0,
            matchPoints: 6,
            tiebreakers: { opponentMatchWinPercentage: 0.667 },
            finalRanking: null
          },
          {
            playerId: 'player2',
            playerName: 'Player Two',
            wins: 1,
            losses: 1,
            draws: 0,
            matchPoints: 3,
            tiebreakers: { opponentMatchWinPercentage: 0.333 },
            finalRanking: null
          }
        ],
        rounds: [
          {
            id: 'round1',
            tournamentId: activeTournament.id,
            roundNumber: 1,
            status: 'completed',
            startedAt: new Date().toISOString(),
            completedAt: new Date().toISOString(),
            matches: []
          }
        ],
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

      render(<TournamentStatisticsOverlay tournament={activeTournament} />);

      await waitFor(() => {
        expect(screen.getByText(/tournament standings/i)).toBeInTheDocument();
        expect(screen.getByText('Player One')).toBeInTheDocument();
        expect(screen.getByText('2-0')).toBeInTheDocument(); // wins-losses
        expect(screen.getByText('Player Two')).toBeInTheDocument();
        expect(screen.getByText('1-1')).toBeInTheDocument();
      });

      // Check statistics display
      expect(screen.getByText(/4.*completed matches/i)).toBeInTheDocument();
      expect(screen.getByText(/30.*average match duration/i)).toBeInTheDocument(); // 1800s = 30min
    });

    it('should handle real-time tournament updates', async () => {
      const { TournamentStatisticsOverlay } = await import('@/components/tournament/TournamentStatisticsOverlay');
      
      const activeTournament = {
        ...mockTournament,
        status: 'active' as TournamentStatus
      };

      render(<TournamentStatisticsOverlay tournament={activeTournament} />);

      // Simulate real-time update
      const mockUpdate = {
        type: 'match-completed',
        matchId: 'match-123',
        result: {
          winnerId: 'player1',
          player1Wins: 2,
          player2Wins: 1
        }
      };

      // Find the socket event handler for tournament updates
      const updateHandler = mockSocket.on.mock.calls.find(
        call => call[0] === 'tournament:statistics:updated'
      )?.[1];

      if (updateHandler) {
        updateHandler(mockUpdate);
      }

      await waitFor(() => {
        expect(screen.getByText(/standings updated/i)).toBeInTheDocument();
      });
    });

    it('should handle tournament completion', async () => {
      const { TournamentStatisticsOverlay } = await import('@/components/tournament/TournamentStatisticsOverlay');
      
      const completedTournament = {
        ...mockTournament,
        status: 'completed' as TournamentStatus,
        completedAt: new Date().toISOString()
      };

      const mockFinalStatistics = {
        tournamentId: completedTournament.id,
        standings: [
          {
            playerId: 'player1',
            playerName: 'Tournament Winner',
            wins: 3,
            losses: 0,
            draws: 0,
            matchPoints: 9,
            tiebreakers: { opponentMatchWinPercentage: 0.778 },
            finalRanking: 1
          }
        ],
        rounds: [],
        overallStats: {
          totalMatches: 12,
          completedMatches: 12,
          averageMatchDuration: 1800,
          tournamentDuration: 7200,
          totalPlayers: 8,
          roundsCompleted: 3
        }
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockFinalStatistics)
      });

      render(<TournamentStatisticsOverlay tournament={completedTournament} />);

      await waitFor(() => {
        expect(screen.getByText(/tournament completed/i)).toBeInTheDocument();
        expect(screen.getByText(/final results/i)).toBeInTheDocument();
        expect(screen.getByText('Tournament Winner')).toBeInTheDocument();
        expect(screen.getByText(/1st place/i)).toBeInTheDocument();
      });
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle tournament cancellation', async () => {
      const { TournamentCard } = await import('@/components/tournament/TournamentCard');
      
      const cancelledTournament = {
        ...mockTournament,
        status: 'cancelled' as TournamentStatus
      };

      render(<TournamentCard tournament={cancelledTournament} />);

      expect(screen.getByText(/cancelled/i)).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /join/i })).not.toBeInTheDocument();
    });

    it('should handle network disconnection during tournament', async () => {
      const { TournamentStatisticsOverlay } = await import('@/components/tournament/TournamentStatisticsOverlay');
      
      const activeTournament = {
        ...mockTournament,
        status: 'active' as TournamentStatus
      };

      render(<TournamentStatisticsOverlay tournament={activeTournament} />);

      // Simulate network disconnection
      mockSocket.emit('disconnect');

      await waitFor(() => {
        expect(screen.getByText(/connection lost/i)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /reconnect/i })).toBeInTheDocument();
      });

      // Simulate reconnection
      fireEvent.click(screen.getByRole('button', { name: /reconnect/i }));

      expect(mockSocket.emit).toHaveBeenCalledWith('tournament:join', {
        tournamentId: activeTournament.id
      });
    });

    it('should handle preparation timeout gracefully', async () => {
      const { SealedPreparationScreen } = await import('@/components/tournament/SealedPreparationScreen');
      
      const preparingTournament = {
        ...mockTournament,
        status: 'preparing' as TournamentStatus
      };

      render(<SealedPreparationScreen tournament={preparingTournament} />);

      // Simulate server timeout event
      const timeoutHandler = mockSocket.on.mock.calls.find(
        call => call[0] === 'tournament:preparation:timeout'
      )?.[1];

      if (timeoutHandler) {
        timeoutHandler({ message: 'Preparation phase timed out' });
      }

      await waitFor(() => {
        expect(screen.getByText(/preparation time expired/i)).toBeInTheDocument();
        expect(screen.getByText(/tournament proceeding/i)).toBeInTheDocument();
      });
    });

    it('should handle invalid tournament data gracefully', async () => {
      const { TournamentCard } = await import('@/components/tournament/TournamentCard');
      
      const invalidTournament = {
        ...mockTournament,
        maxPlayers: -1, // Invalid
        currentPlayers: 10, // More than max
        status: 'invalid-status' as any
      };

      render(<TournamentCard tournament={invalidTournament} />);

      // Should show error state
      expect(screen.getByText(/invalid tournament data/i)).toBeInTheDocument();
    });
  });

  describe('Feature Flag Integration', () => {
    it('should respect tournament feature flag', async () => {
      const { TournamentList } = await import('@/components/tournament/TournamentList');
      
      // Mock feature flag as disabled
      vi.mock('@/lib/config/features', () => ({
        FEATURE_FLAGS: {
          tournaments: {
            enabled: false,
            maxConcurrentTournaments: 0,
            supportedFormats: []
          }
        }
      }));

      render(<TournamentList />);

      expect(screen.getByText(/tournaments are currently disabled/i)).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /create tournament/i })).not.toBeInTheDocument();
    });

    it('should respect format restrictions', async () => {
      const { CreateTournamentModal } = await import('@/components/tournament/CreateTournamentModal');
      
      // Mock feature flag with limited formats
      vi.mock('@/lib/config/features', () => ({
        FEATURE_FLAGS: {
          tournaments: {
            enabled: true,
            maxConcurrentTournaments: 10,
            supportedFormats: ['sealed'] // Only sealed allowed
          }
        }
      }));

      render(<CreateTournamentModal isOpen={true} onClose={vi.fn()} onCreate={vi.fn()} />);

      const formatSelect = screen.getByLabelText(/format/i);
      expect(formatSelect).toBeInTheDocument();
      
      // Should only have sealed option
      expect(screen.getByRole('option', { name: /sealed/i })).toBeInTheDocument();
      expect(screen.queryByRole('option', { name: /draft/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('option', { name: /constructed/i })).not.toBeInTheDocument();
    });
  });
});