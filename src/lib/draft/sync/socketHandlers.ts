/**
 * Socket Handlers for Pick Synchronization Events
 * Bridges Socket.io transport with DraftSyncManager for real-time coordination
 */

import type { Socket } from 'socket.io-client';
import type { Draft3DEventMap } from '@/types/draft-3d-events';
import { DraftSyncManager } from './DraftSyncManager';
import type { 
  DraftSession, 
  PlayerDraftState, 
  PickResult,
  SyncMetrics 
} from './types';

// Extended event map for pick synchronization
interface PickSyncEventMap extends Draft3DEventMap {
  // Pick synchronization events
  'draft:pick:attempt': PickAttemptEvent;
  'draft:pick:result': PickResultEvent;
  'draft:pick:conflict': PickConflictEvent;
  'draft:pick:timeout': PickTimeoutEvent;
  
  // Pack rotation events
  'draft:pack:rotation': PackRotationEvent;
  'draft:pack:rotation_complete': PackRotationCompleteEvent;
  
  // Player state synchronization
  'draft:player:state_update': PlayerStateUpdateEvent;
  'draft:player:ready': PlayerReadyEvent;
  'draft:player:disconnected': PlayerDisconnectedEvent;
  'draft:player:reconnected': PlayerReconnectedEvent;
  
  // Session synchronization
  'draft:session:sync_request': SessionSyncRequestEvent;
  'draft:session:sync_response': SessionSyncResponseEvent;
  'draft:session:metrics_update': MetricsUpdateEvent;
}

// Internal map includes socket lifecycle events
type SocketLifecycleEventMap = {
  connect: void;
  disconnect: void;
};

type HandlerEventMap = PickSyncEventMap & SocketLifecycleEventMap;

// Pick synchronization event interfaces
export interface PickAttemptEvent {
  sessionId: string;
  playerId: string;
  cardId: string;
  timestamp: number;
  clientLatency?: number;
}

export interface PickResultEvent {
  sessionId: string;
  playerId: string;
  cardId: string;
  success: boolean;
  timestamp: number;
  serverLatency: number;
  conflictsWith?: string[];
  shouldRotate: boolean;
}

export interface PickConflictEvent {
  sessionId: string;
  conflictingPlayers: string[];
  cardId: string;
  resolution: 'first_wins' | 'retry' | 'cancelled';
  timestamp: number;
}

export interface PickTimeoutEvent {
  sessionId: string;
  playerId: string;
  autoPickCardId?: string;
  timestamp: number;
}

export interface PackRotationEvent {
  sessionId: string;
  rotationMap: Record<string, string>; // playerId -> new pack owner
  newRound: number;
  timestamp: number;
}

export interface PackRotationCompleteEvent {
  sessionId: string;
  completedRound: number;
  allPlayersReady: boolean;
  timestamp: number;
}

export interface PlayerStateUpdateEvent {
  sessionId: string;
  playerId: string;
  state: Partial<PlayerDraftState>;
  timestamp: number;
}

export interface PlayerReadyEvent {
  sessionId: string;
  playerId: string;
  isReady: boolean;
  timestamp: number;
}

export interface PlayerDisconnectedEvent {
  sessionId: string;
  playerId: string;
  gracePeriod: number; // seconds
  timestamp: number;
}

export interface PlayerReconnectedEvent {
  sessionId: string;
  playerId: string;
  missedEvents: string[];
  timestamp: number;
}

export interface SessionSyncRequestEvent {
  sessionId: string;
  requesterId: string;
  lastKnownVersion: number;
  timestamp: number;
}

export interface SessionSyncResponseEvent {
  sessionId: string;
  session: DraftSession;
  players: Record<string, PlayerDraftState>;
  version: number;
  timestamp: number;
}

export interface MetricsUpdateEvent {
  sessionId: string;
  metrics: SyncMetrics;
  timestamp: number;
}

/**
 * PickSyncSocketHandler manages Socket.io event routing for draft pick synchronization
 * Connects network events to DraftSyncManager business logic
 */
export class PickSyncSocketHandler {
  private socket: Socket;
  private syncManager: DraftSyncManager;
  private currentSessionId: string | null = null;
  private currentPlayerId: string | null = null;
  private isConnected = false;
  private eventListeners: Map<string, (...args: unknown[]) => void> = new Map();

  constructor(socket: Socket, syncManager: DraftSyncManager) {
    this.socket = socket;
    this.syncManager = syncManager;
    this.setupSocketListeners();
  }

