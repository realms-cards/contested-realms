import type { TokenBucket, RateLimiterConfig, SocketRateLimits } from "./types";

/**
 * Creates a new token bucket for rate limiting
 */
export function createTokenBucket(config: RateLimiterConfig): TokenBucket {
  return {
    tokens: config.capacity,
    lastRefill: Date.now(),
    capacity: config.capacity,
    refillRate: config.refillRate,
    refillInterval: config.refillInterval,
  };
}

/**
 * Refills tokens based on elapsed time since last refill
 */
function refillTokens(bucket: TokenBucket): void {
  const now = Date.now();
  const elapsed = now - bucket.lastRefill;

  if (elapsed >= bucket.refillInterval) {
    const intervalsElapsed = Math.floor(elapsed / bucket.refillInterval);
    const tokensToAdd = intervalsElapsed * bucket.refillRate;

    bucket.tokens = Math.min(bucket.capacity, bucket.tokens + tokensToAdd);
    bucket.lastRefill = now - (elapsed % bucket.refillInterval);
  }
}

/**
 * Attempts to consume a token from the bucket
 * @returns true if token was consumed, false if rate limit exceeded
 */
export function tryConsume(bucket: TokenBucket): boolean {
  refillTokens(bucket);

  if (bucket.tokens >= 1) {
    bucket.tokens -= 1;
    return true;
  }

  return false;
}

/**
 * Creates rate limiters for a socket with default or env-configured limits
 */
export function createSocketRateLimits(): SocketRateLimits {
  // Chat: 5 messages per 10 seconds, burst 5
  const chatCapacity = parseInt(
    process.env.RATE_LIMIT_CHAT_CAPACITY ?? "5",
    10,
  );
  const chatRefillRate = parseInt(
    process.env.RATE_LIMIT_CHAT_REFILL ?? "5",
    10,
  );
  const chatInterval = parseInt(
    process.env.RATE_LIMIT_CHAT_INTERVAL ?? "10000",
    10,
  );

  // Cursor: 30 updates per second, burst 30
  const cursorCapacity = parseInt(
    process.env.RATE_LIMIT_CURSOR_CAPACITY ?? "30",
    10,
  );
  const cursorRefillRate = parseInt(
    process.env.RATE_LIMIT_CURSOR_REFILL ?? "30",
    10,
  );
  const cursorInterval = parseInt(
    process.env.RATE_LIMIT_CURSOR_INTERVAL ?? "1000",
    10,
  );

  // Generic message: 50 per 10 seconds, burst 50
  const messageCapacity = parseInt(
    process.env.RATE_LIMIT_MESSAGE_CAPACITY ?? "50",
    10,
  );
  const messageRefillRate = parseInt(
    process.env.RATE_LIMIT_MESSAGE_REFILL ?? "50",
    10,
  );
  const messageInterval = parseInt(
    process.env.RATE_LIMIT_MESSAGE_INTERVAL ?? "10000",
    10,
  );

  return {
    chat: createTokenBucket({
      capacity: chatCapacity,
      refillRate: chatRefillRate,
      refillInterval: chatInterval,
    }),
    cursor: createTokenBucket({
      capacity: cursorCapacity,
      refillRate: cursorRefillRate,
      refillInterval: cursorInterval,
    }),
    message: createTokenBucket({
      capacity: messageCapacity,
      refillRate: messageRefillRate,
      refillInterval: messageInterval,
    }),
  };
}

/**
 * Global rate limiter state per socket
 */
export const socketRateLimits = new Map<string, SocketRateLimits>();

/**
 * Gets or creates rate limiters for a socket ID
 */
export function getRateLimitsForSocket(socketId: string): SocketRateLimits {
  let limits = socketRateLimits.get(socketId);
  if (!limits) {
    limits = createSocketRateLimits();
    socketRateLimits.set(socketId, limits);
  }
  return limits;
}

/**
 * Removes rate limiters for a disconnected socket
 */
export function cleanupRateLimits(socketId: string): void {
  socketRateLimits.delete(socketId);
}

// ============================================================================
// Per-User Connection Rate Limiting
// Prevents outlier users from spamming connections (like the jbangalanga case)
// ============================================================================

interface UserConnectionLimit {
  bucket: TokenBucket;
  lastWarning: number;
  warningCount: number;
}

const userConnectionLimits = new Map<string, UserConnectionLimit>();

// Default: 20 connections per 30 seconds, burst 20 (increased for dev with hot reload)
const CONNECTION_CAPACITY = parseInt(
  process.env.RATE_LIMIT_CONN_CAPACITY ?? "20",
  10,
);
const CONNECTION_REFILL_RATE = parseInt(
  process.env.RATE_LIMIT_CONN_REFILL ?? "5",
  10,
);
const CONNECTION_INTERVAL = parseInt(
  process.env.RATE_LIMIT_CONN_INTERVAL ?? "30000",
  10,
);
const WARNING_COOLDOWN_MS = 60000; // Only log warning once per minute per user

/**
 * Check if a user is allowed to connect (rate limited per user ID)
 * @returns { allowed: boolean, waitMs?: number } - allowed and optional wait time
 */
export function checkUserConnectionLimit(userId: string): {
  allowed: boolean;
  waitMs?: number;
} {
  let limit = userConnectionLimits.get(userId);

  if (!limit) {
    limit = {
      bucket: createTokenBucket({
        capacity: CONNECTION_CAPACITY,
        refillRate: CONNECTION_REFILL_RATE,
        refillInterval: CONNECTION_INTERVAL,
      }),
      lastWarning: 0,
      warningCount: 0,
    };
    userConnectionLimits.set(userId, limit);
  }

  if (tryConsume(limit.bucket)) {
    return { allowed: true };
  }

  // Rate limited - calculate wait time
  const waitMs = Math.ceil(
    (limit.bucket.refillInterval / limit.bucket.refillRate) *
      (1 - limit.bucket.tokens),
  );

  // Log warning (with cooldown to prevent log spam)
  const now = Date.now();
  if (now - limit.lastWarning > WARNING_COOLDOWN_MS) {
    limit.warningCount++;
    limit.lastWarning = now;
    console.warn(
      `[rate-limit] User ${userId} connection rate limited (attempt #${
        limit.warningCount
      }, wait ${Math.round(waitMs / 1000)}s)`,
    );
  }

  return { allowed: false, waitMs };
}

/**
 * Clean up old user connection limits (call periodically)
 */
export function cleanupUserConnectionLimits(): void {
  const now = Date.now();
  const staleThreshold = 5 * 60 * 1000; // 5 minutes

  for (const [userId, limit] of userConnectionLimits.entries()) {
    // Remove if no activity in 5 minutes and bucket is full
    if (
      now - limit.bucket.lastRefill > staleThreshold &&
      limit.bucket.tokens >= limit.bucket.capacity
    ) {
      userConnectionLimits.delete(userId);
    }
  }
}
