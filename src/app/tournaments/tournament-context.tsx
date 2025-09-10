"use client";

import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from "react";
import type { TournamentInfo, PlayerStanding } from "@/lib/net/protocol";

interface TournamentContextValue {
  // Tournament list and management
  tournaments: TournamentInfo[];
  currentTournament: TournamentInfo | null;
  
  // Tournament actions
  createTournament: (config: {
    name: string;
    format: "swiss" | "elimination" | "round_robin";
    matchType: "constructed" | "sealed" | "draft";
    maxPlayers: number;
    sealedConfig?: unknown;
    draftConfig?: unknown;
  }) => Promise<void>;
  joinTournament: (tournamentId: string) => Promise<void>;
  leaveTournament: (tournamentId: string) => Promise<void>;
  startTournament: (tournamentId: string) => Promise<void>;
  endTournament: (tournamentId: string) => Promise<void>;
  updateTournamentSettings: (tournamentId: string, settings: {
    name?: string;
    format?: "swiss" | "elimination" | "round_robin";
    matchType?: "constructed" | "sealed" | "draft";
    maxPlayers?: number;
    sealedConfig?: unknown;
    draftConfig?: unknown;
  }) => Promise<void>;
  toggleTournamentReady: (tournamentId: string, ready: boolean) => Promise<void>;
  requestTournaments: () => Promise<void>;
  
  // Tournament state
  loading: boolean;
  error: string | null;
}

const TournamentContext = createContext<TournamentContextValue | null>(null);

export function TournamentProvider({ children }: { children: ReactNode }) {
  const [tournaments, setTournaments] = useState<TournamentInfo[]>([]);
  const [currentTournament, setCurrentTournament] = useState<TournamentInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createTournament = useCallback(async (config: {
    name: string;
    format: "swiss" | "elimination" | "round_robin";
    matchType: "constructed" | "sealed" | "draft";
    maxPlayers: number;
    sealedConfig?: unknown;
    draftConfig?: unknown;
  }) => {
    setLoading(true);
    setError(null);
    try {
      console.log("Creating tournament:", config);
      
      const response = await fetch('/api/tournaments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: config.name,
          format: config.format,
          matchType: config.matchType,
          maxPlayers: config.maxPlayers,
          sealedConfig: config.sealedConfig ? {
            packCount: 6,
            setMix: ["sorcery"],
            timeLimit: 45,
          } : null,
          draftConfig: config.draftConfig ? {
            setMix: ["sorcery"],
            packCount: 3,
            packSize: 15,
          } : null,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to create tournament');
      }

      const tournament = await response.json();
      console.log("Tournament created:", tournament);
      
      // Refresh tournaments list
      await requestTournaments();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create tournament");
    } finally {
      setLoading(false);
    }
  }, []);

  const requestTournaments = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      console.log("Requesting tournaments list");
      
      const response = await fetch('/api/tournaments');

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to fetch tournaments');
      }

      const tournaments = await response.json() as TournamentInfo[];
      console.log("Tournaments fetched:", tournaments);
      
      setTournaments(tournaments);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch tournaments");
    } finally {
      setLoading(false);
    }
  }, []);

  const joinTournament = useCallback(async (tournamentId: string) => {
    setLoading(true);
    setError(null);
    try {
      console.log("Joining tournament:", tournamentId);
      
      const response = await fetch(`/api/tournaments/${tournamentId}/join`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to join tournament');
      }

      console.log("Joined tournament successfully");
      
      // Refresh tournaments list
      await requestTournaments();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to join tournament");
    } finally {
      setLoading(false);
    }
  }, []);

  const leaveTournament = useCallback(async (tournamentId: string) => {
    setLoading(true);
    setError(null);
    try {
      console.log("Leaving tournament:", tournamentId);
      
      const response = await fetch(`/api/tournaments/${tournamentId}/leave`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to leave tournament');
      }

      console.log("Left tournament successfully");
      
      // Refresh tournaments list
      await requestTournaments();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to leave tournament");
    } finally {
      setLoading(false);
    }
  }, []);

  const startTournament = useCallback(async (tournamentId: string) => {
    setLoading(true);
    setError(null);
    try {
      console.log("Starting tournament:", tournamentId);
      
      const response = await fetch(`/api/tournaments/${tournamentId}/start`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to start tournament');
      }

      console.log("Tournament started successfully");
      
      // Refresh tournaments list
      await requestTournaments();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start tournament");
    } finally {
      setLoading(false);
    }
  }, []);

  const endTournament = useCallback(async (tournamentId: string) => {
    setLoading(true);
    setError(null);
    try {
      console.log("Ending tournament:", tournamentId);
      
      const response = await fetch(`/api/tournaments/${tournamentId}/end`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to end tournament');
      }

      console.log("Tournament ended successfully");
      
      // Refresh tournaments list
      await requestTournaments();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to end tournament");
    } finally {
      setLoading(false);
    }
  }, []);

  const updateTournamentSettings = useCallback(async (tournamentId: string, settings: {
    name?: string;
    format?: "swiss" | "elimination" | "round_robin";
    matchType?: "constructed" | "sealed" | "draft";
    maxPlayers?: number;
    sealedConfig?: unknown;
    draftConfig?: unknown;
  }) => {
    setLoading(true);
    setError(null);
    try {
      console.log("Updating tournament settings:", { tournamentId, settings });
      
      const response = await fetch(`/api/tournaments/${tournamentId}/settings`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(settings),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to update tournament settings');
      }

      const result = await response.json();
      console.log("Tournament settings updated successfully:", result);
      
      // Refresh tournaments list
      await requestTournaments();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update tournament settings");
    } finally {
      setLoading(false);
    }
  }, []);

  const toggleTournamentReady = useCallback(async (tournamentId: string, ready: boolean) => {
    setLoading(true);
    setError(null);
    try {
      console.log("Toggling tournament ready status:", { tournamentId, ready });
      
      const response = await fetch(`/api/tournaments/${tournamentId}/ready`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ready }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to update ready status');
      }

      const result = await response.json();
      console.log("Tournament ready status updated:", result);
      
      // Refresh tournaments list
      await requestTournaments();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update ready status");
    } finally {
      setLoading(false);
    }
  }, []);

  // Auto-fetch tournaments on mount and set up periodic refresh
  useEffect(() => {
    requestTournaments();
    
    // Set up periodic refresh every 10 seconds for real-time updates
    const interval = setInterval(() => {
      requestTournaments();
    }, 10000);
    
    return () => clearInterval(interval);
  }, [requestTournaments]);

  const contextValue: TournamentContextValue = {
    tournaments,
    currentTournament,
    createTournament,
    joinTournament,
    leaveTournament,
    startTournament,
    endTournament,
    updateTournamentSettings,
    toggleTournamentReady,
    requestTournaments,
    loading,
    error,
  };

  return (
    <TournamentContext.Provider value={contextValue}>
      {children}
    </TournamentContext.Provider>
  );
}

export function useTournaments() {
  const context = useContext(TournamentContext);
  if (!context) {
    throw new Error("useTournaments must be used within a TournamentProvider");
  }
  return context;
}