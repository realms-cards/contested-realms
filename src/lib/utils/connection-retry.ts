/**
 * Connection Retry Logic with Exponential Backoff
 * Robust retry mechanism for WebRTC and network connections
 */

import { webrtcLogger } from './webrtc-logging';

export interface RetryConfig {
  maxRetries: number;
  initialDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
  jitter: boolean;
  retryCondition?: (error: Error) => boolean;
  onRetry?: (attempt: number, delay: number, error: Error) => void;
  onFailure?: (finalError: Error, totalAttempts: number) => void;
  onSuccess?: (result: unknown, totalAttempts: number) => void;
}

export interface RetryResult<T> {
  success: boolean;
  result?: T;
  error?: Error;
  attempts: number;
  totalDelay: number;
}

export class ConnectionRetry {
  private static readonly DEFAULT_CONFIG: RetryConfig = {
    maxRetries: 3,
    initialDelay: 1000,
    maxDelay: 30000,
    backoffMultiplier: 2,
    jitter: true
  };

  private activeRetries = new Set<string>();
  private abortControllers = new Map<string, AbortController>();

  /**
   * Execute a function with exponential backoff retry logic
   */
  async retry<T>(
    operation: () => Promise<T>,
    config: Partial<RetryConfig> = {},
    operationId?: string
  ): Promise<RetryResult<T>> {
    const finalConfig = { ...ConnectionRetry.DEFAULT_CONFIG, ...config };
    const id = operationId || Math.random().toString(36).substring(7);
    
    // Prevent duplicate retries for the same operation
    if (this.activeRetries.has(id)) {
      throw new Error(`Retry already in progress for operation: ${id}`);
    }

    this.activeRetries.add(id);
    const abortController = new AbortController();
    this.abortControllers.set(id, abortController);

    let lastError: Error | undefined;
    let totalDelay = 0;

    try {
      for (let attempt = 0; attempt <= finalConfig.maxRetries; attempt++) {
        // Check if operation was aborted
        if (abortController.signal.aborted) {
          throw new Error(`Operation aborted: ${id}`);
        }

        try {
          webrtcLogger.log('debug', 'connection', `Retry attempt ${attempt + 1}/${finalConfig.maxRetries + 1}`, {
            operationId: id,
            attempt: attempt + 1,
            totalDelay
          });

          const result = await operation();
          
          // Success!
          webrtcLogger.log('info', 'connection', `Operation succeeded after ${attempt + 1} attempts`, {
            operationId: id,
            totalAttempts: attempt + 1,
            totalDelay
          });

          if (finalConfig.onSuccess) {
            finalConfig.onSuccess(result, attempt + 1);
          }

          return {
            success: true,
            result,
            attempts: attempt + 1,
            totalDelay
          };

        } catch (error) {
          lastError = error as Error;
          
          webrtcLogger.log('warn', 'connection', `Attempt ${attempt + 1} failed`, {
            operationId: id,
            error: lastError.message,
            attempt: attempt + 1
          });

          // Check if we should retry this error
          if (finalConfig.retryCondition && !finalConfig.retryCondition(lastError)) {
            webrtcLogger.log('info', 'connection', `Retry condition not met, aborting retries`, {
              operationId: id,
              error: lastError.message
            });
            break;
          }

          // If this was the last attempt, don't wait
          if (attempt === finalConfig.maxRetries) {
            break;
          }

          // Calculate delay for next attempt
          const delay = this.calculateDelay(attempt, finalConfig);
          totalDelay += delay;

          webrtcLogger.log('debug', 'connection', `Waiting ${delay}ms before retry`, {
            operationId: id,
            delay,
            nextAttempt: attempt + 2
          });

          if (finalConfig.onRetry) {
            finalConfig.onRetry(attempt + 1, delay, lastError);
          }

          // Wait before retrying
          await this.delay(delay, abortController.signal);
        }
      }

      // All retries exhausted
      const finalError = lastError || new Error('Unknown error');
      webrtcLogger.logError('connection-failed', `Operation failed after ${finalConfig.maxRetries + 1} attempts`, finalError, {
        additionalInfo: {
          operationId: id,
          totalAttempts: finalConfig.maxRetries + 1,
          totalDelay
        }
      });

      if (finalConfig.onFailure) {
        finalConfig.onFailure(finalError, finalConfig.maxRetries + 1);
      }

      return {
        success: false,
        error: finalError,
        attempts: finalConfig.maxRetries + 1,
        totalDelay
      };

    } finally {
      this.cleanup(id);
    }
  }

  /**
   * Retry with specific WebRTC connection parameters
   */
  async retryWebRTCConnection<T>(
    operation: () => Promise<T>,
    matchId: string,
    playerId: string,
    operationType: 'peer-connection' | 'ice-connection' | 'signaling' | 'media-stream' = 'peer-connection'
  ): Promise<RetryResult<T>> {
    const operationId = `webrtc-${operationType}-${matchId}-${playerId}`;
    
    const config: RetryConfig = {
      maxRetries: 3,
      initialDelay: 2000,
      maxDelay: 15000,
      backoffMultiplier: 2,
      jitter: true,
      retryCondition: (error: Error) => {
        // Don't retry permission errors or user cancellations
        const message = error.message.toLowerCase();
        return !message.includes('permission') && 
               !message.includes('denied') && 
               !message.includes('cancelled') &&
               !message.includes('abort');
      },
      onRetry: (attempt, delay, error) => {
        webrtcLogger.log('info', 'connection', `WebRTC ${operationType} retry ${attempt}`, {
          matchId,
          playerId,
          error: error.message,
          delay
        });
      },
      onFailure: (error, attempts) => {
        webrtcLogger.logError('peer-connection-failed', `WebRTC ${operationType} failed permanently`, error, {
          matchId,
          playerId,
          additionalInfo: {
            totalAttempts: attempts
          }
        });
      },
      onSuccess: (result, attempts) => {
        webrtcLogger.log('info', 'connection', `WebRTC ${operationType} succeeded`, {
          matchId,
          playerId,
          totalAttempts: attempts
        });
      }
    };

    return this.retry(operation, config, operationId);
  }

