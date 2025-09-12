/**
 * DraftSyncStore - Zustand State Management for Draft Synchronization
 * Reactive state store that connects DraftSyncManager to React components
 */

import { create } from 'zustand';
import { DraftSyncManager } from './DraftSyncManager';
// TODO(draft-sync): Reintroduce additional types as features land.
import type {
  DraftSession,
  PlayerDraftState,
  PickCoordination,
  SyncMetrics,
  TimerState,
} from './types';

interface DraftSyncStoreState {
  // Core state
  syncManager: DraftSyncManager;
  currentSession: DraftSession | null;
  currentPlayerId: string | null;
  isConnected: boolean;
  
  // Player and session data
  players: Record<string, PlayerDraftState>;
  coordination: PickCoordination | null;
  metrics: SyncMetrics | null;
  timers: Record<string, TimerState>;
  
  // UI state
  waitingForPlayers: boolean;
  syncLatency: number;
  lastSyncTime: number;
  
  // Actions for session management
  initializeSession: (sessionId: string, players: string[], hostPlayerId: string, currentPlayerId: string) => void;
  joinSession: (sessionId: string, playerId: string) => Promise<boolean>;
  leaveSession: () => void;
  
  // Actions for pick coordination
  makePickAttempt: (cardId: string) => Promise<{ success: boolean; message?: string }>;
  handlePickResult: (playerId: string, cardId: string, success: boolean) => void;
  
  // Actions for synchronization
  updatePlayerState: (playerId: string, updates: Partial<PlayerDraftState>) => void;
  handlePackRotation: (rotationData: Record<string, string>) => void;
  syncWithServer: () => Promise<void>;
  
  // Actions for connection management
  handleDisconnection: (playerId: string) => void;
  handleReconnection: (playerId: string) => void;
  updateConnectionStatus: (isConnected: boolean) => void;
  
  // Actions for timing and warnings
  startPickTimer: (duration: number) => void;
  handlePickWarning: (secondsRemaining: number) => void;
  handlePickTimeout: () => void;
  
  // Getters for computed state
  getAllPlayersReady: () => boolean;
  getWaitingPlayers: () => string[];
  getPickProgress: () => { completed: number; total: number; percentage: number };
  getCurrentPackContents: () => string[];
  getConnectionQuality: () => 'excellent' | 'good' | 'poor' | 'unstable';
  
  // Performance and monitoring
  updateMetrics: (metrics: Partial<SyncMetrics>) => void;
  getPerformanceReport: () => {
    averageLatency: number;
    frameRate: number;
    memoryUsage: number;
    syncEfficiency: number;
  };
}

