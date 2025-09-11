/**
 * Tournament UI Component Tests
 * Tests for tournament UI components following TDD principles
 * 
 * IMPORTANT: These tests are written to FAIL FIRST
 * The actual components do not exist yet
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { ReactNode } from 'react';
import type { 
  TournamentFormat,
  TournamentStatus,
  TournamentResponse 
} from '@/lib/tournament/validation';

// Mock providers
const mockProviders = ({ children }: { children: ReactNode }) => {
  return <>{children}</>;
};

// Mock next-auth
vi.mock('next-auth/react', () => ({
  useSession: vi.fn(() => ({
    data: { user: { id: 'user-123', name: 'Test User' } },
    status: 'authenticated'
  }))
}));

// Mock router
vi.mock('next/navigation', () => ({
  useRouter: vi.fn(() => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn()
  })),
  usePathname: vi.fn(() => '/tournaments')
}));

describe('Tournament UI Components', () => {
  const mockTournament: TournamentResponse = {
    id: 'tournament-123',
    name: 'Test Tournament',
    format: 'sealed',
    status: 'registering',
    maxPlayers: 8,
    currentPlayers: 2,
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
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('TournamentCard Component', () => {
    it('should render tournament information correctly', async () => {
      const { TournamentCard } = await import('@/components/tournament/TournamentCard');
      
      render(<TournamentCard tournament={mockTournament} />);

      expect(screen.getByText('Test Tournament')).toBeInTheDocument();
      expect(screen.getByText(/sealed/i)).toBeInTheDocument();
      expect(screen.getByText(/2.*8.*players/i)).toBeInTheDocument();
      expect(screen.getByText(/registering/i)).toBeInTheDocument();
    });

    it('should show join button for open tournaments', async () => {
      const { TournamentCard } = await import('@/components/tournament/TournamentCard');
      
      const onJoin = vi.fn();
      render(<TournamentCard tournament={mockTournament} onJoin={onJoin} />);

      const joinButton = screen.getByRole('button', { name: /join/i });
      expect(joinButton).toBeInTheDocument();
      expect(joinButton).not.toBeDisabled();

      fireEvent.click(joinButton);
      expect(onJoin).toHaveBeenCalledWith(mockTournament.id);
    });

    it('should disable join for full tournaments', async () => {
      const { TournamentCard } = await import('@/components/tournament/TournamentCard');
      
      const fullTournament = {
        ...mockTournament,
        currentPlayers: 8
      };

      render(<TournamentCard tournament={fullTournament} />);

      const joinButton = screen.getByRole('button', { name: /join/i });
      expect(joinButton).toBeDisabled();
      expect(screen.getByText(/full/i)).toBeInTheDocument();
    });

    it('should show different UI for tournament creator', async () => {
      const { TournamentCard } = await import('@/components/tournament/TournamentCard');
      
      const ownTournament = {
        ...mockTournament,
        creatorId: 'user-123' // Matches mocked session user
      };

      render(<TournamentCard tournament={ownTournament} isCreator={true} />);

      expect(screen.getByRole('button', { name: /manage/i })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /join/i })).not.toBeInTheDocument();
    });

    it('should display format-specific badges', async () => {
      const { TournamentCard } = await import('@/components/tournament/TournamentCard');
      
      const draftTournament = {
        ...mockTournament,
        format: 'draft' as TournamentFormat
      };

      render(<TournamentCard tournament={draftTournament} />);

      const formatBadge = screen.getByTestId('format-badge');
      expect(formatBadge).toHaveClass('badge-draft');
      expect(formatBadge).toHaveTextContent(/draft/i);
    });
  });

  describe('CreateTournamentModal Component', () => {
    it('should render form fields correctly', async () => {
      const { CreateTournamentModal } = await import('@/components/tournament/CreateTournamentModal');
      
      render(
        <CreateTournamentModal 
          isOpen={true} 
          onClose={vi.fn()} 
          onCreate={vi.fn()} 
        />
      );

      expect(screen.getByLabelText(/tournament name/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/format/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/max players/i)).toBeInTheDocument();
    });

    it('should show format-specific settings', async () => {
      const { CreateTournamentModal } = await import('@/components/tournament/CreateTournamentModal');
      
      render(
        <CreateTournamentModal 
          isOpen={true} 
          onClose={vi.fn()} 
          onCreate={vi.fn()} 
        />
      );

      // Select sealed format
      fireEvent.change(screen.getByLabelText(/format/i), {
        target: { value: 'sealed' }
      });

      await waitFor(() => {
        expect(screen.getByLabelText(/pack configuration/i)).toBeInTheDocument();
        expect(screen.getByLabelText(/deck building time/i)).toBeInTheDocument();
      });

      // Switch to draft format
      fireEvent.change(screen.getByLabelText(/format/i), {
        target: { value: 'draft' }
      });

      await waitFor(() => {
        expect(screen.getByLabelText(/draft time limit/i)).toBeInTheDocument();
        expect(screen.getByLabelText(/pick time/i)).toBeInTheDocument();
      });
    });

    it('should validate form inputs', async () => {
      const { CreateTournamentModal } = await import('@/components/tournament/CreateTournamentModal');
      
      render(
        <CreateTournamentModal 
          isOpen={true} 
          onClose={vi.fn()} 
          onCreate={vi.fn()} 
        />
      );

      // Try to submit with invalid name
      fireEvent.change(screen.getByLabelText(/tournament name/i), {
        target: { value: 'X' } // Too short
      });

      fireEvent.click(screen.getByRole('button', { name: /create/i }));

      await waitFor(() => {
        expect(screen.getByText(/name must be at least 3 characters/i)).toBeInTheDocument();
      });
    });

    it('should handle pack configuration for sealed', async () => {
      const { CreateTournamentModal } = await import('@/components/tournament/CreateTournamentModal');
      
      render(
        <CreateTournamentModal 
          isOpen={true} 
          onClose={vi.fn()} 
          onCreate={vi.fn()} 
        />
      );

      fireEvent.change(screen.getByLabelText(/format/i), {
        target: { value: 'sealed' }
      });

      // Add pack configuration
      fireEvent.click(screen.getByRole('button', { name: /add pack set/i }));

      const setSelect = screen.getByLabelText(/set/i);
      const packCount = screen.getByLabelText(/pack count/i);

      fireEvent.change(setSelect, { target: { value: 'alpha' } });
      fireEvent.change(packCount, { target: { value: '6' } });

      expect(screen.getByText(/alpha.*6 packs/i)).toBeInTheDocument();
    });
  });

  describe('TournamentStatisticsOverlay Component', () => {
    it('should display standings table', async () => {
      const { TournamentStatisticsOverlay } = await import('@/components/tournament/TournamentStatisticsOverlay');
      
      const standings = [
        {
          playerId: 'player1',
          playerName: 'Alice',
          wins: 2,
          losses: 0,
          draws: 0,
          matchPoints: 6,
          tiebreakers: { opponentMatchWinPercentage: 0.75 },
          finalRanking: null
        },
        {
          playerId: 'player2',
          playerName: 'Bob',
          wins: 1,
          losses: 1,
          draws: 0,
          matchPoints: 3,
          tiebreakers: { opponentMatchWinPercentage: 0.5 },
          finalRanking: null
        }
      ];

      render(
        <TournamentStatisticsOverlay 
          tournament={mockTournament}
          standings={standings}
          isOpen={true}
        />
      );

      const table = screen.getByRole('table');
      expect(within(table).getByText('Alice')).toBeInTheDocument();
      expect(within(table).getByText('2-0-0')).toBeInTheDocument();
      expect(within(table).getByText('6')).toBeInTheDocument();
      
      expect(within(table).getByText('Bob')).toBeInTheDocument();
      expect(within(table).getByText('1-1-0')).toBeInTheDocument();
      expect(within(table).getByText('3')).toBeInTheDocument();
    });

    it('should highlight current user in standings', async () => {
      const { TournamentStatisticsOverlay } = await import('@/components/tournament/TournamentStatisticsOverlay');
      
      const standings = [
        {
          playerId: 'user-123', // Current user
          playerName: 'Test User',
          wins: 1,
          losses: 1,
          draws: 0,
          matchPoints: 3,
          tiebreakers: {},
          finalRanking: null
        }
      ];

      render(
        <TournamentStatisticsOverlay 
          tournament={mockTournament}
          standings={standings}
          isOpen={true}
        />
      );

      const userRow = screen.getByTestId('standing-user-123');
      expect(userRow).toHaveClass('highlight-current-user');
    });

    it('should show round information', async () => {
      const { TournamentStatisticsOverlay } = await import('@/components/tournament/TournamentStatisticsOverlay');
      
      const rounds = [
        {
          id: 'round1',
          tournamentId: mockTournament.id,
          roundNumber: 1,
          status: 'completed' as const,
          startedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
          matches: [
            {
              id: 'match1',
              player1Id: 'player1',
              player1Name: 'Alice',
              player2Id: 'player2',
              player2Name: 'Bob',
              status: 'completed' as const,
              result: {
                winnerId: 'player1',
                player1Wins: 2,
                player2Wins: 0,
                draws: 0
              }
            }
          ]
        }
      ];

      render(
        <TournamentStatisticsOverlay 
          tournament={mockTournament}
          rounds={rounds}
          isOpen={true}
        />
      );

      expect(screen.getByText(/round 1/i)).toBeInTheDocument();
      expect(screen.getByText(/alice vs bob/i)).toBeInTheDocument();
      expect(screen.getByText(/2-0/i)).toBeInTheDocument();
    });

    it('should display overall statistics', async () => {
      const { TournamentStatisticsOverlay } = await import('@/components/tournament/TournamentStatisticsOverlay');
      
      const overallStats = {
        totalMatches: 12,
        completedMatches: 8,
        averageMatchDuration: 1800, // 30 minutes
        tournamentDuration: 7200, // 2 hours
        totalPlayers: 8,
        roundsCompleted: 2
      };

      render(
        <TournamentStatisticsOverlay 
          tournament={mockTournament}
          overallStats={overallStats}
          isOpen={true}
        />
      );

      expect(screen.getByText(/8.*12.*matches completed/i)).toBeInTheDocument();
      expect(screen.getByText(/30.*minutes.*average/i)).toBeInTheDocument();
      expect(screen.getByText(/2.*hours.*total/i)).toBeInTheDocument();
      expect(screen.getByText(/2.*rounds completed/i)).toBeInTheDocument();
    });
  });

  describe('SealedPreparationScreen Component', () => {
    it('should show pack opening interface', async () => {
      const { SealedPreparationScreen } = await import('@/components/tournament/SealedPreparationScreen');
      
      const preparingTournament = {
        ...mockTournament,
        status: 'preparing' as TournamentStatus
      };

      render(<SealedPreparationScreen tournament={preparingTournament} />);

      expect(screen.getByText(/sealed deck preparation/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /open packs/i })).toBeInTheDocument();
    });

    it('should display opened cards', async () => {
      const { SealedPreparationScreen } = await import('@/components/tournament/SealedPreparationScreen');
      
      const preparingTournament = {
        ...mockTournament,
        status: 'preparing' as TournamentStatus
      };

      const openedCards = [
        { id: 'card1', name: 'Lightning Bolt', rarity: 'common' },
        { id: 'card2', name: 'Counterspell', rarity: 'uncommon' },
        { id: 'card3', name: 'Black Lotus', rarity: 'mythic' }
      ];

      render(
        <SealedPreparationScreen 
          tournament={preparingTournament}
          openedCards={openedCards}
        />
      );

      openedCards.forEach(card => {
        expect(screen.getByTestId(`card-${card.id}`)).toBeInTheDocument();
        expect(screen.getByText(card.name)).toBeInTheDocument();
      });
    });

    it('should handle deck building drag and drop', async () => {
      const { SealedPreparationScreen } = await import('@/components/tournament/SealedPreparationScreen');
      
      const preparingTournament = {
        ...mockTournament,
        status: 'preparing' as TournamentStatus
      };

      render(<SealedPreparationScreen tournament={preparingTournament} />);

      const cardPool = screen.getByTestId('card-pool');
      const deckArea = screen.getByTestId('deck-area');
      const sideboardArea = screen.getByTestId('sideboard-area');

      // Simulate dragging card to deck
      const card = within(cardPool).getByTestId('card-card1');
      
      fireEvent.dragStart(card);
      fireEvent.dragOver(deckArea);
      fireEvent.drop(deckArea);

      await waitFor(() => {
        expect(within(deckArea).getByTestId('card-card1')).toBeInTheDocument();
      });
    });

    it('should show deck statistics', async () => {
      const { SealedPreparationScreen } = await import('@/components/tournament/SealedPreparationScreen');
      
      const preparingTournament = {
        ...mockTournament,
        status: 'preparing' as TournamentStatus
      };

      const deck = {
        mainDeck: Array(40).fill({ id: 'card', name: 'Test Card' }),
        sideboard: Array(15).fill({ id: 'card2', name: 'Sideboard Card' })
      };

      render(
        <SealedPreparationScreen 
          tournament={preparingTournament}
          deck={deck}
        />
      );

      expect(screen.getByText(/40.*cards.*main deck/i)).toBeInTheDocument();
      expect(screen.getByText(/15.*cards.*sideboard/i)).toBeInTheDocument();
      expect(screen.getByTestId('deck-valid-indicator')).toHaveClass('valid');
    });

    it('should display countdown timer', async () => {
      const { SealedPreparationScreen } = await import('@/components/tournament/SealedPreparationScreen');
      
      const preparingTournament = {
        ...mockTournament,
        status: 'preparing' as TournamentStatus,
        settings: {
          sealed: {
            packConfiguration: [{ setId: 'alpha', packCount: 6 }],
            deckBuildingTimeLimit: 30
          }
        }
      };

      render(<SealedPreparationScreen tournament={preparingTournament} />);

      expect(screen.getByTestId('countdown-timer')).toBeInTheDocument();
      expect(screen.getByText(/30:00/)).toBeInTheDocument();
    });
  });

  describe('DraftPreparationScreen Component', () => {
    it('should show draft pick interface', async () => {
      const { DraftPreparationScreen } = await import('@/components/tournament/DraftPreparationScreen');
      
      const draftTournament = {
        ...mockTournament,
        format: 'draft' as TournamentFormat,
        status: 'preparing' as TournamentStatus
      };

      const currentPack = [
        { id: 'pick1', name: 'Card A' },
        { id: 'pick2', name: 'Card B' },
        { id: 'pick3', name: 'Card C' }
      ];

      render(
        <DraftPreparationScreen 
          tournament={draftTournament}
          currentPack={currentPack}
          pickNumber={1}
          packNumber={1}
        />
      );

      expect(screen.getByText(/pack 1.*pick 1/i)).toBeInTheDocument();
      currentPack.forEach(card => {
        expect(screen.getByText(card.name)).toBeInTheDocument();
      });
    });

    it('should handle card selection', async () => {
      const { DraftPreparationScreen } = await import('@/components/tournament/DraftPreparationScreen');
      
      const draftTournament = {
        ...mockTournament,
        format: 'draft' as TournamentFormat,
        status: 'preparing' as TournamentStatus
      };

      const onPick = vi.fn();

      render(
        <DraftPreparationScreen 
          tournament={draftTournament}
          currentPack={[{ id: 'pick1', name: 'Card A' }]}
          onPick={onPick}
        />
      );

      fireEvent.click(screen.getByTestId('draft-card-pick1'));
      
      expect(onPick).toHaveBeenCalledWith('pick1');
    });

    it('should display pick timer', async () => {
      const { DraftPreparationScreen } = await import('@/components/tournament/DraftPreparationScreen');
      
      const draftTournament = {
        ...mockTournament,
        format: 'draft' as TournamentFormat,
        status: 'preparing' as TournamentStatus,
        settings: {
          draft: {
            draftTimeLimit: 90
          }
        }
      };

      render(
        <DraftPreparationScreen 
          tournament={draftTournament}
          timeRemaining={45}
        />
      );

      const timer = screen.getByTestId('pick-timer');
      expect(timer).toHaveTextContent('0:45');
      expect(timer).toHaveClass('timer-warning'); // Under 50% time
    });

    it('should show drafted cards collection', async () => {
      const { DraftPreparationScreen } = await import('@/components/tournament/DraftPreparationScreen');
      
      const draftTournament = {
        ...mockTournament,
        format: 'draft' as TournamentFormat,
        status: 'preparing' as TournamentStatus
      };

      const draftedCards = [
        { id: 'drafted1', name: 'Picked Card 1' },
        { id: 'drafted2', name: 'Picked Card 2' }
      ];

      render(
        <DraftPreparationScreen 
          tournament={draftTournament}
          draftedCards={draftedCards}
        />
      );

      const collection = screen.getByTestId('drafted-collection');
      draftedCards.forEach(card => {
        expect(within(collection).getByText(card.name)).toBeInTheDocument();
      });
    });
  });

  describe('TournamentList Component', () => {
    it('should display list of tournaments', async () => {
      const { TournamentList } = await import('@/components/tournament/TournamentList');
      
      const tournaments = [
        mockTournament,
        {
          ...mockTournament,
          id: 'tournament-456',
          name: 'Another Tournament',
          format: 'draft' as TournamentFormat
        }
      ];

      render(<TournamentList tournaments={tournaments} />);

      expect(screen.getByText('Test Tournament')).toBeInTheDocument();
      expect(screen.getByText('Another Tournament')).toBeInTheDocument();
    });

    it('should filter tournaments by status', async () => {
      const { TournamentList } = await import('@/components/tournament/TournamentList');
      
      const tournaments = [
        mockTournament,
        {
          ...mockTournament,
          id: 'active-tournament',
          status: 'active' as TournamentStatus
        }
      ];

      render(<TournamentList tournaments={tournaments} />);

      // Filter to show only registering
      fireEvent.click(screen.getByLabelText(/registering only/i));

      await waitFor(() => {
        expect(screen.getByText('Test Tournament')).toBeInTheDocument();
        expect(screen.queryByText('active-tournament')).not.toBeInTheDocument();
      });
    });

    it('should filter tournaments by format', async () => {
      const { TournamentList } = await import('@/components/tournament/TournamentList');
      
      const tournaments = [
        mockTournament,
        {
          ...mockTournament,
          id: 'draft-tournament',
          format: 'draft' as TournamentFormat
        }
      ];

      render(<TournamentList tournaments={tournaments} />);

      // Select format filter
      fireEvent.change(screen.getByLabelText(/format filter/i), {
        target: { value: 'sealed' }
      });

      await waitFor(() => {
        expect(screen.getByText('Test Tournament')).toBeInTheDocument();
        expect(screen.queryByText('draft-tournament')).not.toBeInTheDocument();
      });
    });

    it('should show empty state when no tournaments', async () => {
      const { TournamentList } = await import('@/components/tournament/TournamentList');
      
      render(<TournamentList tournaments={[]} />);

      expect(screen.getByText(/no tournaments found/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /create tournament/i })).toBeInTheDocument();
    });

    it('should handle pagination for large lists', async () => {
      const { TournamentList } = await import('@/components/tournament/TournamentList');
      
      const manyTournaments = Array(25).fill(null).map((_, i) => ({
        ...mockTournament,
        id: `tournament-${i}`,
        name: `Tournament ${i}`
      }));

      render(<TournamentList tournaments={manyTournaments} pageSize={10} />);

      // Should show first 10
      expect(screen.getByText('Tournament 0')).toBeInTheDocument();
      expect(screen.getByText('Tournament 9')).toBeInTheDocument();
      expect(screen.queryByText('Tournament 10')).not.toBeInTheDocument();

      // Navigate to page 2
      fireEvent.click(screen.getByRole('button', { name: /page 2/i }));

      await waitFor(() => {
        expect(screen.queryByText('Tournament 0')).not.toBeInTheDocument();
        expect(screen.getByText('Tournament 10')).toBeInTheDocument();
        expect(screen.getByText('Tournament 19')).toBeInTheDocument();
      });
    });
  });

  describe('TournamentBracket Component', () => {
    it('should display elimination bracket', async () => {
      const { TournamentBracket } = await import('@/components/tournament/TournamentBracket');
      
      const bracket = {
        rounds: [
          {
            name: 'Quarterfinals',
            matches: [
              {
                player1: 'Alice',
                player2: 'Bob',
                winner: 'Alice',
                score: '2-1'
              },
              {
                player1: 'Charlie',
                player2: 'David',
                winner: 'Charlie',
                score: '2-0'
              }
            ]
          },
          {
            name: 'Semifinals',
            matches: [
              {
                player1: 'Alice',
                player2: 'Charlie',
                winner: null,
                score: null
              }
            ]
          }
        ]
      };

      render(<TournamentBracket bracket={bracket} />);

      expect(screen.getByText('Quarterfinals')).toBeInTheDocument();
      expect(screen.getByText('Semifinals')).toBeInTheDocument();
      expect(screen.getByText('Alice')).toBeInTheDocument();
      expect(screen.getByText('2-1')).toBeInTheDocument();
    });
  });
});