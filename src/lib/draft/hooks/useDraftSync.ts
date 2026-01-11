/**
 * React Hooks for Draft Synchronization Integration
 * Provides React components with access to draft sync functionality
 */

import { useEffect, useCallback, useRef } from "react";
import { useOnline } from "@/app/online/online-context";
import { DraftSyncManager } from "../sync/DraftSyncManager";
import { useDraftSyncStore } from "../sync/DraftSyncStore";
import { PickSyncSocketHandler } from "../sync/socketHandlers";
import type {
  DraftSession,
  PlayerDraftState,
  PickResult,
  SyncMetrics,
} from "../sync/types";

// Hook return types
interface UseDraftSyncReturn {
  // Session management
  initializeSession: (
    sessionId: string,
    players: string[],
    hostPlayerId: string
  ) => void;
  joinSession: (sessionId: string, playerId: string) => Promise<boolean>;
  leaveSession: () => void;

  // Pick coordination
  makePickAttempt: (cardId: string) => Promise<PickResult>;

  // State accessors
  session: DraftSession | null;
  isConnected: boolean;
  currentPlayerId: string | null;
  waitingForPlayers: boolean;
  allPlayersReady: boolean;
  waitingPlayers: string[];
  pickProgress: { completed: number; total: number; percentage: number };
  packContents: string[];

  // Performance monitoring
  connectionQuality: "excellent" | "good" | "poor" | "unstable";
  syncLatency: number;
  metrics: SyncMetrics | null;

  // Error handling
  lastError: string | null;
}

interface UsePlayerSyncReturn {
  // Player state
  players: Record<string, PlayerDraftState>;
  updatePlayerState: (
    playerId: string,
    updates: Partial<PlayerDraftState>
  ) => void;

  // Connection management
  handleDisconnection: (playerId: string) => void;
  handleReconnection: (playerId: string) => void;

  // Status tracking
  connectedPlayers: string[];
  disconnectedPlayers: string[];
  playersWithCurrentPick: string[];
}

interface UsePickTimerReturn {
  // Timer state
  timeRemaining: number;
  hasTimeRemaining: boolean;
  isWarningTime: boolean;
  hasTimedOut: boolean;

  // Timer controls
  startTimer: (duration: number) => void;
  pauseTimer: () => void;
  resumeTimer: () => void;
  resetTimer: () => void;

  // Event handlers
  onWarning: (callback: (seconds: number) => void) => () => void;
  onTimeout: (callback: () => void) => () => void;
}

/**
 * Primary hook for draft synchronization
 * Provides complete draft sync functionality for React components
 */