export const useDraftSyncStore = create<DraftSyncStoreState>((set, get) => ({
  // Initial state
  syncManager: new DraftSyncManager(),
  currentSession: null,
  currentPlayerId: null,
  isConnected: false,
  players: {},
  coordination: null,
  metrics: null,
  timers: {},
  waitingForPlayers: false,
  syncLatency: 0,
  lastSyncTime: 0,

  // Session management actions
  initializeSession: (sessionId: string, players: string[], hostPlayerId: string, currentPlayerId: string) => {
    const { syncManager } = get();
    
    const session = syncManager.createSession(sessionId, players, hostPlayerId);
    
    set({
      currentSession: session,
      currentPlayerId,
      isConnected: true,
      players: {},
      waitingForPlayers: false,
      lastSyncTime: Date.now()
    });

    console.log(`[DraftSyncStore] Initialized session ${sessionId} with ${players.length} players`);
  },

  joinSession: async (sessionId: string, playerId: string) => {
    const { syncManager } = get();
    
    try {
      const session = syncManager.getSession(sessionId);
      if (!session) {
        console.error(`[DraftSyncStore] Session ${sessionId} not found`);
        return false;
      }

      set({
        currentSession: session,
        currentPlayerId: playerId,
        isConnected: true,
        lastSyncTime: Date.now()
      });

      console.log(`[DraftSyncStore] Joined session ${sessionId} as player ${playerId}`);
      return true;
    } catch (error) {
      console.error('[DraftSyncStore] Failed to join session:', error);
      return false;
    }
  },

  leaveSession: () => {
    set({
      currentSession: null,
      currentPlayerId: null,
      isConnected: false,
      players: {},
      coordination: null,
      timers: {},
      waitingForPlayers: false
    });

    console.log('[DraftSyncStore] Left session');
  },

  // Pick coordination actions
  makePickAttempt: async (cardId: string) => {
    const { syncManager, currentSession, currentPlayerId } = get();
    
    if (!currentSession || !currentPlayerId) {
      return { success: false, message: 'No active session' };
    }

    try {
      // Update UI state immediately for optimistic updates
      set({ waitingForPlayers: true });

      const result = await syncManager.processPickEvent(
        currentSession.sessionId,
        currentPlayerId,
        cardId,
        Date.now()
      );

      if (result.success) {
        // Update session state
        const updatedSession = syncManager.getSession(currentSession.sessionId);
        set({ 
          currentSession: updatedSession || currentSession,
          waitingForPlayers: !result.shouldRotate,
          lastSyncTime: Date.now()
        });

        if (result.shouldRotate) {
          console.log('[DraftSyncStore] Pick successful, pack rotation triggered');
          return { success: true, message: 'Pick successful - rotating packs' };
        } else {
          console.log('[DraftSyncStore] Pick successful, waiting for other players');
          return { success: true, message: 'Pick successful - waiting for other players' };
        }
      } else {
        set({ waitingForPlayers: false });
        
        if (result.conflict) {
          return { success: false, message: 'Card picked by another player' };
        } else {
          return { success: false, message: 'Pick failed' };
        }
      }
    } catch (error) {
      set({ waitingForPlayers: false });
      console.error('[DraftSyncStore] Pick attempt failed:', error);
      return { success: false, message: 'Network error' };
    }
  },

  handlePickResult: (playerId: string, cardId: string, success: boolean) => {
    const { players } = get();
    
    if (success) {
      // Update player's card collection
      const updatedPlayers = { ...players };
      if (updatedPlayers[playerId]) {
        updatedPlayers[playerId].currentCards.push(cardId);
        updatedPlayers[playerId].totalPicks += 1;
        updatedPlayers[playerId].lastActivity = Date.now();
      }
      
      set({ players: updatedPlayers });
      console.log(`[DraftSyncStore] Player ${playerId} successfully picked ${cardId}`);
    }
  },

  // Synchronization actions
  updatePlayerState: (playerId: string, updates: Partial<PlayerDraftState>) => {
    const { players } = get();
    
    const updatedPlayers = {
      ...players,
      [playerId]: {
        ...players[playerId],
        ...updates
      } as PlayerDraftState
    };
    
    set({ 
      players: updatedPlayers,
      lastSyncTime: Date.now() 
    });
  },

  handlePackRotation: (rotationData: Record<string, string>) => {
    const { currentSession, currentPlayerId } = get();
    
    if (!currentSession || !currentPlayerId) return;

    // Update pack contents based on rotation
    const newOwner = rotationData[currentPlayerId];
    console.log(`[DraftSyncStore] Pack rotation: player ${currentPlayerId} receives pack from ${newOwner}`);
    
    set({
      waitingForPlayers: false,
      lastSyncTime: Date.now()
    });
  },

  syncWithServer: async () => {
    const { syncManager, currentSession } = get();
    
    if (!currentSession) return;

    try {
      const syncStart = Date.now();
      
      // Get latest session state from sync manager
      const updatedSession = syncManager.getSession(currentSession.sessionId);
      const metrics = syncManager.getMetrics(currentSession.sessionId);
      
      const syncLatency = Date.now() - syncStart;
      
      set({
        currentSession: updatedSession || currentSession,
        metrics,
        syncLatency,
        lastSyncTime: Date.now()
      });

      console.log(`[DraftSyncStore] Sync completed in ${syncLatency}ms`);
    } catch (error) {
      console.error('[DraftSyncStore] Sync failed:', error);
    }
  },

  // Connection management
  handleDisconnection: (playerId: string) => {
    const { syncManager, currentSession } = get();
    
    if (!currentSession) return;

    syncManager.handlePlayerDisconnection(currentSession.sessionId, playerId);
    
    // Update player connection status
    get().updatePlayerState(playerId, { 
      isConnected: false,
      connectionQuality: 'unstable'
    });

    console.log(`[DraftSyncStore] Player ${playerId} disconnected`);
  },

  handleReconnection: (playerId: string) => {
    const { syncManager, currentSession } = get();
    
    if (!currentSession) return;

    syncManager.handlePlayerReconnection(currentSession.sessionId, playerId);
    
    // Update player connection status
    get().updatePlayerState(playerId, { 
      isConnected: true,
      connectionQuality: 'good'
    });

    console.log(`[DraftSyncStore] Player ${playerId} reconnected`);
  },

  updateConnectionStatus: (isConnected: boolean) => {
    set({ 
      isConnected,
      lastSyncTime: Date.now() 
    });
  },

  // Timer management
  startPickTimer: (duration: number) => {
    const { currentPlayerId } = get();
    if (!currentPlayerId) return;

    const timer: TimerState = {
      sessionId: get().currentSession?.sessionId || '',
      playerId: currentPlayerId,
      timerType: 'pick',
      startTime: Date.now(),
      duration,
      remaining: duration,
      warnings: [],
      hasTimedOut: false,
      autoActionTaken: false
    };

    set(state => ({
      timers: {
        ...state.timers,
        [`pick-${currentPlayerId}`]: timer
      }
    }));
  },

  handlePickWarning: (secondsRemaining: number) => {
    console.log(`[DraftSyncStore] Pick warning: ${secondsRemaining}s remaining`);
    // This would trigger UI notifications
  },

  handlePickTimeout: () => {
    const { currentPlayerId } = get();
    console.log(`[DraftSyncStore] Pick timeout for player ${currentPlayerId}`);
    
    set(state => {
      const timerKey = `pick-${currentPlayerId}`;
      if (state.timers[timerKey]) {
        return {
          timers: {
            ...state.timers,
            [timerKey]: {
              ...state.timers[timerKey],
              hasTimedOut: true,
              remaining: 0
            }
          }
        };
      }
      return state;
    });
  },

  // Computed state getters
  getAllPlayersReady: () => {
    const { currentSession } = get();
    if (!currentSession) return false;

    const activePlayers = currentSession.players.filter(playerId => {
      const player = get().players[playerId];
      return player?.isConnected;
    });

    const playersWhoHavePicked = activePlayers.filter(playerId => {
      const pickState = currentSession.pickStates[playerId];
      return pickState?.hasPickedThisRound;
    });

    return playersWhoHavePicked.length === activePlayers.length;
  },

  getWaitingPlayers: () => {
    const { currentSession, players } = get();
    if (!currentSession) return [];

    return currentSession.players.filter(playerId => {
      const pickState = currentSession.pickStates[playerId];
      const player = players[playerId];
      return player?.isConnected && !pickState?.hasPickedThisRound;
    });
  },

  getPickProgress: () => {
    const { currentSession, players } = get();
    if (!currentSession) return { completed: 0, total: 0, percentage: 0 };

    const activePlayers = currentSession.players.filter(playerId => {
      const player = players[playerId];
      return player?.isConnected;
    });

    const completedPlayers = activePlayers.filter(playerId => {
      const pickState = currentSession.pickStates[playerId];
      return pickState?.hasPickedThisRound;
    });

    const total = activePlayers.length;
    const completed = completedPlayers.length;
    const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;

    return { completed, total, percentage };
  },

  getCurrentPackContents: () => {
    const { currentSession, currentPlayerId } = get();
    if (!currentSession || !currentPlayerId) return [];

    return currentSession.packContents[currentPlayerId] || [];
  },

  getConnectionQuality: () => {
    const { syncLatency, isConnected } = get();
    
    if (!isConnected) return 'unstable';
    
    if (syncLatency < 50) return 'excellent';
    if (syncLatency < 100) return 'good';
    if (syncLatency < 200) return 'poor';
    return 'unstable';
  },

  // Performance monitoring
  updateMetrics: (newMetrics: Partial<SyncMetrics>) => {
    const { metrics } = get();
    
    set({
      metrics: metrics ? { ...metrics, ...newMetrics } : null
    });
  },

  getPerformanceReport: () => {
    const { metrics, syncLatency } = get();
    
    return {
      averageLatency: metrics?.averagePickLatency || syncLatency,
      frameRate: metrics?.frameRate || 60,
      memoryUsage: metrics?.memoryUsage || 0,
      syncEfficiency: syncLatency > 0 ? Math.max(0, 100 - syncLatency) : 100
    };
  }
}));

