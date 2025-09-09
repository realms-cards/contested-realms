/**
 * Socket Handlers for Deck Submission Coordination
 * Manages deck persistence, submission coordination, and waiting overlay events
 */

import type { Socket } from 'socket.io-client';
import { DeckPersistenceManager } from './DeckPersistenceManager';
import { WaitingStateManager } from '../waiting/WaitingStateManager';
import type {
  DeckSubmission,
  DeckComposition,
  DeckValidationResult,
  SubmissionCoordination,
  PersistenceMetrics
} from './types';
import type {
  WaitingUpdateEvent,
  WaitingType,
  PlayerStatus
} from '../waiting/types';

// Deck submission event interfaces
export interface DeckSubmissionEvent {
  sessionId: string;
  playerId: string;
  submission: DeckSubmission;
  timestamp: number;
}

export interface DeckSubmissionResultEvent {
  sessionId: string;
  playerId: string;
  submissionId: string;
  success: boolean;
  validationResult?: DeckValidationResult;
  errorMessage?: string;
  timestamp: number;
}

export interface DeckValidationEvent {
  sessionId: string;
  playerId: string;
  deck: DeckComposition;
  validationId: string;
  timestamp: number;
}

export interface DeckValidationResultEvent {
  sessionId: string;
  playerId: string;
  validationId: string;
  result: DeckValidationResult;
  timestamp: number;
}

export interface SubmissionCoordinationEvent {
  sessionId: string;
  coordination: SubmissionCoordination;
  timestamp: number;
}

export interface PlayerSubmissionStatusEvent {
  sessionId: string;
  playerId: string;
  status: PlayerStatus;
  submissionProgress?: {
    phase: 'preparing' | 'validating' | 'uploading' | 'processing' | 'complete';
    percentComplete: number;
  };
  timestamp: number;
}

export interface WaitingOverlayEvent {
  sessionId: string;
  waitingType: WaitingType;
  action: 'show' | 'update' | 'hide';
  data?: Record<string, unknown>;
  timestamp: number;
}

export interface SubmissionTimeoutEvent {
  sessionId: string;
  playerId?: string; // undefined means global timeout
  timeoutType: 'warning' | 'final' | 'grace_period';
  secondsRemaining: number;
  timestamp: number;
}

export interface BulkSubmissionEvent {
  sessionId: string;
  submissions: DeckSubmission[];
  coordinationRequired: boolean;
  timestamp: number;
}

// Extended event map for deck submission coordination
interface SubmissionEventMap {
  // Deck submission events
  'deck:submission:submit': DeckSubmissionEvent;
  'deck:submission:result': DeckSubmissionResultEvent;
  'deck:submission:status': PlayerSubmissionStatusEvent;
  'deck:submission:bulk': BulkSubmissionEvent;
  
  // Deck validation events
  'deck:validation:validate': DeckValidationEvent;
  'deck:validation:result': DeckValidationResultEvent;
  
  // Submission coordination
  'deck:coordination:update': SubmissionCoordinationEvent;
  'deck:coordination:timeout': SubmissionTimeoutEvent;
  
  // Waiting overlay events
  'deck:waiting:overlay': WaitingOverlayEvent;
  'deck:waiting:update': WaitingUpdateEvent;
  
  // Persistence events
  'deck:persistence:save': { sessionId: string; playerId: string; deck: DeckComposition; timestamp: number };
  'deck:persistence:restore': { sessionId: string; playerId: string; timestamp: number };
  'deck:persistence:metrics': { sessionId: string; metrics: PersistenceMetrics; timestamp: number };
}

/**
 * SubmissionSocketHandler manages Socket.io events for deck submission coordination
 */
export class SubmissionSocketHandler {
  private socket: Socket;
  private persistenceManager: DeckPersistenceManager;
  private waitingManager: WaitingStateManager;
  private currentSessionId: string | null = null;
  private currentPlayerId: string | null = null;
  private eventListeners: Map<string, (...args: unknown[]) => void> = new Map();

  constructor(
    socket: Socket,
    persistenceManager: DeckPersistenceManager,
    waitingManager: WaitingStateManager
  ) {
    this.socket = socket;
    this.persistenceManager = persistenceManager;
    this.waitingManager = waitingManager;
    this.setupSocketListeners();
  }

  // Public API for session management
  connectToSubmissionSession(sessionId: string, playerId: string): void {
    console.log(`[SubmissionSocketHandler] Connecting to submission session ${sessionId}`);
    
    this.currentSessionId = sessionId;
    this.currentPlayerId = playerId;

    // Initialize persistence for this session
    this.persistenceManager.initializeSession(sessionId);

    // Request current coordination state
    this.socket.emit('deck:coordination:request', {
      sessionId,
      playerId,
      timestamp: Date.now()
    });
  }

