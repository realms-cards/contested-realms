/**
 * WebRTC Error Recovery and Retry Mechanisms
 * Handles connection failures, automatic retries, and graceful degradation
 */

export type RetryReason = 
  | 'connection_failed' 
  | 'peer_disconnected' 
  | 'ice_failed'
  | 'media_failed'
  | 'permission_denied'
  | 'device_unavailable'
  | 'network_error';

export interface RetryAttempt {
  attempt: number;
  timestamp: number;
  reason: RetryReason;
  error?: string;
  success: boolean;
}

export interface RetryStrategy {
  maxAttempts: number;
  baseDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
  jitter: boolean;
}

export interface WebRTCErrorRecoveryConfig {
  retryStrategy: RetryStrategy;
  gracefulDegradation: {
    enableAudioFallback: boolean;
    enableLowResolutionFallback: boolean;
    disableVideoOnFailure: boolean;
  };
  timeouts: {
    connectionTimeout: number;
    iceGatheringTimeout: number;
    mediaStreamTimeout: number;
  };
}

export const DEFAULT_RECOVERY_CONFIG: WebRTCErrorRecoveryConfig = {
  retryStrategy: {
    maxAttempts: 5,
    baseDelay: 1000,
    maxDelay: 30000,
    backoffMultiplier: 2,
    jitter: true
  },
  gracefulDegradation: {
    enableAudioFallback: true,
    enableLowResolutionFallback: true,
    disableVideoOnFailure: true
  },
  timeouts: {
    connectionTimeout: 10000,
    iceGatheringTimeout: 10000,
    mediaStreamTimeout: 5000
  }
};

export class WebRTCErrorRecoveryManager {
  private config: WebRTCErrorRecoveryConfig;
  private retryHistory: Map<string, RetryAttempt[]> = new Map();
  private activeRetries: Map<string, NodeJS.Timeout> = new Map();
  private onRetryAttempt?: (sessionId: string, attempt: RetryAttempt) => void;
  private onRecoverySuccess?: (sessionId: string, attempts: RetryAttempt[]) => void;
  private onRecoveryFailed?: (sessionId: string, attempts: RetryAttempt[]) => void;

  constructor(
    config: Partial<WebRTCErrorRecoveryConfig> = {},
    callbacks: {
      onRetryAttempt?: (sessionId: string, attempt: RetryAttempt) => void;
      onRecoverySuccess?: (sessionId: string, attempts: RetryAttempt[]) => void;
      onRecoveryFailed?: (sessionId: string, attempts: RetryAttempt[]) => void;
    } = {}
  ) {
    this.config = { ...DEFAULT_RECOVERY_CONFIG, ...config };
    this.onRetryAttempt = callbacks.onRetryAttempt;
    this.onRecoverySuccess = callbacks.onRecoverySuccess;
    this.onRecoveryFailed = callbacks.onRecoveryFailed;
  }

  /**
   * Attempt to recover from a WebRTC error
   */
  async attemptRecovery(
    sessionId: string,
    reason: RetryReason,
    errorMessage: string,
    recoveryFunction: () => Promise<boolean>
  ): Promise<boolean> {
    const attempts = this.retryHistory.get(sessionId) || [];
    
    // Check if we've exceeded max attempts
    if (attempts.length >= this.config.retryStrategy.maxAttempts) {
      console.warn(`Max retry attempts exceeded for session ${sessionId}`);
      this.onRecoveryFailed?.(sessionId, attempts);
      return false;
    }

    const attemptNumber = attempts.length + 1;
    const delay = this.calculateRetryDelay(attemptNumber);
    
    // Cancel any existing retry for this session
    this.cancelRetry(sessionId);

    return new Promise((resolve) => {
      const timeoutId = setTimeout(async () => {
        const attempt: RetryAttempt = {
          attempt: attemptNumber,
          timestamp: Date.now(),
          reason,
          error: errorMessage,
          success: false
        };

        this.activeRetries.delete(sessionId);
        
        try {
          // Attempt recovery
          const success = await recoveryFunction();
          attempt.success = success;
          
          // Update retry history
          attempts.push(attempt);
          this.retryHistory.set(sessionId, attempts);
          
          this.onRetryAttempt?.(sessionId, attempt);
          
          if (success) {
            console.log(`Recovery successful for session ${sessionId} after ${attemptNumber} attempts`);
            this.onRecoverySuccess?.(sessionId, attempts);
            resolve(true);
          } else {
            // Retry failed, try again if attempts remaining
            if (attemptNumber < this.config.retryStrategy.maxAttempts) {
              const nextSuccess = await this.attemptRecovery(sessionId, reason, errorMessage, recoveryFunction);
              resolve(nextSuccess);
            } else {
              console.error(`All recovery attempts failed for session ${sessionId}`);
              this.onRecoveryFailed?.(sessionId, attempts);
              resolve(false);
            }
          }
          
        } catch (error) {
          attempt.success = false;
          attempt.error = error instanceof Error ? error.message : 'Unknown error during recovery';
          
          attempts.push(attempt);
          this.retryHistory.set(sessionId, attempts);
          
          this.onRetryAttempt?.(sessionId, attempt);
          
          console.error(`Recovery attempt ${attemptNumber} failed for session ${sessionId}:`, error);
          
          // Continue retrying if attempts remaining
          if (attemptNumber < this.config.retryStrategy.maxAttempts) {
            const nextSuccess = await this.attemptRecovery(sessionId, reason, errorMessage, recoveryFunction);
            resolve(nextSuccess);
          } else {
            this.onRecoveryFailed?.(sessionId, attempts);
            resolve(false);
          }
        }
      }, delay);
      
      this.activeRetries.set(sessionId, timeoutId);
    });
  }

