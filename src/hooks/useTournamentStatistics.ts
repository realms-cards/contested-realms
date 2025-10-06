import { useState, useCallback, useEffect } from 'react';

interface PlayerStanding {
  rank: number;
  playerId: string;
  playerName: string;
  playerImage: string | null;
  wins: number;
  losses: number;
  draws: number;
  matchPoints: number;
  gameWinPercentage: number;
  opponentMatchWinPercentage: number;
  isEliminated: boolean;
  currentMatchId?: string | null;
}

interface MatchResult {
  id: string;
  tournamentId: string;
  tournamentName?: string;
  roundNumber: number | null;
  status: 'pending' | 'active' | 'completed' | 'cancelled';
  players: Array<{ id: string; name: string; seat?: number | null }>;
  winnerId: string | null;
  gameCount: number;
  duration: number | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
}

interface TournamentRound {
  id: string;
  roundNumber: number;
  status: 'pending' | 'active' | 'completed';
  startedAt: string | null;
  completedAt: string | null;
  duration: number | null;
  statistics: {
    totalMatches: number;
    completedMatches: number;
    activeMatches: number;
    pendingMatches: number;
    completionRate: number;
    averageMatchDuration: number | null;
  };
  matches: MatchResult[];
}

interface StatisticsState {
  standings: PlayerStanding[];
  matches: MatchResult[];
  rounds: TournamentRound[];
  overview: {
    totalPlayers: number;
    totalRounds: number;
    totalMatches: number;
    completedMatches: number;
    dropoutRate: number;
  };
  lastUpdated: string | null;
  loading: boolean;
  error: string | null;
}

