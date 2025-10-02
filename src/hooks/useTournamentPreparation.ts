import { useState, useCallback, useEffect } from 'react';

export interface SealedPreparationData {
  packs: Array<{ id: string; contents: unknown[] }>;
  packsOpened: boolean;
  cardPool: unknown[];
  deckBuilt: boolean;
  deckList: Array<{ cardId: string; quantity: number }>;
  openedPackIds?: string[];
}

export interface DraftPreparationData {
  draftSessionId: string | null;
  joinedAt: string | null;
  draftCompleted: boolean;
  pickHistory: unknown[];
  deckBuilt: boolean;
  deckList: Array<{ cardId: string; quantity: number }>;
}

export interface ConstructedPreparationData {
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

export interface PreparationState {
  status: 'notStarted' | 'inProgress' | 'completed';
  sealed?: SealedPreparationData;
  draft?: DraftPreparationData;
  constructed?: ConstructedPreparationData;
  loading: boolean;
  error: string | null;
}

export type PreparationDataPayload = {
  sealed?: Partial<SealedPreparationData>;
  draft?: Partial<DraftPreparationData>;
  constructed?: Partial<ConstructedPreparationData>;
};

export type PreparationResponse<T extends Record<string, unknown> = Record<string, never>> = T & {
  preparationStatus?: PreparationState['status'];
  preparationData?: PreparationDataPayload;
};

export const createDefaultSealed = (): SealedPreparationData => ({
  packs: [],
  packsOpened: false,
  cardPool: [],
  deckBuilt: false,
  deckList: [],
  openedPackIds: []
});

export const createDefaultDraft = (): DraftPreparationData => ({
  draftSessionId: null,
  joinedAt: null,
  draftCompleted: false,
  pickHistory: [],
  deckBuilt: false,
  deckList: []
});

export const createDefaultConstructed = (): ConstructedPreparationData => ({
  availableDecks: [],
  selectedDeckId: null,
  deckSelected: false,
  deckValidated: false
});

export const mergeSealed = (
  existing: SealedPreparationData | undefined,
  update?: Partial<SealedPreparationData>,
  overrides?: Partial<SealedPreparationData>
): SealedPreparationData => {
  const base = existing ?? createDefaultSealed();
  return {
    ...base,
    ...update,
    ...overrides,
    packs: overrides?.packs ?? update?.packs ?? base.packs,
    cardPool: overrides?.cardPool ?? update?.cardPool ?? base.cardPool,
    deckList: overrides?.deckList ?? update?.deckList ?? base.deckList,
    deckBuilt: overrides?.deckBuilt ?? update?.deckBuilt ?? base.deckBuilt,
    packsOpened: overrides?.packsOpened ?? update?.packsOpened ?? base.packsOpened,
    openedPackIds: overrides?.openedPackIds ?? update?.openedPackIds ?? base.openedPackIds
  };
};

export const mergeDraft = (
  existing: DraftPreparationData | undefined,
  update?: Partial<DraftPreparationData>,
  overrides?: Partial<DraftPreparationData>
): DraftPreparationData => {
  const base = existing ?? createDefaultDraft();
  return {
    ...base,
    ...update,
    ...overrides,
    draftSessionId: overrides?.draftSessionId ?? update?.draftSessionId ?? base.draftSessionId,
    joinedAt: overrides?.joinedAt ?? update?.joinedAt ?? base.joinedAt,
    draftCompleted: overrides?.draftCompleted ?? update?.draftCompleted ?? base.draftCompleted,
    pickHistory: overrides?.pickHistory ?? update?.pickHistory ?? base.pickHistory,
    deckBuilt: overrides?.deckBuilt ?? update?.deckBuilt ?? base.deckBuilt,
    deckList: overrides?.deckList ?? update?.deckList ?? base.deckList
  };
};

export const mergeConstructed = (
  existing: ConstructedPreparationData | undefined,
  update?: Partial<ConstructedPreparationData>,
  overrides?: Partial<ConstructedPreparationData>
): ConstructedPreparationData => {
  const base = existing ?? createDefaultConstructed();
  return {
    ...base,
    ...update,
    ...overrides,
    availableDecks: overrides?.availableDecks ?? update?.availableDecks ?? base.availableDecks,
    selectedDeckId: overrides?.selectedDeckId ?? update?.selectedDeckId ?? base.selectedDeckId,
    deckSelected: overrides?.deckSelected ?? update?.deckSelected ?? base.deckSelected,
    deckValidated: overrides?.deckValidated ?? update?.deckValidated ?? base.deckValidated
  };
};

export function useTournamentPreparation(
  tournamentId: string | null,
  options?: { isConnected?: boolean; pollIntervalMs?: number }
) {
  const [state, setState] = useState<PreparationState>({
    status: 'notStarted',
    loading: false,
    error: null
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

  const refreshStatus = useCallback(async () => {
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

      const result = await response.json() as PreparationResponse;

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
    } catch (err) {
      setState(prev => ({
        ...prev,
        error: err instanceof Error ? err.message : 'Failed to get preparation status',
        loading: false
      }));
    }
  }, [tournamentId]);

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
    } catch (err) {
      setState(prev => ({
        ...prev,
        error: err instanceof Error ? err.message : 'Failed to open sealed packs',
        loading: false
      }));
    }
  }, [tournamentId]);

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
    } catch (err) {
      setState(prev => ({
        ...prev,
        error: err instanceof Error ? err.message : 'Failed to join draft session',
        loading: false
      }));
    }
  }, [tournamentId]);

  const getAvailableDecks = useCallback(async () => {
    setState(prev => ({ ...prev, loading: true, error: null }));

    try {
      const response = await fetch(`/api/tournaments/${tournamentId}/preparation/constructed/decks`);

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to get available decks');
      }

      const result = await response.json() as PreparationResponse<{
        availableDecks?: ConstructedPreparationData['availableDecks'];
        selectedDeckId?: string | null;
      }>;

      setState(prev => ({
        ...prev,
        constructed: mergeConstructed(prev.constructed, result.preparationData?.constructed, {
          availableDecks: result.availableDecks,
          selectedDeckId: result.selectedDeckId
        }),
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

      const result = await response.json() as PreparationResponse;

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
    } catch (err) {
      setState(prev => ({
        ...prev,
        error: err instanceof Error ? err.message : 'Failed to select deck',
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

      const result = await response.json() as PreparationResponse;

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
