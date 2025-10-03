"use client";

import { createContext, useContext, useEffect, useState, useCallback, ReactNode, useRef } from "react";
import { useTournamentPhases } from "@/hooks/useTournamentPhases";
import { useTournamentPreparation } from "@/hooks/useTournamentPreparation";
import { useTournamentSocket } from "@/hooks/useTournamentSocket";
import { useTournamentStatistics } from "@/hooks/useTournamentStatistics";

interface TournamentInfo {
  id: string;
  name: string;
  format: 'sealed' | 'draft' | 'constructed';
  status: 'registering' | 'preparing' | 'active' | 'completed' | 'cancelled';
  maxPlayers: number;
  currentPlayers: number;
  creatorId: string;
  creatorName?: string;
  settings: Record<string, unknown>;
  featureFlags?: Record<string, unknown>;
  startedAt?: string;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
  userRegistered?: boolean;
  userReady?: boolean;
  canJoin?: boolean;
  canStart?: boolean;
}

interface RealtimeTournamentContextValue {
  // Tournament list and management
  tournaments: TournamentInfo[];
  currentTournament: TournamentInfo | null;
  setCurrentTournament: (tournament: TournamentInfo | null) => void;
  setCurrentTournamentById: (id: string | null) => void;
  
  // Real-time connection status
  isSocketConnected: boolean;
  connectionError: string | null;
  
  // Tournament actions
  createTournament: (config: {
    name: string;
    format: 'sealed' | 'draft' | 'constructed';
    maxPlayers: number;
    settings?: Record<string, unknown>;
  }) => Promise<TournamentInfo>;
  joinTournament: (tournamentId: string) => Promise<void>;
  leaveTournament: (tournamentId: string) => Promise<void>;
  startTournament: (tournamentId: string) => Promise<void>;
  endTournament: (tournamentId: string) => Promise<void>;
  updateTournamentSettings: (tournamentId: string, settings: Record<string, unknown>) => Promise<void>;
  toggleTournamentReady: (tournamentId: string, ready: boolean) => Promise<void>;
  
  // Enhanced state management
  refreshTournaments: () => Promise<void>;
  
  // Real-time preparation management
  preparation: ReturnType<typeof useTournamentPreparation> | null;
  
  // Real-time statistics management
  statistics: ReturnType<typeof useTournamentStatistics> | null;
  
  // Phase management
  phases: ReturnType<typeof useTournamentPhases> | null;
  
  // Real-time events
  realtimeEvents: {
    playerJoinedCount: number;
    playerLeftCount: number;
    phaseChangeCount: number;
    lastEventTime: string | null;
  };
  
  // Global state
  loading: boolean;
  error: string | null;
  lastUpdated: string | null;
}

const RealtimeTournamentContext = createContext<RealtimeTournamentContextValue | null>(null);

