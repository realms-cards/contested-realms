"use client";

import { createContext, useContext, useEffect, useState, useCallback, ReactNode, useRef } from "react";
import { useTournamentPreparation } from "@/hooks/useTournamentPreparation";
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

interface EnhancedTournamentContextValue {
  // Tournament list and management
  tournaments: TournamentInfo[];
  currentTournament: TournamentInfo | null;
  setCurrentTournament: (tournament: TournamentInfo | null) => void;
  
  // Tournament actions with optimistic updates
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
  getTournament: (tournamentId: string) => Promise<TournamentInfo>;
  
  // Preparation management (for current tournament)
  preparation: ReturnType<typeof useTournamentPreparation> | null;
  
  // Statistics management (for current tournament)  
  statistics: ReturnType<typeof useTournamentStatistics> | null;
  
  // Global state
  loading: boolean;
  error: string | null;
  lastUpdated: string | null;
}

const EnhancedTournamentContext = createContext<EnhancedTournamentContextValue | null>(null);

export function EnhancedTournamentProvider({ children }: { children: ReactNode }) {
  const [tournaments, setTournaments] = useState<TournamentInfo[]>([]);
  const [currentTournament, setCurrentTournament] = useState<TournamentInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  // Initialize preparation and statistics hooks for current tournament
  // Use a fallback ID to avoid conditional hook calls
  const preparationId = currentTournament?.id ?? null;
  const preparation = useTournamentPreparation(preparationId);
  const statistics = useTournamentStatistics(preparationId);
  
  // Only return hook results if we have a current tournament
  const activePreparation = currentTournament ? preparation : null;
  const activeStatistics = currentTournament ? statistics : null;

  // Optimistic update helper
  const withOptimisticUpdate = useCallback(<T,>(
    action: () => Promise<T>,
    optimisticUpdate?: () => void,
    revertUpdate?: () => void
  ): (() => Promise<T>) => {
    return async (): Promise<T> => {
      setLoading(true);
      setError(null);
      
      if (optimisticUpdate) {
        optimisticUpdate();
      }
      
      try {
        const result = await action();
        setLastUpdated(new Date().toISOString());
        return result;
      } catch (err) {
        if (revertUpdate) {
          revertUpdate();
        }
        const message = err instanceof Error ? err.message : 'An error occurred';
        setError(message);
        throw err;
      } finally {
        setLoading(false);
      }
    };
  }, []);

  const isRefreshingRef = useRef(false);
  const refreshTournaments = useCallback(async () => {
    if (isRefreshingRef.current) return;
    isRefreshingRef.current = true;
    try {
      await withOptimisticUpdate(async () => {
        const response = await fetch('/api/tournaments');
        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || 'Failed to fetch tournaments');
        }
        const tournamentsData = await response.json() as TournamentInfo[];
        setTournaments(tournamentsData);
        if (currentTournament) {
          const updatedCurrent = tournamentsData.find(t => t.id === currentTournament.id);
          if (updatedCurrent) {
            setCurrentTournament(updatedCurrent);
          }
        }
      })();
    } finally {
      isRefreshingRef.current = false;
    }
  }, [currentTournament, withOptimisticUpdate]);

  const createTournament = useCallback(async (config: {
    name: string;
    format: 'sealed' | 'draft' | 'constructed';
    maxPlayers: number;
    settings?: Record<string, unknown>;
  }) => {
    return withOptimisticUpdate(async () => {
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
      await refreshTournaments();
      return tournament;
    })();
  }, [refreshTournaments, withOptimisticUpdate]);

  const getTournament = useCallback(async (tournamentId: string): Promise<TournamentInfo> => {
    return withOptimisticUpdate(async () => {
      const response = await fetch(`/api/tournaments/${tournamentId}`);

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to fetch tournament');
      }

      const tournament = await response.json();
      
      // Update in tournaments list if exists
      setTournaments(prev => 
        prev.map(t => t.id === tournamentId ? tournament : t)
      );
      
      return tournament;
    })();
  }, [withOptimisticUpdate]);

  const joinTournament = useCallback(async (tournamentId: string) => {
    const originalTournaments = [...tournaments];
    
    return withOptimisticUpdate(
      async () => {
        
        const response = await fetch(`/api/tournaments/${tournamentId}/join`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || 'Failed to join tournament');
        }

        await refreshTournaments();
      },
      // Optimistic update
      () => {
        setTournaments(prev => 
          prev.map(t => 
            t.id === tournamentId 
              ? { ...t, currentPlayers: t.currentPlayers + 1, userRegistered: true }
              : t
          )
        );
      },
      // Revert update
      () => {
        setTournaments(originalTournaments);
      }
    )();
  }, [refreshTournaments, tournaments, withOptimisticUpdate]);

  const leaveTournament = useCallback(async (tournamentId: string) => {
    const originalTournaments = [...tournaments];
    
    return withOptimisticUpdate(
      async () => {
        
        const response = await fetch(`/api/tournaments/${tournamentId}/leave`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || 'Failed to leave tournament');
        }

        await refreshTournaments();
      },
      // Optimistic update
      () => {
        setTournaments(prev => 
          prev.map(t => 
            t.id === tournamentId 
              ? { ...t, currentPlayers: Math.max(0, t.currentPlayers - 1), userRegistered: false }
              : t
          )
        );
      },
      // Revert update
      () => {
        setTournaments(originalTournaments);
      }
    )();
  }, [refreshTournaments, tournaments, withOptimisticUpdate]);

  const startTournament = useCallback(async (tournamentId: string) => {
    const originalTournaments = [...tournaments];
    
    return withOptimisticUpdate(
      async () => {
        
        const response = await fetch(`/api/tournaments/${tournamentId}/start`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || 'Failed to start tournament');
        }

        await refreshTournaments();
      },
      // Optimistic update
      () => {
        setTournaments(prev => 
          prev.map(t => 
            t.id === tournamentId 
              ? { ...t, status: 'preparing' as const, startedAt: new Date().toISOString() }
              : t
          )
        );
      },
      // Revert update
      () => {
        setTournaments(originalTournaments);
      }
    )();
  }, [refreshTournaments, tournaments, withOptimisticUpdate]);

  const endTournament = useCallback(async (tournamentId: string) => {
    const originalTournaments = [...tournaments];
    
    return withOptimisticUpdate(
      async () => {
        
        const response = await fetch(`/api/tournaments/${tournamentId}/end`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || 'Failed to end tournament');
        }

        await refreshTournaments();
      },
      // Optimistic update
      () => {
        setTournaments(prev => 
          prev.map(t => 
            t.id === tournamentId 
              ? { ...t, status: 'completed' as const, completedAt: new Date().toISOString() }
              : t
          )
        );
      },
      // Revert update
      () => {
        setTournaments(originalTournaments);
      }
    )();
  }, [refreshTournaments, tournaments, withOptimisticUpdate]);

  const updateTournamentSettings = useCallback(async (
    tournamentId: string, 
    settings: Record<string, unknown>
  ) => {
    return withOptimisticUpdate(async () => {
      
      const response = await fetch(`/api/tournaments/${tournamentId}/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to update tournament settings');
      }

      await refreshTournaments();
    })();
  }, [refreshTournaments, withOptimisticUpdate]);

  const toggleTournamentReady = useCallback(async (tournamentId: string, ready: boolean) => {
    const originalTournaments = [...tournaments];
    
    return withOptimisticUpdate(
      async () => {
        
        const response = await fetch(`/api/tournaments/${tournamentId}/ready`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ready }),
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || 'Failed to update ready status');
        }

        await refreshTournaments();
      },
      // Optimistic update
      () => {
        setTournaments(prev => 
          prev.map(t => 
            t.id === tournamentId 
              ? { ...t, userReady: ready }
              : t
          )
        );
      },
      // Revert update
      () => {
        setTournaments(originalTournaments);
      }
    )();
  }, [refreshTournaments, tournaments, withOptimisticUpdate]);

  // Auto-fetch tournaments on mount (single load). Subsequent updates should come via event-driven contexts.
  useEffect(() => {
    void refreshTournaments();
  }, [refreshTournaments]);

  const contextValue: EnhancedTournamentContextValue = {
    tournaments,
    currentTournament,
    setCurrentTournament,
    createTournament,
    joinTournament,
    leaveTournament,
    startTournament,
    endTournament,
    updateTournamentSettings,
    toggleTournamentReady,
    refreshTournaments,
    getTournament,
    preparation: activePreparation,
    statistics: activeStatistics,
    loading,
    error,
    lastUpdated,
  };

  return (
    <EnhancedTournamentContext.Provider value={contextValue}>
      {children}
    </EnhancedTournamentContext.Provider>
  );
}

export function useEnhancedTournaments() {
  const context = useContext(EnhancedTournamentContext);
  if (!context) {
    throw new Error("useEnhancedTournaments must be used within an EnhancedTournamentProvider");
  }
  return context;
}