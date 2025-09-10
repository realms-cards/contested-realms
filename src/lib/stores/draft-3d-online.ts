/**
 * Draft-3D Online Store Integration
 * Connects Draft3DStateManager with Zustand for React component access
 */

import { create } from 'zustand';
import { Draft3DStateManager } from '@/lib/models/Draft3DState';
import type { 
  Position3D, 
  PreviewType, 
  StackInteractionType, 
  EventPriority,
  OperationData,
  UIUpdateData,
  UIUpdateType
} from '@/types/draft-3d-events';
import type { 
  OnlineDraftState, 
  PlayerDraftState, 
  CardPreviewState, 
  StackInteraction 
} from '@/types/draft-models';

interface Draft3DOnlineState {
  // State Manager Instance
  stateManager: Draft3DStateManager;
  
  // Current Session Data
  sessionId: string | null;
  currentPlayerId: string | null;
  isConnected: boolean;
  
  // Active Previews (for UI rendering)
  activePreviews: Map<string, CardPreviewState>;
  
  // Player States (for presence indicators)
  playerStates: Map<string, PlayerDraftState>;
  
  // UI Sync State
  pendingUIUpdates: number;
  
  // Actions
  initialize: (sessionId: string, playerId: string) => void;
  cleanup: () => void;
  
  // Card Preview Actions
  createCardPreview: (
    cardId: string,
    previewType: PreviewType,
    position: Position3D,
    priority?: EventPriority
  ) => CardPreviewState | null;
  clearCardPreview: (previewId: string) => void;
  updateActivePreviews: () => void;
  
  // Stack Interaction Actions
  processStackInteraction: (
    interactionType: StackInteractionType,
    cardIds: string[],
    operationData: OperationData
  ) => { interaction: StackInteraction; conflicts: string[] } | null;
  completeStackInteraction: (interactionId: string) => void;
  
  // Player State Actions
  updatePlayerState: (playerId: string, updates: Partial<PlayerDraftState>) => void;
  removePlayer: (playerId: string) => void;
  updatePlayerStates: () => void;
  
  // UI Sync Actions
  addUIUpdate: (updateType: UIUpdateType, data: UIUpdateData, priority?: EventPriority) => void;
  processPendingUpdates: () => UIUpdateData[] | null;
  
  // Session Management
  joinSession: (sessionId: string, playerId: string) => void;
  leaveSession: () => void;
  setConnectionStatus: (isConnected: boolean) => void;
}