  // Public API for connecting to sessions
  connectToSession(sessionId: string, playerId: string): void {
    console.log(`[PickSyncSocketHandler] Connecting to session ${sessionId} as player ${playerId}`);
    
    this.currentSessionId = sessionId;
    this.currentPlayerId = playerId;
    this.isConnected = true;

    // Join the socket room for this session
    this.socket.emit('draft:session:join', {
      sessionId,
      playerId,
      playerName: `Player ${playerId}`, // Would be fetched from user data
      reconnection: false
    });
  }

  disconnectFromSession(): void {
    if (!this.currentSessionId || !this.currentPlayerId) return;

    console.log(`[PickSyncSocketHandler] Disconnecting from session ${this.currentSessionId}`);

    this.socket.emit('draft:session:leave', {
      sessionId: this.currentSessionId,
      playerId: this.currentPlayerId
    });

    this.currentSessionId = null;
    this.currentPlayerId = null;
    this.isConnected = false;
  }

  // Pick coordination methods
  async attemptPick(cardId: string): Promise<PickResult> {
    if (!this.currentSessionId || !this.currentPlayerId) {
      return { success: false, conflict: false, message: 'Not connected to session' };
    }

    const clientTimestamp = Date.now();
    console.log(`[PickSyncSocketHandler] Attempting pick: ${cardId}`);

    // Emit pick attempt to server
    this.socket.emit('draft:pick:attempt', {
      sessionId: this.currentSessionId,
      playerId: this.currentPlayerId,
      cardId,
      timestamp: clientTimestamp,
      clientLatency: this.calculateLatency()
    } as PickAttemptEvent);

    // Process pick through sync manager
    const result = await this.syncManager.processPickEvent(
      this.currentSessionId,
      this.currentPlayerId,
      cardId,
      clientTimestamp
    );
    
    // Ensure PickResult contract compliance
    return {
      success: result.success,
      conflict: !!result.conflict,
      shouldRotate: result.shouldRotate || false
    };
  }

  requestSync(): void {
    if (!this.currentSessionId || !this.currentPlayerId) return;

    console.log('[PickSyncSocketHandler] Requesting session sync');

    const session = this.syncManager.getSession(this.currentSessionId);
    const lastKnownVersion = session?.version || 0;

    this.socket.emit('draft:session:sync_request', {
      sessionId: this.currentSessionId,
      requesterId: this.currentPlayerId,
      lastKnownVersion,
      timestamp: Date.now()
    } as SessionSyncRequestEvent);
  }

  updatePlayerState(updates: Partial<PlayerDraftState>): void {
    if (!this.currentSessionId || !this.currentPlayerId) return;

    console.log(`[PickSyncSocketHandler] Broadcasting player state update`);

    this.socket.emit('draft:player:state_update', {
      sessionId: this.currentSessionId,
      playerId: this.currentPlayerId,
      state: updates,
      timestamp: Date.now()
    } as PlayerStateUpdateEvent);
  }

  // Private socket event handlers
  private setupSocketListeners(): void {
    // Pick result handling
    this.addSocketListener('draft:pick:result', (event) => {
      this.handlePickResult(event);
    });

    // Pick conflict handling
    this.addSocketListener('draft:pick:conflict', (event) => {
      this.handlePickConflict(event);
    });

    // Pack rotation handling
    this.addSocketListener('draft:pack:rotation', (event) => {
      this.handlePackRotation(event);
    });

    this.addSocketListener('draft:pack:rotation_complete', (event) => {
      this.handlePackRotationComplete(event);
    });

    // Player state synchronization
    this.addSocketListener('draft:player:state_update', (event) => {
      this.handlePlayerStateUpdate(event);
    });

    this.addSocketListener('draft:player:disconnected', (event) => {
      this.handlePlayerDisconnection(event);
    });

    this.addSocketListener('draft:player:reconnected', (event) => {
      this.handlePlayerReconnection(event);
    });

    // Session synchronization
    this.addSocketListener('draft:session:sync_response', (event) => {
      this.handleSessionSync(event);
    });

    // Metrics updates
    this.addSocketListener('draft:session:metrics_update', (event) => {
      this.handleMetricsUpdate(event);
    });

    // Connection event handling
    this.addSocketListener('connect', () => {
      console.log('[PickSyncSocketHandler] Socket connected');
      if (this.currentSessionId && this.currentPlayerId) {
        // Reconnect to current session
        this.connectToSession(this.currentSessionId, this.currentPlayerId);
      }
    });

    this.addSocketListener('disconnect', () => {
      console.log('[PickSyncSocketHandler] Socket disconnected');
      this.isConnected = false;
    });
  }

