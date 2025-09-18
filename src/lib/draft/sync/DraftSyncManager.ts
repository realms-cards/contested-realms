/**
 * DraftSyncManager - Coordinated Pick and Pass Synchronization
 * Implements the core requirement: "All players must pick before packs rotate"
 */

import type {
  DraftSession,
  PlayerDraftState,
  PickConflict,
  PackRotationEvent,
  TimerState,
  SyncMetrics,
  StateValidation,
} from './types';

export class DraftSyncManager {
  /**
   * Strictly typed coordination layer for draft synchronization.
   *
   * - All state structures (sessions, players, metrics) are typed via `./types`.
   * - Socket transport and event wiring are owned by `socketHandlers.ts`. This class
   *   remains transport-agnostic and focuses purely on business rules and state changes.
   */
  private sessions: Map<string, DraftSession> = new Map();
  private playerStates: Map<string, PlayerDraftState> = new Map();
  private activeTimers: Map<string, NodeJS.Timeout> = new Map();
  private metrics: Map<string, SyncMetrics> = new Map();

  // Constants from research.md
  private readonly PICK_TIMER_DURATION = 60000; // 60 seconds
  private readonly GRACE_PERIOD_DURATION = 30000; // 30 seconds
  private readonly WARNING_THRESHOLDS = [15000, 10000, 5000]; // 15s, 10s, 5s remaining
  private readonly MAX_SYNC_LATENCY = 100; // 100ms target
  private readonly TARGET_FPS = 60;

  /**
   * Process a pick event from a player
   * This is the core method that enforces synchronization
   */
  async processPickEvent(
    sessionId: string,
    playerId: string,
    cardId: string,
    clientTimestamp: number
  ): Promise<{ success: boolean; conflict?: PickConflict; shouldRotate: boolean }> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    const serverTimestamp = Date.now();
    const networkLatency = serverTimestamp - clientTimestamp;

    // Check if player can make this pick
    const canPick = this.validatePickEligibility(sessionId, playerId, cardId);
    if (!canPick.valid) {
      return { success: false, shouldRotate: false };
    }

    // Record the pick
    const pickState = session.pickStates[playerId];
    if (pickState) {
      pickState.hasPickedThisRound = true;
      pickState.pickTimestamp = serverTimestamp;
      pickState.isTimedOut = false;
    }

    // Update player's cards and pack contents
    await this.applyPickToSession(sessionId, playerId, cardId);

    // Check for conflicts with other players
    const conflict = await this.checkPickConflicts(sessionId, cardId, playerId, {
      clientTimestamp,
      serverTimestamp,
      networkLatency
    });

    if (conflict) {
      const resolution = await this.resolvePickConflict(conflict);
      if (resolution.resolvedPlayerId !== playerId) {
        // This pick was overridden by conflict resolution
        await this.rollbackPick(sessionId, playerId, cardId);
        return { success: false, conflict, shouldRotate: false };
      }
    }

    // Check if all players have picked (synchronization requirement)
    const shouldRotate = this.checkAllPlayersReady(sessionId);
    
    if (shouldRotate) {
      // Trigger pack rotation for all players simultaneously
      await this.coordinatePackRotation(sessionId);
    }

    // Update metrics
    this.updateMetrics(sessionId, networkLatency, serverTimestamp);

