import { useEffect, useCallback, useRef } from "react";
import type { Socket } from "socket.io-client";
import { useOnline } from "@/app/online/online-context";
import { TOURNAMENT_SOCKET_EVENTS } from "@/lib/tournament/constants";

const SERVER_EVENT_ALIASES: Partial<Record<string, string[]>> = {
  [TOURNAMENT_SOCKET_EVENTS.TOURNAMENT_UPDATED]: ["TOURNAMENT_UPDATED"],
  [TOURNAMENT_SOCKET_EVENTS.PHASE_CHANGED]: ["PHASE_CHANGED"],
  [TOURNAMENT_SOCKET_EVENTS.PLAYER_JOINED]: ["PLAYER_JOINED"],
  [TOURNAMENT_SOCKET_EVENTS.PLAYER_LEFT]: ["PLAYER_LEFT"],
  [TOURNAMENT_SOCKET_EVENTS.ROUND_STARTED]: ["ROUND_STARTED"],
  [TOURNAMENT_SOCKET_EVENTS.MATCH_ASSIGNED]: ["MATCH_ASSIGNED"],
  [TOURNAMENT_SOCKET_EVENTS.STATISTICS_UPDATED]: ["STATISTICS_UPDATED"],
  [TOURNAMENT_SOCKET_EVENTS.UPDATE_PREPARATION]: ["UPDATE_PREPARATION"],
  [TOURNAMENT_SOCKET_EVENTS.DRAFT_READY]: ["DRAFT_READY"],
  [TOURNAMENT_SOCKET_EVENTS.PRESENCE_UPDATED]: ["PRESENCE_UPDATED"],
  [TOURNAMENT_SOCKET_EVENTS.ERROR]: ["TOURNAMENT_ERROR"],
};

interface TournamentSocketEvents {
  // Tournament events
  onTournamentUpdated?: (data: {
    id: string;
    name?: string;
    status?: string;
    [key: string]: unknown;
  }) => void;
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
  onStatisticsUpdated?: (data: {
    tournamentId: string;
    [key: string]: unknown;
  }) => void;

