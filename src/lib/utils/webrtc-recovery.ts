/**
 * WebRTC Error Recovery Strategies
 * Handles automatic recovery from various WebRTC failure scenarios
 */

import { webrtcLogger, type WebRTCErrorType } from './webrtc-logging';

export type RecoveryStrategy = 'retry' | 'restart' | 'fallback' | 'notify-only';

export interface RecoveryConfig {
  maxRetries: number;
  retryDelay: number;
  backoffMultiplier: number;
  maxDelay: number;
  strategy: RecoveryStrategy;
  fallbackAction?: () => Promise<void>;
  notificationCallback?: (error: WebRTCErrorType, message: string) => void;
}

export interface RecoveryContext {
  matchId?: string;
  playerId?: string;
  attemptCount: number;
  lastError?: Error;
  connectionState?: RTCPeerConnectionState;
  retryAllowed: boolean;
}

class WebRTCRecoveryManager {
  private recoveryAttempts = new Map<string, number>();
  private recoveryTimers = new Map<string, NodeJS.Timeout>();
  
  // Default recovery strategies for different error types
  private readonly strategies: Record<WebRTCErrorType, RecoveryConfig> = {
    'connection-failed': {
      maxRetries: 3,
      retryDelay: 2000,
      backoffMultiplier: 2,
      maxDelay: 10000,
      strategy: 'retry'
    },
    'peer-connection-failed': {
      maxRetries: 2,
      retryDelay: 3000,
      backoffMultiplier: 2,
      maxDelay: 15000,
      strategy: 'restart'
    },
    'media-device-error': {
      maxRetries: 1,
      retryDelay: 1000,
      backoffMultiplier: 1.5,
      maxDelay: 5000,
      strategy: 'fallback'
    },
    'permission-denied': {
      maxRetries: 0,
      retryDelay: 0,
      backoffMultiplier: 1,
      maxDelay: 0,
      strategy: 'notify-only'
    },
    'signaling-error': {
      maxRetries: 5,
      retryDelay: 1000,
      backoffMultiplier: 1.5,
      maxDelay: 8000,
      strategy: 'retry'
    },
    'ice-connection-failed': {
      maxRetries: 3,
      retryDelay: 2000,
      backoffMultiplier: 2,
      maxDelay: 12000,
      strategy: 'restart'
    },
    'data-channel-error': {
      maxRetries: 2,
      retryDelay: 1500,
      backoffMultiplier: 2,
      maxDelay: 6000,
      strategy: 'retry'
    },
    'stream-error': {
      maxRetries: 2,
      retryDelay: 2000,
      backoffMultiplier: 1.5,
      maxDelay: 8000,
      strategy: 'fallback'
    },
    'unknown': {
      maxRetries: 1,
      retryDelay: 3000,
      backoffMultiplier: 1,
      maxDelay: 3000,
      strategy: 'notify-only'
    }
  };

