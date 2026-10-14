/**
 * Presence of rules-engine games (/play/engine) for the lobby's activity line.
 *
 * Engine games run entirely in the browser, so the server only learns about
 * them from a heartbeat: while a game is in progress the page touches a random
 * per-game id every PRESENCE_HEARTBEAT_MS, and an id that has not been touched
 * for PRESENCE_TTL_MS stops counting (a closed tab simply drops out). Nothing
 * but that id is ever sent - no deck, no user.
 *
 * Shared by the client hook (constants, id check) and the API route (stores).
 */

/** An id stops counting this long after its last heartbeat. */
export const PRESENCE_TTL_MS = 90_000;
/** How often an in-progress game re-announces itself. */
export const PRESENCE_HEARTBEAT_MS = 30_000;
/** Ceiling on tracked ids, so a flood of made-up ids cannot grow the set unbounded. */
export const MAX_PRESENCE_ENTRIES = 10_000;
/** Redis sorted set: member = presence id, score = last heartbeat (ms). */
export const PRESENCE_REDIS_KEY = "engine:presence";
export const PRESENCE_API_PATH = "/api/engine/presence";

const PRESENCE_ID_RE = /^[A-Za-z0-9_-]{16,64}$/;

export function isPresenceId(value: unknown): value is string {
  return typeof value === "string" && PRESENCE_ID_RE.test(value);
}

/** Reads `{ id }` from a request body; null when it is missing or malformed. */
export function presenceIdFromBody(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const id = (body as { id?: unknown }).id;
  return isPresenceId(id) ? id : null;
}

/** Reads `{ count }` from the API response; null when it is not a usable count. */
export function presenceCountFromBody(body: unknown): number | null {
  if (!body || typeof body !== "object") return null;
  const count = (body as { count?: unknown }).count;
  return typeof count === "number" && Number.isFinite(count) && count >= 0
    ? Math.floor(count)
    : null;
}

export interface PresenceStore {
  /** Record a heartbeat. False when the id was refused (store full). */
  touch(id: string, now: number): Promise<boolean>;
  /** Drop an id at once (game over, page left). */
  remove(id: string): Promise<void>;
  /** Ids touched within the TTL. */
  count(now: number): Promise<number>;
}

/** Single-process store: the fallback when Redis is unreachable, and the test double. */
export function createMemoryPresenceStore(
  ttlMs: number = PRESENCE_TTL_MS,
  maxEntries: number = MAX_PRESENCE_ENTRIES,
): PresenceStore {
  const lastSeen = new Map<string, number>();
  const prune = (now: number) => {
    for (const [id, ts] of lastSeen) {
      if (now - ts > ttlMs) lastSeen.delete(id);
    }
  };
  return {
    async touch(id, now) {
      if (!lastSeen.has(id)) {
        prune(now);
        if (lastSeen.size >= maxEntries) return false;
      }
      lastSeen.set(id, now);
      return true;
    },
    async remove(id) {
      lastSeen.delete(id);
    },
    async count(now) {
      prune(now);
      return lastSeen.size;
    },
  };
}

/** The few sorted-set commands the Redis store needs (ioredis satisfies this). */
export interface PresenceRedis {
  zadd(key: string, score: number, member: string): Promise<number | string>;
  zrem(key: string, member: string): Promise<number>;
  zremrangebyscore(key: string, min: string, max: number): Promise<number>;
  zcard(key: string): Promise<number>;
  zscore(key: string, member: string): Promise<string | null>;
  pexpire(key: string, ms: number): Promise<number>;
}

/**
 * Cross-instance store: one sorted set every app instance shares, so the count
 * is the same whichever instance a heartbeat or a lobby poll lands on.
 */
export function createRedisPresenceStore(
  redis: PresenceRedis,
  ttlMs: number = PRESENCE_TTL_MS,
  maxEntries: number = MAX_PRESENCE_ENTRIES,
  key: string = PRESENCE_REDIS_KEY,
): PresenceStore {
  const prune = (now: number) => redis.zremrangebyscore(key, "-inf", now - ttlMs - 1);
  return {
    async touch(id, now) {
      if ((await redis.zscore(key, id)) === null) {
        await prune(now);
        if ((await redis.zcard(key)) >= maxEntries) return false;
      }
      await redis.zadd(key, now, id);
      // the whole set lapses if every game goes quiet
      await redis.pexpire(key, ttlMs * 2);
      return true;
    },
    async remove(id) {
      await redis.zrem(key, id);
    },
    async count(now) {
      await prune(now);
      return redis.zcard(key);
    },
  };
}