  /**
   * Cancel retry attempts for a session
   */
  cancelRetry(sessionId: string): void {
    const timeoutId = this.activeRetries.get(sessionId);
    if (timeoutId) {
      clearTimeout(timeoutId);
      this.activeRetries.delete(sessionId);
    }
  }

  /**
   * Clear retry history for a session
   */
  clearRetryHistory(sessionId: string): void {
    this.cancelRetry(sessionId);
    this.retryHistory.delete(sessionId);
  }

  /**
   * Get retry statistics for a session
   */
  getRetryStats(sessionId: string): {
    totalAttempts: number;
    successfulAttempts: number;
    failedAttempts: number;
    lastAttempt?: RetryAttempt;
    timeToRecovery?: number;
  } {
    const attempts = this.retryHistory.get(sessionId) || [];
    
    const successfulAttempts = attempts.filter(a => a.success).length;
    const failedAttempts = attempts.filter(a => !a.success).length;
    const lastAttempt = attempts[attempts.length - 1];
    
    let timeToRecovery: number | undefined;
    if (attempts.length > 0) {
      const firstAttempt = attempts[0];
      const lastSuccessful = attempts.find(a => a.success);
      if (lastSuccessful) {
        timeToRecovery = lastSuccessful.timestamp - firstAttempt.timestamp;
      }
    }
    
    return {
      totalAttempts: attempts.length,
      successfulAttempts,
      failedAttempts,
      lastAttempt,
      timeToRecovery
    };
  }

  /**
   * Check if session is currently retrying
   */
  isRetrying(sessionId: string): boolean {
    return this.activeRetries.has(sessionId);
  }

  /**
   * Update retry configuration
   */
  updateConfig(config: Partial<WebRTCErrorRecoveryConfig>): void {
    this.config = { ...this.config, ...config };
  }

  private calculateRetryDelay(attemptNumber: number): number {
    const { baseDelay, maxDelay, backoffMultiplier, jitter } = this.config.retryStrategy;
    
    // Exponential backoff
    let delay = baseDelay * Math.pow(backoffMultiplier, attemptNumber - 1);
    
    // Cap at max delay
    delay = Math.min(delay, maxDelay);
    
    // Add jitter to prevent thundering herd
    if (jitter) {
      delay = delay * (0.5 + Math.random() * 0.5);
    }
    
    return Math.floor(delay);
  }
}

/**
 * Specific error recovery strategies
 */

/**
 * Recover from connection failure with graceful degradation
 */
export async function recoverFromConnectionFailure(
  peerConnection: RTCPeerConnection,
  localStream: MediaStream | null,
  config: WebRTCErrorRecoveryConfig
): Promise<{ success: boolean; degraded: boolean; message: string }> {
  try {
    // First attempt: Restart ICE
    if (peerConnection.connectionState === 'failed') {
      console.log('Attempting ICE restart...');
      peerConnection.restartIce();
      
      // Wait for connection to recover
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('ICE restart timeout')), config.timeouts.connectionTimeout);
        
        const checkConnection = () => {
          if (peerConnection.connectionState === 'connected') {
            clearTimeout(timeout);
            resolve(undefined);
          } else if (peerConnection.connectionState === 'failed') {
            clearTimeout(timeout);
            reject(new Error('ICE restart failed'));
          }
        };
        
        peerConnection.addEventListener('connectionstatechange', checkConnection);
      });
      
      return { success: true, degraded: false, message: 'Connection recovered via ICE restart' };
    }
    
    // If ICE restart doesn't work, try graceful degradation
    if (config.gracefulDegradation.disableVideoOnFailure && localStream) {
      const videoTracks = localStream.getVideoTracks();
      if (videoTracks.length > 0) {
        console.log('Disabling video for connection recovery...');
        videoTracks.forEach(track => track.enabled = false);
        
        return { success: true, degraded: true, message: 'Connection recovered with video disabled' };
      }
    }
    
    return { success: false, degraded: false, message: 'Connection recovery failed' };
    
  } catch (error) {
    console.error('Connection recovery error:', error);
    return { 
      success: false, 
      degraded: false, 
      message: error instanceof Error ? error.message : 'Unknown recovery error'
    };
  }
}

