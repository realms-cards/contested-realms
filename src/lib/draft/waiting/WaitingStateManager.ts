/**
 * WaitingStateManager - Manages submission tracking and waiting overlay states
 * Coordinates multi-player deck submission process with real-time updates
 */

// TODO(waiting): Reintroduce additional waiting types when building full UX flows.
import type {
  WaitingOverlayState,
  WaitingProgress,
  PlayerWaitingStatus,
  WaitingUpdateEvent,
  WaitingCoordination,
  TimeoutConfiguration,
  WaitingMetrics,
  WaitingManagerState,
  WaitingType,
  PlayerStatus,
  SubmissionProgress,
} from './types';

export class WaitingStateManager {
  private state: WaitingManagerState;
  private updateCallbacks: Set<(event: WaitingUpdateEvent) => void>;
  private timeoutHandlers: Map<string, NodeJS.Timeout>;
  private performanceMetrics: Map<string, number>;

  constructor() {
    this.state = {
      overlayState: null,
      configuration: this.getDefaultConfiguration(),
      coordination: null,
      metrics: null,
      isActive: false,
      isPaused: false,
      hasError: false,
      pendingUpdates: [],
      lastUpdateTime: 0,
      screenReaderActive: false,
      highContrastActive: false,
      keyboardNavigationActive: false
    };

    this.updateCallbacks = new Set();
    this.timeoutHandlers = new Map();
    this.performanceMetrics = new Map();
  }

  // Core lifecycle methods
  startWaiting(
    sessionId: string,
    waitingType: WaitingType,
    players: string[],
    coordinatorId: string,
    options: Partial<WaitingOverlayState> = {}
  ): void {
    console.log(`[WaitingStateManager] Starting ${waitingType} waiting for ${players.length} players`);
    
    const startTime = Date.now();
    this.performanceMetrics.set('start_time', startTime);

    // Create coordination state
    const coordination: WaitingCoordination = {
      sessionId,
      coordinatorId,
      activeWaiting: new Map(),
      globalProgress: {
        completed: 0,
        total: players.length,
        percentage: 0,
        submittedPlayers: 0,
        waitingPlayers: players.length,
        timedOutPlayers: 0,
        disconnectedPlayers: 0,
        averageWaitTime: 0,
        estimatedTimeRemaining: 0,
        progressBarVisible: true,
        showIndeterminateProgress: false
      },
      lastSyncTime: startTime,
      syncVersion: 1,
      pendingUpdates: [],
      requireAllPlayers: options.waitingType === 'deck_submission',
      allowPartialCompletion: false,
      majorityThreshold: 75,
      globalTimeout: this.getTimeoutConfiguration(waitingType),
      playerTimeouts: new Map(),
      // Player tracking for hooks
      playersSubmitted: [],
      playersBuilding: [],
      playersTimedOut: [],
      allPlayersReady: false,
      canProceedToNextPhase: false,
      waitingOverlayActive: true
    };

    // Create initial player statuses
    const playerStatuses: PlayerWaitingStatus[] = players.map((playerId, index) => ({
      playerId,
      playerName: `Player ${index + 1}`, // Would be fetched from player data
      status: 'waiting',
      startTime,
      lastActivityTime: startTime,
      waitTime: 0,
      isConnected: true,
      connectionQuality: 'good',
      displayOrder: index,
      statusIcon: 'clock',
      statusColor: 'blue'
    }));

    // Create overlay state
    const overlayState: WaitingOverlayState = {
      sessionId,
      isVisible: true,
      waitingType,
      message: this.getWaitingMessage(waitingType, coordination.globalProgress),
      progress: coordination.globalProgress,
      playerStatuses,
      startTime,
      hasTimeout: true,
      timeoutDuration: coordination.globalTimeout.totalTimeout / 1000,
      showProgressBar: true,
      showPlayerList: true,
      allowCancel: waitingType !== 'deck_submission',
      accessibilityAnnouncements: [],
      screenReaderEnabled: this.state.screenReaderActive,
      autoDismissOnComplete: true,
      dismissDelay: 2000,
      ...options
    };

    this.state = {
      ...this.state,
      overlayState,
      coordination,
      isActive: true,
      isPaused: false,
      hasError: false,
      lastUpdateTime: startTime
    };

    // Set up timeout if needed
    if (overlayState.hasTimeout && overlayState.timeoutDuration) {
      this.setupTimeout(sessionId, overlayState.timeoutDuration * 1000);
    }

    // Initialize metrics
    this.initializeMetrics(sessionId, waitingType, players.length);

    // Announce to screen readers
    this.announceToScreenReader(
      `${waitingType.replace('_', ' ')} started. Waiting for ${players.length} players.`,
      'medium'
    );

    // Broadcast start event
    this.broadcastUpdate({
      sessionId,
      updateId: `start-${Date.now()}`,
      timestamp: startTime,
      updateType: 'progress_update',
      broadcastToAll: true,
      requiresAcknowledgment: false,
      triggerAnimation: true,
      soundNotification: false
    });
  }