  // Preparation events
  onPreparationUpdate?: (data: {
    tournamentId: string;
    playerId: string;
    preparationStatus: string;
    deckSubmitted: boolean;
    readyPlayerCount: number;
    totalPlayerCount: number;
  }) => void;
  onDraftReady?: (data: {
    tournamentId: string;
    draftSessionId: string;
    totalPlayers?: number;
  }) => void;
  // Presence events
  onPresenceUpdated?: (data: {
    tournamentId: string;
    players: Array<{
      playerId: string;
      playerName: string;
      isConnected: boolean;
      lastActivity: number;
    }>;
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
  updatePreparation: (
    tournamentId: string,
    preparationData: Record<string, unknown>
  ) => void;
  submitMatchResult: (matchId: string, result: Record<string, unknown>) => void;
  currentTournament: string | null;
}

export function useTournamentSocket(
  events: TournamentSocketEvents = {}
): UseTournamentSocketReturn {
  // Use the shared transport from OnlineProvider instead of creating a separate socket
  // This prevents duplicate socket connections
  const { transport, connected } = useOnline();
  const socket = transport?.getSocket() ?? null;

  const currentTournamentRef = useRef<string | null>(null);
  const wasConnectedRef = useRef<boolean>(connected);
  const eventsRef = useRef(events);
  // T024: Event deduplication - track last 100 event IDs
  const lastEventIds = useRef<Set<string>>(new Set());

  // Update events ref when events change
  useEffect(() => {
    eventsRef.current = events;
  }, [events]);

  // T024: Helper to check for duplicate events and track them
  const isDuplicateEvent = useCallback((eventId: string): boolean => {
    if (lastEventIds.current.has(eventId)) {
      console.debug("[useTournamentSocket] Ignoring duplicate event:", eventId);
      return true;
    }

    // Add to set and maintain max 100 entries
    lastEventIds.current.add(eventId);
    if (lastEventIds.current.size > 100) {
      const first = lastEventIds.current.values().next().value;
      if (first !== undefined) {
        lastEventIds.current.delete(first);
      }
    }

    return false;
  }, []);

  // Set up event listeners
  useEffect(() => {
    if (!socket) return;

    type Listener = Parameters<Socket["on"]>[1];
    const registerEvent = (
      eventName: string,
      handler: (...args: unknown[]) => void
    ) => {
      // Wrap to satisfy socket's listener type without using explicit 'any'
      const wrapped = ((...args: unknown[]) =>
        handler(...args)) as unknown as Listener;
      const aliases = SERVER_EVENT_ALIASES[eventName] ?? [];
      const eventNames = [eventName, ...aliases];
      eventNames.forEach((name) => socket.on(name, wrapped));
      return () => {
        eventNames.forEach((name) => socket.off(name, wrapped));
      };
    };

    // Tournament events
    const handleTournamentUpdated = (data: {
      id: string;
      name?: string;
      status?: string;
      [key: string]: unknown;
    }) => {
      eventsRef.current.onTournamentUpdated?.(data);
    };

    const handlePhaseChanged = (data: {
      tournamentId: string;
      newPhase: string;
      newStatus: string;
      timestamp: string;
    }) => {
      // T024: Check for duplicate events
      const eventId = `${data.tournamentId}:PHASE_CHANGED:${data.newPhase}:${data.timestamp}`;
      if (isDuplicateEvent(eventId)) return;

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
      // T024: Check for duplicate events
      const eventId = `${data.tournamentId}:ROUND_STARTED:${data.roundNumber}`;
      if (isDuplicateEvent(eventId)) return;

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

    const handleStatisticsUpdated = (data: {
      tournamentId: string;
      [key: string]: unknown;
    }) => {
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

    const handleDraftReady = (data: {
      tournamentId: string;
      draftSessionId: string;
      totalPlayers?: number;
    }) => {
      // T024: Check for duplicate events
      const eventId = `${data.tournamentId}:DRAFT_READY:${data.draftSessionId}`;
      if (isDuplicateEvent(eventId)) return;

      eventsRef.current.onDraftReady?.(data);
    };

    const handlePresenceUpdated = (data: {
      tournamentId: string;
      players: Array<{
        playerId: string;
        playerName: string;
        isConnected: boolean;
        lastActivity: number;
      }>;
    }) => {
      eventsRef.current.onPresenceUpdated?.(data);
    };

    // Error handling
    const handleError = (error: {
      code: string;
      message: string;
      details?: string;
    }) => {
      console.error("Tournament socket error:", error);
      eventsRef.current.onError?.(error);
    };

    const handleJoinedAck = (data: { tournamentId?: string }) => {
      const tournamentId = data?.tournamentId;
      if (!tournamentId) return;
      currentTournamentRef.current = tournamentId;
      console.log("[useTournamentSocket] Joined tournament room", tournamentId);
    };

    const handleLeftAck = (data: { tournamentId?: string }) => {
      const tournamentId = data?.tournamentId;
      if (!tournamentId) return;
      if (currentTournamentRef.current === tournamentId) {
        currentTournamentRef.current = null;
      }
      console.log("[useTournamentSocket] Left tournament room", tournamentId);
    };

    // Register event listeners (with uppercase fallbacks for legacy server broadcasts)
    const cleanups = [
      registerEvent(
        TOURNAMENT_SOCKET_EVENTS.TOURNAMENT_UPDATED,
        (data: unknown) =>
          handleTournamentUpdated(
            data as {
              id: string;
              name?: string;
              status?: string;
              [key: string]: unknown;
            }
          )
      ),
      registerEvent(TOURNAMENT_SOCKET_EVENTS.PHASE_CHANGED, (data: unknown) =>
        handlePhaseChanged(
          data as {
            tournamentId: string;
            newPhase: string;
            newStatus: string;
            timestamp: string;
          }
        )
      ),
      registerEvent(TOURNAMENT_SOCKET_EVENTS.PLAYER_JOINED, (data: unknown) =>
        handlePlayerJoined(
          data as {
            tournamentId: string;
            playerId: string;
            playerName: string;
            currentPlayerCount: number;
          }
        )
      ),
      registerEvent(TOURNAMENT_SOCKET_EVENTS.PLAYER_LEFT, (data: unknown) =>
        handlePlayerLeft(
          data as {
            tournamentId: string;
            playerId: string;
            playerName: string;
            currentPlayerCount: number;
          }
        )
      ),
      registerEvent(TOURNAMENT_SOCKET_EVENTS.ROUND_STARTED, (data: unknown) =>
        handleRoundStarted(
          data as {
            tournamentId: string;
            roundNumber: number;
            matches: Array<{
              id: string;
              player1Id: string;
              player1Name: string;
              player2Id: string | null;
              player2Name: string | null;
            }>;
          }
        )
      ),
      registerEvent(TOURNAMENT_SOCKET_EVENTS.MATCH_ASSIGNED, (data: unknown) =>
        handleMatchAssigned(
          data as {
            tournamentId: string;
            matchId: string;
            opponentId: string | null;
            opponentName: string | null;
            lobbyName: string;
          }
        )
      ),
      registerEvent(
        TOURNAMENT_SOCKET_EVENTS.STATISTICS_UPDATED,
        (data: unknown) =>
          handleStatisticsUpdated(
            data as { tournamentId: string; [key: string]: unknown }
          )
      ),
      registerEvent(
        TOURNAMENT_SOCKET_EVENTS.UPDATE_PREPARATION,
        (data: unknown) =>
          handlePreparationUpdate(
            data as {
              tournamentId: string;
              playerId: string;
              preparationStatus: string;
              deckSubmitted: boolean;
              readyPlayerCount: number;
              totalPlayerCount: number;
            }
          )
      ),
      registerEvent(TOURNAMENT_SOCKET_EVENTS.DRAFT_READY, (data: unknown) =>
        handleDraftReady(
          data as {
            tournamentId: string;
            draftSessionId: string;
            totalPlayers?: number;
          }
        )
      ),
      registerEvent(
        TOURNAMENT_SOCKET_EVENTS.PRESENCE_UPDATED,
        (data: unknown) =>
          handlePresenceUpdated(
            data as {
              tournamentId: string;
              players: Array<{
                playerId: string;
                playerName: string;
                isConnected: boolean;
                lastActivity: number;
              }>;
            }
          )
      ),
      // Also listen to legacy/lowercase server event used by our Socket.IO server
      registerEvent("tournament:presence", (data: unknown) =>
        handlePresenceUpdated(
          data as {
            tournamentId: string;
            players: Array<{
              playerId: string;
              playerName: string;
              isConnected: boolean;
              lastActivity: number;
            }>;
          }
        )
      ),
      registerEvent("tournament:joined", (data: unknown) =>
        handleJoinedAck(data as { tournamentId?: string })
      ),
      registerEvent("tournament:left", (data: unknown) =>
        handleLeftAck(data as { tournamentId?: string })
      ),
      registerEvent(TOURNAMENT_SOCKET_EVENTS.ERROR, (error: unknown) =>
        handleError(
          error as { code: string; message: string; details?: string }
        )
      ),
    ];

    const handleConnectError = (error: Error) => {
      console.error("Tournament socket connection error:", error);
      eventsRef.current.onError?.({
        code: "CONNECTION_ERROR",
        message: "Failed to connect to tournament server",
        details: error.message,
      });
    };
    socket.on("connect_error", handleConnectError);

    // Cleanup
    return () => {
      cleanups.forEach((cleanup) => cleanup());
      socket.off("connect_error", handleConnectError);
    };
    // Note: isDuplicateEvent is intentionally excluded from deps to prevent effect re-runs
    // It only uses lastEventIds.current (ref) which doesn't require re-initialization
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket]);

  useEffect(() => {
    const justConnected = connected && !wasConnectedRef.current;
    wasConnectedRef.current = connected;

    if (!justConnected || !socket || !currentTournamentRef.current) {
      return;
    }

    socket.emit(TOURNAMENT_SOCKET_EVENTS.JOIN_TOURNAMENT, {
      tournamentId: currentTournamentRef.current,
    });
  }, [connected, socket]);

  // Tournament actions
  const joinTournament = useCallback(
    (tournamentId: string) => {
      if (!socket) {
        console.warn(
          "[useTournamentSocket] Cannot join tournament - socket not connected"
        );
        return;
      }

      console.log(
        "[useTournamentSocket] Joining tournament room:",
        tournamentId
      );
      currentTournamentRef.current = tournamentId;
      socket.emit(TOURNAMENT_SOCKET_EVENTS.JOIN_TOURNAMENT, { tournamentId });
    },
    [socket]
  );

  const leaveTournament = useCallback(
    (tournamentId: string) => {
      if (!socket) return;

      currentTournamentRef.current = null;
      socket.emit(TOURNAMENT_SOCKET_EVENTS.LEAVE_TOURNAMENT, { tournamentId });
    },
    [socket]
  );

  const updatePreparation = useCallback(
    (tournamentId: string, preparationData: Record<string, unknown>) => {
      if (!socket) return;

      socket.emit(TOURNAMENT_SOCKET_EVENTS.UPDATE_PREPARATION, {
        tournamentId,
        preparationData,
      });
    },
    [socket]
  );

  const submitMatchResult = useCallback(
    (matchId: string, result: Record<string, unknown>) => {
      if (!socket) return;

      socket.emit(TOURNAMENT_SOCKET_EVENTS.SUBMIT_MATCH_RESULT, {
        matchId,
        result,
      });
    },
    [socket]
  );

  return {
    socket,
    isConnected: connected,
    joinTournament,
    leaveTournament,
    updatePreparation,
    submitMatchResult,
    currentTournament: currentTournamentRef.current,
  };
}