  /**
   * Attempt to recover from a WebRTC error
   */
  async recover(
    errorType: WebRTCErrorType,
    context: RecoveryContext,
    recoveryAction: () => Promise<boolean>
  ): Promise<boolean> {
    const recoveryKey = this.getRecoveryKey(errorType, context);
    const config = this.strategies[errorType];
    const currentAttempts = this.recoveryAttempts.get(recoveryKey) || 0;

    webrtcLogger.log('info', 'connection', `Recovery attempt ${currentAttempts + 1}/${config.maxRetries} for ${errorType}`, {
      matchId: context.matchId,
      playerId: context.playerId,
      errorType,
      strategy: config.strategy
    });

    // Check if we've exceeded max retries
    if (currentAttempts >= config.maxRetries) {
      webrtcLogger.logError(errorType, `Recovery failed: max retries (${config.maxRetries}) exceeded`, undefined, {
        matchId: context.matchId,
        playerId: context.playerId,
        additionalInfo: {
          totalAttempts: currentAttempts
        }
      });

      this.cleanupRecovery(recoveryKey);
      
      // Execute fallback if available
      if (config.fallbackAction) {
        await config.fallbackAction();
      }
      
      // Notify user if callback provided
      if (config.notificationCallback) {
        config.notificationCallback(errorType, `Connection recovery failed after ${currentAttempts} attempts`);
      }
      
      return false;
    }

    // Don't retry if not allowed
    if (!context.retryAllowed) {
      webrtcLogger.log('warn', 'connection', `Recovery skipped: retry not allowed for ${errorType}`, {
        matchId: context.matchId,
        playerId: context.playerId
      });
      return false;
    }

    // Update attempt count
    this.recoveryAttempts.set(recoveryKey, currentAttempts + 1);

    try {
      // Execute recovery strategy
      switch (config.strategy) {
        case 'retry':
          return await this.executeRetryStrategy(recoveryKey, config, recoveryAction);
          
        case 'restart':
          return await this.executeRestartStrategy(recoveryKey, config, context, recoveryAction);
          
        case 'fallback':
          return await this.executeFallbackStrategy(config, context);
          
        case 'notify-only':
          return await this.executeNotifyOnlyStrategy(config, errorType, context);
          
        default:
          webrtcLogger.logError('unknown', `Unknown recovery strategy: ${config.strategy}`);
          return false;
      }
    } catch (error) {
      webrtcLogger.logError(errorType, 'Recovery action failed', error as Error, {
        matchId: context.matchId,
        playerId: context.playerId,
        additionalInfo: {
          attempt: currentAttempts + 1
        }
      });
      
      // Schedule next retry if attempts remaining
      if (currentAttempts + 1 < config.maxRetries) {
        await this.scheduleRetry(recoveryKey, config, currentAttempts + 1, () => 
          this.recover(errorType, context, recoveryAction)
        );
      }
      
      return false;
    }
  }

  /**
   * Cancel any ongoing recovery attempts
   */
  cancelRecovery(matchId: string, playerId?: string) {
    const keysToCancel: string[] = [];
    
    for (const key of this.recoveryAttempts.keys()) {
      if (key.includes(matchId) && (!playerId || key.includes(playerId))) {
        keysToCancel.push(key);
      }
    }
    
    keysToCancel.forEach(key => {
      this.cleanupRecovery(key);
      webrtcLogger.log('info', 'connection', `Recovery cancelled for ${key}`);
    });
  }

  /**
   * Get recovery statistics
   */
  getRecoveryStats() {
    const stats = {
      activeRecoveries: this.recoveryAttempts.size,
      activeTimers: this.recoveryTimers.size,
      recoveryAttempts: Array.from(this.recoveryAttempts.entries()).map(([key, attempts]) => ({
        key,
        attempts
      }))
    };
    
    return stats;
  }

  /**
   * Override default recovery strategy for an error type
   */
  setRecoveryStrategy(errorType: WebRTCErrorType, config: Partial<RecoveryConfig>) {
    this.strategies[errorType] = {
      ...this.strategies[errorType],
      ...config
    };
    
    webrtcLogger.log('info', 'connection', `Updated recovery strategy for ${errorType}`, config);
  }

  private async executeRetryStrategy(
    recoveryKey: string,
    config: RecoveryConfig,
    recoveryAction: () => Promise<boolean>
  ): Promise<boolean> {
    const attempts = this.recoveryAttempts.get(recoveryKey) || 0;
    const delay = Math.min(config.retryDelay * Math.pow(config.backoffMultiplier, attempts - 1), config.maxDelay);
    
    // Wait before retry
    if (delay > 0) {
      await new Promise(resolve => setTimeout(resolve, delay));
    }
    
    const success = await recoveryAction();
    
    if (success) {
      webrtcLogger.log('info', 'connection', `Recovery successful after ${attempts} attempts`, {
        recoveryKey,
        totalDelay: delay
      });
      this.cleanupRecovery(recoveryKey);
      return true;
    }
    
    return false;
  }