  updatePlayerStatus(playerId: string, newStatus: PlayerStatus, additionalData?: Record<string, unknown>): void {
    if (!this.state.overlayState || !this.state.coordination) {
      console.warn('[WaitingStateManager] No active waiting state');
      return;
    }

    const currentTime = Date.now();
    const { overlayState, coordination } = this.state;

    // Find and update player status
    const playerIndex = overlayState.playerStatuses.findIndex(p => p.playerId === playerId);
    if (playerIndex === -1) {
      console.warn(`[WaitingStateManager] Player ${playerId} not found`);
      return;
    }

    const currentPlayer = overlayState.playerStatuses[playerIndex];
    const oldStatus = currentPlayer.status;

    // Calculate new status indicators
    const { statusIcon, statusColor } = this.getStatusIndicators(newStatus);

    // Update player status
    const updatedPlayer: PlayerWaitingStatus = {
      ...currentPlayer,
      status: newStatus,
      lastActivityTime: currentTime,
      waitTime: currentTime - currentPlayer.startTime,
      statusIcon,
      statusColor,
      submissionProgress: additionalData?.submissionProgress as SubmissionProgress | undefined
    };

    const updatedPlayerStatuses = [...overlayState.playerStatuses];
    updatedPlayerStatuses[playerIndex] = updatedPlayer;

    // Update progress counters
    const progress = this.calculateProgress(updatedPlayerStatuses);

    // Update overlay state
    const updatedOverlayState: WaitingOverlayState = {
      ...overlayState,
      playerStatuses: updatedPlayerStatuses,
      progress,
      message: this.getWaitingMessage(overlayState.waitingType, progress),
      timeRemaining: this.calculateTimeRemaining()
    };

    // Update coordination
    const updatedCoordination: WaitingCoordination = {
      ...coordination,
      globalProgress: progress,
      lastSyncTime: currentTime,
      syncVersion: coordination.syncVersion + 1
    };

    this.state = {
      ...this.state,
      overlayState: updatedOverlayState,
      coordination: updatedCoordination,
      lastUpdateTime: currentTime
    };

    console.log(`[WaitingStateManager] Player ${playerId} status: ${oldStatus} → ${newStatus}`);

    // Announce status change
    if (oldStatus !== newStatus) {
      this.announceToScreenReader(
        `${updatedPlayer.playerName} status changed to ${newStatus}`,
        'medium'
      );
    }

    // Check for completion
    const allCompleted = this.checkAllPlayersCompleted();
    if (allCompleted) {
      this.handleCompletion();
    }

    // Broadcast update
    this.broadcastUpdate({
      sessionId: overlayState.sessionId,
      updateId: `player-${playerId}-${currentTime}`,
      timestamp: currentTime,
      updateType: 'player_status_change',
      playerId,
      newStatus,
      progress,
      broadcastToAll: true,
      requiresAcknowledgment: false,
      triggerAnimation: true,
      soundNotification: newStatus === 'submitted' || newStatus === 'completed'
    });

    // Update metrics (use valid field from WaitingMetrics)
    this.updateMetrics({
      updateLatency: 0
    });
  }

  handlePlayerDisconnection(playerId: string): void {
    console.log(`[WaitingStateManager] Player ${playerId} disconnected`);
    
    this.updatePlayerStatus(playerId, 'disconnected');
    
    // Update connection quality for remaining players
    if (this.state.overlayState) {
      const remainingPlayers = this.state.overlayState.playerStatuses.filter(
        p => p.isConnected && p.playerId !== playerId
      );
      
      // Announce disconnection
      this.announceToScreenReader(
        `A player has disconnected. ${remainingPlayers.length} players remaining.`,
        'high'
      );
    }

    // Check if we can still proceed
    this.evaluateContinuation();
  }

