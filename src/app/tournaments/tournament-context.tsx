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
      // TODO: Implement server communication
      console.log("Creating tournament:", config);
      // For now, create a mock tournament
      const mockTournament: TournamentInfo = {
        id: `tournament_${Date.now()}`,
        name: config.name,
        format: config.format,
        status: "registering",
        maxPlayers: config.maxPlayers,
        registeredPlayers: [],
        standings: [],
        currentRound: 0,
        totalRounds: config.format === "swiss" ? 3 : Math.ceil(Math.log2(config.maxPlayers)),
        rounds: [],
        matchType: config.matchType,
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
        createdAt: Date.now(),
      };
      
      setTournaments(prev => [mockTournament, ...prev]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create tournament");
    } finally {
      setLoading(false);
    }
  }, []);

  const joinTournament = useCallback(async (tournamentId: string) => {
    setLoading(true);
    setError(null);
    try {
      // TODO: Implement server communication
      console.log("Joining tournament:", tournamentId);
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
      // TODO: Implement server communication
      console.log("Leaving tournament:", tournamentId);
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
      // TODO: Implement server communication
      console.log("Starting tournament:", tournamentId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start tournament");
    } finally {
      setLoading(false);
    }
  }, []);

  const requestTournaments = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // TODO: Implement server communication
      console.log("Requesting tournaments list");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch tournaments");
    } finally {
      setLoading(false);
    }
  }, []);

  const contextValue: TournamentContextValue = {
    tournaments,
    currentTournament,
    createTournament,
    joinTournament,
    leaveTournament,
    startTournament,
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