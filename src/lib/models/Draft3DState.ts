/**
 * Draft-3D State Models for Online Integration
 * Organized state management for multiplayer draft sessions with enhanced UI
 */

import type { 
  OnlineDraftState, 
  PlayerDraftState, 
  CardPreviewState, 
  StackInteraction,
  UIState,
  PlayerPreferences
} from '@/types/draft-models';
import type { 
  Position3D, 
  EventPriority, 
  PreviewType, 
  StackInteractionType, 
  InteractionStatus,
  OperationData,
  UIUpdateData,
  BatchUpdateData
} from '@/types/draft-3d-events';

/**
 * Card Preview State Management
 * Handles multiplayer card preview coordination with debouncing and priority
 */
export class CardPreviewStateManager {
  private activePreviews: Map<string, CardPreviewState> = new Map();
  private previewTimeouts: Map<string, NodeJS.Timeout> = new Map();
  private debounceDelay = 100; // 100ms debounce for hover events

  /**
   * Create or update a card preview state
   */
  createPreview(
    sessionId: string,
    playerId: string,
    cardId: string,
    previewType: PreviewType,
    position: Position3D,
    priority: EventPriority = 'low'
  ): CardPreviewState {
    const previewId = `${playerId}-${cardId}-${previewType}`;
    const now = Date.now();

    const preview: CardPreviewState = {
      previewId,
      sessionId,
      playerId,
      cardId,
      previewType,
      position,
      isActive: true,
      priority,
      startTime: now,
      expiresAt: now + (previewType === 'hover' ? 5000 : 30000), // Auto-expire
    };

    if (!this.activePreviews) {
      console.error('[CardPreviewStateManager] activePreviews not initialized, cannot create preview');
      return preview; // Return the preview object but don't store it
    }
    
    this.activePreviews.set(previewId, preview);
    this.scheduleExpiry(preview);
    
    return preview;
  }

  /**
   * Clear a specific preview
   */
  clearPreview(previewId: string): void {
    if (!this.activePreviews || !this.previewTimeouts) {
      console.warn('[CardPreviewStateManager] Maps not initialized, cannot clear preview');
      return;
    }
    const preview = this.activePreviews.get(previewId);
    if (preview) {
      preview.isActive = false;
      this.activePreviews.delete(previewId);
      
      const timeout = this.previewTimeouts.get(previewId);
      if (timeout) {
        clearTimeout(timeout);
        this.previewTimeouts.delete(previewId);
      }
    }
  }

  /**
   * Get all active previews for a session
   */
  getActivePreviews(sessionId: string): CardPreviewState[] {
    if (!this.activePreviews) {
      console.warn('[CardPreviewStateManager] activePreviews not initialized, returning empty array');
      return [];
    }
    return Array.from(this.activePreviews.values())
      .filter(preview => preview.sessionId === sessionId && preview.isActive);
  }

  /**
   * Clear all previews for a player (on disconnect)
   */
  clearPlayerPreviews(playerId: string): void {
    if (!this.activePreviews) {
      console.warn('[CardPreviewStateManager] activePreviews not initialized, cannot clear player previews');
      return;
    }
    const playerPreviews = Array.from(this.activePreviews.values())
      .filter(preview => preview.playerId === playerId);
      
    for (const preview of playerPreviews) {
      this.clearPreview(preview.previewId);
    }
  }

  private scheduleExpiry(preview: CardPreviewState): void {
    const timeout = setTimeout(() => {
      this.clearPreview(preview.previewId);
    }, preview.expiresAt - Date.now());
    
    this.previewTimeouts.set(preview.previewId, timeout);
  }
}

/**
 * Stack Interaction State Management
 * Handles conflict resolution and operational transform for concurrent stack operations
 */
export class StackInteractionManager {
  private activeInteractions: Map<string, StackInteraction> = new Map();
  private conflictResolver: OperationalTransform;

  constructor() {
    this.conflictResolver = new OperationalTransform();
  }