  handlePlayerReconnection(playerId: string): void {
    console.log(`[WaitingStateManager] Player ${playerId} reconnected`);
    
    if (!this.state.overlayState) return;

    const playerIndex = this.state.overlayState.playerStatuses.findIndex(p => p.playerId === playerId);
    if (playerIndex === -1) return;

    const currentPlayer = this.state.overlayState.playerStatuses[playerIndex];
    const updatedPlayer: PlayerWaitingStatus = {
      ...currentPlayer,
      isConnected: true,
      connectionQuality: 'good',
      status: currentPlayer.status === 'disconnected' ? 'waiting' : currentPlayer.status,
      statusIcon: currentPlayer.status === 'disconnected' ? 'clock' : currentPlayer.statusIcon,
      statusColor: currentPlayer.status === 'disconnected' ? 'blue' : currentPlayer.statusColor
    };

    const updatedPlayerStatuses = [...this.state.overlayState.playerStatuses];
    updatedPlayerStatuses[playerIndex] = updatedPlayer;

    this.state = {
      ...this.state,
      overlayState: {
        ...this.state.overlayState,
        playerStatuses: updatedPlayerStatuses
      }
    };

    // Announce reconnection
    this.announceToScreenReader(
      `${updatedPlayer.playerName} has reconnected.`,
      'medium'
    );
  }

  handleTimeout(): void {
    if (!this.state.overlayState || !this.state.coordination) return;

    console.log('[WaitingStateManager] Timeout reached');

    const currentTime = Date.now();
    const overlay = this.state.overlayState as WaitingOverlayState;
    
    // Mark remaining players as timed out
    const updatedPlayerStatuses = overlay.playerStatuses.map(player => {
      if (player.status === 'waiting' || player.status === 'in_progress') {
        return {
          ...player,
          status: 'timed_out' as PlayerStatus,
          statusIcon: 'warning' as const,
          statusColor: 'red' as const,
          lastActivityTime: currentTime
        };
      }
      return player;
    });

    // Update progress
    const progress = this.calculateProgress(updatedPlayerStatuses);

    this.state = {
      ...this.state,
      overlayState: {
        ...this.state.overlayState,
        playerStatuses: updatedPlayerStatuses,
        progress,
        message: 'Time expired - proceeding with submitted decks',
        timeRemaining: 0
      }
    };

    // Announce timeout
    this.announceToScreenReader(
      'Time limit reached. Proceeding with submitted decks.',
      'critical'
    );

    // Broadcast timeout event
    this.broadcastUpdate({
      sessionId: overlay.sessionId,
      updateId: `timeout-${currentTime}`,
      timestamp: currentTime,
      updateType: 'timeout_warning',
      message: 'Time expired',
      broadcastToAll: true,
      requiresAcknowledgment: true,
      triggerAnimation: true,
      soundNotification: true
    });

    // Proceed with completion after grace period
    setTimeout(() => {
      this.handleCompletion();
    }, 2000);
  }

  completeWaiting(playerId?: string): void {
    if (!this.state.overlayState) return;

    console.log(`[WaitingStateManager] Completing waiting${playerId ? ` for player ${playerId}` : ''}`);

    if (playerId) {
      this.updatePlayerStatus(playerId, 'completed');
    } else {
      this.handleCompletion();
    }
  }

  cancelWaiting(): void {
    if (!this.state.overlayState) return;

    console.log('[WaitingStateManager] Cancelling waiting');

    // Clear all timeouts
    this.timeoutHandlers.forEach(timeout => clearTimeout(timeout));
    this.timeoutHandlers.clear();

    // Broadcast cancellation
    this.broadcastUpdate({
      sessionId: this.state.overlayState.sessionId,
      updateId: `cancel-${Date.now()}`,
      timestamp: Date.now(),
      updateType: 'dismissal',
      message: 'Waiting cancelled',
      broadcastToAll: true,
      requiresAcknowledgment: false,
      triggerAnimation: false,
      soundNotification: false
    });

    // Reset state
    this.state = {
      ...this.state,
      overlayState: null,
      coordination: null,
      isActive: false,
      isPaused: false,
      hasError: false
    };

    // Announce cancellation
    this.announceToScreenReader('Waiting cancelled.', 'high');
  }