  private async executeRestartStrategy(
    recoveryKey: string,
    config: RecoveryConfig,
    context: RecoveryContext,
    recoveryAction: () => Promise<boolean>
  ): Promise<boolean> {
    // For restart strategy, we need to completely reset the connection
    webrtcLogger.log('info', 'connection', 'Executing restart recovery strategy', {
      matchId: context.matchId,
      playerId: context.playerId
    });
    
    // Add a longer delay for restart operations
    const restartDelay = config.retryDelay * 2;
    await new Promise(resolve => setTimeout(resolve, restartDelay));
    
    const success = await recoveryAction();
    
    if (success) {
      this.cleanupRecovery(recoveryKey);
      return true;
    }
    
    return false;
  }

  private async executeFallbackStrategy(
    config: RecoveryConfig,
    context: RecoveryContext
  ): Promise<boolean> {
    webrtcLogger.log('info', 'connection', 'Executing fallback recovery strategy', {
      matchId: context.matchId,
      playerId: context.playerId
    });
    
    if (config.fallbackAction) {
      try {
        await config.fallbackAction();
        return true;
      } catch (error) {
        webrtcLogger.logError('unknown', 'Fallback action failed', error as Error, {
          matchId: context.matchId,
          playerId: context.playerId
        });
      }
    }
    
    return false;
  }

  private async executeNotifyOnlyStrategy(
    config: RecoveryConfig,
    errorType: WebRTCErrorType,
    context: RecoveryContext
  ): Promise<boolean> {
    webrtcLogger.log('warn', 'connection', `No recovery available for ${errorType}`, {
      matchId: context.matchId,
      playerId: context.playerId
    });
    
    if (config.notificationCallback) {
      config.notificationCallback(errorType, `${errorType} occurred - manual intervention required`);
    }
    
    return false;
  }

  private async scheduleRetry(
    recoveryKey: string,
    config: RecoveryConfig,
    attemptNumber: number,
    retryFunction: () => Promise<boolean>
  ) {
    const delay = Math.min(
      config.retryDelay * Math.pow(config.backoffMultiplier, attemptNumber - 1),
      config.maxDelay
    );
    
    webrtcLogger.log('debug', 'connection', `Scheduling retry in ${delay}ms`, {
      recoveryKey,
      attemptNumber,
      delay
    });
    
    const timer = setTimeout(async () => {
      this.recoveryTimers.delete(recoveryKey);
      await retryFunction();
    }, delay);
    
    this.recoveryTimers.set(recoveryKey, timer);
  }

  private getRecoveryKey(errorType: WebRTCErrorType, context: RecoveryContext): string {
    return `${errorType}:${context.matchId || 'no-match'}:${context.playerId || 'no-player'}`;
  }

  private cleanupRecovery(recoveryKey: string) {
    this.recoveryAttempts.delete(recoveryKey);
    
    const timer = this.recoveryTimers.get(recoveryKey);
    if (timer) {
      clearTimeout(timer);
      this.recoveryTimers.delete(recoveryKey);
    }
  }
}

// Export singleton instance
export const webrtcRecovery = new WebRTCRecoveryManager();

// Convenience functions
export const recoverFromWebRTCError = (
  errorType: WebRTCErrorType,
  context: RecoveryContext,
  recoveryAction: () => Promise<boolean>
) => webrtcRecovery.recover(errorType, context, recoveryAction);

export const cancelWebRTCRecovery = (matchId: string, playerId?: string) => 
  webrtcRecovery.cancelRecovery(matchId, playerId);

export const setWebRTCRecoveryStrategy = (errorType: WebRTCErrorType, config: Partial<RecoveryConfig>) =>
  webrtcRecovery.setRecoveryStrategy(errorType, config);