/**
 * Recover from media access failure
 */
export async function recoverFromMediaFailure(
  constraints: MediaStreamConstraints,
  config: WebRTCErrorRecoveryConfig
): Promise<{ stream: MediaStream | null; degraded: boolean; message: string }> {
  try {
    // First attempt: Retry with original constraints
    try {
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      return { stream, degraded: false, message: 'Media recovered with original constraints' };
    } catch {
      // Continue to degraded attempts
    }
    
    // Second attempt: Audio only if video failed
    if (config.gracefulDegradation.enableAudioFallback && constraints.video) {
      try {
        console.log('Attempting audio-only fallback...');
        const audioOnlyStream = await navigator.mediaDevices.getUserMedia({
          audio: constraints.audio,
          video: false
        });
        return { stream: audioOnlyStream, degraded: true, message: 'Media recovered with audio-only fallback' };
      } catch {
        // Continue to next attempt
      }
    }
    
    // Third attempt: Low resolution video
    if (config.gracefulDegradation.enableLowResolutionFallback && constraints.video) {
      try {
        console.log('Attempting low resolution fallback...');
        const lowResConstraints = {
          ...constraints,
          video: {
            width: { ideal: 320 },
            height: { ideal: 240 },
            frameRate: { ideal: 15 }
          }
        };
        
        const lowResStream = await navigator.mediaDevices.getUserMedia(lowResConstraints);
        return { stream: lowResStream, degraded: true, message: 'Media recovered with low resolution' };
      } catch {
        // Continue to final attempt
      }
    }
    
    // Final attempt: Basic constraints
    try {
      console.log('Attempting basic media constraints...');
      const basicStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: constraints.video ? true : false
      });
      return { stream: basicStream, degraded: true, message: 'Media recovered with basic constraints' };
    } catch (error) {
      console.error('All media recovery attempts failed:', error);
      return { 
        stream: null, 
        degraded: false, 
        message: error instanceof Error ? error.message : 'Media recovery failed' 
      };
    }
    
  } catch (error) {
    console.error('Media recovery error:', error);
    return { 
      stream: null, 
      degraded: false, 
      message: error instanceof Error ? error.message : 'Unknown media recovery error' 
    };
  }
}

/**
 * Create a timeout promise that rejects after specified time
 */
export function withTimeout<T>(
  promise: Promise<T>, 
  timeoutMs: number, 
  errorMessage = 'Operation timed out'
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(errorMessage));
    }, timeoutMs);
    
    promise
      .then(resolve)
      .catch(reject)
      .finally(() => clearTimeout(timeout));
  });
}

/**
 * Determine recovery strategy based on error type
 */
export function getRecoveryStrategy(error: Error): {
  reason: RetryReason;
  recoverable: boolean;
  requiresUserAction: boolean;
} {
  const message = error.message.toLowerCase();
  const name = error.name.toLowerCase();
  
  if (name === 'notallowederror' || message.includes('permission')) {
    return {
      reason: 'permission_denied',
      recoverable: false,
      requiresUserAction: true
    };
  }
  
  if (name === 'notfounderror' || message.includes('no device') || message.includes('not found')) {
    return {
      reason: 'device_unavailable',
      recoverable: false,
      requiresUserAction: true
    };
  }
  
  if (name === 'notreadableerror' || message.includes('in use') || message.includes('busy')) {
    return {
      reason: 'device_unavailable',
      recoverable: true,
      requiresUserAction: false
    };
  }
  
  if (name === 'overconstrainederror' || message.includes('constraint')) {
    return {
      reason: 'media_failed',
      recoverable: true,
      requiresUserAction: false
    };
  }
  
  if (message.includes('network') || message.includes('connection')) {
    return {
      reason: 'network_error',
      recoverable: true,
      requiresUserAction: false
    };
  }
  
  if (message.includes('ice') || message.includes('peer')) {
    return {
      reason: 'connection_failed',
      recoverable: true,
      requiresUserAction: false
    };
  }
  
  return {
    reason: 'connection_failed',
    recoverable: true,
    requiresUserAction: false
  };
}