  disconnectFromSubmissionSession(): void {
    if (!this.currentSessionId) return;

    console.log(`[SubmissionSocketHandler] Disconnecting from submission session`);

    // Save final deck state
    this.persistenceManager.saveDeck();

    this.currentSessionId = null;
    this.currentPlayerId = null;
  }

  // Deck submission methods
  async submitDeck(): Promise<{ success: boolean; submissionId?: string; error?: string }> {
    if (!this.currentSessionId || !this.currentPlayerId) {
      return { success: false, error: 'Not connected to session' };
    }

    console.log(`[SubmissionSocketHandler] Submitting deck for session ${this.currentSessionId}`);

    try {
      // Create submission through persistence manager
      const submission = await this.persistenceManager.submitDeck();
      
      if (!submission) {
        return { success: false, error: 'Failed to create submission' };
      }

      // Emit submission to server
      this.socket.emit('deck:submission:submit', {
        sessionId: this.currentSessionId,
        playerId: this.currentPlayerId,
        submission,
        timestamp: Date.now()
      } as DeckSubmissionEvent);

      // Update player status to submitted
      this.updateSubmissionStatus('submitted');

      return { 
        success: true, 
        submissionId: submission.submissionId 
      };

    } catch (error) {
      console.error('[SubmissionSocketHandler] Deck submission failed:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  }

  async validateDeck(): Promise<DeckValidationResult> {
    if (!this.currentSessionId || !this.currentPlayerId) {
      throw new Error('Not connected to session');
    }

    console.log(`[SubmissionSocketHandler] Validating deck`);

    // Get current deck from persistence manager
    const currentDeck = this.persistenceManager.getCurrentDeck();
    if (!currentDeck) {
      throw new Error('No deck to validate');
    }

    // Create validation request
    const validationId = `validation-${this.currentPlayerId}-${Date.now()}`;

    // Emit validation request
    this.socket.emit('deck:validation:validate', {
      sessionId: this.currentSessionId,
      playerId: this.currentPlayerId,
      deck: currentDeck,
      validationId,
      timestamp: Date.now()
    } as DeckValidationEvent);

    // For now, return immediate local validation
    return this.persistenceManager.validateDeck();
  }

  updateSubmissionStatus(status: PlayerStatus, progress?: Record<string, unknown>): void {
    if (!this.currentSessionId || !this.currentPlayerId) return;

    console.log(`[SubmissionSocketHandler] Updating submission status: ${status}`);

    // Update waiting manager
    this.waitingManager.updatePlayerStatus(this.currentPlayerId, status, progress);

    // Broadcast status update
    this.socket.emit('deck:submission:status', {
      sessionId: this.currentSessionId,
      playerId: this.currentPlayerId,
      status,
      submissionProgress: progress,
      timestamp: Date.now()
    } as PlayerSubmissionStatusEvent);
  }

  startSubmissionWaiting(players: string[]): void {
    if (!this.currentSessionId || !this.currentPlayerId) return;

    console.log(`[SubmissionSocketHandler] Starting submission waiting for ${players.length} players`);

    // Start waiting overlay through waiting manager
    this.waitingManager.startWaiting(
      this.currentSessionId,
      'deck_submission',
      players,
      this.currentPlayerId, // Assume current player is coordinator for now
      {
        timeoutDuration: 5 * 60, // 5 minute timeout
        allowCancel: false,
        showPlayerList: true
      }
    );

    // Emit waiting overlay event
    this.socket.emit('deck:waiting:overlay', {
      sessionId: this.currentSessionId,
      waitingType: 'deck_submission',
      action: 'show',
      data: { players, timeout: 300 },
      timestamp: Date.now()
    } as WaitingOverlayEvent);
  }

  // Private socket event handlers
  private setupSocketListeners(): void {
    // Deck submission result handling
    this.addSocketListener<DeckSubmissionResultEvent>('deck:submission:result', (event) => {
      this.handleSubmissionResult(event);
    });

    // Submission status updates from other players
    this.addSocketListener<PlayerSubmissionStatusEvent>('deck:submission:status', (event) => {
      this.handlePlayerSubmissionStatus(event);
    });

    // Validation results
    this.addSocketListener<DeckValidationResultEvent>('deck:validation:result', (event) => {
      this.handleValidationResult(event);
    });

    // Coordination updates
    this.addSocketListener<SubmissionCoordinationEvent>('deck:coordination:update', (event) => {
      this.handleCoordinationUpdate(event);
    });

    // Timeout events
    this.addSocketListener<SubmissionTimeoutEvent>('deck:coordination:timeout', (event) => {
      this.handleSubmissionTimeout(event);
    });

    // Waiting overlay updates
    this.addSocketListener<WaitingOverlayEvent>('deck:waiting:overlay', (event) => {
      this.handleWaitingOverlayEvent(event);
    });

    this.addSocketListener<WaitingUpdateEvent>('deck:waiting:update', (event) => {
      this.handleWaitingUpdate(event);
    });

    // Bulk submission handling
    this.addSocketListener<BulkSubmissionEvent>('deck:submission:bulk', (event) => {
      this.handleBulkSubmission(event);
    });

    // Persistence events
    this.addSocketListener<{ sessionId: string; playerId: string; deck: DeckComposition; timestamp: number }>('deck:persistence:save', (event) => {
      this.handlePersistenceSave(event);
    });

    this.addSocketListener<{ sessionId: string; playerId: string; timestamp: number }>('deck:persistence:restore', (event) => {
      this.handlePersistenceRestore(event);
    });
  }

  private addSocketListener<T>(event: string, handler: (data: T) => void): void {
    const wrappedHandler = (data: unknown) => {
      handler(data as T);
    };
    this.socket.on(event, wrappedHandler);
    this.eventListeners.set(event, wrappedHandler);
  }

  private handleSubmissionResult(event: DeckSubmissionResultEvent): void {
    if (event.sessionId !== this.currentSessionId) return;

    console.log(`[SubmissionSocketHandler] Submission result for ${event.playerId}: ${event.success ? 'SUCCESS' : 'FAILED'}`);

    if (event.playerId === this.currentPlayerId) {
      // Handle our own submission result
      if (event.success) {
        console.log(`[SubmissionSocketHandler] Our deck submitted successfully`);
        this.updateSubmissionStatus('completed');
      } else {
        console.error(`[SubmissionSocketHandler] Our deck submission failed: ${event.errorMessage}`);
        this.updateSubmissionStatus('failed');
      }
    } else {
      // Handle other player's submission result
      if (event.success) {
        this.waitingManager.updatePlayerStatus(event.playerId, 'completed');
      } else {
        this.waitingManager.updatePlayerStatus(event.playerId, 'failed');
      }
    }
  }

  private handlePlayerSubmissionStatus(event: PlayerSubmissionStatusEvent): void {
    if (event.sessionId !== this.currentSessionId) return;
    if (event.playerId === this.currentPlayerId) return; // Don't handle our own status

    console.log(`[SubmissionSocketHandler] Player ${event.playerId} status: ${event.status}`);

    // Update waiting manager with player status
    this.waitingManager.updatePlayerStatus(
      event.playerId, 
      event.status,
      event.submissionProgress
    );
  }

  private handleValidationResult(event: DeckValidationResultEvent): void {
    if (event.sessionId !== this.currentSessionId) return;

    console.log(`[SubmissionSocketHandler] Validation result for ${event.playerId}: ${event.result.isValid ? 'VALID' : 'INVALID'}`);

    if (event.playerId === this.currentPlayerId) {
      // Handle our own validation result
      if (!event.result.isValid) {
        console.warn('[SubmissionSocketHandler] Our deck has validation errors:', event.result.errors);
        this.updateSubmissionStatus('failed');
      } else {
        console.log('[SubmissionSocketHandler] Our deck validation passed');
      }
    }
  }

  private handleCoordinationUpdate(event: SubmissionCoordinationEvent): void {
    if (event.sessionId !== this.currentSessionId) return;

    console.log(`[SubmissionSocketHandler] Coordination update received`);

    const { coordination } = event;
    
    // Update waiting manager with coordination state
    if (coordination.allPlayersReady) {
      console.log('[SubmissionSocketHandler] All players are ready');
      this.waitingManager.completeWaiting();
    } else {
      const waitingCount = coordination.playersBuilding.length;
      const submittedCount = coordination.playersSubmitted.length;
      console.log(`[SubmissionSocketHandler] ${submittedCount} submitted, ${waitingCount} still building`);
    }
  }

  private handleSubmissionTimeout(event: SubmissionTimeoutEvent): void {
    if (event.sessionId !== this.currentSessionId) return;

    console.log(`[SubmissionSocketHandler] Submission timeout: ${event.timeoutType}, ${event.secondsRemaining}s remaining`);

    switch (event.timeoutType) {
      case 'warning':
        console.warn(`[SubmissionSocketHandler] Submission warning: ${event.secondsRemaining}s remaining`);
        if (event.playerId === this.currentPlayerId) {
          // Show warning to user
          this.updateSubmissionStatus('in_progress', {
            warningMessage: `${event.secondsRemaining} seconds remaining to submit`
          });
        }
        break;

      case 'final':
        console.error(`[SubmissionSocketHandler] Final timeout reached`);
        if (event.playerId === this.currentPlayerId) {
          this.updateSubmissionStatus('timed_out');
        } else if (event.playerId) {
          this.waitingManager.updatePlayerStatus(event.playerId, 'timed_out');
        } else {
          // Global timeout
          this.waitingManager.handleTimeout();
        }
        break;

      case 'grace_period':
        console.log(`[SubmissionSocketHandler] Grace period: ${event.secondsRemaining}s remaining`);
        break;
    }
  }

  private handleWaitingOverlayEvent(event: WaitingOverlayEvent): void {
    if (event.sessionId !== this.currentSessionId) return;

    console.log(`[SubmissionSocketHandler] Waiting overlay event: ${event.action}`);

    switch (event.action) {
      case 'show':
        if (event.data?.players && Array.isArray(event.data.players)) {
          this.startSubmissionWaiting(event.data.players as string[]);
        }
        break;

      case 'update':
        // Handle overlay updates through waiting manager
        break;

      case 'hide':
        this.waitingManager.completeWaiting();
        break;
    }
  }

  private handleWaitingUpdate(event: WaitingUpdateEvent): void {
    if (event.sessionId !== this.currentSessionId) return;

    console.log(`[SubmissionSocketHandler] Waiting update: ${event.updateType}`);

    // Forward waiting updates to waiting manager
    // This allows server to coordinate waiting states across all clients
  }

  private handleBulkSubmission(event: BulkSubmissionEvent): void {
    if (event.sessionId !== this.currentSessionId) return;

    console.log(`[SubmissionSocketHandler] Bulk submission event with ${event.submissions.length} submissions`);

    // Process multiple submissions at once
    event.submissions.forEach(submission => {
      if (submission.playerId !== this.currentPlayerId) {
        this.waitingManager.updatePlayerStatus(submission.playerId, 'completed');
      }
    });

    // Check if coordination is required
    if (event.coordinationRequired) {
      console.log('[SubmissionSocketHandler] Bulk submission requires coordination');
    }
  }

  private handlePersistenceSave(event: { sessionId: string; playerId: string; deck: DeckComposition; timestamp: number }): void {
    if (event.sessionId !== this.currentSessionId) return;
    if (event.playerId === this.currentPlayerId) return; // Don't handle our own save

    console.log(`[SubmissionSocketHandler] Player ${event.playerId} saved deck`);
    
    // Could update UI to show other players are actively building
    this.waitingManager.updatePlayerStatus(event.playerId, 'in_progress');
  }

  private handlePersistenceRestore(event: { sessionId: string; playerId: string; timestamp: number }): void {
    if (event.sessionId !== this.currentSessionId) return;

    console.log(`[SubmissionSocketHandler] Player ${event.playerId} restored deck`);

    // Player has reconnected and restored their deck
    if (event.playerId !== this.currentPlayerId) {
      this.waitingManager.updatePlayerStatus(event.playerId, 'waiting');
    }
  }

  // Utility methods
  broadcastDeckSave(): void {
    if (!this.currentSessionId || !this.currentPlayerId) return;

    const currentDeck = this.persistenceManager.getCurrentDeck();
    if (!currentDeck) return;

    this.socket.emit('deck:persistence:save', {
      sessionId: this.currentSessionId,
      playerId: this.currentPlayerId,
      deck: currentDeck,
      timestamp: Date.now()
    });
  }

  broadcastMetrics(): void {
    if (!this.currentSessionId) return;

    const metrics = this.persistenceManager.getMetrics();
    if (!metrics) return;

    this.socket.emit('deck:persistence:metrics', {
      sessionId: this.currentSessionId,
      metrics,
      timestamp: Date.now()
    });
  }

  // Cleanup
  destroy(): void {
    console.log('[SubmissionSocketHandler] Cleaning up submission socket handlers');

    // Save final state
    if (this.persistenceManager) {
      this.persistenceManager.saveDeck();
    }

    // Remove all event listeners
    this.eventListeners.forEach((handler, event) => {
      this.socket.off(event, handler);
    });
    this.eventListeners.clear();

    // Disconnect from session
    this.disconnectFromSubmissionSession();
  }

  // Getters
  get sessionId(): string | null {
    return this.currentSessionId;
  }

  get playerId(): string | null {
    return this.currentPlayerId;
  }

  get isConnected(): boolean {
    return this.socket.connected && this.currentSessionId !== null;
  }
}