  /**
   * Retry with specific signaling parameters
   */
  async retrySignaling<T>(
    operation: () => Promise<T>,
    matchId: string,
    eventType: string
  ): Promise<RetryResult<T>> {
    const operationId = `signaling-${eventType}-${matchId}`;
    
    const config: RetryConfig = {
      maxRetries: 5,
      initialDelay: 1000,
      maxDelay: 8000,
      backoffMultiplier: 1.5,
      jitter: true,
      retryCondition: (error: Error) => {
        // Retry network errors but not protocol errors
        const message = error.message.toLowerCase();
        return message.includes('network') || 
               message.includes('timeout') || 
               message.includes('connection') ||
               message.includes('socket');
      },
      onRetry: (attempt, delay, error) => {
        webrtcLogger.logSignalingEvent(matchId, `${eventType}-retry-${attempt}`, 'send', {
          error: error.message,
          delay
        });
      }
    };

    return this.retry(operation, config, operationId);
  }

  /**
   * Retry media device operations
   */
  async retryMediaDevice<T>(
    operation: () => Promise<T>,
    deviceType: 'audio' | 'video' | 'screen'
  ): Promise<RetryResult<T>> {
    const operationId = `media-${deviceType}-${Date.now()}`;
    
    const config: RetryConfig = {
      maxRetries: 2,
      initialDelay: 1000,
      maxDelay: 5000,
      backoffMultiplier: 2,
      jitter: false, // More predictable for user experience
      retryCondition: (error: Error) => {
        const message = error.message.toLowerCase();
        // Don't retry permission denials or not found errors
        return !message.includes('permission') && 
               !message.includes('denied') && 
               !message.includes('notfound') &&
               !message.includes('notallowed');
      },
      onRetry: (attempt, delay, error) => {
        webrtcLogger.logMediaDeviceChange(deviceType as 'audio' | 'video', 'error', undefined, error);
      }
    };

    return this.retry(operation, config, operationId);
  }

  /**
   * Abort a specific retry operation
   */
  abort(operationId: string): boolean {
    const controller = this.abortControllers.get(operationId);
    if (controller) {
      controller.abort();
      webrtcLogger.log('info', 'connection', `Aborted retry operation: ${operationId}`);
      return true;
    }
    return false;
  }

  /**
   * Abort all active retry operations
   */
  abortAll(): number {
    let aborted = 0;
    for (const [id, controller] of this.abortControllers.entries()) {
      controller.abort();
      aborted++;
    }
    
    if (aborted > 0) {
      webrtcLogger.log('info', 'connection', `Aborted ${aborted} retry operations`);
    }
    
    return aborted;
  }

  /**
   * Get status of active retries
   */
  getActiveRetries(): string[] {
    return Array.from(this.activeRetries);
  }

  private calculateDelay(attempt: number, config: RetryConfig): number {
    let delay = config.initialDelay * Math.pow(config.backoffMultiplier, attempt);
    
    // Apply maximum delay cap
    delay = Math.min(delay, config.maxDelay);
    
    // Add jitter to prevent thundering herd
    if (config.jitter) {
      const jitterRange = delay * 0.1; // 10% jitter
      const jitter = (Math.random() - 0.5) * 2 * jitterRange;
      delay = Math.max(0, delay + jitter);
    }
    
    return Math.round(delay);
  }

  private delay(ms: number, signal?: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      if (signal?.aborted) {
        reject(new Error('Operation aborted'));
        return;
      }

      const timeout = setTimeout(() => {
        resolve();
      }, ms);

      signal?.addEventListener('abort', () => {
        clearTimeout(timeout);
        reject(new Error('Operation aborted'));
      });
    });
  }

  private cleanup(operationId: string) {
    this.activeRetries.delete(operationId);
    this.abortControllers.delete(operationId);
  }
}

// Export singleton instance
export const connectionRetry = new ConnectionRetry();

// Convenience functions
export const retryOperation = <T>(
  operation: () => Promise<T>,
  config?: Partial<RetryConfig>,
  operationId?: string
) => connectionRetry.retry(operation, config, operationId);

export const retryWebRTCConnection = <T>(
  operation: () => Promise<T>,
  matchId: string,
  playerId: string,
  operationType?: 'peer-connection' | 'ice-connection' | 'signaling' | 'media-stream'
) => connectionRetry.retryWebRTCConnection(operation, matchId, playerId, operationType);

export const retrySignaling = <T>(
  operation: () => Promise<T>,
  matchId: string,
  eventType: string
) => connectionRetry.retrySignaling(operation, matchId, eventType);

export const retryMediaDevice = <T>(
  operation: () => Promise<T>,
  deviceType: 'audio' | 'video' | 'screen'
) => connectionRetry.retryMediaDevice(operation, deviceType);