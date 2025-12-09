import { getRedis } from "@/lib/redis";

/**
 * Cache utility for Redis with TTL support and automatic JSON serialization
 */

export interface CacheOptions {
  /** Time to live in seconds */
  ttl?: number;
  /** Cache key prefix for namespacing */
  prefix?: string;
}

/**
 * Generate a cache key from route and parameters
 */
export function generateCacheKey(
  route: string,
  params: Record<string, unknown> = {}
): string {
  const sortedParams = Object.keys(params)
    .sort()
    .map((key) => `${key}=${JSON.stringify(params[key])}`)
    .join("&");

  return sortedParams ? `${route}?${sortedParams}` : route;
}

// Timeout wrapper to prevent slow Redis from blocking requests
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([
    promise,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), ms)),
  ]);
}

// Cache timeout in ms - if Redis is slow, skip cache and hit DB
const CACHE_TIMEOUT_MS = 500;

/**
 * Get cached value with automatic JSON deserialization
 * Times out after 500ms to prevent slow Redis from blocking requests
 */
export async function getCached<T>(key: string): Promise<T | null> {
  try {
    const redis = getRedis();
    const cached = await withTimeout(redis.get(key), CACHE_TIMEOUT_MS);

    if (!cached) {
      return null;
    }

    return JSON.parse(cached) as T;
  } catch (e) {
    console.warn(
      "[cache] get failed:",
      key,
      e instanceof Error ? e.message : e
    );
    return null;
  }
}

/**
 * Set cached value with automatic JSON serialization and TTL
 * Fire-and-forget with timeout - don't block on cache writes
 */
export async function setCached<T>(
  key: string,
  value: T,
  options: CacheOptions = {}
): Promise<void> {
  try {
    const redis = getRedis();
    const serialized = JSON.stringify(value);

    // Fire-and-forget with timeout - don't block response on cache write
    const writePromise = options.ttl
      ? redis.setex(key, options.ttl, serialized)
      : redis.set(key, serialized);

    // Don't await - let it complete in background
    withTimeout(writePromise, CACHE_TIMEOUT_MS).catch((e) => {
      console.warn(
        "[cache] set timeout:",
        key,
        e instanceof Error ? e.message : e
      );
    });
  } catch (e) {
    console.warn(
      "[cache] set failed:",
      key,
      e instanceof Error ? e.message : e
    );
  }
}

/**
 * Delete cached value(s) by key pattern
 */
export async function invalidateCache(pattern: string): Promise<number> {
  try {
    const redis = getRedis();

    // Find all keys matching pattern
    const keys = await redis.keys(pattern);

    if (keys.length === 0) {
      return 0;
    }

    // Delete all matching keys
    const deleted = await redis.del(...keys);
    console.log(`[cache] invalidated ${deleted} keys matching: ${pattern}`);

    return deleted;
  } catch (e) {
    console.warn(
      "[cache] invalidation failed:",
      pattern,
      e instanceof Error ? e.message : e
    );
    return 0;
  }
}

/**
 * Cache wrapper for API route handlers
 * Automatically handles cache get/set with fallback to database query
 */
export async function withCache<T>(
  cacheKey: string,
  fetcher: () => Promise<T>,
  options: CacheOptions = { ttl: 60 }
): Promise<T> {
  // Try to get from cache first
  const cached = await getCached<T>(cacheKey);

  if (cached !== null) {
    return cached;
  }

  // Cache miss - fetch from database
  const data = await fetcher();

  // Store in cache for next time
  await setCached(cacheKey, data, options);

  return data;
}

/**
 * Common cache key patterns for different route types
 */
export const CacheKeys = {
  tournaments: {
    list: (params: Record<string, unknown>) =>
      generateCacheKey("tournaments:list", params),
    detail: (id: string) => `tournaments:detail:${id}`,
    matches: (id: string, params: Record<string, unknown>) =>
      generateCacheKey(`tournaments:matches:${id}`, params),
    standings: (id: string) => `tournaments:standings:${id}`,
    invalidateAll: () => "tournaments:*",
    invalidateTournament: (id: string) => `tournaments:*:${id}*`,
  },

  cards: {
    search: (params: Record<string, unknown>) =>
      generateCacheKey("cards:search", params),
    byId: (id: number) => `cards:detail:${id}`,
    invalidateAll: () => "cards:*",
  },

  collection: {
    list: (userId: string, params: Record<string, unknown>) =>
      generateCacheKey(`collection:${userId}`, params),
    stats: (userId: string) => `collection:stats:${userId}`,
    invalidateUser: (userId: string) => `collection:${userId}*`,
  },

  decks: {
    list: (userId: string) => `decks:list:${userId}`,
    detail: (id: string) => `decks:detail:${id}`,
    invalidateUser: (userId: string) => `decks:*:${userId}*`,
    invalidateDeck: (id: string) => `decks:*:${id}*`,
  },
};