  private addSocketListener<K extends keyof HandlerEventMap>(
    event: K,
    handler: (data: HandlerEventMap[K]) => void
  ): void {
    const wrappedHandler = (data: unknown) => {
      handler(data as HandlerEventMap[K]);
    };
    this.socket.on(event as string, wrappedHandler);
    this.eventListeners.set(event as string, wrappedHandler);
  }

  private handlePickResult(event: PickResultEvent): void {
    if (event.sessionId !== this.currentSessionId) return;

    console.log(`[PickSyncSocketHandler] Pick result: ${event.playerId} -> ${event.cardId} (${event.success ? 'SUCCESS' : 'FAILED'})`);

    // Update sync manager with result
    const session = this.syncManager.getSession(event.sessionId);
    if (session && event.success) {
      // Update pick state
      if (!session.pickStates[event.playerId]) {
        session.pickStates[event.playerId] = {
          playerId: event.playerId,
          hasPickedThisRound: false,
          pickTimestamp: null,
          isTimedOut: false,
          disconnectedAt: null,
          reconnectionAttempts: 0,
          currentPick: null,
          pickStartTime: 0,
          pickEndTime: 0
        };
      }

      session.pickStates[event.playerId].hasPickedThisRound = true;
      session.pickStates[event.playerId].currentPick = event.cardId;
      session.pickStates[event.playerId].pickEndTime = Date.now();

      // Handle pack rotation if needed
      if (event.shouldRotate) {
        this.initiatePackRotation(event.sessionId);
      }
    }

    // Update metrics
    this.syncManager.applyMetricsUpdate(event.sessionId, {
      totalPicks: (this.syncManager.getMetrics(event.sessionId)?.totalPicks || 0) + 1,
      averagePickLatency: this.calculateAverageLatency(event.serverLatency)
    });
  }

  private handlePickConflict(event: PickConflictEvent): void {
    if (event.sessionId !== this.currentSessionId) return;

    console.warn(`[PickSyncSocketHandler] Pick conflict detected for card ${event.cardId} between players: ${event.conflictingPlayers.join(', ')}`);

    // Handle conflict based on resolution strategy
    switch (event.resolution) {
      case 'first_wins':
        console.log(`[PickSyncSocketHandler] Conflict resolved: first player wins`);
        break;
      case 'retry':
        console.log(`[PickSyncSocketHandler] Conflict requires retry`);
        break;
      case 'cancelled':
        console.log(`[PickSyncSocketHandler] Pick cancelled due to conflict`);
        break;
    }

    // Update metrics
    this.syncManager.applyMetricsUpdate(event.sessionId, {
      conflictCount: (this.syncManager.getMetrics(event.sessionId)?.conflictCount || 0) + 1
    });
  }

  private handlePackRotation(event: PackRotationEvent): void {
    if (event.sessionId !== this.currentSessionId) return;

    console.log(`[PickSyncSocketHandler] Pack rotation initiated for round ${event.newRound}`);

    // Update session state through sync manager
    const session = this.syncManager.getSession(event.sessionId);
    if (session) {
      // Rotate packs according to rotation map
      const newPackContents: Record<string, string[]> = {};
      
      Object.entries(event.rotationMap).forEach(([playerId, newPackOwner]) => {
        const currentPack = session.packContents[newPackOwner] || [];
        newPackContents[playerId] = [...currentPack];
      });

      // Update session
      session.packContents = newPackContents;
      session.currentRound = event.newRound;
      session.version += 1;
      session.lastSyncTime = Date.now();

      // Reset pick states for new round
      Object.keys(session.pickStates).forEach(playerId => {
        session.pickStates[playerId].hasPickedThisRound = false;
        session.pickStates[playerId].currentPick = null;
        session.pickStates[playerId].pickStartTime = Date.now();
      });
    }
  }

  private handlePackRotationComplete(event: PackRotationCompleteEvent): void {
    if (event.sessionId !== this.currentSessionId) return;

    console.log(`[PickSyncSocketHandler] Pack rotation complete for round ${event.completedRound}`);

    // Notify sync manager that rotation is complete
    const session = this.syncManager.getSession(event.sessionId);
    if (session) {
      session.lastSyncTime = Date.now();
      session.version += 1;
    }
  }

