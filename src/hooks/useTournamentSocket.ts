import { useEffect, useCallback, useRef } from 'react';
import type { Socket } from 'socket.io-client';
import { useSocket } from '@/lib/hooks/useSocket';
import { TOURNAMENT_SOCKET_EVENTS } from '@/lib/tournament/constants';

const SERVER_EVENT_ALIASES: Partial<Record<string, string[]>> = {
  [TOURNAMENT_SOCKET_EVENTS.TOURNAMENT_UPDATED]: ['TOURNAMENT_UPDATED'],
  [TOURNAMENT_SOCKET_EVENTS.PHASE_CHANGED]: ['PHASE_CHANGED'],
  [TOURNAMENT_SOCKET_EVENTS.PLAYER_JOINED]: ['PLAYER_JOINED'],
  [TOURNAMENT_SOCKET_EVENTS.PLAYER_LEFT]: ['PLAYER_LEFT'],
  [TOURNAMENT_SOCKET_EVENTS.ROUND_STARTED]: ['ROUND_STARTED'],
  [TOURNAMENT_SOCKET_EVENTS.MATCH_ASSIGNED]: ['MATCH_ASSIGNED'],
  [TOURNAMENT_SOCKET_EVENTS.STATISTICS_UPDATED]: ['STATISTICS_UPDATED'],
  [TOURNAMENT_SOCKET_EVENTS.UPDATE_PREPARATION]: ['UPDATE_PREPARATION'],
  [TOURNAMENT_SOCKET_EVENTS.ERROR]: ['TOURNAMENT_ERROR'],
};

interface TournamentSocketEvents {
  // Tournament events
  onTournamentUpdated?: (data: { id: string; name?: string; status?: string; [key: string]: unknown }) => void;
  onPhaseChanged?: (data: { 
    tournamentId: string; 
    newPhase: string; 
    newStatus: string; 
    timestamp: string; 
  }) => void;
  onPlayerJoined?: (data: { 
    tournamentId: string;
    playerId: string; 
    playerName: string; 
    currentPlayerCount: number; 
  }) => void;
  onPlayerLeft?: (data: { 
    tournamentId: string;
    playerId: string; 
    playerName: string; 
    currentPlayerCount: number; 
  }) => void;
  
  // Match events
  onRoundStarted?: (data: { 
    tournamentId: string; 
    roundNumber: number; 
    matches: Array<{
      id: string;
      player1Id: string;
      player1Name: string;
      player2Id: string | null;
      player2Name: string | null;
    }>; 
  }) => void;
  onMatchAssigned?: (data: { 
    tournamentId: string; 
    matchId: string; 
    opponentId: string | null; 
    opponentName: string | null; 
    lobbyName: string; 
  }) => void;
  onStatisticsUpdated?: (data: { tournamentId: string; [key: string]: unknown }) => void;
  
  // Preparation events
  onPreparationUpdate?: (data: { 
    tournamentId: string; 
    playerId: string; 
    preparationStatus: string; 
    deckSubmitted: boolean; 
    readyPlayerCount: number; 
    totalPlayerCount: number; 
  }) => void;
  
  // Error handling
  onError?: (error: { 
    code: string; 
    message: string; 
    details?: string; 
  }) => void;
}

interface UseTournamentSocketReturn {
  socket: Socket | null;
  isConnected: boolean;
  joinTournament: (tournamentId: string) => void;
  leaveTournament: (tournamentId: string) => void;
  updatePreparation: (tournamentId: string, preparationData: Record<string, unknown>) => void;
  submitMatchResult: (matchId: string, result: Record<string, unknown>) => void;
  currentTournament: string | null;
}