  // State accessors
  getWaitingState(): WaitingOverlayState | null {
    return this.state.overlayState;
  }

  getCoordinationState(): WaitingCoordination | null {
    return this.state.coordination;
  }

  getMetrics(): WaitingMetrics | null {
    return this.state.metrics;
  }

  isWaiting(): boolean {
    return this.state.isActive && this.state.overlayState !== null;
  }

  getProgress(): WaitingProgress | null {
    return this.state.overlayState?.progress || null;
  }

  // Event subscription
  onUpdate(callback: (event: WaitingUpdateEvent) => void): () => void {
    this.updateCallbacks.add(callback);
    return () => {
      this.updateCallbacks.delete(callback);
    };
  }

  // Private helper methods
  private handleCompletion(): void {
    if (!this.state.overlayState) return;

    console.log('[WaitingStateManager] All players completed');

    const currentTime = Date.now();
    const overlay = this.state.overlayState as WaitingOverlayState;
    const totalTime = currentTime - overlay.startTime;

    // Update final state
    this.state = {
      ...this.state,
      overlayState: {
        ...this.state.overlayState,
        message: 'All players ready - proceeding',
        progress: {
          ...this.state.overlayState.progress,
          percentage: 100
        }
      }
    };

    // Final metrics update
    this.updateMetrics({
      totalWaitTime: totalTime,
      completionRate: this.calculateCompletionRate()
    });

    // Announce completion
    this.announceToScreenReader('All players are ready. Proceeding.', 'high');

    // Broadcast completion
    this.broadcastUpdate({
      sessionId: overlay.sessionId,
      updateId: `complete-${currentTime}`,
      timestamp: currentTime,
      updateType: 'completion',
      broadcastToAll: true,
      requiresAcknowledgment: false,
      triggerAnimation: true,
      soundNotification: true
    });

    // Auto-dismiss after delay
    if (overlay.autoDismissOnComplete) {
      setTimeout(() => {
        this.dismissOverlay();
      }, overlay.dismissDelay);
    }
  }

  private dismissOverlay(): void {
    if (!this.state.overlayState) return;

    // Clear timeouts
    this.timeoutHandlers.forEach(timeout => clearTimeout(timeout));
    this.timeoutHandlers.clear();

    // Reset active state
    this.state = {
      ...this.state,
      overlayState: null,
      coordination: null,
      isActive: false,
      isPaused: false
    };

    console.log('[WaitingStateManager] Overlay dismissed');
  }

  private checkAllPlayersCompleted(): boolean {
    if (!this.state.overlayState) return false;

    const activePlayers = this.state.overlayState.playerStatuses.filter(p => p.isConnected);
    const completedPlayers = activePlayers.filter(p => 
      p.status === 'completed' || p.status === 'submitted'
    );

    return completedPlayers.length === activePlayers.length && activePlayers.length > 0;
  }

  private calculateProgress(playerStatuses: PlayerWaitingStatus[]): WaitingProgress {
    const total = playerStatuses.length;
    const completed = playerStatuses.filter(p => 
      p.status === 'completed' || p.status === 'submitted'
    ).length;
    const waiting = playerStatuses.filter(p => 
      p.status === 'waiting' || p.status === 'in_progress'
    ).length;
    const timedOut = playerStatuses.filter(p => p.status === 'timed_out').length;
    const disconnected = playerStatuses.filter(p => p.status === 'disconnected').length;

    const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;

    return {
      completed,
      total,
      percentage,
      submittedPlayers: completed,
      waitingPlayers: waiting,
      timedOutPlayers: timedOut,
      disconnectedPlayers: disconnected,
      averageWaitTime: this.calculateAverageWaitTime(playerStatuses),
      estimatedTimeRemaining: this.calculateTimeRemaining(),
      progressBarVisible: true,
      showIndeterminateProgress: percentage === 0 && waiting > 0
    };
  }

  private calculateAverageWaitTime(playerStatuses: PlayerWaitingStatus[]): number {
    const currentTime = Date.now();
    const activePlayers = playerStatuses.filter(p => p.isConnected);
    
    if (activePlayers.length === 0) return 0;

    const totalWaitTime = activePlayers.reduce((sum, player) => {
      return sum + (currentTime - player.startTime);
    }, 0);

    return Math.round(totalWaitTime / activePlayers.length);
  }

