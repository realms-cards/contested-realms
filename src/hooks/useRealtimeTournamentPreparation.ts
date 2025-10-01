import { useState, useCallback, useEffect } from 'react';
import {
  SealedPreparationData,
  DraftPreparationData,
  ConstructedPreparationData,
  PreparationState,
  mergeSealed,
  mergeDraft,
  mergeConstructed,
  PreparationResponse
} from './useTournamentPreparation';
import { useTournamentSocket } from './useTournamentSocket';

interface RealtimeUpdate {
  playerId: string;
  type: 'preparation_update' | 'deck_submitted' | 'ready_status_changed';
  timestamp: string;
  data?: Record<string, unknown>;
}

interface RealtimePreparationState {
  status: PreparationState['status'];
  sealed?: SealedPreparationData;
  draft?: DraftPreparationData;
  constructed?: ConstructedPreparationData;
  playersReady: number;
  totalPlayers: number;
  allPlayersReady: boolean;
  lastUpdateTime: string | null;
  realtimeUpdates: RealtimeUpdate[];
  loading: boolean;
  error: string | null;
}

export function useRealtimeTournamentPreparation(tournamentId: string, opts?: { isConnected?: boolean; pollIntervalMs?: number }) {
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

  const refreshStatus = useCallback(async () => {
    setState(prev => ({ ...prev, loading: true, error: null }));

    try {
      const response = await fetch(`/api/tournaments/${tournamentId}/preparation/status`);

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to get preparation status');
      }

      const result = await response.json() as PreparationResponse<{
        readyPlayerCount?: number;
        totalPlayerCount?: number;
        allPlayersComplete?: boolean;
      }>;

      setState(prev => ({
        ...prev,
        status: result.preparationStatus ?? prev.status,
        sealed: result.preparationData?.sealed
          ? mergeSealed(prev.sealed, result.preparationData.sealed)
          : prev.sealed,
        draft: result.preparationData?.draft
          ? mergeDraft(prev.draft, result.preparationData.draft)
          : prev.draft,
        constructed: result.preparationData?.constructed
          ? mergeConstructed(prev.constructed, result.preparationData.constructed)
          : prev.constructed,
        playersReady: result.readyPlayerCount ?? prev.playersReady,
        totalPlayers: result.totalPlayerCount ?? prev.totalPlayers,
        allPlayersReady: result.allPlayersComplete ?? prev.allPlayersReady,
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

  const handlePreparationUpdate = useCallback((data: {
    tournamentId: string;
    playerId: string;
    preparationStatus: string;
    deckSubmitted: boolean;
    readyPlayerCount: number;
    totalPlayerCount: number;
  }) => {
    if (data.tournamentId !== tournamentId) {
      return;
    }

    console.log('Real-time preparation update:', data);

    setState(prev => ({
      ...prev,
      playersReady: data.readyPlayerCount,
      totalPlayers: data.totalPlayerCount,
      allPlayersReady: data.readyPlayerCount === data.totalPlayerCount,
      lastUpdateTime: new Date().toISOString(),
      realtimeUpdates: [
        ...prev.realtimeUpdates.slice(-9),
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

    void refreshStatus();
  }, [tournamentId, refreshStatus]);

  const {
    socket,
    isConnected,
    updatePreparation: socketUpdatePreparation
  } = useTournamentSocket({
    onPreparationUpdate: handlePreparationUpdate,
    onError: error => {
      setState(prev => ({
        ...prev,
        error: error.message,
        loading: false
      }));
    }
  });

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

      const result = await response.json() as PreparationResponse;

      setState(prev => ({
        ...prev,
        status: result.preparationStatus ?? 'inProgress',
        sealed: result.preparationData?.sealed
          ? mergeSealed(prev.sealed, result.preparationData.sealed)
          : prev.sealed,
        draft: result.preparationData?.draft
          ? mergeDraft(prev.draft, result.preparationData.draft)
          : prev.draft,
        constructed: result.preparationData?.constructed
          ? mergeConstructed(prev.constructed, result.preparationData.constructed)
          : prev.constructed,
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

      const result = await response.json() as PreparationResponse<{
        isComplete?: boolean;
        deckSubmitted?: boolean;
      }>;

      setState(prev => ({
        ...prev,
        status: result.preparationStatus ?? prev.status,
        sealed: result.preparationData?.sealed
          ? mergeSealed(prev.sealed, result.preparationData.sealed)
          : prev.sealed,
        draft: result.preparationData?.draft
          ? mergeDraft(prev.draft, result.preparationData.draft)
          : prev.draft,
        constructed: result.preparationData?.constructed
          ? mergeConstructed(prev.constructed, result.preparationData.constructed)
          : prev.constructed,
        loading: false
      }));

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

      const result = await response.json() as PreparationResponse<{
        cardPool?: unknown[];
        openedPackIds?: string[];
      }>;

      setState(prev => ({
        ...prev,
        sealed: mergeSealed(prev.sealed, result.preparationData?.sealed, {
          packsOpened: true,
          cardPool: result.preparationData?.sealed?.cardPool ?? result.cardPool,
          openedPackIds: result.openedPackIds
        }),
        loading: false
      }));

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

      const result = await response.json() as PreparationResponse<{
        draftSession?: { id: string | null };
      }>;

      const overrides: Partial<DraftPreparationData> = {};
      if (result.draftSession?.id) {
        overrides.draftSessionId = result.draftSession.id;
        overrides.joinedAt = new Date().toISOString();
      }

      setState(prev => ({
        ...prev,
        draft: mergeDraft(prev.draft, result.preparationData?.draft, overrides),
        loading: false
      }));

      if (isConnected && socket && result.draftSession?.id) {
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

      const result = await response.json() as PreparationResponse<{
        isComplete?: boolean;
        deckSubmitted?: boolean;
      }>;

      setState(prev => ({
        ...prev,
        status: result.preparationStatus ?? 'completed',
        constructed: mergeConstructed(prev.constructed, result.preparationData?.constructed, {
          selectedDeckId: result.preparationData?.constructed?.selectedDeckId ?? deckId,
          deckSelected: result.preparationData?.constructed?.deckSelected ?? true,
          deckValidated: result.preparationData?.constructed?.deckValidated ?? true
        }),
        loading: false
      }));

      if (isConnected && socket) {
        socketUpdatePreparation(tournamentId, {
          constructed: {
            deckSelected: true,
            deckId,
            deckValidated: true,
            selectedAt: new Date().toISOString()
          },
          isComplete: result.isComplete ?? true,
          deckSubmitted: result.deckSubmitted ?? true
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

  useEffect(() => {
    refreshStatus();
    const pollMs = opts?.pollIntervalMs ?? 20000;
    let id: number | null = null;
    const start = () => {
      if (opts?.isConnected) return; // don't poll when socket is connected
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      if (id != null) return;
      id = window.setInterval(() => {
        if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
        void refreshStatus();
      }, pollMs);
    };
    const stop = () => { if (id != null) { clearInterval(id); id = null; } };
    start();
    const onVis = () => { stop(); start(); };
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVis);
    return () => { stop(); if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVis); };
  }, [refreshStatus, opts?.isConnected, opts?.pollIntervalMs]);

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