export function useDraftSync(playerId: string): UseDraftSyncReturn {
  const { transport } = useOnline();
  const socket = transport?.getSocket() ?? null;
  const store = useDraftSyncStore();
  const syncManagerRef = useRef<DraftSyncManager | null>(null);
  const socketHandlerRef = useRef<PickSyncSocketHandler | null>(null);

  // Initialize sync manager and socket handler
  useEffect(() => {
    if (!socket) return;

    // Create sync manager if it doesn't exist
    if (!syncManagerRef.current) {
      syncManagerRef.current = new DraftSyncManager();
      console.log("[useDraftSync] Created DraftSyncManager");
    }

    // Create socket handler if it doesn't exist
    if (!socketHandlerRef.current) {
      socketHandlerRef.current = new PickSyncSocketHandler(
        socket,
        syncManagerRef.current
      );
      console.log("[useDraftSync] Created PickSyncSocketHandler");
    }

    return () => {
      // Cleanup socket handler when socket changes
      if (socketHandlerRef.current) {
        socketHandlerRef.current.destroy();
        socketHandlerRef.current = null;
      }
    };
  }, [socket]);

  // Session management
  const initializeSession = useCallback(
    (sessionId: string, players: string[], hostPlayerId: string) => {
      console.log(
        `[useDraftSync] Initializing session ${sessionId} with ${players.length} players`
      );

      store.initializeSession(sessionId, players, hostPlayerId, playerId);

      if (socketHandlerRef.current) {
        socketHandlerRef.current.connectToSession(sessionId, playerId);
      }
    },
    [store, playerId]
  );

  const joinSession = useCallback(
    async (sessionId: string, playerIdToJoin: string) => {
      console.log(`[useDraftSync] Joining session ${sessionId}`);

      const success = await store.joinSession(sessionId, playerIdToJoin);

      if (success && socketHandlerRef.current) {
        socketHandlerRef.current.connectToSession(sessionId, playerIdToJoin);
      }

      return success;
    },
    [store]
  );

  const leaveSession = useCallback(() => {
    console.log("[useDraftSync] Leaving session");

    store.leaveSession();

    if (socketHandlerRef.current) {
      socketHandlerRef.current.disconnectFromSession();
    }
  }, [store]);

  // Pick coordination
  const makePickAttempt = useCallback(
    async (cardId: string): Promise<PickResult> => {
      console.log(`[useDraftSync] Attempting pick: ${cardId}`);

      if (socketHandlerRef.current) {
        return await socketHandlerRef.current.attemptPick(cardId);
      }

      // Fallback to store if socket handler not available
      const result = await store.makePickAttempt(cardId);
      // Ensure PickResult contract compliance
      return {
        success: result.success,
        conflict: false, // Store method doesn't track conflicts
        message: result.message,
      };
    },
    [store]
  );

  // Performance monitoring
  const requestSync = useCallback(() => {
    console.log("[useDraftSync] Requesting session sync");

    if (socketHandlerRef.current) {
      socketHandlerRef.current.requestSync();
    } else {
      store.syncWithServer();
    }
  }, [store]);

  // Connection monitoring
  useEffect(() => {
    if (!socket) return;

    const handleConnect = () => {
      console.log("[useDraftSync] Socket connected");
      store.updateConnectionStatus(true);
    };

    const handleDisconnect = () => {
      console.log("[useDraftSync] Socket disconnected");
      store.updateConnectionStatus(false);
    };

    const handleConnectError = (error: Error) => {
      console.error("[useDraftSync] Socket connection error:", error);
      store.updateConnectionStatus(false);
    };

    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);
    socket.on("connect_error", handleConnectError);

    return () => {
      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
      socket.off("connect_error", handleConnectError);
    };
  }, [socket, store]);

  // Auto-sync timer
  useEffect(() => {
    if (!store.isConnected) return;

    const syncInterval = setInterval(() => {
      requestSync();
    }, 5000); // Sync every 5 seconds

    return () => clearInterval(syncInterval);
  }, [store.isConnected, requestSync]);

  return {
    // Session management
    initializeSession,
    joinSession,
    leaveSession,

    // Pick coordination
    makePickAttempt,

    // State accessors
    session: store.currentSession,
    isConnected: store.isConnected,
    currentPlayerId: store.currentPlayerId,
    waitingForPlayers: store.waitingForPlayers,
    allPlayersReady: store.getAllPlayersReady(),
    waitingPlayers: store.getWaitingPlayers(),
    pickProgress: store.getPickProgress(),
    packContents: store.getCurrentPackContents(),

    // Performance monitoring
    connectionQuality: store.getConnectionQuality(),
    syncLatency: store.syncLatency,
    metrics: store.metrics,

    // Error handling - would need to add error state to store
    lastError: null,
  };
}

/**
 * Hook for managing player state synchronization
 */
export function usePlayerSync(): UsePlayerSyncReturn {
  const store = useDraftSyncStore();

  const connectedPlayers = Object.keys(store.players).filter(
    (playerId) => store.players[playerId]?.isConnected
  );

  const disconnectedPlayers = Object.keys(store.players).filter(
    (playerId) => !store.players[playerId]?.isConnected
  );

  const playersWithCurrentPick = Object.keys(store.players).filter(
    (playerId) => {
      const player = store.players[playerId];
      const session = store.currentSession;
      if (!player || !session) return false;

      const pickState = session.pickStates[playerId];
      return pickState?.hasPickedThisRound || false;
    }
  );

  return {
    // Player state
    players: store.players,
    updatePlayerState: store.updatePlayerState,

    // Connection management
    handleDisconnection: store.handleDisconnection,
    handleReconnection: store.handleReconnection,

    // Status tracking
    connectedPlayers,
    disconnectedPlayers,
    playersWithCurrentPick,
  };
}

/**
 * Hook for managing pick timers
 */