export function useTournamentStatistics(
  tournamentId: string | null,
  options?: { isConnected?: boolean; pollIntervalMs?: number }
) {
  const [state, setState] = useState<StatisticsState>({
    standings: [],
    matches: [],
    rounds: [],
    overview: {
      totalPlayers: 0,
      totalRounds: 0,
      totalMatches: 0,
      completedMatches: 0,
      dropoutRate: 0
    },
    lastUpdated: null,
    loading: false,
    error: null
  });

  // Get current standings
  const refreshStandings = useCallback(async () => {
    // Skip API calls if no tournament ID
    if (!tournamentId) {
      return;
    }
    
    setState(prev => ({ ...prev, loading: true, error: null }));
    
    try {
      const response = await fetch(`/api/tournaments/${tournamentId}/standings`);

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to get tournament standings');
      }

      const result = await response.json();
      
      setState(prev => ({
        ...prev,
        standings: result.standings,
        lastUpdated: result.lastUpdated,
        loading: false
      }));
    } catch (err) {
      setState(prev => ({
        ...prev,
        error: err instanceof Error ? err.message : 'Failed to get tournament standings',
        loading: false
      }));
    }
  }, [tournamentId]);

  // Get matches with filtering
  const refreshMatches = useCallback(async (filters?: {
    roundNumber?: number;
    playerId?: string;
  }) => {
    // Skip API calls if no tournament ID
    if (!tournamentId) {
      return;
    }
    
    setState(prev => ({ ...prev, loading: true, error: null }));
    
    try {
      const params = new URLSearchParams();
      if (filters?.roundNumber) params.set('round', filters.roundNumber.toString());
      if (filters?.playerId) params.set('player', filters.playerId);
      
      const response = await fetch(`/api/tournaments/${tournamentId}/matches?${params}`);

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to get tournament matches');
      }

      const result = await response.json();
      
      setState(prev => ({
        ...prev,
        matches: result.matches,
        overview: {
          ...prev.overview,
          totalMatches: result.summary.totalMatches,
          completedMatches: result.summary.completedMatches
        },
        loading: false
      }));
    } catch (err) {
      setState(prev => ({
        ...prev,
        error: err instanceof Error ? err.message : 'Failed to get tournament matches',
        loading: false
      }));
    }
  }, [tournamentId]);

  // Get rounds information
  const refreshRounds = useCallback(async () => {
    // Skip API calls if no tournament ID
    if (!tournamentId) {
      return;
    }
    
    setState(prev => ({ ...prev, loading: true, error: null }));
    
    try {
      const response = await fetch(`/api/tournaments/${tournamentId}/rounds`);

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to get tournament rounds');
      }

      const result = await response.json();
      
      setState(prev => ({
        ...prev,
        rounds: result.rounds,
        overview: {
          ...prev.overview,
          totalRounds: result.summary.totalRounds,
          totalMatches: result.summary.totalMatches,
          completedMatches: result.summary.completedMatches
        },
        loading: false
      }));
    } catch (err) {
      setState(prev => ({
        ...prev,
        error: err instanceof Error ? err.message : 'Failed to get tournament rounds',
        loading: false
      }));
    }
  }, [tournamentId]);

  // Get complete tournament statistics
  const refreshStatistics = useCallback(async () => {
    // Skip API calls if no tournament ID
    if (!tournamentId) {
      return;
    }
    
    setState(prev => ({ ...prev, loading: true, error: null }));
    
    try {
      const response = await fetch(`/api/tournaments/${tournamentId}/statistics`);

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to get tournament statistics');
      }

      const result = await response.json();
      
      setState(prev => ({
        ...prev,
        standings: result.standings,
        overview: result.overview,
        rounds: result.rounds.map((round: Record<string, unknown>) => ({
          ...round,
          matches: [] // Matches loaded separately
        })),
        lastUpdated: new Date().toISOString(),
        loading: false
      }));
    } catch (err) {
      setState(prev => ({
        ...prev,
        error: err instanceof Error ? err.message : 'Failed to get tournament statistics',
        loading: false
      }));
    }
  }, [tournamentId]);

  // Get player-specific statistics
  const getPlayerStatistics = useCallback(async (playerId: string) => {
    // Skip API calls if no tournament ID
    if (!tournamentId) {
      return;
    }
    
    setState(prev => ({ ...prev, loading: true, error: null }));
    
    try {
      const response = await fetch(`/api/tournaments/${tournamentId}/players/${playerId}/statistics`);

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to get player statistics');
      }

      const result = await response.json();
      
      // Return player statistics instead of updating global state
      setState(prev => ({ ...prev, loading: false }));
      return result;
    } catch (err) {
      setState(prev => ({
        ...prev,
        error: err instanceof Error ? err.message : 'Failed to get player statistics',
        loading: false
      }));
      throw err;
    }
  }, [tournamentId]);

  // Export tournament data
  const exportTournamentData = useCallback(async (format: 'json' | 'csv' = 'json') => {
    // Skip API calls if no tournament ID
    if (!tournamentId) {
      return;
    }
    
    setState(prev => ({ ...prev, loading: true, error: null }));
    
    try {
      const response = await fetch(`/api/tournaments/${tournamentId}/export?format=${format}`);

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to export tournament data');
      }

      // Handle file download
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      a.download = `tournament-${tournamentId}-export.${format}`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      setState(prev => ({ ...prev, loading: false }));
    } catch (err) {
      setState(prev => ({
        ...prev,
        error: err instanceof Error ? err.message : 'Failed to export tournament data',
        loading: false
      }));
    }
  }, [tournamentId]);

  // Auto-refresh all statistics
  const refreshAll = useCallback(async () => {
    await Promise.all([
      refreshStandings(),
      refreshMatches(),
      refreshRounds(),
      refreshStatistics()
    ]);
  }, [refreshStandings, refreshMatches, refreshRounds, refreshStatistics]);

  // Auto-refresh statistics periodically (backup). Do not poll when socket is connected, or tab is hidden
  useEffect(() => {
    refreshAll();
    const pollMs = options?.pollIntervalMs ?? 60000; // back off to 60s
    let id: number | null = null;
    const start = () => {
      if (options?.isConnected) return;
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      if (id != null) return;
      id = window.setInterval(() => {
        if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
        void refreshAll();
      }, pollMs);
    };
    const stop = () => { if (id != null) { clearInterval(id); id = null; } };
    start();
    const onVis = () => { stop(); start(); };
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVis);
    return () => { stop(); if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVis); };
  }, [refreshAll, options?.isConnected, options?.pollIntervalMs]);

  return {
    ...state,
    actions: {
      refreshStandings,
      refreshMatches,
      refreshRounds,
      refreshStatistics,
      getPlayerStatistics,
      exportTournamentData,
      refreshAll
    }
  };
}
