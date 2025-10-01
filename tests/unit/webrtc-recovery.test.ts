/**
 * WebRTC Recovery and Retry Tests
 *
 * Tests for error recovery strategies and exponential backoff retry logic
 * that ensure reliable WebRTC connections despite network instability.
 *
 * Critical requirements tested:
 * - Exponential backoff calculation
 * - Retry strategy selection based on error type
 * - Recovery attempt limits and circuit breaking
 * - Jitter application to prevent thundering herd
 * - Abort functionality for cleanup
 * - Error condition evaluation for retry decisions
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  ConnectionRetry,
  webrtcRecovery,
  type RecoveryContext,
  type RetryConfig,
} from '@/lib/utils/connection-retry';
import { webrtcRecovery as recovery } from '@/lib/utils/webrtc-recovery';

describe('ConnectionRetry', () => {
  let retryManager: ConnectionRetry;

  beforeEach(() => {
    retryManager = new ConnectionRetry();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  describe('Basic Retry Logic', () => {
    it('should succeed on first attempt', async () => {
      const operation = vi.fn().mockResolvedValue('success');

      const promise = retryManager.retry(operation);
      await vi.runAllTimersAsync();
      const result = await promise;

      expect(result.success).toBe(true);
      expect(result.result).toBe('success');
      expect(result.attempts).toBe(1);
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should retry on failure', async () => {
      const operation = vi
        .fn()
        .mockRejectedValueOnce(new Error('Fail 1'))
        .mockRejectedValueOnce(new Error('Fail 2'))
        .mockResolvedValueOnce('success');

      const promise = retryManager.retry(operation, { maxRetries: 3 });
      await vi.runAllTimersAsync();
      const result = await promise;

      expect(result.success).toBe(true);
      expect(result.attempts).toBe(3);
      expect(operation).toHaveBeenCalledTimes(3);
    });

    it('should fail after max retries', async () => {
      const operation = vi.fn().mockRejectedValue(new Error('Always fails'));

      const promise = retryManager.retry(operation, { maxRetries: 2 });
      await vi.runAllTimersAsync();
      const result = await promise;

      expect(result.success).toBe(false);
      expect(result.error?.message).toBe('Always fails');
      expect(result.attempts).toBe(3); // Initial + 2 retries
    });

    it('should call onSuccess callback', async () => {
      const operation = vi.fn().mockResolvedValue('success');
      const onSuccess = vi.fn();

      const promise = retryManager.retry(operation, { onSuccess });
      await vi.runAllTimersAsync();
      await promise;

      expect(onSuccess).toHaveBeenCalledWith('success', 1);
    });

    it('should call onFailure callback', async () => {
      const operation = vi.fn().mockRejectedValue(new Error('Fail'));
      const onFailure = vi.fn();

      const promise = retryManager.retry(operation, { maxRetries: 1, onFailure });
      await vi.runAllTimersAsync();
      await promise;

      expect(onFailure).toHaveBeenCalledWith(expect.any(Error), 2);
    });

    it('should call onRetry callback', async () => {
      const operation = vi
        .fn()
        .mockRejectedValueOnce(new Error('Fail'))
        .mockResolvedValueOnce('success');
      const onRetry = vi.fn();

      const promise = retryManager.retry(operation, { onRetry });
      await vi.runAllTimersAsync();
      await promise;

      expect(onRetry).toHaveBeenCalledWith(
        1,
        expect.any(Number),
        expect.any(Error)
      );
    });
  });

  describe('Exponential Backoff', () => {
    it('should use exponential backoff delays', async () => {
      const operation = vi.fn().mockRejectedValue(new Error('Fail'));
      const delays: number[] = [];
      const onRetry = vi.fn((attempt, delay) => delays.push(delay));

      const promise = retryManager.retry(operation, {
        maxRetries: 3,
        initialDelay: 1000,
        backoffMultiplier: 2,
        jitter: false,
        onRetry,
      });
      await vi.runAllTimersAsync();
      await promise;

      // Delays should be: 1000, 2000, 4000
      expect(delays[0]).toBe(1000);
      expect(delays[1]).toBe(2000);
      expect(delays[2]).toBe(4000);
    });

    it('should cap delays at maxDelay', async () => {
      const operation = vi.fn().mockRejectedValue(new Error('Fail'));
      const delays: number[] = [];
      const onRetry = vi.fn((attempt, delay) => delays.push(delay));

      const promise = retryManager.retry(operation, {
        maxRetries: 5,
        initialDelay: 1000,
        backoffMultiplier: 2,
        maxDelay: 5000,
        jitter: false,
        onRetry,
      });
      await vi.runAllTimersAsync();
      await promise;

      // After reaching 5000, should stay at 5000
      expect(delays[delays.length - 1]).toBe(5000);
      expect(delays.every(d => d <= 5000)).toBe(true);
    });

    it('should apply jitter when enabled', async () => {
      const operation = vi.fn().mockRejectedValue(new Error('Fail'));
      const delays: number[] = [];
      const onRetry = vi.fn((attempt, delay) => delays.push(delay));

      const promise = retryManager.retry(operation, {
        maxRetries: 3,
        initialDelay: 1000,
        backoffMultiplier: 2,
        jitter: true,
        onRetry,
      });
      await vi.runAllTimersAsync();
      await promise;

      // With jitter, delays should vary slightly from exact values
      // Check they're within acceptable range (90-110% of expected)
      expect(delays[0]).toBeGreaterThanOrEqual(900);
      expect(delays[0]).toBeLessThanOrEqual(1100);
    });
  });

  describe('Retry Conditions', () => {
    it('should stop retrying when condition returns false', async () => {
      const operation = vi.fn().mockRejectedValue(new Error('Permission denied'));
      const retryCondition = (error: Error) =>
        !error.message.toLowerCase().includes('permission');

      const promise = retryManager.retry(operation, {
        maxRetries: 5,
        retryCondition,
      });
      await vi.runAllTimersAsync();
      const result = await promise;

      expect(result.success).toBe(false);
      expect(operation).toHaveBeenCalledTimes(1); // Only initial attempt
    });

    it('should continue retrying when condition returns true', async () => {
      const operation = vi
        .fn()
        .mockRejectedValueOnce(new Error('Network timeout'))
        .mockRejectedValueOnce(new Error('Network timeout'))
        .mockResolvedValueOnce('success');

      const retryCondition = (error: Error) =>
        error.message.toLowerCase().includes('network');

      const promise = retryManager.retry(operation, {
        maxRetries: 3,
        retryCondition,
      });
      await vi.runAllTimersAsync();
      const result = await promise;

      expect(result.success).toBe(true);
      expect(operation).toHaveBeenCalledTimes(3);
    });
  });

  describe('Abort Functionality', () => {
    it('should abort ongoing retry', async () => {
      const operation = vi.fn().mockRejectedValue(new Error('Fail'));
      const operationId = 'test-operation';

      const promise = retryManager.retry(operation, { maxRetries: 5 }, operationId);

      // Abort after first failure
      await vi.advanceTimersByTimeAsync(100);
      const aborted = retryManager.abort(operationId);

      expect(aborted).toBe(true);
      await expect(promise).rejects.toThrow('Operation aborted');
    });

    it('should abort all active retries', async () => {
      const operation1 = vi.fn().mockRejectedValue(new Error('Fail'));
      const operation2 = vi.fn().mockRejectedValue(new Error('Fail'));

      const promise1 = retryManager.retry(operation1, { maxRetries: 5 }, 'op-1');
      const promise2 = retryManager.retry(operation2, { maxRetries: 5 }, 'op-2');

      await vi.advanceTimersByTimeAsync(100);
      const abortedCount = retryManager.abortAll();

      expect(abortedCount).toBe(2);

      // Catch the rejected promises to prevent unhandled rejections
      await expect(promise1).rejects.toThrow('Operation aborted');
      await expect(promise2).rejects.toThrow('Operation aborted');
    });

    it('should prevent duplicate retry operations', async () => {
      const operation = vi.fn().mockResolvedValue('success');
      const operationId = 'duplicate-test';

      retryManager.retry(operation, {}, operationId);

      await expect(
        retryManager.retry(operation, {}, operationId)
      ).rejects.toThrow('Retry already in progress');
    });
  });

  describe('WebRTC-Specific Retry', () => {
    it('should retry WebRTC connection with appropriate config', async () => {
      const operation = vi
        .fn()
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce('connected');

      const promise = retryManager.retryWebRTCConnection(
        operation,
        'match-1',
        'player-1',
        'peer-connection'
      );
      await vi.runAllTimersAsync();
      const result = await promise;

      expect(result.success).toBe(true);
      expect(operation).toHaveBeenCalledTimes(2);
    });

    it('should not retry permission errors', async () => {
      const operation = vi.fn().mockRejectedValue(new Error('Permission denied'));

      const promise = retryManager.retryWebRTCConnection(
        operation,
        'match-1',
        'player-1'
      );
      await vi.runAllTimersAsync();
      const result = await promise;

      expect(result.success).toBe(false);
      expect(operation).toHaveBeenCalledTimes(1); // No retry
    });

    it('should retry signaling errors with appropriate config', async () => {
      const operation = vi
        .fn()
        .mockRejectedValueOnce(new Error('Socket timeout'))
        .mockResolvedValueOnce('success');

      const promise = retryManager.retrySignaling(
        operation,
        'match-1',
        'offer'
      );
      await vi.runAllTimersAsync();
      const result = await promise;

      expect(result.success).toBe(true);
    });

    it('should retry media device errors', async () => {
      const operation = vi
        .fn()
        .mockRejectedValueOnce(new Error('Device busy'))
        .mockResolvedValueOnce('stream');

      const promise = retryManager.retryMediaDevice(operation, 'audio');
      await vi.runAllTimersAsync();
      const result = await promise;

      expect(result.success).toBe(true);
    });

    it('should not retry media device not found errors', async () => {
      const operation = vi.fn().mockRejectedValue(new Error('Device NotFound'));

      const promise = retryManager.retryMediaDevice(operation, 'audio');
      await vi.runAllTimersAsync();
      const result = await promise;

      expect(result.success).toBe(false);
      expect(operation).toHaveBeenCalledTimes(1);
    });
  });

  describe('Active Retry Tracking', () => {
    it('should track active retries', async () => {
      const operation = vi.fn().mockRejectedValue(new Error('Fail'));

      const promise1 = retryManager.retry(operation, { maxRetries: 5 }, 'op-1');
      const promise2 = retryManager.retry(operation, { maxRetries: 5 }, 'op-2');

      await vi.advanceTimersByTimeAsync(100);
      const active = retryManager.getActiveRetries();

      expect(active).toHaveLength(2);
      expect(active).toContain('op-1');
      expect(active).toContain('op-2');

      // Cleanup: abort and catch rejections
      retryManager.abortAll();
      await expect(promise1).rejects.toThrow();
      await expect(promise2).rejects.toThrow();
    });

    it('should cleanup after completion', async () => {
      const operation = vi.fn().mockResolvedValue('success');

      const promise = retryManager.retry(operation, {}, 'op-1');
      await vi.runAllTimersAsync();
      await promise;

      const active = retryManager.getActiveRetries();
      expect(active).toHaveLength(0);
    });
  });
});

describe('WebRTCRecoveryManager', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Recovery Strategies', () => {
    it.skip('should execute retry strategy for connection failures', async () => {
      // TODO: Fix interaction with recovery manager singleton
      const recoveryAction = vi
        .fn()
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(true);

      const context: RecoveryContext = {
        matchId: 'match-1',
        playerId: 'player-1',
        attemptCount: 0,
        retryAllowed: true,
      };

      const promise = recovery.recover('connection-failed', context, recoveryAction);
      await vi.runAllTimersAsync();
      const result = await promise;

      expect(result).toBe(true);
      expect(recoveryAction).toHaveBeenCalledTimes(2);
    });

    it.skip('should stop after max retries', async () => {
      // TODO: Fix interaction with recovery manager singleton
      const recoveryAction = vi.fn().mockResolvedValue(false);

      const context: RecoveryContext = {
        matchId: 'match-1',
        playerId: 'player-1',
        attemptCount: 0,
        retryAllowed: true,
      };

      const promise = recovery.recover('connection-failed', context, recoveryAction);
      await vi.runAllTimersAsync();
      const result = await promise;

      expect(result).toBe(false);
      // Max retries for connection-failed is 3
      expect(recoveryAction).toHaveBeenCalledTimes(3);
    });

    it('should not retry when retryAllowed is false', async () => {
      const recoveryAction = vi.fn().mockResolvedValue(false);

      const context: RecoveryContext = {
        matchId: 'match-1',
        playerId: 'player-1',
        attemptCount: 0,
        retryAllowed: false,
      };

      const result = await recovery.recover('connection-failed', context, recoveryAction);

      expect(result).toBe(false);
      expect(recoveryAction).not.toHaveBeenCalled();
    });

    it('should use notify-only strategy for permission errors', async () => {
      const recoveryAction = vi.fn().mockResolvedValue(false);
      const notificationCallback = vi.fn();

      recovery.setRecoveryStrategy('permission-denied', {
        notificationCallback,
      });

      const context: RecoveryContext = {
        matchId: 'match-1',
        playerId: 'player-1',
        attemptCount: 0,
        retryAllowed: true,
      };

      const result = await recovery.recover('permission-denied', context, recoveryAction);

      expect(result).toBe(false);
      expect(recoveryAction).not.toHaveBeenCalled();
      expect(notificationCallback).toHaveBeenCalled();
    });
  });

  describe('Recovery Cancellation', () => {
    it('should cancel ongoing recovery', async () => {
      const recoveryAction = vi.fn().mockResolvedValue(false);

      const context: RecoveryContext = {
        matchId: 'match-1',
        playerId: 'player-1',
        attemptCount: 0,
        retryAllowed: true,
      };

      recovery.recover('connection-failed', context, recoveryAction);

      await vi.advanceTimersByTimeAsync(1000);
      recovery.cancelRecovery('match-1', 'player-1');

      const stats = recovery.getRecoveryStats();
      expect(stats.activeRecoveries).toBe(0);
    });

    it('should get recovery statistics', () => {
      const stats = recovery.getRecoveryStats();

      expect(stats).toHaveProperty('activeRecoveries');
      expect(stats).toHaveProperty('activeTimers');
      expect(stats).toHaveProperty('recoveryAttempts');
    });
  });
});
