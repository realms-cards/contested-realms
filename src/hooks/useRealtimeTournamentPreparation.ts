import { useState, useCallback, useEffect, useRef } from 'react';
import { useTournamentSocket } from './useTournamentSocket';

interface SealedPreparationData {
  packs: Array<{ id: string; contents: unknown[] }>;
  packsOpened: boolean;
  cardPool: unknown[];
  deckBuilt: boolean;
  deckList: Array<{ cardId: string; quantity: number }>;
}

interface DraftPreparationData {
  draftSessionId: string | null;
  joinedAt: string | null;
  draftCompleted: boolean;
  pickHistory: unknown[];
  deckBuilt: boolean;
  deckList: Array<{ cardId: string; quantity: number }>;
}

interface ConstructedPreparationData {
  availableDecks: Array<{
    id: string;
    name: string;
    format: string;
    createdAt: string;
    updatedAt: string;
  }>;
  selectedDeckId: string | null;
  deckSelected: boolean;
  deckValidated: boolean;
}

interface RealtimePreparationState {
  status: 'notStarted' | 'inProgress' | 'completed';
  sealed?: SealedPreparationData;
  draft?: DraftPreparationData;
  constructed?: ConstructedPreparationData;
  
  // Real-time coordination data
  playersReady: number;
  totalPlayers: number;
  allPlayersReady: boolean;
  
  // Real-time updates
  lastUpdateTime: string | null;
  realtimeUpdates: Array<{
    playerId: string;
    type: 'preparation_update' | 'deck_submitted' | 'ready_status_changed';
    timestamp: string;
    data?: Record<string, unknown>;
  }>;
  
  loading: boolean;
  error: string | null;
}