  /**
   * Process a new stack interaction
   */
  processInteraction(
    sessionId: string,
    playerId: string,
    interactionType: StackInteractionType,
    cardIds: string[],
    operationData: OperationData,
    clientTimestamp: number
  ): { interaction: StackInteraction; conflicts: string[] } {
    const interactionId = this.generateInteractionId();
    const serverTimestamp = Date.now();

    const interaction: StackInteraction = {
      interactionId,
      sessionId,
      initiatingPlayerId: playerId,
      cardIds,
      interactionType,
      operationTimestamp: serverTimestamp,
      operationData,
      status: 'pending',
      conflictsWith: [],
      resolutionMethod: 'timestamp',
    };

    // Check for conflicts with existing interactions
    const conflicts = this.detectConflicts(interaction);
    interaction.conflictsWith = conflicts;

    if (conflicts.length > 0) {
      // Apply operational transform to resolve conflicts
      const resolution = this.conflictResolver.resolve(interaction, conflicts, this.activeInteractions);
      interaction.status = resolution.status;
      interaction.resolutionMethod = resolution.method as 'timestamp' | 'priority' | 'rollback';
    } else {
      interaction.status = 'processing';
    }

    this.activeInteractions.set(interactionId, interaction);
    return { interaction, conflicts };
  }

  /**
   * Complete an interaction
   */
  completeInteraction(interactionId: string): void {
    const interaction = this.activeInteractions.get(interactionId);
    if (interaction) {
      interaction.status = 'completed';
      // Keep completed interactions for a short time for conflict resolution
      setTimeout(() => {
        this.activeInteractions.delete(interactionId);
      }, 5000);
    }
  }

  /**
   * Fail an interaction and trigger rollback
   */
  failInteraction(interactionId: string, reason: string): void {
    const interaction = this.activeInteractions.get(interactionId);
    if (interaction) {
      interaction.status = 'failed';
      this.activeInteractions.delete(interactionId);
    }
  }

  private detectConflicts(interaction: StackInteraction): string[] {
    const conflicts: string[] = [];
    
    for (const [existingId, existing] of this.activeInteractions) {
      if (existing.sessionId === interaction.sessionId && 
          existing.status === 'processing' &&
          this.hasCardConflict(interaction, existing)) {
        conflicts.push(existingId);
      }
    }
    
    return conflicts;
  }

  private hasCardConflict(a: StackInteraction, b: StackInteraction): boolean {
    // Check if any cards are involved in both interactions
    return a.cardIds.some(cardId => b.cardIds.includes(cardId));
  }

