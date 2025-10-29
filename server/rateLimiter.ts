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
  const chatCapacity = parseInt(process.env.RATE_LIMIT_CHAT_CAPACITY ?? "5", 10);
  const chatRefillRate = parseInt(process.env.RATE_LIMIT_CHAT_REFILL ?? "5", 10);
  const chatInterval = parseInt(process.env.RATE_LIMIT_CHAT_INTERVAL ?? "10000", 10);

  // Cursor: 30 updates per second, burst 30
  const cursorCapacity = parseInt(process.env.RATE_LIMIT_CURSOR_CAPACITY ?? "30", 10);
  const cursorRefillRate = parseInt(process.env.RATE_LIMIT_CURSOR_REFILL ?? "30", 10);
  const cursorInterval = parseInt(process.env.RATE_LIMIT_CURSOR_INTERVAL ?? "1000", 10);

  // Generic message: 50 per 10 seconds, burst 50
  const messageCapacity = parseInt(process.env.RATE_LIMIT_MESSAGE_CAPACITY ?? "50", 10);
  const messageRefillRate = parseInt(process.env.RATE_LIMIT_MESSAGE_REFILL ?? "50", 10);
  const messageInterval = parseInt(process.env.RATE_LIMIT_MESSAGE_INTERVAL ?? "10000", 10);

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