export function useRealtimeTournamentPreparation(tournamentId: string) {
  const [state, setState] = useState<RealtimePreparationState>({
    status: 'notStarted',
    playersReady: 0,
    totalPlayers: 0,
    allPlayersReady: false,
    lastUpdateTime: null,
    realtimeUpdates: [],
    loading: false,
    error: null
  });

  const stateRef = useRef(state);
  stateRef.current = state;

  // Real-time event handlers
  const handlePreparationUpdate = useCallback((data: {
    tournamentId: string;
    playerId: string;
    preparationStatus: string;
    deckSubmitted: boolean;
    readyPlayerCount: number;
    totalPlayerCount: number;
  }) => {
    if (data.tournamentId !== tournamentId) return;

    console.log('Real-time preparation update:', data);

    setState(prev => ({
      ...prev,
      playersReady: data.readyPlayerCount,
      totalPlayers: data.totalPlayerCount,
      allPlayersReady: data.readyPlayerCount === data.totalPlayerCount,
      lastUpdateTime: new Date().toISOString(),
      realtimeUpdates: [
        ...prev.realtimeUpdates.slice(-9), // Keep last 10 updates
        {
          playerId: data.playerId,
          type: data.deckSubmitted ? 'deck_submitted' : 'preparation_update',
          timestamp: new Date().toISOString(),
          data: {
            preparationStatus: data.preparationStatus,
            deckSubmitted: data.deckSubmitted
          }
        }
      ]
    }));

    // Auto-refresh detailed status when we get updates
    refreshStatus();
  }, [tournamentId]);

  // Initialize socket with preparation-specific events
  const { 
    socket, 
    isConnected, 
    updatePreparation: socketUpdatePreparation 
  } = useTournamentSocket({
    onPreparationUpdate: handlePreparationUpdate,
    onError: (error) => {
      setState(prev => ({
        ...prev,
        error: error.message,
        loading: false
      }));
    }
  });

  // Start preparation phase
  const startPreparation = useCallback(async () => {
    setState(prev => ({ ...prev, loading: true, error: null }));
    
    try {
      const response = await fetch(`/api/tournaments/${tournamentId}/preparation/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to start preparation');
      }

      const result = await response.json();
      
      setState(prev => ({
        ...prev,
        status: 'inProgress',
        sealed: result.preparationData?.sealed,
        draft: result.preparationData?.draft,
        constructed: result.preparationData?.constructed,
        loading: false
      }));
    } catch (err) {
      setState(prev => ({
        ...prev,
        error: err instanceof Error ? err.message : 'Failed to start preparation',
        loading: false
      }));
    }
  }, [tournamentId]);

  // Get preparation status with real-time coordination data
  const refreshStatus = useCallback(async () => {
    setState(prev => ({ ...prev, loading: true, error: null }));
    
    try {
      const response = await fetch(`/api/tournaments/${tournamentId}/preparation/status`);

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to get preparation status');
      }

      const result = await response.json();
      
      setState(prev => ({
        ...prev,
        status: result.preparationStatus,
        sealed: result.preparationData?.sealed,
        draft: result.preparationData?.draft,
        constructed: result.preparationData?.constructed,
        playersReady: result.readyPlayerCount || prev.playersReady,
        totalPlayers: result.totalPlayerCount || prev.totalPlayers,
        allPlayersReady: result.allPlayersComplete || prev.allPlayersReady,
        loading: false
      }));
    } catch (err) {
      setState(prev => ({
        ...prev,
        error: err instanceof Error ? err.message : 'Failed to get preparation status',
        loading: false
      }));
    }
  }, [tournamentId]);

  // Submit preparation with real-time broadcasting
  const submitPreparation = useCallback(async (preparationData: {
    sealed?: Partial<SealedPreparationData>;
    draft?: Partial<DraftPreparationData>;
    constructed?: Partial<ConstructedPreparationData>;
  }) => {
    setState(prev => ({ ...prev, loading: true, error: null }));
    
    try {
      const response = await fetch(`/api/tournaments/${tournamentId}/preparation/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ preparationData })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to submit preparation');
      }

      const result = await response.json();
      
      setState(prev => ({
        ...prev,
        status: result.preparationStatus,
        sealed: result.preparationData?.sealed,
        draft: result.preparationData?.draft,
        constructed: result.preparationData?.constructed,
        loading: false
      }));

      // Broadcast preparation update via socket
      if (isConnected && socket) {
        socketUpdatePreparation(tournamentId, {
          ...preparationData,
          isComplete: result.isComplete,
          deckSubmitted: result.deckSubmitted,
          completedAt: new Date().toISOString()
        });
      }
    } catch (err) {
      setState(prev => ({
        ...prev,
        error: err instanceof Error ? err.message : 'Failed to submit preparation',
        loading: false
      }));
    }
  }, [tournamentId, isConnected, socket, socketUpdatePreparation]);

  // Sealed format actions with real-time updates
  const openSealedPacks = useCallback(async (packIds: string[]) => {
    setState(prev => ({ ...prev, loading: true, error: null }));
    
    try {
      const response = await fetch(`/api/tournaments/${tournamentId}/preparation/sealed/packs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ packIds })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to open sealed packs');
      }

      const result = await response.json();
      
      setState(prev => ({
        ...prev,
        sealed: {
          ...prev.sealed!,
          packsOpened: true,
          cardPool: result.cardPool,
          openedPackIds: result.openedPackIds
        },
        loading: false
      }));

      // Broadcast pack opening update
      if (isConnected && socket) {
        socketUpdatePreparation(tournamentId, {
          sealed: {
            packsOpened: true,
            packsOpenedAt: new Date().toISOString()
          }
        });
      }
    } catch (err) {
      setState(prev => ({
        ...prev,
        error: err instanceof Error ? err.message : 'Failed to open sealed packs',
        loading: false
      }));
    }
  }, [tournamentId, isConnected, socket, socketUpdatePreparation]);

  // Draft format actions with real-time coordination
  const joinDraftSession = useCallback(async () => {
    setState(prev => ({ ...prev, loading: true, error: null }));
    
    try {
      const response = await fetch(`/api/tournaments/${tournamentId}/preparation/draft/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to join draft session');
      }

      const result = await response.json();
      
      setState(prev => ({
        ...prev,
        draft: {
          ...prev.draft!,
          draftSessionId: result.draftSession.id,
          joinedAt: new Date().toISOString()
        },
        loading: false
      }));

      // Broadcast draft join
      if (isConnected && socket) {
        socketUpdatePreparation(tournamentId, {
          draft: {
            draftSessionId: result.draftSession.id,
            joinedAt: new Date().toISOString()
          }
        });
      }
    } catch (err) {
      setState(prev => ({
        ...prev,
        error: err instanceof Error ? err.message : 'Failed to join draft session',
        loading: false
      }));
    }
  }, [tournamentId, isConnected, socket, socketUpdatePreparation]);

  // Constructed format actions with real-time validation
  const selectDeck = useCallback(async (deckId: string) => {
    setState(prev => ({ ...prev, loading: true, error: null }));
    
    try {
      const response = await fetch(`/api/tournaments/${tournamentId}/preparation/constructed/decks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deckId })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to select deck');
      }

      const result = await response.json();
      
      setState(prev => ({
        ...prev,
        status: 'completed',
        constructed: {
          ...prev.constructed!,
          selectedDeckId: deckId,
          deckSelected: true,
          deckValidated: true
        },
        loading: false
      }));

      // Broadcast deck selection
      if (isConnected && socket) {
        socketUpdatePreparation(tournamentId, {
          constructed: {
            deckSelected: true,
            deckId,
            deckValidated: true,
            selectedAt: new Date().toISOString()
          },
          isComplete: true,
          deckSubmitted: true
        });
      }
    } catch (err) {
      setState(prev => ({
        ...prev,
        error: err instanceof Error ? err.message : 'Failed to select deck',
        loading: false
      }));
    }
  }, [tournamentId, isConnected, socket, socketUpdatePreparation]);

  // Auto-refresh preparation status periodically (backup to real-time)
  useEffect(() => {
    refreshStatus();
    
    const interval = setInterval(refreshStatus, 10000); // Poll every 10 seconds as backup
    return () => clearInterval(interval);
  }, [refreshStatus]);

  return {
    ...state,
    actions: {
      startPreparation,
      refreshStatus,
      openSealedPacks,
      joinDraftSession,
      selectDeck,
      submitPreparation
    },
    realtime: {
      isConnected,
      lastSocketUpdate: state.lastUpdateTime,
      recentUpdates: state.realtimeUpdates
    }
  };
}