  private handlePlayerStateUpdate(event: PlayerStateUpdateEvent): void {
    if (event.sessionId !== this.currentSessionId) return;
    if (event.playerId === this.currentPlayerId) return; // Don't update our own state

    console.log(`[PickSyncSocketHandler] Player state update: ${event.playerId}`);

    // Update player state through sync manager
    this.syncManager.updatePlayerState(event.sessionId, event.playerId, event.state);
  }

  private handlePlayerDisconnection(event: PlayerDisconnectedEvent): void {
    if (event.sessionId !== this.currentSessionId) return;

    console.log(`[PickSyncSocketHandler] Player disconnected: ${event.playerId} (grace period: ${event.gracePeriod}s)`);

    // Handle through sync manager
    this.syncManager.handlePlayerDisconnection(event.sessionId, event.playerId);

    // Update metrics
    this.syncManager.applyMetricsUpdate(event.sessionId, {
      disconnectionCount: (this.syncManager.getMetrics(event.sessionId)?.disconnectionCount || 0) + 1
    });
  }

  private handlePlayerReconnection(event: PlayerReconnectedEvent): void {
    if (event.sessionId !== this.currentSessionId) return;

    console.log(`[PickSyncSocketHandler] Player reconnected: ${event.playerId}, missed ${event.missedEvents.length} events`);

    // Handle through sync manager
    this.syncManager.handlePlayerReconnection(event.sessionId, event.playerId);

    // Request sync if we missed events
    if (event.playerId === this.currentPlayerId && event.missedEvents.length > 0) {
      this.requestSync();
    }
  }

  private handleSessionSync(event: SessionSyncResponseEvent): void {
    if (event.sessionId !== this.currentSessionId) return;

    console.log(`[PickSyncSocketHandler] Session sync received (version ${event.version})`);

    // Update sync manager with fresh session state
    this.syncManager.updateSessionState(event.sessionId, event.session);

    // Update player states
    Object.entries(event.players).forEach(([playerId, playerState]) => {
      this.syncManager.updatePlayerState(event.sessionId, playerId, playerState);
    });
  }

  private handleMetricsUpdate(event: MetricsUpdateEvent): void {
    if (event.sessionId !== this.currentSessionId) return;

    console.log(`[PickSyncSocketHandler] Metrics update received`);

    // Update metrics through sync manager
    this.syncManager.applyMetricsUpdate(event.sessionId, event.metrics);
  }

  // Utility methods
  private initiatePackRotation(sessionId: string): void {
    const session = this.syncManager.getSession(sessionId);
    if (!session) return;

    // Check if all players are ready for rotation
    const allPlayersReady = this.syncManager.areAllPlayersReady(sessionId);
    
    if (allPlayersReady) {
      console.log('[PickSyncSocketHandler] All players ready - triggering pack rotation');
      
      // This would typically be handled by the server, but we can emit a request
      this.socket.emit('draft:pack:rotation_request', {
        sessionId,
        timestamp: Date.now()
      });
    }
  }

  private calculateLatency(): number {
    // Simple RTT calculation - would use more sophisticated method in production
    return (this.socket as unknown as { ping?: number }).ping || 0;
  }

  private calculateAverageLatency(newLatency: number): number {
    const sid = this.currentSessionId;
    const metrics = sid ? this.syncManager.getMetrics(sid) : undefined;
    if (!metrics) return newLatency;

    const currentAverage = metrics.averagePickLatency || 0;
    const totalPicks = metrics.totalPicks || 1;
    
    return Math.round(((currentAverage * (totalPicks - 1)) + newLatency) / totalPicks);
  }

  // Cleanup
  destroy(): void {
    console.log('[PickSyncSocketHandler] Cleaning up socket handlers');

    // Remove all event listeners
    this.eventListeners.forEach((handler, event) => {
      this.socket.off(event, handler);
    });
    this.eventListeners.clear();

    // Disconnect from current session
    if (this.isConnected) {
      this.disconnectFromSession();
    }
  }

  // Getters for state
  get connected(): boolean {
    return this.isConnected && this.socket.connected;
  }

  get sessionId(): string | null {
    return this.currentSessionId;
  }

  get playerId(): string | null {
    return this.currentPlayerId;
  }
}