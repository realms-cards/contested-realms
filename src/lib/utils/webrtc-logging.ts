/**
 * WebRTC Error Logging and Reporting
 * Centralized logging system for WebRTC connection issues and debugging
 */

export type WebRTCErrorType = 
  | 'connection-failed'
  | 'peer-connection-failed' 
  | 'media-device-error'
  | 'permission-denied'
  | 'signaling-error'
  | 'ice-connection-failed'
  | 'data-channel-error'
  | 'stream-error'
  | 'unknown';

export interface WebRTCError {
  type: WebRTCErrorType;
  message: string;
  timestamp: number;
  context?: {
    matchId?: string;
    playerId?: string;
    connectionState?: RTCPeerConnectionState;
    iceConnectionState?: RTCIceConnectionState;
    iceGatheringState?: RTCIceGatheringState;
    signalingState?: RTCSignalingState;
    userAgent?: string;
    additionalInfo?: Record<string, unknown>;
  };
  error?: Error;
  stack?: string;
}

export interface WebRTCLogEntry {
  level: 'debug' | 'info' | 'warn' | 'error';
  category: 'connection' | 'media' | 'signaling' | 'ice' | 'performance' | 'user-action';
  message: string;
  timestamp: number;
  context?: Record<string, unknown>;
}

class WebRTCLogger {
  private logs: WebRTCLogEntry[] = [];
  private errors: WebRTCError[] = [];
  private maxLogs = 1000; // Keep last 1000 log entries
  private maxErrors = 100; // Keep last 100 errors
  private debugEnabled = process.env.NODE_ENV === 'development';

  /**
   * Log a general WebRTC event
   */
  log(level: WebRTCLogEntry['level'], category: WebRTCLogEntry['category'], message: string, context?: Record<string, unknown>) {
    const entry: WebRTCLogEntry = {
      level,
      category,
      message,
      timestamp: Date.now(),
      context
    };

    this.logs.push(entry);
    
    // Trim logs if exceeding max
    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(-this.maxLogs);
    }

    // Console logging in development
    if (this.debugEnabled) {
      const contextStr = context ? ` ${JSON.stringify(context)}` : '';
      const logMessage = `[WebRTC:${category}] ${message}${contextStr}`;
      
      switch (level) {
        case 'debug':
          console.debug(logMessage);
          break;
        case 'info':
          console.info(logMessage);
          break;
        case 'warn':
          console.warn(logMessage);
          break;
        case 'error':
          console.error(logMessage);
          break;
      }
    }