  private calculateTimeRemaining(): number {
    if (!this.state.overlayState || !this.state.overlayState.hasTimeout) return 0;

    const elapsed = Date.now() - this.state.overlayState.startTime;
    const total = (this.state.overlayState.timeoutDuration || 60) * 1000;
    return Math.max(0, Math.round((total - elapsed) / 1000));
  }

  private calculateCompletionRate(): number {
    if (!this.state.overlayState) return 0;

    const total = this.state.overlayState.playerStatuses.length;
    const completed = this.state.overlayState.playerStatuses.filter(p => 
      p.status === 'completed' || p.status === 'submitted'
    ).length;

    return total > 0 ? Math.round((completed / total) * 100) : 0;
  }

  private getStatusIndicators(status: PlayerStatus): { 
    statusIcon: PlayerWaitingStatus['statusIcon']; 
    statusColor: PlayerWaitingStatus['statusColor']; 
  } {
    switch (status) {
      case 'waiting':
        return { statusIcon: 'clock', statusColor: 'blue' };
      case 'in_progress':
        return { statusIcon: 'spinner', statusColor: 'blue' };
      case 'submitted':
      case 'completed':
        return { statusIcon: 'checkmark', statusColor: 'green' };
      case 'timed_out':
        return { statusIcon: 'warning', statusColor: 'yellow' };
      case 'disconnected':
        return { statusIcon: 'offline', statusColor: 'gray' };
      case 'failed':
        return { statusIcon: 'error', statusColor: 'red' };
      default:
        return { statusIcon: 'clock', statusColor: 'blue' };
    }
  }

  private getWaitingMessage(waitingType: WaitingType, progress: WaitingProgress): string {
    switch (waitingType) {
      case 'deck_submission':
        return `Waiting for deck submissions (${progress.completed}/${progress.total})`;
      case 'pick_synchronization':
        return `Waiting for all players to pick (${progress.completed}/${progress.total})`;
      case 'pack_rotation':
        return 'Rotating packs...';
      case 'reconnection':
        return 'Reconnecting players...';
      case 'validation':
        return 'Validating submissions...';
      case 'match_start':
        return 'Starting match...';
      default:
        return `Waiting for players (${progress.completed}/${progress.total})`;
    }
  }

  private setupTimeout(sessionId: string, timeoutMs: number): void {
    const timeoutId = setTimeout(() => {
      this.handleTimeout();
    }, timeoutMs);

    this.timeoutHandlers.set(sessionId, timeoutId);
  }

  private getTimeoutConfiguration(waitingType: WaitingType): TimeoutConfiguration {
    // Different timeout configurations based on waiting type
    switch (waitingType) {
      case 'deck_submission':
        return {
          totalTimeout: 5 * 60 * 1000, // 5 minutes
          warningThresholds: [
            { threshold: 60000, message: '1 minute remaining', severity: 'warning', soundEnabled: true, visualIndicator: true },
            { threshold: 30000, message: '30 seconds remaining', severity: 'warning', soundEnabled: true, visualIndicator: true },
            { threshold: 10000, message: '10 seconds remaining', severity: 'critical', soundEnabled: true, visualIndicator: true }
          ],
          escalationEnabled: true,
          escalationSteps: [],
          gracePeriod: 10000, // 10 seconds
          allowGracePeriod: true
        };
      case 'pick_synchronization':
        return {
          totalTimeout: 60 * 1000, // 1 minute
          warningThresholds: [
            { threshold: 20000, message: '20 seconds remaining', severity: 'info', soundEnabled: false, visualIndicator: true },
            { threshold: 10000, message: '10 seconds remaining', severity: 'warning', soundEnabled: true, visualIndicator: true }
          ],
          escalationEnabled: false,
          escalationSteps: [],
          gracePeriod: 5000, // 5 seconds
          allowGracePeriod: true
        };
      default:
        return {
          totalTimeout: 2 * 60 * 1000, // 2 minutes
          warningThresholds: [],
          escalationEnabled: false,
          escalationSteps: [],
          gracePeriod: 0,
          allowGracePeriod: false
        };
    }
  }