export function usePickTimer(): UsePickTimerReturn {
  const store = useDraftSyncStore();
  const timerCallbacksRef = useRef<{
    warning: Set<(seconds: number) => void>;
    timeout: Set<() => void>;
  }>({
    warning: new Set(),
    timeout: new Set(),
  });

  // Get current timer state
  const currentPlayerId = store.currentPlayerId;
  const currentTimer = currentPlayerId
    ? store.timers[`pick-${currentPlayerId}`]
    : null;

  const timeRemaining = currentTimer?.remaining || 0;
  const hasTimeRemaining = timeRemaining > 0;
  const isWarningTime = timeRemaining > 0 && timeRemaining <= 20; // Warning at 20 seconds
  const hasTimedOut = currentTimer?.hasTimedOut || false;

  // Timer controls
  const startTimer = useCallback(
    (duration: number) => {
      console.log(`[usePickTimer] Starting timer for ${duration}s`);
      store.startPickTimer(duration * 1000); // Convert to milliseconds
    },
    [store]
  );

  const pauseTimer = useCallback(() => {
    console.log("[usePickTimer] Pause timer - not implemented");
    // Would need to add pause functionality to store
  }, []);

  const resumeTimer = useCallback(() => {
    console.log("[usePickTimer] Resume timer - not implemented");
    // Would need to add resume functionality to store
  }, []);

  const resetTimer = useCallback(() => {
    console.log("[usePickTimer] Reset timer - not implemented");
    // Would need to add reset functionality to store
  }, []);

  // Event handlers
  const onWarning = useCallback((callback: (seconds: number) => void) => {
    timerCallbacksRef.current.warning.add(callback);

    return () => {
      timerCallbacksRef.current.warning.delete(callback);
    };
  }, []);

  const onTimeout = useCallback((callback: () => void) => {
    timerCallbacksRef.current.timeout.add(callback);

    return () => {
      timerCallbacksRef.current.timeout.delete(callback);
    };
  }, []);

  // Timer update effect
  useEffect(() => {
    if (!currentTimer || hasTimedOut) return;

    const interval = setInterval(() => {
      const newRemaining = Math.max(0, currentTimer.remaining - 1000);

      // Update timer in store
      if (currentPlayerId) {
        const timerKey = `pick-${currentPlayerId}`;
        store.timers[timerKey] = {
          ...currentTimer,
          remaining: newRemaining,
        };
      }

      // Trigger warning callbacks
      if (newRemaining > 0 && newRemaining <= 20000 && !isWarningTime) {
        const seconds = Math.ceil(newRemaining / 1000);
        timerCallbacksRef.current.warning.forEach((callback) =>
          callback(seconds)
        );
      }

      // Trigger timeout callbacks
      if (newRemaining === 0) {
        store.handlePickTimeout();
        timerCallbacksRef.current.timeout.forEach((callback) => callback());
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [currentTimer, hasTimedOut, currentPlayerId, isWarningTime, store]);

  return {
    // Timer state
    timeRemaining: Math.ceil(timeRemaining / 1000), // Convert to seconds
    hasTimeRemaining,
    isWarningTime,
    hasTimedOut,

    // Timer controls
    startTimer,
    pauseTimer,
    resumeTimer,
    resetTimer,

    // Event handlers
    onWarning,
    onTimeout,
  };
}

/**
 * Hook for synchronization metrics and performance monitoring
 */
export function useSyncMetrics() {
  const store = useDraftSyncStore();

  return {
    metrics: store.metrics,
    performanceReport: store.getPerformanceReport(),
    updateMetrics: store.updateMetrics,

    // Connection quality indicators
    connectionQuality: store.getConnectionQuality(),
    syncLatency: store.syncLatency,
    lastSyncTime: store.lastSyncTime,

    // Helper methods
    isHighLatency: store.syncLatency > 200,
    isUnstable: store.getConnectionQuality() === "unstable",
  };
}

/**
 * Utility hook for debugging draft sync state
 */
export function useDraftSyncDebug() {
  const store = useDraftSyncStore();

  return {
    // Debug state
    currentSession: store.currentSession,
    players: store.players,
    coordination: store.coordination,
    timers: store.timers,

    // Debug actions
    logState: () => {
      console.group("[DraftSync Debug]");
      console.log("Current Session:", store.currentSession);
      console.log("Players:", store.players);
      console.log("Coordination:", store.coordination);
      console.log("Timers:", store.timers);
      console.log("Metrics:", store.metrics);
      console.groupEnd();
    },

    // Performance indicators
    performanceReport: store.getPerformanceReport(),
  };
}