    return entry;
  }

  /**
   * Log a WebRTC error with structured information
   */
  logError(type: WebRTCErrorType, message: string, error?: Error, context?: WebRTCError['context']) {
    const webrtcError: WebRTCError = {
      type,
      message,
      timestamp: Date.now(),
      context: {
        ...context,
        userAgent: navigator.userAgent
      },
      error,
      stack: error?.stack || new Error().stack
    };

    this.errors.push(webrtcError);
    
    // Trim errors if exceeding max
    if (this.errors.length > this.maxErrors) {
      this.errors = this.errors.slice(-this.maxErrors);
    }

    // Also log as regular log entry
    this.log('error', this.getCategoryForErrorType(type), message, {
      errorType: type,
      error: error?.message,
      ...context
    });

    return webrtcError;
  }

  /**
   * Log connection state changes
   */
  logConnectionStateChange(
    matchId: string,
    playerId: string,
    connectionState: RTCPeerConnectionState,
    iceConnectionState?: RTCIceConnectionState,
    iceGatheringState?: RTCIceGatheringState,
    signalingState?: RTCSignalingState
  ) {
    return this.log('info', 'connection', 'Connection state changed', {
      matchId,
      playerId,
      connectionState,
      iceConnectionState,
      iceGatheringState,
      signalingState
    });
  }

  /**
   * Log media device changes
   */
  logMediaDeviceChange(type: 'audio' | 'video', action: 'granted' | 'denied' | 'changed' | 'error', deviceId?: string, error?: Error) {
    const level = action === 'error' || action === 'denied' ? 'error' : 'info';
    return this.log(level, 'media', `Media device ${action}: ${type}`, {
      type,
      action,
      deviceId,
      error: error?.message
    });
  }

  /**
   * Log signaling events
   */
  logSignalingEvent(matchId: string, eventType: string, direction: 'send' | 'receive', data?: unknown) {
    return this.log('debug', 'signaling', `Signaling ${direction}: ${eventType}`, {
      matchId,
      eventType,
      direction,
      dataSize: data ? JSON.stringify(data).length : 0
    });
  }

  /**
   * Log performance metrics
   */
  logPerformanceMetric(metric: string, value: number, context?: Record<string, unknown>) {
    return this.log('info', 'performance', `Performance: ${metric} = ${value}`, {
      metric,
      value,
      ...context
    });
  }

  /**
   * Log user actions
   */
  logUserAction(action: string, success: boolean, context?: Record<string, unknown>) {
    const level = success ? 'info' : 'warn';
    return this.log(level, 'user-action', `User action: ${action} ${success ? 'succeeded' : 'failed'}`, {
      action,
      success,
      ...context
    });
  }

  /**
   * Get recent logs
   */
  getRecentLogs(count = 50): WebRTCLogEntry[] {
    return this.logs.slice(-count);
  }

  /**
   * Get recent errors
   */
  getRecentErrors(count = 20): WebRTCError[] {
    return this.errors.slice(-count);
  }

  /**
   * Get logs by category
   */
  getLogsByCategory(category: WebRTCLogEntry['category'], count = 50): WebRTCLogEntry[] {
    return this.logs
      .filter(log => log.category === category)
      .slice(-count);
  }

  /**
   * Get errors by type
   */
  getErrorsByType(type: WebRTCErrorType): WebRTCError[] {
    return this.errors.filter(error => error.type === type);
  }

  /**
   * Generate debug report
   */
  generateDebugReport(): {
    summary: {
      totalLogs: number;
      totalErrors: number;
      errorsByType: Record<WebRTCErrorType, number>;
      recentActivity: WebRTCLogEntry[];
    };
    logs: WebRTCLogEntry[];
    errors: WebRTCError[];
  } {
    const errorsByType: Record<WebRTCErrorType, number> = {
      'connection-failed': 0,
      'peer-connection-failed': 0,
      'media-device-error': 0,
      'permission-denied': 0,
      'signaling-error': 0,
      'ice-connection-failed': 0,
      'data-channel-error': 0,
      'stream-error': 0,
      'unknown': 0
    };

    this.errors.forEach(error => {
      errorsByType[error.type]++;
    });

    return {
      summary: {
        totalLogs: this.logs.length,
        totalErrors: this.errors.length,
        errorsByType,
        recentActivity: this.getRecentLogs(10)
      },
      logs: this.logs,
      errors: this.errors
    };
  }

  /**
   * Clear logs and errors
   */
  clear() {
    this.logs = [];
    this.errors = [];
  }

  /**
   * Enable or disable debug logging
   */
  setDebugEnabled(enabled: boolean) {
    this.debugEnabled = enabled;
  }

  private getCategoryForErrorType(type: WebRTCErrorType): WebRTCLogEntry['category'] {
    switch (type) {
      case 'connection-failed':
      case 'peer-connection-failed':
      case 'ice-connection-failed':
        return 'connection';
      case 'media-device-error':
      case 'permission-denied':
      case 'stream-error':
        return 'media';
      case 'signaling-error':
        return 'signaling';
      case 'data-channel-error':
        return 'connection';
      default:
        return 'connection';
    }
  }
}

// Export singleton instance
export const webrtcLogger = new WebRTCLogger();

// Convenience functions
export const logWebRTCError = (type: WebRTCErrorType, message: string, error?: Error, context?: WebRTCError['context']) => 
  webrtcLogger.logError(type, message, error, context);

export const logWebRTCEvent = (level: WebRTCLogEntry['level'], category: WebRTCLogEntry['category'], message: string, context?: Record<string, unknown>) => 
  webrtcLogger.log(level, category, message, context);

export const getWebRTCDebugReport = () => webrtcLogger.generateDebugReport();