    return { success: true, conflict: conflict ?? undefined, shouldRotate };
  }

  /**
   * Enforce pick synchronization - core requirement implementation
   * "All players must pick before packs rotate"
   */
  private checkAllPlayersReady(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    // Check if all active players have completed their picks
    const activePlayers = session.players.filter(playerId => {
      const player = this.playerStates.get(playerId);
      return player?.isConnected && !this.isInGracePeriod(playerId);
    });

    const playersWhoHavePicked = activePlayers.filter(playerId => {
      const pickState = session.pickStates[playerId];
      return pickState?.hasPickedThisRound === true;
    });

    const allReady = playersWhoHavePicked.length === activePlayers.length;
    
    if (allReady) {
      console.log(`[DraftSync] All ${activePlayers.length} players ready for pack rotation in session ${sessionId}`);
    } else {
      const remaining = activePlayers.length - playersWhoHavePicked.length;
      console.log(`[DraftSync] Waiting for ${remaining} more players to pick in session ${sessionId}`);
    }

    return allReady;
  }

  /**
   * Coordinate simultaneous pack rotation for all players
   * Target: <100ms synchronization latency
   */
  private async coordinatePackRotation(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    const rotationStartTime = Date.now();

    // Calculate new pack ownership mapping
    const rotationMap = this.calculatePackRotation(sessionId);
    
    // Create rotation event
    const rotationEvent: PackRotationEvent = {
      sessionId,
      fromRound: session.currentPick,
      toRound: session.currentPick + 1,
      rotationMap,
      timestamp: rotationStartTime,
      syncLatency: 0 // Will be updated after broadcast
    };

    // Reset pick states for next round
    this.resetPickStatesForNextRound(sessionId);

    // Update session state
    session.currentPick += 1;
    session.packRotationPending = false;
    session.updatedAt = Date.now();
    session.syncVersion += 1;

    // Broadcast rotation to all players simultaneously
    await this.broadcastPackRotation(rotationEvent);

    // Measure actual sync latency
    const syncLatency = Date.now() - rotationStartTime;
    rotationEvent.syncLatency = syncLatency;

    // Validate sync latency meets performance target
    if (syncLatency > this.MAX_SYNC_LATENCY) {
      console.warn(`[DraftSync] Pack rotation latency ${syncLatency}ms exceeds target of ${this.MAX_SYNC_LATENCY}ms`);
    }

    console.log(`[DraftSync] Pack rotation completed in ${syncLatency}ms for session ${sessionId}`);
  }

  /**
   * Handle player disconnection with 30-second grace period
   */
  async handlePlayerDisconnection(sessionId: string, playerId: string): Promise<void> {
    const player = this.playerStates.get(playerId);
    if (!player) return;

    player.isConnected = false;
    const disconnectTime = Date.now();

    // Start grace period timer
    const graceTimer = setTimeout(async () => {
      await this.handleGracePeriodExpired(sessionId, playerId);
    }, this.GRACE_PERIOD_DURATION);

    this.activeTimers.set(`grace-${playerId}`, graceTimer);

    // Update pick state to reflect disconnection
    const session = this.sessions.get(sessionId);
    if (session?.pickStates[playerId]) {
      session.pickStates[playerId].disconnectedAt = disconnectTime;
    }

    console.log(`[DraftSync] Player ${playerId} disconnected, starting 30s grace period`);
  }

  /**
   * Handle successful reconnection within grace period
   */
  async handlePlayerReconnection(sessionId: string, playerId: string): Promise<void> {
    const player = this.playerStates.get(playerId);
    if (!player) return;

    player.isConnected = true;
    // Track reconnection attempts on pick state, not player draft state
    const sessionForReconn = this.sessions.get(sessionId);
    if (sessionForReconn?.pickStates[playerId]) {
      sessionForReconn.pickStates[playerId].reconnectionAttempts += 1;
      sessionForReconn.pickStates[playerId].disconnectedAt = null;
    }

    // Clear grace period timer
    const graceTimer = this.activeTimers.get(`grace-${playerId}`);
    if (graceTimer) {
      clearTimeout(graceTimer);
      this.activeTimers.delete(`grace-${playerId}`);
    }

    // Update pick state
    const session = this.sessions.get(sessionId);
    if (session?.pickStates[playerId]) {
      session.pickStates[playerId].disconnectedAt = null;
    }

    // Trigger state resync
    await this.resyncPlayerState(sessionId, playerId);

    console.log(`[DraftSync] Player ${playerId} reconnected successfully`);
  }

  /**
   * Start 60-second pick timer with escalating warnings
   */
  private startPickTimer(sessionId: string, playerId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    // Set warning timers at 15s, 10s, 5s remaining
    this.WARNING_THRESHOLDS.forEach((threshold) => {
      const warningTime = this.PICK_TIMER_DURATION - threshold;
      setTimeout(() => {
        this.triggerPickWarning(sessionId, playerId, threshold / 1000);
      }, warningTime);
    });

    // Set timeout timer
    const timeoutTimer = setTimeout(() => {
      this.handlePickTimeout(sessionId, playerId);
    }, this.PICK_TIMER_DURATION);

    this.activeTimers.set(`pick-${playerId}`, timeoutTimer);
  }

  /**
   * Handle pick timeout - auto-pick random card
   */
  private async handlePickTimeout(sessionId: string, playerId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    const pickState = session.pickStates[playerId];
    if (pickState && !pickState.hasPickedThisRound) {
      pickState.isTimedOut = true;
      
      // Auto-pick random card from available options
      const availableCards = session.packContents[playerId] || [];
      if (availableCards.length > 0) {
        const randomCard = availableCards[Math.floor(Math.random() * availableCards.length)];
        await this.processPickEvent(sessionId, playerId, randomCard, Date.now());
        
        console.log(`[DraftSync] Auto-picked card ${randomCard} for timed-out player ${playerId}`);
      }
    }
  }

  /**
   * Validate state consistency across all players
   */
  async validateSessionState(sessionId: string): Promise<StateValidation> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found for validation`);
    }

    const validation: StateValidation = {
      sessionId,
      validationId: `val-${Date.now()}`,
      timestamp: Date.now(),
      playerCountConsistent: true,
      packContentsValid: true,
      pickStatesConsistent: true,
      timingValid: true,
      issues: [],
      correctionActions: [],
      validatorVersion: '1.0.0',
      checksPerformed: []
    };

    // Check player count consistency
    const expectedPlayerCount = session.players.length;
    const actualPlayerStates = Object.keys(session.pickStates).length;
    if (expectedPlayerCount !== actualPlayerStates) {
      validation.playerCountConsistent = false;
      validation.issues.push({
        issueId: 'player-count-mismatch',
        severity: 'error',
        category: 'state',
        description: `Expected ${expectedPlayerCount} players, found ${actualPlayerStates} pick states`,
        affectedPlayers: session.players,
        suggestedAction: 'Resync player states',
        autoFixAvailable: true
      });
    }

    // Validate pack contents
    this.validatePackContents(session, validation);

    // Check timing consistency
    this.validateTiming(session, validation);

    return validation;
  }

  /**
   * Performance monitoring and metrics collection
   */
  private updateMetrics(sessionId: string, latency: number, timestamp: number): void {
    let m = this.metrics.get(sessionId);
    if (!m) {
      m = {
        sessionId,
        timestamp,
        averagePickLatency: 0,
        p95PickLatency: 0,
        syncLatency: 0,
        frameRate: this.TARGET_FPS,
        memoryUsage: 0,
        networkThroughput: 0,
        playerCount: 0,
        activeConnections: 0,
        averageConnectionQuality: 0,
        conflictCount: 0,
        timeoutCount: 0,
        disconnectionCount: 0,
        totalPicks: 0,
        playerStatusChanges: 0,
        lastStatusChangeTime: timestamp,
      };
      this.metrics.set(sessionId, m);
    }

    // Update latency metrics
    m.averagePickLatency = (m.averagePickLatency + latency) / 2;
    m.timestamp = timestamp;

    this.metrics.set(sessionId, m);
  }

  // Helper methods for internal operations
  private validatePickEligibility(sessionId: string, playerId: string, cardId: string): { valid: boolean; reason?: string } {
    const session = this.sessions.get(sessionId);
    if (!session) return { valid: false, reason: 'Session not found' };

    const pickState = session.pickStates[playerId];
    if (!pickState) return { valid: false, reason: 'Player not in session' };

    if (pickState.hasPickedThisRound) {
      return { valid: false, reason: 'Player already picked this round' };
    }

    const playerCards = session.packContents[playerId] || [];
    if (!playerCards.includes(cardId)) {
      return { valid: false, reason: 'Card not available to player' };
    }

    return { valid: true };
  }

  private async applyPickToSession(sessionId: string, playerId: string, cardId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    // Remove card from player's pack
    const playerPack = session.packContents[playerId] || [];
    session.packContents[playerId] = playerPack.filter(id => id !== cardId);

    // Add card to player's picked cards
    const player = this.playerStates.get(playerId);
    if (player) {
      player.currentCards.push(cardId);
      player.totalPicks += 1;
      player.lastActivity = Date.now();
    }
  }

  private async checkPickConflicts(
    _sessionId: string,
    _cardId: string,
    _playerId: string,
    _timing: { clientTimestamp: number; serverTimestamp: number; networkLatency: number }
  ): Promise<PickConflict | null> {
    // Implementation would check for simultaneous picks of the same card
    // For now, return null (no conflicts)
    return null;
  }

  private async resolvePickConflict(conflict: PickConflict): Promise<{ resolvedPlayerId: string }> {
    // Resolve by server timestamp (earliest wins)
    const earliestPick = conflict.conflictingPicks.reduce((earliest, pick) => 
      pick.serverTimestamp < earliest.serverTimestamp ? pick : earliest
    );

    return { resolvedPlayerId: earliestPick.playerId };
  }

  private async rollbackPick(sessionId: string, playerId: string, cardId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    // Add card back to player's pack
    session.packContents[playerId]?.push(cardId);

    // Remove card from player's picked cards
    const player = this.playerStates.get(playerId);
    if (player) {
      player.currentCards = player.currentCards.filter(id => id !== cardId);
      player.totalPicks -= 1;
    }

    // Reset pick state
    const pickState = session.pickStates[playerId];
    if (pickState) {
      pickState.hasPickedThisRound = false;
      pickState.pickTimestamp = null;
    }
  }

  private calculatePackRotation(sessionId: string): Record<string, string> {
    const session = this.sessions.get(sessionId);
    if (!session) return {};

    const rotationMap: Record<string, string> = {};
    const players = session.players;

    // Simple rotation: each player gets the next player's pack
    for (let i = 0; i < players.length; i++) {
      const currentPlayer = players[i];
      const nextPlayer = players[(i + 1) % players.length];
      rotationMap[currentPlayer] = nextPlayer;
    }

    return rotationMap;
  }

  private resetPickStatesForNextRound(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    Object.values(session.pickStates).forEach(pickState => {
      pickState.hasPickedThisRound = false;
      pickState.pickTimestamp = null;
      pickState.isTimedOut = false;
    });
  }

  private async broadcastPackRotation(event: PackRotationEvent): Promise<void> {
    // Implementation would broadcast to all connected clients
    console.log(`[DraftSync] Broadcasting pack rotation for session ${event.sessionId}`);
  }

  private isInGracePeriod(playerId: string): boolean {
    return this.activeTimers.has(`grace-${playerId}`);
  }

  private async handleGracePeriodExpired(sessionId: string, playerId: string): Promise<void> {
    console.log(`[DraftSync] Grace period expired for player ${playerId}, activating bot`);
    // Implementation would activate bot takeover
  }

  private async resyncPlayerState(sessionId: string, playerId: string): Promise<void> {
    console.log(`[DraftSync] Resyncing state for player ${playerId}`);
    // Implementation would send complete state update to reconnected player
  }

  private triggerPickWarning(sessionId: string, playerId: string, secondsRemaining: number): void {
    console.log(`[DraftSync] Pick warning: ${secondsRemaining}s remaining for player ${playerId}`);
    // Implementation would send warning to player
  }

  private validatePackContents(session: DraftSession, validation: StateValidation): void {
    // Implementation would validate pack contents consistency
    validation.checksPerformed.push('pack-contents');
  }

  private validateTiming(session: DraftSession, validation: StateValidation): void {
    // Implementation would validate timing constraints
    validation.checksPerformed.push('timing');
  }

  // Public interface methods
  /**
   * Public wrapper to check if all players are ready for rotation.
   */
  public areAllPlayersReady(sessionId: string): boolean {
    return this.checkAllPlayersReady(sessionId);
  }

  /**
   * Update session state with authoritative data (e.g., from server sync).
   */
  public updateSessionState(sessionId: string, session: DraftSession): void {
    this.sessions.set(sessionId, session);
  }

  /**
   * Update or create a player's draft state with partial updates.
   */
  public updatePlayerState(sessionId: string, playerId: string, state: Partial<PlayerDraftState>): void {
    const existing = this.playerStates.get(playerId);
    const base: PlayerDraftState = existing || {
      playerId,
      sessionId,
      playerName: '',
      isConnected: true,
      connectionQuality: 'good',
      currentCards: [],
      packPosition: 0,
      totalPicks: 0,
      isReady: false,
      lastActivity: Date.now(),
      pickStartTime: null,
      averagePickTime: 0,
      uiState: {
        cameraPosition: { x: 0, y: 0, z: 0 },
        cameraTarget: { x: 0, y: 0, z: 0 },
        previewMode: null,
        menuOpen: false,
        viewMode: '3d',
        zoomLevel: 1,
        cardStackHeight: 0,
        animationSpeed: 1,
        isDragging: false,
        isPickingCard: false,
        showPackContents: true,
      },
      preferences: {
        autoPass: false,
        showTimers: true,
        cardPreviewDelay: 150,
        soundEnabled: true,
        animationSpeed: 'normal',
        enablePickWarnings: true,
        warningThresholds: [45, 50, 55],
        highContrast: false,
        reducedMotion: false,
        screenReaderEnabled: false,
      },
    };

    const updated: PlayerDraftState = { ...base, ...state, playerId, sessionId } as PlayerDraftState;
    this.playerStates.set(playerId, updated);
  }

  /**
   * Public metrics update API to merge partial updates safely.
   */
  public applyMetricsUpdate(sessionId: string, updates: Partial<SyncMetrics>): void {
    let m = this.metrics.get(sessionId);
    if (!m) {
      m = {
        sessionId,
        timestamp: Date.now(),
        averagePickLatency: 0,
        p95PickLatency: 0,
        syncLatency: 0,
        frameRate: this.TARGET_FPS,
        memoryUsage: 0,
        networkThroughput: 0,
        playerCount: 0,
        activeConnections: 0,
        averageConnectionQuality: 0,
        conflictCount: 0,
        timeoutCount: 0,
        disconnectionCount: 0,
        totalPicks: 0,
        playerStatusChanges: 0,
        lastStatusChangeTime: Date.now(),
      };
    }

    const next: SyncMetrics = { ...m, ...updates, sessionId } as SyncMetrics;
    this.metrics.set(sessionId, next);
  }
  public createSession(sessionId: string, players: string[], hostPlayerId: string): DraftSession {
    const session: DraftSession = {
      sessionId,
      players,
      hostPlayerId,
      currentPack: 0,
      currentPick: 0,
      gamePhase: 'waiting',
      packContents: {},
      timeRemaining: this.PICK_TIMER_DURATION / 1000,
      pickTimer: this.PICK_TIMER_DURATION / 1000,
      gracePeriod: this.GRACE_PERIOD_DURATION / 1000,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      pickStates: {},
      packRotationPending: false,
      syncVersion: 1,
      version: 1,
      currentRound: 0,
      lastSyncTime: Date.now(),
    };

    // Initialize pick states for all players
    players.forEach(playerId => {
      session.pickStates[playerId] = {
        playerId,
        hasPickedThisRound: false,
        pickTimestamp: null,
        isTimedOut: false,
        disconnectedAt: null,
        reconnectionAttempts: 0,
        currentPick: null,
        pickStartTime: Date.now(),
        pickEndTime: 0,
      };
    });

    this.sessions.set(sessionId, session);
    return session;
  }

  public getSession(sessionId: string): DraftSession | undefined {
    return this.sessions.get(sessionId);
  }

  public getMetrics(sessionId: string): SyncMetrics | undefined {
    return this.metrics.get(sessionId);
  }
}
