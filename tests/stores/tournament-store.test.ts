/**
 * Tournament Store Tests
 * Tests for Zustand tournament state management following TDD principles
 * 
 * IMPORTANT: These tests are written to FAIL FIRST
 * The actual stores do not exist yet
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { 
  TournamentFormat,
  TournamentStatus,
  TournamentResponse 
} from '@/lib/tournament/validation';

// Mock fetch
global.fetch = vi.fn();

describe('Tournament Store Tests', () => {
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
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('useTournamentStore', () => {
    it('should initialize with empty state', async () => {
      const { useTournamentStore } = await import('@/stores/tournament-store');
      
      const { result } = renderHook(() => useTournamentStore());

      expect(result.current.tournaments).toEqual([]);
      expect(result.current.currentTournament).toBe(null);
      expect(result.current.isLoading).toBe(false);
      expect(result.current.error).toBe(null);
    });

    it('should load tournaments from API', async () => {
      const { useTournamentStore } = await import('@/stores/tournament-store');
      
      const mockTournaments = [mockTournament];
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockTournaments)
      });

      const { result } = renderHook(() => useTournamentStore());

      await act(async () => {
        await result.current.loadTournaments();
      });

      expect(result.current.tournaments).toEqual(mockTournaments);
      expect(result.current.isLoading).toBe(false);
      expect(global.fetch).toHaveBeenCalledWith('/api/tournaments');
    });

    it('should handle API errors when loading tournaments', async () => {
      const { useTournamentStore } = await import('@/stores/tournament-store');
      
      (global.fetch as any).mockRejectedValueOnce(new Error('Network error'));

      const { result } = renderHook(() => useTournamentStore());

      await act(async () => {
        await result.current.loadTournaments();
      });

      expect(result.current.tournaments).toEqual([]);
      expect(result.current.error).toBe('Network error');
      expect(result.current.isLoading).toBe(false);
    });

    it('should create new tournament', async () => {
      const { useTournamentStore } = await import('@/stores/tournament-store');
      
      const createRequest = {
        name: 'New Tournament',
        format: 'sealed' as TournamentFormat,
        maxPlayers: 8,
        settings: {}
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ ...mockTournament, ...createRequest })
      });

      const { result } = renderHook(() => useTournamentStore());

      await act(async () => {
        await result.current.createTournament(createRequest);
      });

      expect(result.current.tournaments).toHaveLength(1);
      expect(result.current.tournaments[0].name).toBe('New Tournament');
      expect(global.fetch).toHaveBeenCalledWith('/api/tournaments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(createRequest)
      });
    });

    it('should update existing tournament in store', async () => {
      const { useTournamentStore } = await import('@/stores/tournament-store');
      
      const { result } = renderHook(() => useTournamentStore());

      // Add initial tournament
      act(() => {
        result.current.updateTournament(mockTournament);
      });

      expect(result.current.tournaments).toHaveLength(1);

      // Update same tournament
      const updatedTournament = {
        ...mockTournament,
        currentPlayers: 3,
        status: 'preparing' as TournamentStatus
      };

      act(() => {
        result.current.updateTournament(updatedTournament);
      });

      expect(result.current.tournaments).toHaveLength(1);
      expect(result.current.tournaments[0].currentPlayers).toBe(3);
      expect(result.current.tournaments[0].status).toBe('preparing');
    });

    it('should join tournament and update state', async () => {
      const { useTournamentStore } = await import('@/stores/tournament-store');
      
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

      const { result } = renderHook(() => useTournamentStore());

      // Add tournament first
      act(() => {
        result.current.updateTournament(mockTournament);
      });

      await act(async () => {
        await result.current.joinTournament(mockTournament.id);
      });

      expect(result.current.myRegistrations).toHaveProperty(mockTournament.id);
      expect(global.fetch).toHaveBeenCalledWith(
        `/api/tournaments/${mockTournament.id}/join`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }
      );
    });

    it('should filter tournaments by status', async () => {
      const { useTournamentStore } = await import('@/stores/tournament-store');
      
      const tournaments = [
        mockTournament,
        { ...mockTournament, id: 'tournament-456', status: 'active' as TournamentStatus },
        { ...mockTournament, id: 'tournament-789', status: 'completed' as TournamentStatus }
      ];

      const { result } = renderHook(() => useTournamentStore());

      // Add tournaments
      act(() => {
        tournaments.forEach(t => result.current.updateTournament(t));
      });

      // Filter by registering
      act(() => {
        result.current.setStatusFilter('registering');
      });

      expect(result.current.filteredTournaments).toHaveLength(1);
      expect(result.current.filteredTournaments[0].status).toBe('registering');

      // Filter by active
      act(() => {
        result.current.setStatusFilter('active');
      });

      expect(result.current.filteredTournaments).toHaveLength(1);
      expect(result.current.filteredTournaments[0].status).toBe('active');

      // Clear filter
      act(() => {
        result.current.setStatusFilter(null);
      });

      expect(result.current.filteredTournaments).toHaveLength(3);
    });

    it('should filter tournaments by format', async () => {
      const { useTournamentStore } = await import('@/stores/tournament-store');
      
      const tournaments = [
        mockTournament,
        { ...mockTournament, id: 'tournament-456', format: 'draft' as TournamentFormat },
        { ...mockTournament, id: 'tournament-789', format: 'constructed' as TournamentFormat }
      ];

      const { result } = renderHook(() => useTournamentStore());

      // Add tournaments
      act(() => {
        tournaments.forEach(t => result.current.updateTournament(t));
      });

      // Filter by sealed
      act(() => {
        result.current.setFormatFilter('sealed');
      });

      expect(result.current.filteredTournaments).toHaveLength(1);
      expect(result.current.filteredTournaments[0].format).toBe('sealed');

      // Filter by draft
      act(() => {
        result.current.setFormatFilter('draft');
      });

      expect(result.current.filteredTournaments).toHaveLength(1);
      expect(result.current.filteredTournaments[0].format).toBe('draft');
    });

    it('should set current tournament', async () => {
      const { useTournamentStore } = await import('@/stores/tournament-store');
      
      const { result } = renderHook(() => useTournamentStore());

      act(() => {
        result.current.setCurrentTournament(mockTournament);
      });

      expect(result.current.currentTournament).toEqual(mockTournament);
    });

    it('should clear current tournament', async () => {
      const { useTournamentStore } = await import('@/stores/tournament-store');
      
      const { result } = renderHook(() => useTournamentStore());

      // Set tournament first
      act(() => {
        result.current.setCurrentTournament(mockTournament);
      });

      expect(result.current.currentTournament).not.toBe(null);

      // Clear tournament
      act(() => {
        result.current.clearCurrentTournament();
      });

      expect(result.current.currentTournament).toBe(null);
    });
  });

  describe('useTournamentStatisticsStore', () => {
    it('should initialize with empty statistics', async () => {
      const { useTournamentStatisticsStore } = await import('@/stores/tournament-statistics-store');
      
      const { result } = renderHook(() => useTournamentStatisticsStore());

      expect(result.current.statistics).toEqual({});
      expect(result.current.isLoading).toBe(false);
      expect(result.current.lastUpdate).toBe(null);
    });

    it('should load statistics for tournament', async () => {
      const { useTournamentStatisticsStore } = await import('@/stores/tournament-statistics-store');
      
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

      const { result } = renderHook(() => useTournamentStatisticsStore());

      await act(async () => {
        await result.current.loadStatistics(mockTournament.id);
      });

      expect(result.current.statistics[mockTournament.id]).toEqual(mockStatistics);
      expect(result.current.isLoading).toBe(false);
      expect(global.fetch).toHaveBeenCalledWith(
        `/api/tournaments/${mockTournament.id}/statistics`
      );
    });

    it('should update statistics in real-time', async () => {
      const { useTournamentStatisticsStore } = await import('@/stores/tournament-statistics-store');
      
      const initialStatistics = {
        tournamentId: mockTournament.id,
        standings: [
          { playerId: 'player1', wins: 1, losses: 0, matchPoints: 3 }
        ],
        rounds: [],
        overallStats: {}
      };

      const { result } = renderHook(() => useTournamentStatisticsStore());

      // Set initial statistics
      act(() => {
        result.current.updateStatistics(mockTournament.id, initialStatistics);
      });

      // Update with new data
      const updatedStatistics = {
        ...initialStatistics,
        standings: [
          { playerId: 'player1', wins: 2, losses: 0, matchPoints: 6 }
        ]
      };

      act(() => {
        result.current.updateStatistics(mockTournament.id, updatedStatistics);
      });

      expect(result.current.statistics[mockTournament.id]).toEqual(updatedStatistics);
      expect(result.current.lastUpdate).toBeTruthy();
    });

    it('should get standings for specific tournament', async () => {
      const { useTournamentStatisticsStore } = await import('@/stores/tournament-statistics-store');
      
      const mockStandings = [
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
      ];

      const { result } = renderHook(() => useTournamentStatisticsStore());

      // Set statistics
      act(() => {
        result.current.updateStatistics(mockTournament.id, {
          tournamentId: mockTournament.id,
          standings: mockStandings,
          rounds: [],
          overallStats: {}
        });
      });

      const standings = result.current.getStandings(mockTournament.id);
      expect(standings).toEqual(mockStandings);
    });

    it('should clear statistics for tournament', async () => {
      const { useTournamentStatisticsStore } = await import('@/stores/tournament-statistics-store');
      
      const { result } = renderHook(() => useTournamentStatisticsStore());

      // Set statistics first
      act(() => {
        result.current.updateStatistics(mockTournament.id, {
          tournamentId: mockTournament.id,
          standings: [],
          rounds: [],
          overallStats: {}
        });
      });

      expect(result.current.statistics[mockTournament.id]).toBeDefined();

      // Clear statistics
      act(() => {
        result.current.clearStatistics(mockTournament.id);
      });

      expect(result.current.statistics[mockTournament.id]).toBeUndefined();
    });
  });

  describe('useTournamentPreparationStore', () => {
    it('should initialize with empty preparation state', async () => {
      const { useTournamentPreparationStore } = await import('@/stores/tournament-preparation-store');
      
      const { result } = renderHook(() => useTournamentPreparationStore());

      expect(result.current.preparations).toEqual({});
      expect(result.current.isLoading).toBe(false);
    });

    it('should handle sealed preparation state', async () => {
      const { useTournamentPreparationStore } = await import('@/stores/tournament-preparation-store');
      
      const sealedPreparation = {
        tournamentId: mockTournament.id,
        type: 'sealed' as const,
        packsOpened: false,
        deckBuilt: false,
        cardPool: [],
        deck: [],
        sideboard: [],
        isSubmitted: false
      };

      const { result } = renderHook(() => useTournamentPreparationStore());

      act(() => {
        result.current.setPreparation(mockTournament.id, sealedPreparation);
      });

      expect(result.current.preparations[mockTournament.id]).toEqual(sealedPreparation);
    });

    it('should update card pool after opening packs', async () => {
      const { useTournamentPreparationStore } = await import('@/stores/tournament-preparation-store');
      
      const { result } = renderHook(() => useTournamentPreparationStore());

      const cardPool = [
        { id: 'card1', name: 'Lightning Bolt' },
        { id: 'card2', name: 'Counterspell' }
      ];

      act(() => {
        result.current.updateCardPool(mockTournament.id, cardPool);
      });

      const preparation = result.current.preparations[mockTournament.id];
      expect(preparation.cardPool).toEqual(cardPool);
      expect(preparation.packsOpened).toBe(true);
    });

    it('should update deck composition', async () => {
      const { useTournamentPreparationStore } = await import('@/stores/tournament-preparation-store');
      
      const { result } = renderHook(() => useTournamentPreparationStore());

      const deck = [
        { cardId: 'card1', quantity: 2 },
        { cardId: 'card2', quantity: 1 }
      ];

      act(() => {
        result.current.updateDeck(mockTournament.id, deck);
      });

      const preparation = result.current.preparations[mockTournament.id];
      expect(preparation.deck).toEqual(deck);
      expect(preparation.deckBuilt).toBe(true);
    });

    it('should handle draft preparation state', async () => {
      const { useTournamentPreparationStore } = await import('@/stores/tournament-preparation-store');
      
      const draftPreparation = {
        tournamentId: mockTournament.id,
        type: 'draft' as const,
        draftCompleted: false,
        pickedCards: [],
        currentPack: null,
        pickNumber: 0,
        packNumber: 0,
        deck: [],
        sideboard: [],
        isSubmitted: false
      };

      const { result } = renderHook(() => useTournamentPreparationStore());

      act(() => {
        result.current.setPreparation(mockTournament.id, draftPreparation);
      });

      expect(result.current.preparations[mockTournament.id]).toEqual(draftPreparation);
    });

    it('should add picked card in draft', async () => {
      const { useTournamentPreparationStore } = await import('@/stores/tournament-preparation-store');
      
      const { result } = renderHook(() => useTournamentPreparationStore());

      // Initialize draft preparation
      act(() => {
        result.current.setPreparation(mockTournament.id, {
          type: 'draft',
          pickedCards: [],
          packNumber: 1,
          pickNumber: 1
        });
      });

      const pickedCard = { id: 'draft1', name: 'Drafted Card' };

      act(() => {
        result.current.addPickedCard(mockTournament.id, pickedCard, 1, 1);
      });

      const preparation = result.current.preparations[mockTournament.id];
      expect(preparation.pickedCards).toContainEqual({
        card: pickedCard,
        packNumber: 1,
        pickNumber: 1
      });
    });

    it('should mark preparation as submitted', async () => {
      const { useTournamentPreparationStore } = await import('@/stores/tournament-preparation-store');
      
      const { result } = renderHook(() => useTournamentPreparationStore());

      // Set initial preparation
      act(() => {
        result.current.setPreparation(mockTournament.id, {
          type: 'sealed',
          isSubmitted: false
        });
      });

      act(() => {
        result.current.markSubmitted(mockTournament.id);
      });

      const preparation = result.current.preparations[mockTournament.id];
      expect(preparation.isSubmitted).toBe(true);
    });

    it('should clear preparation data', async () => {
      const { useTournamentPreparationStore } = await import('@/stores/tournament-preparation-store');
      
      const { result } = renderHook(() => useTournamentPreparationStore());

      // Set preparation first
      act(() => {
        result.current.setPreparation(mockTournament.id, { type: 'sealed' });
      });

      expect(result.current.preparations[mockTournament.id]).toBeDefined();

      // Clear preparation
      act(() => {
        result.current.clearPreparation(mockTournament.id);
      });

      expect(result.current.preparations[mockTournament.id]).toBeUndefined();
    });
  });

  describe('useTournamentUIStore', () => {
    it('should manage tournament overlay visibility', async () => {
      const { useTournamentUIStore } = await import('@/stores/tournament-ui-store');
      
      const { result } = renderHook(() => useTournamentUIStore());

      expect(result.current.isStatisticsOverlayOpen).toBe(false);

      act(() => {
        result.current.openStatisticsOverlay();
      });

      expect(result.current.isStatisticsOverlayOpen).toBe(true);

      act(() => {
        result.current.closeStatisticsOverlay();
      });

      expect(result.current.isStatisticsOverlayOpen).toBe(false);
    });

    it('should manage create tournament modal', async () => {
      const { useTournamentUIStore } = await import('@/stores/tournament-ui-store');
      
      const { result } = renderHook(() => useTournamentUIStore());

      expect(result.current.isCreateModalOpen).toBe(false);

      act(() => {
        result.current.openCreateModal();
      });

      expect(result.current.isCreateModalOpen).toBe(true);

      act(() => {
        result.current.closeCreateModal();
      });

      expect(result.current.isCreateModalOpen).toBe(false);
    });

    it('should set active tournament tab', async () => {
      const { useTournamentUIStore } = await import('@/stores/tournament-ui-store');
      
      const { result } = renderHook(() => useTournamentUIStore());

      expect(result.current.activeTab).toBe('all');

      act(() => {
        result.current.setActiveTab('my-tournaments');
      });

      expect(result.current.activeTab).toBe('my-tournaments');
    });

    it('should manage tournament notifications', async () => {
      const { useTournamentUIStore } = await import('@/stores/tournament-ui-store');
      
      const { result } = renderHook(() => useTournamentUIStore());

      expect(result.current.notifications).toEqual([]);

      const notification = {
        id: 'notif-1',
        type: 'success' as const,
        message: 'Successfully joined tournament',
        tournamentId: mockTournament.id
      };

      act(() => {
        result.current.addNotification(notification);
      });

      expect(result.current.notifications).toContainEqual(notification);

      act(() => {
        result.current.removeNotification('notif-1');
      });

      expect(result.current.notifications).not.toContainEqual(notification);
    });

    it('should manage preparation screen state', async () => {
      const { useTournamentUIStore } = await import('@/stores/tournament-ui-store');
      
      const { result } = renderHook(() => useTournamentUIStore());

      expect(result.current.preparationScreen).toEqual({
        isActive: false,
        currentStep: null,
        timeRemaining: null
      });

      act(() => {
        result.current.setPreparationScreen({
          isActive: true,
          currentStep: 'pack-opening',
          timeRemaining: 1800
        });
      });

      expect(result.current.preparationScreen.isActive).toBe(true);
      expect(result.current.preparationScreen.currentStep).toBe('pack-opening');
      expect(result.current.preparationScreen.timeRemaining).toBe(1800);
    });
  });

  describe('Store Integration', () => {
    it('should coordinate between tournament and statistics stores', async () => {
      const { useTournamentStore } = await import('@/stores/tournament-store');
      const { useTournamentStatisticsStore } = await import('@/stores/tournament-statistics-store');
      
      const tournamentResult = renderHook(() => useTournamentStore());
      const statisticsResult = renderHook(() => useTournamentStatisticsStore());

      // Set tournament
      act(() => {
        tournamentResult.result.current.setCurrentTournament(mockTournament);
      });

      // Load statistics for current tournament
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          tournamentId: mockTournament.id,
          standings: [],
          rounds: [],
          overallStats: {}
        })
      });

      await act(async () => {
        const currentTournament = tournamentResult.result.current.currentTournament;
        if (currentTournament) {
          await statisticsResult.result.current.loadStatistics(currentTournament.id);
        }
      });

      expect(statisticsResult.result.current.statistics[mockTournament.id]).toBeDefined();
    });

    it('should persist tournament state across page reloads', async () => {
      const { useTournamentStore } = await import('@/stores/tournament-store');
      
      // Mock localStorage
      const mockLocalStorage = {
        getItem: vi.fn(),
        setItem: vi.fn(),
        removeItem: vi.fn()
      };
      Object.defineProperty(window, 'localStorage', {
        value: mockLocalStorage,
        writable: true
      });

      mockLocalStorage.getItem.mockReturnValue(JSON.stringify({
        tournaments: [mockTournament],
        currentTournament: mockTournament
      }));

      const { result } = renderHook(() => useTournamentStore());

      // Should load from localStorage on initialization
      expect(result.current.tournaments).toEqual([mockTournament]);
      expect(result.current.currentTournament).toEqual(mockTournament);

      // Should save to localStorage on state change
      act(() => {
        result.current.updateTournament({
          ...mockTournament,
          currentPlayers: 3
        });
      });

      expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
        'tournament-store',
        expect.stringContaining('"currentPlayers":3')
      );
    });
  });
});