export const useDraft3DOnlineStore = create<Draft3DOnlineState>((set, get) => ({
  // Initial State
  stateManager: new Draft3DStateManager(),
  sessionId: null,
  currentPlayerId: null,
  isConnected: false,
  activePreviews: new Map(),
  playerStates: new Map(),
  pendingUIUpdates: 0,

  // Initialize the store for a session
  initialize: (sessionId: string, playerId: string) => {
    set({ 
      sessionId, 
      currentPlayerId: playerId,
      isConnected: true,
      activePreviews: new Map(),
      playerStates: new Map(),
      pendingUIUpdates: 0
    });
  },

  // Cleanup resources
  cleanup: () => {
    const { stateManager, sessionId } = get();
    if (sessionId) {
      stateManager.cleanupSession(sessionId);
    }
    set({
      sessionId: null,
      currentPlayerId: null,
      isConnected: false,
      activePreviews: new Map(),
      playerStates: new Map(),
      pendingUIUpdates: 0
    });
  },

  // Card Preview Management
  createCardPreview: (cardId, previewType, position, priority = 'low') => {
    const { stateManager, sessionId, currentPlayerId } = get();
    if (!sessionId || !currentPlayerId) return null;

    try {
      const preview = stateManager.previews.createPreview(
        sessionId,
        currentPlayerId,
        cardId,
        previewType,
        position,
        priority
      );
      
      // Update local state for immediate UI response
      set(state => {
        const previews = stateManager.previews.getActivePreviews(sessionId);
        const previewMap = new Map();
        for (const preview of previews) {
          previewMap.set(preview.previewId, preview);
        }
        return { activePreviews: previewMap };
      });
      
      return preview;
    } catch (error) {
      console.warn('[Draft3D] Failed to create preview:', error);
      return null;
    }
  },

  clearCardPreview: (previewId: string) => {
    const { stateManager, sessionId } = get();
    stateManager.previews.clearPreview(previewId);
    
    if (sessionId) {
      set(state => {
        const previews = stateManager.previews.getActivePreviews(sessionId);
        const previewMap = new Map();
        for (const preview of previews) {
          previewMap.set(preview.previewId, preview);
        }
        return { activePreviews: previewMap };
      });
    }
  },

  updateActivePreviews: () => {
    const { stateManager, sessionId } = get();
    if (!sessionId) return;

    const previews = stateManager.previews.getActivePreviews(sessionId);
    const previewMap = new Map();
    
    for (const preview of previews) {
      previewMap.set(preview.previewId, preview);
    }
    
    set({ activePreviews: previewMap });
  },

  // Stack Interaction Management
  processStackInteraction: (interactionType, cardIds, operationData) => {
    const { stateManager, sessionId, currentPlayerId } = get();
    if (!sessionId || !currentPlayerId) return null;

    try {
      const result = stateManager.interactions.processInteraction(
        sessionId,
        currentPlayerId,
        interactionType,
        cardIds,
        operationData,
        Date.now()
      );
      
      return result;
    } catch (error) {
      console.warn('[Draft3D] Failed to process interaction:', error);
      return null;
    }
  },

  completeStackInteraction: (interactionId: string) => {
    const { stateManager } = get();
    stateManager.interactions.completeInteraction(interactionId);
  },

  // Player State Management
  updatePlayerState: (playerId, updates) => {
    const { stateManager, sessionId } = get();
    const updated = stateManager.players.updatePlayerState(playerId, updates);
    
    if (sessionId) {
      set(state => {
        const players = stateManager.players.getSessionPlayers(sessionId);
        const playerMap = new Map();
        for (const player of players) {
          playerMap.set(player.playerId, player);
        }
        return { playerStates: playerMap };
      });
    }
    
    return updated;
  },

  removePlayer: (playerId: string) => {
    const { stateManager, sessionId } = get();
    stateManager.players.removePlayerState(playerId);
    stateManager.previews.clearPlayerPreviews(playerId);
    
    if (sessionId) {
      set(state => {
        const players = stateManager.players.getSessionPlayers(sessionId);
        const playerMap = new Map();
        for (const player of players) {
          playerMap.set(player.playerId, player);
        }
        return { playerStates: playerMap };
      });
    }
  },

  updatePlayerStates: () => {
    const { stateManager, sessionId } = get();
    if (!sessionId) return;

    const players = stateManager.players.getSessionPlayers(sessionId);
    const playerMap = new Map();
    
    for (const player of players) {
      playerMap.set(player.playerId, player);
    }
    
    set({ playerStates: playerMap });
  },

  // UI Sync Management
  addUIUpdate: (updateType: UIUpdateType, data: UIUpdateData, priority: EventPriority = 'low') => {
    const { stateManager, sessionId, currentPlayerId } = get();
    if (!sessionId || !currentPlayerId) return;

    stateManager.uiSync.addUpdate(sessionId, currentPlayerId, updateType, data, priority);
    set(state => ({ pendingUIUpdates: state.pendingUIUpdates + 1 }));
  },

  processPendingUpdates: () => {
    const { stateManager, sessionId } = get();
    if (!sessionId) return null;

    try {
      const batchKey = `${sessionId}-low`;
      const updates = stateManager.uiSync.processBatch(batchKey);
      
      if (updates) {
        set({ pendingUIUpdates: 0 });
      }
      
      return updates;
    } catch (error) {
      console.warn('[Draft3D] Failed to process pending updates:', error);
      return null;
    }
  },

  // Session Management
  joinSession: (sessionId: string, playerId: string) => {
    set({ 
      sessionId, 
      currentPlayerId: playerId, 
      isConnected: true 
    });
  },

  leaveSession: () => {
    const { stateManager, sessionId } = get();
    if (sessionId) {
      stateManager.cleanupSession(sessionId);
    }
    set({
      sessionId: null,
      currentPlayerId: null,
      isConnected: false,
      activePreviews: new Map(),
      playerStates: new Map(),
      pendingUIUpdates: 0
    });
  },

  setConnectionStatus: (isConnected: boolean) => {
    set({ isConnected });
  }
}));

// Utility hooks for common operations
export const useDraft3DPreviews = () => {
  const store = useDraft3DOnlineStore();
  return {
    activePreviews: store.activePreviews,
    createPreview: store.createCardPreview,
    clearPreview: store.clearCardPreview,
    updatePreviews: store.updateActivePreviews
  };
};

export const useDraft3DPlayers = () => {
  const store = useDraft3DOnlineStore();
  return {
    playerStates: store.playerStates,
    currentPlayerId: store.currentPlayerId,
    updatePlayer: store.updatePlayerState,
    removePlayer: store.removePlayer
  };
};

export const useDraft3DSession = () => {
  const store = useDraft3DOnlineStore();
  return {
    sessionId: store.sessionId,
    isConnected: store.isConnected,
    joinSession: store.joinSession,
    leaveSession: store.leaveSession,
    setConnectionStatus: store.setConnectionStatus
  };
};

export const useDraft3DInteractions = () => {
  const store = useDraft3DOnlineStore();
  return {
    processInteraction: store.processStackInteraction,
    completeInteraction: store.completeStackInteraction,
    addUIUpdate: store.addUIUpdate,
    processPendingUpdates: store.processPendingUpdates,
    pendingUIUpdates: store.pendingUIUpdates
  };
};