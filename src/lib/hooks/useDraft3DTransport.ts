/**
 * Transport Integration Hooks for Draft-3D Online
 * Connects SocketTransport with Draft3DStateManager and Zustand store
 */

import { useEffect, useCallback, useRef } from 'react';
import type { GameTransport } from '@/lib/net/transport';
import { useDraft3DOnlineStore } from '@/lib/stores/draft-3d-online';
import type { 
  CardPreviewEvent, 
  StackInteractionEvent, 
  UIUpdateEvent,
  Draft3DEventMap,
  PreviewType,
  EventPriority,
  StackInteractionType,
  UIUpdateType,
  OperationData,
  UIUpdateData
} from '@/types/draft-3d-events';

interface UseDraft3DTransportOptions {
  transport: GameTransport | null;
  sessionId: string | null;
  playerId: string | null;
  onError?: (error: Error | string | unknown) => void;
}

export const useDraft3DTransport = ({
  transport,
  sessionId,
  playerId,
  onError
}: UseDraft3DTransportOptions) => {
  const store = useDraft3DOnlineStore();
  // Select stable action references to avoid effect loops when store state changes
  const initialize = useDraft3DOnlineStore(s => s.initialize);
  const cleanup = useDraft3DOnlineStore(s => s.cleanup);
  const setConnectionStatus = useDraft3DOnlineStore(s => s.setConnectionStatus);
  const unsubscribersRef = useRef<(() => void)[]>([]);

  // Initialize store when session starts
  useEffect(() => {
    if (sessionId && playerId) {
      initialize(sessionId, playerId);
    } else {
      cleanup();
    }
  }, [sessionId, playerId, initialize, cleanup]);

  // Connection status tracking
  useEffect(() => {
    setConnectionStatus(!!transport);
  }, [transport, setConnectionStatus]);

  // Set up event listeners when transport is available
  useEffect(() => {
    if (!transport || !sessionId || !playerId) return;

    const unsubscribers: (() => void)[] = [];

    // Card Preview Events
    unsubscribers.push(
      transport.on('draft:card:preview', (event: Draft3DEventMap['draft:card:preview']) => {
        if (event.sessionId !== sessionId) return;
        
        // Only process previews from other players to avoid echo
        if (event.playerId !== playerId) {
          store.stateManager.previews.createPreview(
            event.sessionId,
            event.playerId,
            event.cardId,
            event.previewType,
            event.position,
            event.priority
          );
          store.updateActivePreviews();
        }
      })
    );

    unsubscribers.push(
      transport.on('draft:card:preview_update', (event: Draft3DEventMap['draft:card:preview_update']) => {
        if (event.sessionId !== sessionId) return;
        
        if (event.isActive) {
          store.stateManager.previews.createPreview(
            event.sessionId,
            event.playerId,
            event.cardId,
            event.previewType,
            event.position,
            event.priority
          );
        } else {
          store.stateManager.previews.clearPreview(event.previewId);
        }
        store.updateActivePreviews();
      })
    );

    // Stack Interaction Events
    unsubscribers.push(
      transport.on('draft:stack:interact', (event: Draft3DEventMap['draft:stack:interact']) => {
        if (event.sessionId !== sessionId) return;
        
        // Process interaction for conflict detection
        const result = store.stateManager.interactions.processInteraction(
          event.sessionId,
          event.playerId,
          event.interactionType,
          event.cardIds,
          event.operationData
        );
        
        if (result.conflicts.length > 0) {
          console.warn('[Draft3D] Interaction conflicts detected:', result.conflicts);
        }
      })
    );

    unsubscribers.push(
      transport.on('draft:stack:interaction_result', (event: Draft3DEventMap['draft:stack:interaction_result']) => {
        if (event.sessionId !== sessionId) return;
        
        if (event.success) {
          store.stateManager.interactions.completeInteraction(event.interactionId);
        } else {
          store.stateManager.interactions.failInteraction(event.interactionId, event.error || 'Unknown error');
        }
      })
    );

    unsubscribers.push(
      transport.on('draft:stack:state_sync', (event: Draft3DEventMap['draft:stack:state_sync']) => {
        if (event.sessionId !== sessionId) return;
        
        // Handle server-authoritative stack state updates
        for (const update of event.stackUpdates) {
          console.log(`[Draft3D] Stack sync: ${update.stackId} has ${update.cardIds.length} cards`);
        }
      })
    );

    // UI Update Events
    unsubscribers.push(
      transport.on('draft:ui:update', (event: Draft3DEventMap['draft:ui:update']) => {
        if (event.sessionId !== sessionId) return;
        
        // Process individual UI updates from other players
        for (const update of event.uiUpdates) {
          store.stateManager.uiSync.addUpdate(
            event.sessionId,
            event.playerId,
            update.type,
            update.data,
            update.priority
          );
        }
      })
    );

    unsubscribers.push(
      transport.on('draft:ui:sync_batch', (event: Draft3DEventMap['draft:ui:sync_batch']) => {
        if (event.sessionId !== sessionId) return;
        
        // Handle batched UI updates from server
        console.log(`[Draft3D] Received UI batch with ${event.updates.length} updates`);
      })
    );

    // Session Management Events
    unsubscribers.push(
      transport.on('draft:session:joined', (event: Draft3DEventMap['draft:session:joined']) => {
        if (event.sessionId !== sessionId) return;
        
        // Update player states when someone joins
        if (event.playerState) {
          store.stateManager.players.updatePlayerState(
            event.playerState.playerId,
            event.playerState
          );
          store.updatePlayerStates();
        }
      })
    );

    unsubscribers.push(
      transport.on('draft:session:leave', (event: Draft3DEventMap['draft:session:leave']) => {
        if (event.sessionId !== sessionId) return;
        
        // Clean up when player leaves
        store.removePlayer(event.playerId);
      })
    );

    // Error Handling
    unsubscribers.push(
      transport.on('draft:error', (event: Draft3DEventMap['draft:error']) => {
        console.error('[Draft3D] Transport error:', event.error);
        if (onError) {
          onError(event.error);
        }
      })
    );

    // Reconnection Handling
    unsubscribers.push(
      transport.on('draft:system:reconnect', (event: Draft3DEventMap['draft:system:reconnect']) => {
        if (event.sessionId !== sessionId) return;
        
        console.log('[Draft3D] Reconnected, resyncing state...');
        // Trigger state resync after reconnection
        store.updateActivePreviews();
        store.updatePlayerStates();
      })
    );

    // Store unsubscribers for cleanup
    unsubscribersRef.current = unsubscribers;

    // Cleanup function
    return () => {
      unsubscribers.forEach(unsub => {
        try {
          unsub();
        } catch (error) {
          console.warn('[Draft3D] Error during event listener cleanup:', error);
        }
      });
      unsubscribersRef.current = [];
    };
  }, [transport, sessionId, playerId, onError, store]);

  // Transport methods wrapped for Draft-3D
  const sendCardPreview = useCallback((
    cardId: string,
    previewType: PreviewType,
    position: { x: number; y: number; z: number },
    priority: EventPriority = 'low'
  ) => {
    if (!transport || !sessionId || !playerId) return;

    const event: CardPreviewEvent = {
      sessionId,
      playerId,
      cardId,
      previewType,
      position,
      isActive: true,
      priority,
      timestamp: Date.now()
    };

    if (transport?.sendCardPreview) {
      transport.sendCardPreview(event);
    }
    
    // Also update local store for immediate UI response
    store.createCardPreview(cardId, previewType, position, priority);
  }, [transport, sessionId, playerId, store]);

  const clearCardPreview = useCallback((cardId: string, previewType: PreviewType) => {
    if (!transport || !sessionId || !playerId) return;

    const previewId = `${playerId}-${cardId}-${previewType}`;
    
    const event: CardPreviewEvent = {
      sessionId,
      playerId,
      cardId,
      previewType,
      position: { x: 0, y: 0, z: 0 }, // Position not used for clearing
      isActive: false,
      priority: 'low',
      timestamp: Date.now()
    };

    if (transport?.sendCardPreview) {
      transport.sendCardPreview(event);
    }
    store.clearCardPreview(previewId);
  }, [transport, sessionId, playerId, store]);

  const sendStackInteraction = useCallback((
    interactionType: StackInteractionType,
    cardIds: string[],
    fromStackId?: string,
    toStackId?: string,
    operationData?: Partial<OperationData>
  ) => {
    if (!transport || !sessionId || !playerId) return;

    const event: StackInteractionEvent = {
      sessionId,
      playerId,
      interactionType,
      cardIds,
      fromStackId,
      toStackId,
      operationData: {
        userInitiated: true,
        hasAnimation: true,
        ...operationData
      } as OperationData,
      clientTimestamp: Date.now()
    };

    if (transport?.sendStackInteraction) {
      transport.sendStackInteraction(event);
    }
    
    // Process locally for immediate feedback
    store.processStackInteraction(interactionType, cardIds, event.operationData);
  }, [transport, sessionId, playerId, store]);

  const sendUIUpdate = useCallback((
    updateType: UIUpdateType,
    data: UIUpdateData,
    priority: EventPriority = 'low'
  ) => {
    if (!transport || !sessionId || !playerId) return;

    const event: UIUpdateEvent = {
      sessionId,
      playerId,
      uiUpdates: [{
        type: updateType,
        data,
        priority
      }],
      batchId: `${playerId}-${Date.now()}`
    };

    if (transport?.sendUIUpdate) {
      transport.sendUIUpdate(event);
    }
    store.addUIUpdate(updateType, data, priority);
  }, [transport, sessionId, playerId, store]);

  return {
    // Connection state
    isConnected: store.isConnected,
    sessionId: store.sessionId,
    currentPlayerId: store.currentPlayerId,
    
    // Transport methods
    sendCardPreview,
    clearCardPreview,
    sendStackInteraction,
    sendUIUpdate,
    
    // State access
    activePreviews: store.activePreviews,
    playerStates: store.playerStates,
    pendingUIUpdates: store.pendingUIUpdates,
    
    // Utility methods
    processPendingUpdates: store.processPendingUpdates,
    updateActivePreviews: store.updateActivePreviews
  };
};