// Utility hooks for specific aspects of draft sync
export const useDraftSyncSession = () => {
  const store = useDraftSyncStore();
  return {
    session: store.currentSession,
    isConnected: store.isConnected,
    initializeSession: store.initializeSession,
    joinSession: store.joinSession,
    leaveSession: store.leaveSession
  };
};

export const useDraftSyncPicks = () => {
  const store = useDraftSyncStore();
  return {
    makePickAttempt: store.makePickAttempt,
    waitingForPlayers: store.waitingForPlayers,
    allPlayersReady: store.getAllPlayersReady(),
    waitingPlayers: store.getWaitingPlayers(),
    pickProgress: store.getPickProgress(),
    packContents: store.getCurrentPackContents()
  };
};

export const useDraftSyncConnection = () => {
  const store = useDraftSyncStore();
  return {
    isConnected: store.isConnected,
    connectionQuality: store.getConnectionQuality(),
    syncLatency: store.syncLatency,
    lastSyncTime: store.lastSyncTime,
    handleDisconnection: store.handleDisconnection,
    handleReconnection: store.handleReconnection
  };
};

export const useDraftSyncPerformance = () => {
  const store = useDraftSyncStore();
  return {
    metrics: store.metrics,
    performanceReport: store.getPerformanceReport(),
    updateMetrics: store.updateMetrics
  };
};