export function RealtimeTournamentProvider({ children }: { children: ReactNode }) {
  const [tournaments, setTournaments] = useState<TournamentInfo[]>([]);
  const [currentTournament, setCurrentTournament] = useState<TournamentInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [realtimeEvents, setRealtimeEvents] = useState({
    playerJoinedCount: 0,
    playerLeftCount: 0,
    phaseChangeCount: 0,
    preparationUpdateCount: 0,
    lastEventTime: null as string | null
  });

  // Initialize state management hooks for current tournament
  // Use null as safe fallback - hooks will handle this gracefully
  const preparationId = currentTournament?.id || null;
  // Stable refs for avoiding re-fetch loops
  const currentTournamentIdRef = useRef<string | null>(null);
  useEffect(() => {
    currentTournamentIdRef.current = currentTournament?.id ?? null;
  }, [currentTournament?.id]);
  const isRefreshingRef = useRef(false);
  // Refs to latest hook instances so handlers can call without re-declaring
  const prepHookRef = useRef<ReturnType<typeof useTournamentPreparation> | null>(null);
  const statsHookRef = useRef<ReturnType<typeof useTournamentStatistics> | null>(null);
  const phasesHookRef = useRef<ReturnType<typeof useTournamentPhases> | null>(null);
  
  // Hooks below need socket connectivity; we'll initialize them after setting up handlers and socket

  // Helper: set current tournament by id (uses the loaded list)
  const setCurrentTournamentById = useCallback((id: string | null) => {
    if (!id) {
      setCurrentTournament(null);
      return;
    }
    setCurrentTournament(prev => {
      if (prev?.id === id) return prev;
      const found = tournaments.find(t => t.id === id) || null;
      return found;
    });
  }, [tournaments]);

  // Socket event handlers
  const handleTournamentUpdated = useCallback((data: { id: string; name?: string; status?: string; [key: string]: unknown }) => {
    
    setTournaments(prev => 
      prev.map(t => t.id === data.id ? { 
        ...t, 
        ...data, 
        status: data.status as TournamentInfo['status'] || t.status 
      } : t)
    );
    
    setCurrentTournament(prev => {
      if (!prev || prev.id !== data.id) return prev;
      return {
        ...prev,
        ...data,
        status: data.status as TournamentInfo['status'] || prev.status
      };
    });
    
    setLastUpdated(new Date().toISOString());
  }, []);

  const handlePhaseChanged = useCallback((data: { 
    tournamentId: string; 
    newPhase: string; 
    newStatus: string; 
    timestamp: string; 
  }) => {
    console.log('Tournament phase changed:', data);
    
    // Update tournament status
    setTournaments(prev => 
      prev.map(t => 
        t.id === data.tournamentId 
          ? { ...t, status: data.newStatus as TournamentInfo['status'] }
          : t
      )
    );
    
    // Update current tournament & phase state
    setCurrentTournament(prev => {
      if (!prev || prev.id !== data.tournamentId) return prev;
      return {
        ...prev,
        status: data.newStatus as TournamentInfo['status']
      };
    });

    // Toast hint for phase changes
    try {
      const msg = `Tournament advanced to ${data.newStatus}`;
      localStorage.setItem('app:toast', msg);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('app:toast', { detail: { message: msg } }));
      }
    } catch {}

    // Update phase hook
    if (phasesHookRef.current && data.tournamentId === preparationId) {
      phasesHookRef.current.actions.updatePhase(data.newStatus as TournamentInfo['status']);
    }
    
    setRealtimeEvents(prev => ({
      ...prev,
      phaseChangeCount: prev.phaseChangeCount + 1,
      lastEventTime: data.timestamp
    }));
  }, [preparationId]);

  const handlePlayerJoined = useCallback((data: { 
    tournamentId: string;
    playerId: string; 
    playerName: string; 
    currentPlayerCount: number; 
  }) => {
    console.log('Player joined tournament:', data);
    // Update the specific tournament in our global list, including registeredPlayers when present
    setTournaments(prev => prev.map(t => {
      if (t.id !== data.tournamentId) return t;
      const reg = (t as unknown as { registeredPlayers?: Array<{ id: string; displayName: string; ready?: boolean }> }).registeredPlayers || [];
      const without = reg.filter(p => p.id !== data.playerId);
      const updated = [...without, { id: data.playerId, displayName: data.playerName, ready: false }];
      return { ...(t as unknown as Record<string, unknown>), currentPlayers: data.currentPlayerCount, registeredPlayers: updated } as unknown as TournamentInfo;
    }));
    // Update current tournament if it matches
    setCurrentTournament(prev => {
      if (!prev || prev.id !== data.tournamentId) return prev;
      const reg = (prev as unknown as { registeredPlayers?: Array<{ id: string; displayName: string; ready?: boolean }> }).registeredPlayers || [];
      const without = reg.filter(p => p.id !== data.playerId);
      const updated = [...without, { id: data.playerId, displayName: data.playerName, ready: false }];
      return { ...(prev as unknown as Record<string, unknown>), currentPlayers: data.currentPlayerCount, registeredPlayers: updated } as unknown as TournamentInfo;
    });
    setRealtimeEvents(prev => ({
      ...prev,
      playerJoinedCount: prev.playerJoinedCount + 1,
      lastEventTime: new Date().toISOString()
    }));
  }, []);

  const handlePlayerLeft = useCallback((data: { 
    tournamentId: string;
    playerId: string; 
    playerName: string; 
    currentPlayerCount: number; 
  }) => {
    console.log('Player left tournament:', data);
    setTournaments(prev => prev.map(t => {
      if (t.id !== data.tournamentId) return t;
      const reg = (t as unknown as { registeredPlayers?: Array<{ id: string; displayName: string; ready?: boolean }> }).registeredPlayers || [];
      const updated = reg.filter(p => p.id !== data.playerId);
      return { ...(t as unknown as Record<string, unknown>), currentPlayers: data.currentPlayerCount, registeredPlayers: updated } as unknown as TournamentInfo;
    }));
    setCurrentTournament(prev => {
      if (!prev || prev.id !== data.tournamentId) return prev;
      const reg = (prev as unknown as { registeredPlayers?: Array<{ id: string; displayName: string; ready?: boolean }> }).registeredPlayers || [];
      const updated = reg.filter(p => p.id !== data.playerId);
      return { ...(prev as unknown as Record<string, unknown>), currentPlayers: data.currentPlayerCount, registeredPlayers: updated } as unknown as TournamentInfo;
    });
    setRealtimeEvents(prev => ({
      ...prev,
      playerLeftCount: prev.playerLeftCount + 1,
      lastEventTime: new Date().toISOString()
    }));
  }, []);

  const handlePreparationUpdate = useCallback((data: { 
    tournamentId: string; 
    playerId: string; 
    preparationStatus: string; 
    deckSubmitted: boolean; 
    readyPlayerCount: number; 
    totalPlayerCount: number; 
  }) => {
    console.log('Preparation update:', data);
    const isReady = data.preparationStatus === 'ready' || data.deckSubmitted === true;
    // Update local list to reflect per-player ready flag when available
    setTournaments(prev => prev.map(t => {
      if (t.id !== data.tournamentId) return t;
      const reg = (t as unknown as { registeredPlayers?: Array<{ id: string; displayName: string; ready?: boolean; deckSubmitted?: boolean }> }).registeredPlayers;
      if (!Array.isArray(reg)) return t;
      const updated = reg.map(p => p.id === data.playerId ? { ...p, ready: isReady, deckSubmitted: Boolean(data.deckSubmitted) } : p);
      return { ...(t as unknown as Record<string, unknown>), registeredPlayers: updated } as unknown as TournamentInfo;
    }));
    // Update current tournament mirror if present
    if (currentTournament?.id === data.tournamentId) {
      const reg = (currentTournament as unknown as { registeredPlayers?: Array<{ id: string; displayName: string; ready?: boolean; deckSubmitted?: boolean }> }).registeredPlayers;
      if (Array.isArray(reg)) {
        const updated = reg.map(p => p.id === data.playerId ? { ...p, ready: isReady, deckSubmitted: Boolean(data.deckSubmitted) } : p);
        setCurrentTournament({ ...(currentTournament as unknown as Record<string, unknown>), registeredPlayers: updated } as unknown as TournamentInfo);
      }
    }
    // Refresh preparation status only on significant milestones
    if (currentTournament?.id === data.tournamentId && prepHookRef.current) {
      if (data.deckSubmitted || data.preparationStatus === 'completed') {
        prepHookRef.current.actions.refreshStatus();
      }
    }
    
    setRealtimeEvents(prev => ({
      ...prev,
      preparationUpdateCount: prev.preparationUpdateCount + 1,
      lastEventTime: new Date().toISOString()
    }));
  }, [currentTournament]);

  const handleStatisticsUpdated = useCallback((data: { tournamentId: string; [key: string]: unknown }) => {
    console.log('Statistics updated:', data);

    // Refresh statistics if it's for our current tournament (this includes rounds data)
    if (currentTournament?.id === data.tournamentId) {
      if (statsHookRef.current) {
        statsHookRef.current.actions.refreshAll();
      }
    }
  }, [currentTournament]);

  const handleRoundStarted = useCallback((data: {
    tournamentId: string;
    roundNumber: number;
    matches: Array<{
      id: string;
      player1Id: string;
      player1Name: string;
      player2Id: string | null;
      player2Name: string | null;
    }>;
  }) => {
    console.log('Round started:', data);

    // Refresh statistics to get new matches, rounds, and standings
    if (currentTournament?.id === data.tournamentId) {
      if (statsHookRef.current) {
        statsHookRef.current.actions.refreshAll();
      }
    }
  }, [currentTournament]);

  const handleMatchAssigned = useCallback((data: { 
    tournamentId: string; 
    matchId: string; 
    opponentId: string | null; 
    opponentName: string | null; 
    lobbyName: string; 
  }) => {
    console.log('Match assigned:', data);
    
    // Show notification or update UI to indicate match assignment
    // This could trigger a toast notification or modal
  }, []);

  const handleSocketError = useCallback((error: { 
    code: string; 
    message: string; 
    details?: string; 
  }) => {
    console.error('Tournament socket error:', error);
    setConnectionError(error.message);
    setError(error.message);
  }, []);

  // Initialize socket and socket-aware hooks
  const { 
    isConnected, 
    joinTournament: socketJoinTournament, 
    leaveTournament: socketLeaveTournament
  } = useTournamentSocket({
    onTournamentUpdated: handleTournamentUpdated,
    onPhaseChanged: handlePhaseChanged,
    onPlayerJoined: handlePlayerJoined,
    onPlayerLeft: handlePlayerLeft,
    onPreparationUpdate: handlePreparationUpdate,
    onStatisticsUpdated: handleStatisticsUpdated,
    onRoundStarted: handleRoundStarted,
    onMatchAssigned: handleMatchAssigned,
    onError: handleSocketError
  });
  const preparation = useTournamentPreparation(preparationId, { isConnected });
  const statistics = useTournamentStatistics(preparationId, { isConnected });
  const phases = useTournamentPhases(preparationId, currentTournament?.status, { isConnected });
  // Only return hook results if we have a current tournament
  const activePreparation = currentTournament ? preparation : null;
  const activeStatistics = currentTournament ? statistics : null;
  const activePhases = currentTournament ? phases : null;
  // Keep refs in sync with latest instances
  useEffect(() => { prepHookRef.current = activePreparation; }, [activePreparation]);
  useEffect(() => { statsHookRef.current = activeStatistics; }, [activeStatistics]);
  useEffect(() => { phasesHookRef.current = activePhases; }, [activePhases]);

  // Auto-join current tournament when socket connects
  useEffect(() => {
    if (isConnected && currentTournament) {
      socketJoinTournament(currentTournament.id);
    }
  }, [isConnected, currentTournament, socketJoinTournament]);

  // Clear connection error when socket connects
  useEffect(() => {
    if (isConnected) {
      setConnectionError(null);
    }
  }, [isConnected]);

  // Tournament management functions
  const refreshTournaments = useCallback(async () => {
    if (isRefreshingRef.current) return;
    isRefreshingRef.current = true;
    setError(null);
    setLoading(true);
    try {
      // Include completed tournaments to ensure we can view them after finishing
      // Limit to recent 50 tournaments to avoid performance issues
      const response = await fetch('/api/tournaments?includeCompleted=true&limit=50');
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to fetch tournaments');
      }
      const tournamentsData = await response.json() as TournamentInfo[];
      setTournaments(tournamentsData);
      setLastUpdated(new Date().toISOString());
      const ctId = currentTournamentIdRef.current;
      if (ctId) {
        const updatedCurrent = tournamentsData.find(t => t.id === ctId);
        if (updatedCurrent) setCurrentTournament(updatedCurrent);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch tournaments';
      setError(message);
    } finally {
      isRefreshingRef.current = false;
      setLoading(false);
    }
  }, []);

  // Debounced refresher to coalesce bursts
  const refreshTimeoutRef = useRef<number | null>(null);
  const refreshTournamentsDebounced = useCallback((delay = 300) => {
    if (refreshTimeoutRef.current != null) {
      clearTimeout(refreshTimeoutRef.current);
      refreshTimeoutRef.current = null;
    }
    refreshTimeoutRef.current = window.setTimeout(() => {
      refreshTimeoutRef.current = null;
      void refreshTournaments();
    }, delay);
  }, [refreshTournaments]);

  // Fallback polling: keep list fresh even if socket events are missed
  // Fallback polling only when socket is not connected
  useEffect(() => {
    if (isConnected) return;
    const id = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      void refreshTournaments();
    }, 15000);
    return () => clearInterval(id);
  }, [isConnected, refreshTournaments]);

  const createTournament = useCallback(async (config: {
    name: string;
    format: 'sealed' | 'draft' | 'constructed';
    maxPlayers: number;
    settings?: Record<string, unknown>;
  }) => {
    setLoading(true);
    setError(null);

    try {
      console.log("Creating tournament:", config);
      
      const response = await fetch('/api/tournaments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to create tournament');
      }

      const tournament = await response.json();
      console.log("Tournament created:", tournament);
      // Join this tournament room to receive real-time updates immediately
      try {
        socketJoinTournament(tournament.id);
      } catch {}
      // Also refresh list only if socket is not connected (socket will broadcast otherwise)
      if (!isConnected) { refreshTournamentsDebounced(); }
      // Fetch full details and set as current tournament for downstream hooks
      try {
        const detailRes = await fetch(`/api/tournaments/${tournament.id}`);
        if (detailRes.ok) {
          const detail = await detailRes.json();
          setCurrentTournament(detail as unknown as TournamentInfo);
        }
      } catch {}
      return tournament;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create tournament';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [socketJoinTournament, isConnected, refreshTournamentsDebounced]);

  const joinTournament = useCallback(async (tournamentId: string) => {
    setLoading(true);
    setError(null);

    try {
      console.log("Joining tournament:", tournamentId);
      
      const response = await fetch(`/api/tournaments/${tournamentId}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to join tournament');
      }

      console.log("Joined tournament successfully");
      // Join the tournament room immediately for real-time updates
      try {
        socketJoinTournament(tournamentId);
      } catch {}
      // Refresh list only if socket is not connected
      if (!isConnected) { refreshTournamentsDebounced(); }
      // Fetch full details and set as current tournament for downstream hooks
      try {
        const detailRes = await fetch(`/api/tournaments/${tournamentId}`);
        if (detailRes.ok) {
          const detail = await detailRes.json();
          setCurrentTournament(detail as unknown as TournamentInfo);
        }
      } catch {}
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to join tournament';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [socketJoinTournament, isConnected, refreshTournamentsDebounced]);

  const leaveTournament = useCallback(async (tournamentId: string) => {
    setLoading(true);
    setError(null);

    try {
      console.log("Leaving tournament:", tournamentId);
      
      const response = await fetch(`/api/tournaments/${tournamentId}/leave`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to leave tournament');
      }

      console.log("Left tournament successfully");
      
      // Leave socket room
      socketLeaveTournament(tournamentId);
      
      // Clear current tournament if leaving it
      if (currentTournament?.id === tournamentId) {
        setCurrentTournament(null);
      }
      
      // Rely on server events to update list
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to leave tournament';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [currentTournament, socketLeaveTournament]);

  const startTournament = useCallback(async (tournamentId: string) => {
    setLoading(true);
    setError(null);

    try {
      console.log("Starting tournament:", tournamentId);
      
      const response = await fetch(`/api/tournaments/${tournamentId}/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to start tournament');
      }

      console.log("Tournament started successfully");
      // Join the room to receive tournament-scoped updates immediately
      try {
        socketJoinTournament(tournamentId);
      } catch {}
      // Real-time events will propagate updates; fetch details only
      try {
        const detailRes = await fetch(`/api/tournaments/${tournamentId}`);
        if (detailRes.ok) {
          const detail = await detailRes.json();
          setCurrentTournament(detail as unknown as TournamentInfo);
        }
      } catch {}
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to start tournament';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [socketJoinTournament]);

  const endTournament = useCallback(async (tournamentId: string) => {
    setLoading(true);
    setError(null);

    try {
      console.log("Ending tournament:", tournamentId);
      
      const response = await fetch(`/api/tournaments/${tournamentId}/end`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to end tournament');
      }

      console.log("Tournament ended successfully");
      if (!isConnected) { refreshTournamentsDebounced(); }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to end tournament';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [isConnected, refreshTournamentsDebounced]);

  const updateTournamentSettings = useCallback(async (
    tournamentId: string, 
    settings: Record<string, unknown>
  ) => {
    setLoading(true);
    setError(null);

    try {
      console.log("Updating tournament settings:", { tournamentId, settings });
      
      const response = await fetch(`/api/tournaments/${tournamentId}/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to update tournament settings');
      }

      console.log("Tournament settings updated successfully");
      if (!isConnected) { refreshTournamentsDebounced(); }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update tournament settings';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [isConnected, refreshTournamentsDebounced]);

  const toggleTournamentReady = useCallback(async (tournamentId: string, ready: boolean) => {
    setLoading(true);
    setError(null);

    try {
      console.log("Toggling tournament ready status:", { tournamentId, ready });
      
      const response = await fetch(`/api/tournaments/${tournamentId}/ready`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ready }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to update ready status');
      }

      // Only refresh if socket is not connected
      if (!isConnected) { refreshTournamentsDebounced(); }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update ready status';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [isConnected, refreshTournamentsDebounced]);

  // Auto-fetch tournaments on mount
  useEffect(() => {
    // Initial load only once; subsequent updates come from socket events
    void refreshTournaments();
  }, [isConnected, refreshTournamentsDebounced, refreshTournaments]);

  const contextValue: RealtimeTournamentContextValue = {
    tournaments,
    currentTournament,
    setCurrentTournament,
    setCurrentTournamentById,
    isSocketConnected: isConnected,
    connectionError,
    createTournament,
    joinTournament,
    leaveTournament,
    startTournament,
    endTournament,
    updateTournamentSettings,
    toggleTournamentReady,
    refreshTournaments,
    preparation: activePreparation,
    statistics: activeStatistics,
    phases: activePhases,
    realtimeEvents,
    loading,
    error,
    lastUpdated,
  };

  return (
    <RealtimeTournamentContext.Provider value={contextValue}>
      {children}
    </RealtimeTournamentContext.Provider>
  );
}

export function useRealtimeTournaments() {
  const context = useContext(RealtimeTournamentContext);
  if (!context) {
    throw new Error("useRealtimeTournaments must be used within a RealtimeTournamentProvider");
  }
  return context;
}
