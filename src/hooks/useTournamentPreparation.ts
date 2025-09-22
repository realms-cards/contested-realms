import { useState, useCallback, useEffect } from 'react';

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

interface PreparationState {
  status: 'notStarted' | 'inProgress' | 'completed';
  sealed?: SealedPreparationData;
  draft?: DraftPreparationData;
  constructed?: ConstructedPreparationData;
  loading: boolean;
  error: string | null;
}

export function useTournamentPreparation(
  tournamentId: string | null,
  options?: { isConnected?: boolean; pollIntervalMs?: number }
) {
  const [state, setState] = useState<PreparationState>({
    status: 'notStarted',
    loading: false,
    error: null
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

  // Get preparation status
  const refreshStatus = useCallback(async () => {
    // Skip API calls if no tournament ID
    if (!tournamentId) {
      return;
    }
    
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

  // Sealed format actions
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
    } catch (err) {
      setState(prev => ({
        ...prev,
        error: err instanceof Error ? err.message : 'Failed to open sealed packs',
        loading: false
      }));
    }
  }, [tournamentId]);

  // Draft format actions
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
    } catch (err) {
      setState(prev => ({
        ...prev,
        error: err instanceof Error ? err.message : 'Failed to join draft session',
        loading: false
      }));
    }
  }, [tournamentId]);

  // Constructed format actions
  const getAvailableDecks = useCallback(async () => {
    setState(prev => ({ ...prev, loading: true, error: null }));
    
    try {
      const response = await fetch(`/api/tournaments/${tournamentId}/preparation/constructed/decks`);

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to get available decks');
      }

      const result = await response.json();
      
      setState(prev => ({
        ...prev,
        constructed: {
          ...prev.constructed!,
          availableDecks: result.availableDecks,
          selectedDeckId: result.selectedDeckId
        },
        loading: false
      }));
    } catch (err) {
      setState(prev => ({
        ...prev,
        error: err instanceof Error ? err.message : 'Failed to get available decks',
        loading: false
      }));
    }
  }, [tournamentId]);

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
    } catch (err) {
      setState(prev => ({
        ...prev,
        error: err instanceof Error ? err.message : 'Failed to select deck',
        loading: false
      }));
    }
  }, [tournamentId]);

  // Submit preparation data
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
    } catch (err) {
      setState(prev => ({
        ...prev,
        error: err instanceof Error ? err.message : 'Failed to submit preparation',
        loading: false
      }));
    }
  }, [tournamentId]);

  // Auto-refresh preparation status (backup). Prefer sockets; poll only when not connected and tab is visible
  useEffect(() => {
    refreshStatus();
    const pollMs = options?.pollIntervalMs ?? 15000; // back off to 15s
    let interval: number | null = null;
    const start = () => {
      if (options?.isConnected) return; // don't poll when socket is connected
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      if (interval != null) return;
      interval = window.setInterval(() => {
        if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
        void refreshStatus();
      }, pollMs);
    };
    const stop = () => { if (interval != null) { clearInterval(interval); interval = null; } };
    start();
    const onVis = () => { stop(); start(); };
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVis);
    return () => { stop(); if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVis); };
  }, [refreshStatus, options?.isConnected, options?.pollIntervalMs]);

  return {
    ...state,
    actions: {
      startPreparation,
      refreshStatus,
      openSealedPacks,
      joinDraftSession,
      getAvailableDecks,
      selectDeck,
      submitPreparation
    }
  };
}