export function useTournamentSocket(events: TournamentSocketEvents = {}): UseTournamentSocketReturn {
  // Use the exact same Socket.IO server configuration as matches
  // The useSocket hook will use NEXT_PUBLIC_WS_URL and NEXT_PUBLIC_WS_PATH from env
  const socket = useSocket({
    autoConnect: true,
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionAttempts: 5
  });

  const currentTournamentRef = useRef<string | null>(null);
  const eventsRef = useRef(events);

  // Update events ref when events change
  useEffect(() => {
    eventsRef.current = events;
  }, [events]);

  // Set up event listeners
  useEffect(() => {
    if (!socket) return;

    const registerEvent = <Args extends unknown[]>(eventName: string, handler: (...args: Args) => void) => {
      const aliases = SERVER_EVENT_ALIASES[eventName] ?? [];
      const eventNames = [eventName, ...aliases];
      eventNames.forEach((name) => socket.on(name, handler));
      return () => {
        eventNames.forEach((name) => socket.off(name, handler));
      };
    };

    // Tournament events
    const handleTournamentUpdated = (data: { id: string; name?: string; status?: string; [key: string]: unknown }) => {
      eventsRef.current.onTournamentUpdated?.(data);
    };

    const handlePhaseChanged = (data: { 
      tournamentId: string; 
      newPhase: string; 
      newStatus: string; 
      timestamp: string; 
    }) => {
      eventsRef.current.onPhaseChanged?.(data);
    };

    const handlePlayerJoined = (data: { 
      tournamentId: string;
      playerId: string; 
      playerName: string; 
      currentPlayerCount: number; 
    }) => {
      eventsRef.current.onPlayerJoined?.(data);
    };

    const handlePlayerLeft = (data: { 
      tournamentId: string;
      playerId: string; 
      playerName: string; 
      currentPlayerCount: number; 
    }) => {
      eventsRef.current.onPlayerLeft?.(data);
    };

    // Match events
    const handleRoundStarted = (data: { 
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
      eventsRef.current.onRoundStarted?.(data);
    };

    const handleMatchAssigned = (data: { 
      tournamentId: string; 
      matchId: string; 
      opponentId: string | null; 
      opponentName: string | null; 
      lobbyName: string; 
    }) => {
      eventsRef.current.onMatchAssigned?.(data);
    };

    const handleStatisticsUpdated = (data: { tournamentId: string; [key: string]: unknown }) => {
      eventsRef.current.onStatisticsUpdated?.(data);
    };

    // Preparation events
    const handlePreparationUpdate = (data: { 
      tournamentId: string; 
      playerId: string; 
      preparationStatus: string; 
      deckSubmitted: boolean; 
      readyPlayerCount: number; 
      totalPlayerCount: number; 
    }) => {
      eventsRef.current.onPreparationUpdate?.(data);
    };

    // Error handling
    const handleError = (error: { 
      code: string; 
      message: string; 
      details?: string; 
    }) => {
      console.error('Tournament socket error:', error);
      eventsRef.current.onError?.(error);
    };

    // Register event listeners (with uppercase fallbacks for legacy server broadcasts)
    const cleanups = [
      registerEvent(TOURNAMENT_SOCKET_EVENTS.TOURNAMENT_UPDATED, handleTournamentUpdated),
      registerEvent(TOURNAMENT_SOCKET_EVENTS.PHASE_CHANGED, handlePhaseChanged),
      registerEvent(TOURNAMENT_SOCKET_EVENTS.PLAYER_JOINED, handlePlayerJoined),
      registerEvent(TOURNAMENT_SOCKET_EVENTS.PLAYER_LEFT, handlePlayerLeft),
      registerEvent(TOURNAMENT_SOCKET_EVENTS.ROUND_STARTED, handleRoundStarted),
      registerEvent(TOURNAMENT_SOCKET_EVENTS.MATCH_ASSIGNED, handleMatchAssigned),
      registerEvent(TOURNAMENT_SOCKET_EVENTS.STATISTICS_UPDATED, handleStatisticsUpdated),
      registerEvent(TOURNAMENT_SOCKET_EVENTS.UPDATE_PREPARATION, handlePreparationUpdate),
      registerEvent(TOURNAMENT_SOCKET_EVENTS.ERROR, handleError),
    ];

    // Connection events
    socket.on('connect', () => {
      console.log('Tournament socket connected');
      // Rejoin current tournament if we were in one
      if (currentTournamentRef.current) {
        socket.emit(TOURNAMENT_SOCKET_EVENTS.JOIN_TOURNAMENT, {
          tournamentId: currentTournamentRef.current
        });
      }
    });

    socket.on('disconnect', () => {
      console.log('Tournament socket disconnected');
    });

    socket.on('connect_error', (error) => {
      console.error('Tournament socket connection error:', error);
      eventsRef.current.onError?.({
        code: 'CONNECTION_ERROR',
        message: 'Failed to connect to tournament server',
        details: error.message
      });
    });

    // Cleanup
    return () => {
      cleanups.forEach((cleanup) => cleanup());
      socket.off('connect');
      socket.off('disconnect');
      socket.off('connect_error');
    };
  }, [socket]);

  // Tournament actions
  const joinTournament = useCallback((tournamentId: string) => {
    if (!socket) return;

    currentTournamentRef.current = tournamentId;
    socket.emit(TOURNAMENT_SOCKET_EVENTS.JOIN_TOURNAMENT, { tournamentId });
  }, [socket]);

  const leaveTournament = useCallback((tournamentId: string) => {
    if (!socket) return;

    currentTournamentRef.current = null;
    socket.emit(TOURNAMENT_SOCKET_EVENTS.LEAVE_TOURNAMENT, { tournamentId });
  }, [socket]);

  const updatePreparation = useCallback((
    tournamentId: string, 
    preparationData: Record<string, unknown>
  ) => {
    if (!socket) return;

    socket.emit(TOURNAMENT_SOCKET_EVENTS.UPDATE_PREPARATION, {
      tournamentId,
      preparationData
    });
  }, [socket]);

  const submitMatchResult = useCallback((
    matchId: string, 
    result: Record<string, unknown>
  ) => {
    if (!socket) return;

    socket.emit(TOURNAMENT_SOCKET_EVENTS.SUBMIT_MATCH_RESULT, {
      matchId,
      result
    });
  }, [socket]);

  return {
    socket,
    isConnected: socket?.connected ?? false,
    joinTournament,
    leaveTournament,
    updatePreparation,
    submitMatchResult,
    currentTournament: currentTournamentRef.current
  };
}