  private generateInteractionId(): string {
    return `int-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}

/**
 * Operational Transform for Conflict Resolution
 * Implements timestamp-based conflict resolution with rollback support
 */
class OperationalTransform {
  resolve(
    interaction: StackInteraction,
    conflictIds: string[],
    activeInteractions: Map<string, StackInteraction>
  ): { status: InteractionStatus; method: string } {
    if (conflictIds.length === 0) {
      return { status: 'completed', method: 'no-conflict' };
    }

    // Get all conflicting interactions
    const conflicts = conflictIds
      .map(id => activeInteractions.get(id))
      .filter(Boolean) as StackInteraction[];

    // Use timestamp-based ordering (earlier timestamp wins)
    const sortedInteractions = [interaction, ...conflicts]
      .sort((a, b) => a.operationTimestamp - b.operationTimestamp);

    if (sortedInteractions[0] === interaction) {
      // This interaction has the earliest timestamp - it wins
      return { status: 'completed', method: 'timestamp' };
    } else {
      // This interaction is later - it fails and should rollback
      return { status: 'failed', method: 'timestamp' };
    }
  }
}

/**
 * UI State Synchronization Manager
 * Handles batching and synchronization of UI updates across clients
 */
export class UIStateSyncManager {
  private updateBatches: Map<string, BatchUpdateData[]> = new Map();
  private batchTimeouts: Map<string, NodeJS.Timeout> = new Map();
  private batchInterval = 16; // 16ms for 60fps

  /**
   * Add UI update to batch for synchronization
   */
  addUpdate(sessionId: string, playerId: string, updateType: string, data: UIUpdateData, priority: EventPriority = 'low'): void {
    const batchKey = `${sessionId}-${priority}`;
    
    if (!this.updateBatches.has(batchKey)) {
      this.updateBatches.set(batchKey, []);
    }

    const batch = this.updateBatches.get(batchKey)!;
    batch.push({
      playerId,
      type: updateType,
      data,
      timestamp: Date.now(),
    });

    // Schedule batch processing
    this.scheduleBatchProcessing(batchKey, priority);
  }

  /**
   * Process and clear a batch of updates
   */
  processBatch(batchKey: string): BatchUpdateData[] | null {
    const batch = this.updateBatches.get(batchKey);
    if (!batch || batch.length === 0) return null;

    const updates = [...batch];
    this.updateBatches.set(batchKey, []);
    
    return updates;
  }

  private scheduleBatchProcessing(batchKey: string, priority: EventPriority): void {
    // Clear existing timeout
    const existingTimeout = this.batchTimeouts.get(batchKey);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
    }

    // Set new timeout based on priority
    const delay = priority === 'high' ? this.batchInterval : this.batchInterval * 2;
    
    const timeout = setTimeout(() => {
      this.processBatch(batchKey);
      this.batchTimeouts.delete(batchKey);
    }, delay);

    this.batchTimeouts.set(batchKey, timeout);
  }
}

/**
 * Player State Manager
 * Manages individual player states and preferences in online sessions
 */
export class PlayerStateManager {
  private playerStates: Map<string, PlayerDraftState> = new Map();

  /**
   * Create or update player state
   */
  updatePlayerState(playerId: string, updates: Partial<PlayerDraftState>): PlayerDraftState {
    const existing = this.playerStates.get(playerId);
    
    const updated: PlayerDraftState = {
      ...existing,
      ...updates,
      playerId,
      lastActivity: Date.now(),
    } as PlayerDraftState;

    this.playerStates.set(playerId, updated);
    return updated;
  }

  /**
   * Get player state
   */
  getPlayerState(playerId: string): PlayerDraftState | undefined {
    return this.playerStates.get(playerId);
  }

  /**
   * Remove player state (on disconnect)
   */
  removePlayerState(playerId: string): void {
    this.playerStates.delete(playerId);
  }

  /**
   * Get all players in a session
   */
  getSessionPlayers(sessionId: string): PlayerDraftState[] {
    return Array.from(this.playerStates.values())
      .filter(player => player.sessionId === sessionId);
  }

  /**
   * Update UI state for a player
   */
  updatePlayerUIState(playerId: string, uiState: Partial<UIState>): void {
    const player = this.playerStates.get(playerId);
    if (player) {
      player.uiState = { ...player.uiState, ...uiState };
      player.lastActivity = Date.now();
    }
  }
}

/**
 * Complete Draft-3D State Manager
 * Coordinates all state managers for a complete online draft session
 */
export class Draft3DStateManager {
  public previews: CardPreviewStateManager;
  public interactions: StackInteractionManager;
  public uiSync: UIStateSyncManager;
  public players: PlayerStateManager;

  constructor() {
    this.previews = new CardPreviewStateManager();
    this.interactions = new StackInteractionManager();
    this.uiSync = new UIStateSyncManager();
    this.players = new PlayerStateManager();
  }

  /**
   * Clean up resources for a session
   */
  cleanupSession(sessionId: string): void {
    // Clear all previews for the session
    const sessionPreviews = this.previews.getActivePreviews(sessionId);
    for (const preview of sessionPreviews) {
      this.previews.clearPreview(preview.previewId);
    }

    // Clean up player states
    const sessionPlayers = this.players.getSessionPlayers(sessionId);
    for (const player of sessionPlayers) {
      this.players.removePlayerState(player.playerId);
    }
  }
}