  private evaluateContinuation(): void {
    if (!this.state.coordination || !this.state.overlayState) return;

    const activePlayers = this.state.overlayState.playerStatuses.filter(p => p.isConnected);
    const totalPlayers = this.state.overlayState.playerStatuses.length;
    const disconnectedCount = totalPlayers - activePlayers.length;

    // Check if we still have enough players to continue
    const activePercentage = (activePlayers.length / totalPlayers) * 100;
    
    if (activePercentage < this.state.coordination.majorityThreshold) {
      console.warn(`[WaitingStateManager] Too many disconnections (${disconnectedCount}/${totalPlayers})`);
      
      // Announce the situation
      this.announceToScreenReader(
        `Too many players have disconnected. Cannot continue.`,
        'critical'
      );
      
      // This would typically trigger a session cancellation
      this.state = {
        ...this.state,
        hasError: true,
        errorMessage: 'Insufficient players to continue'
      };
    }
  }

  private announceToScreenReader(text: string, priority: AnnouncementPriority): void {
    if (!this.state.screenReaderActive) return;

    const announcement: AccessibilityAnnouncement = {
      announcementId: `announcement-${Date.now()}`,
      timestamp: Date.now(),
      text,
      priority,
      announced: false,
      acknowledgeRequired: priority === 'critical',
      triggerEvent: 'status_change',
      relatedPlayerId: undefined
    };

    if (this.state.overlayState) {
      this.state.overlayState.accessibilityAnnouncements.push(announcement);
    }

    console.log(`[WaitingStateManager] [A11Y] ${priority.toUpperCase()}: ${text}`);
  }

  private broadcastUpdate(event: WaitingUpdateEvent): void {
    // Add to pending updates
    this.state.pendingUpdates.push(event);
    
    // Notify all subscribers
    this.updateCallbacks.forEach(callback => {
      try {
        callback(event);
      } catch (error) {
        console.error('[WaitingStateManager] Error in update callback:', error);
      }
    });

    console.log(`[WaitingStateManager] Broadcast: ${event.updateType} (${event.updateId})`);
  }

  private initializeMetrics(sessionId: string, waitingType: WaitingType, playerCount: number): void {
    this.state.metrics = {
      sessionId,
      waitingType,
      totalWaitTime: 0,
      averagePlayerWaitTime: 0,
      maxPlayerWaitTime: 0,
      minPlayerWaitTime: 0,
      completionRate: 0,
      timeoutRate: 0,
      disconnectionRate: 0,
      overlayRenderTime: 0,
      updateLatency: 0,
      animationFrameRate: 60,
      userCancelRate: 0,
      userComplaintCount: 0,
      accessibilityUsage: this.state.screenReaderActive ? 100 : 0,
      memoryUsage: 0,
      cpuUsage: 0,
      networkTraffic: 0
    };
  }

  private updateMetrics(updates: Partial<WaitingMetrics>): void {
    if (this.state.metrics) {
      this.state.metrics = {
        ...this.state.metrics,
        ...updates
      };
    }
  }

  private getDefaultConfiguration() {
    return {
      theme: {
        backgroundOpacity: 0.8,
        cornerRadius: 12,
        shadowIntensity: 0.3,
        primaryColor: '#3B82F6',
        secondaryColor: '#64748B',
        successColor: '#10B981',
        warningColor: '#F59E0B',
        errorColor: '#EF4444',
        fontFamily: 'system-ui',
        fontSize: {
          title: 18,
          body: 14,
          caption: 12
        }
      },
      animations: {
        enableAnimations: true,
        reducedMotion: false,
        fadeInDuration: 300,
        fadeOutDuration: 200,
        progressAnimationSpeed: 50,
        enablePulse: true,
        enableGlow: true,
        enableParticles: false
      },
      behavior: {
        showOnInit: true,
        hideOnComplete: true,
        allowBackgroundClick: false,
        allowEscapeKey: true,
        autoDismissDelay: 2000,
        requireExplicitDismiss: false,
        allowCancel: true,
        showMinimizeButton: false,
        allowDragToMove: false
      },
      performance: {
        updateThrottleMs: 16,
        maxConcurrentAnimations: 3,
        enableGPUAcceleration: true,
        maxHistoryEntries: 100,
        cleanupInterval: 30000
      },
      accessibility: {
        enableScreenReader: false,
        highContrastMode: false,
        largeTextMode: false,
        enableKeyboardNav: true,
        trapFocus: true,
        announceProgressUpdates: true,
        announcePlayerChanges: true,
        maxAnnouncementFreq: 2000
      }
    };
  }
}
