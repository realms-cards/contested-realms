/**
 * Leader lock using Redis to ensure only one bot instance runs at a time.
 * This prevents duplicate Discord connections when scaling horizontally.
 */

import { Redis } from "ioredis";

const LOCK_KEY = "realms:discord-bot:leader";
const LOCK_TTL_MS = 30_000; // 30 seconds
const HEARTBEAT_INTERVAL_MS = 10_000; // 10 seconds
const MAX_HEARTBEAT_FAILURES = 3;

let redis: Redis | null = null;
let heartbeatTimer: NodeJS.Timeout | null = null;
let instanceId: string | null = null;
let heartbeatFailures = 0;
let isConnected = false;

function getRedis(): Redis {
  if (!redis) {
    const url = process.env.REDIS_URL || "redis://localhost:6379";

    // Parse Redis URL to extract password if present
    let redisConfig: any = url;
    try {
      const parsedUrl = new URL(url);
      if (parsedUrl.password) {
        // Use object config instead of URL string to handle special chars in password
        redisConfig = {
          host: parsedUrl.hostname,
          port: parseInt(parsedUrl.port || "6379"),
          password: parsedUrl.password,
        };
      }
    } catch (err) {
      // If URL parsing fails, fall back to string URL
      console.warn("[leader-lock] Failed to parse REDIS_URL, using as-is");
    }

    redis = new Redis(redisConfig, {
      maxRetriesPerRequest: 3,
      retryStrategy: (times: number) => {
        if (times > 5) {
          console.error(
            "[leader-lock] Redis connection failed after 5 retries"
          );
          return null;
        }
        return Math.min(times * 200, 3000);
      },
      lazyConnect: false,
    });

    redis.on("connect", () => {
      console.log("[leader-lock] Redis connected");
      isConnected = true;
      heartbeatFailures = 0;
    });

    redis.on("close", () => {
      console.log("[leader-lock] Redis connection closed");
      isConnected = false;
    });

    redis.on("error", (err: Error) => {
      // Only log if we were connected (avoid spam during reconnection)
      if (isConnected) {
        console.error("[leader-lock] Redis error:", err.message);
      }
    });
  }
  return redis;
}

function generateInstanceId(): string {
  const hostname = process.env.HOSTNAME || "local";
  const pid = process.pid;
  const random = Math.random().toString(36).substring(2, 8);
  return `${hostname}-${pid}-${random}`;
}

/**
 * Try to acquire the leader lock.
 * Returns true if this instance is now the leader.
 */
export async function acquireBotLock(): Promise<boolean> {
  const r = getRedis();
  instanceId = generateInstanceId();

  try {
    // SET NX with expiry - only sets if key doesn't exist
    const result = await r.set(LOCK_KEY, instanceId, "PX", LOCK_TTL_MS, "NX");

    if (result === "OK") {
      console.log(`[leader-lock] Acquired lock as ${instanceId}`);
      startHeartbeat();
      return true;
    }

    // Check who has the lock
    const currentHolder = await r.get(LOCK_KEY);
    console.log(`[leader-lock] Lock held by ${currentHolder}`);
    return false;
  } catch (err) {
    console.error("[leader-lock] Failed to acquire lock:", err);
    // If Redis is down, allow bot to run (single instance mode)
    console.warn("[leader-lock] Running without lock (Redis unavailable)");
    return true;
  }
}

/**
 * Release the leader lock (on shutdown).
 */
export async function releaseBotLock(): Promise<void> {
  stopHeartbeat();

  if (!redis || !instanceId) return;

  try {
    // Only delete if we still hold the lock
    const script = `
      if redis.call("get", KEYS[1]) == ARGV[1] then
        return redis.call("del", KEYS[1])
      else
        return 0
      end
    `;
    await redis.eval(script, 1, LOCK_KEY, instanceId);
    console.log("[leader-lock] Released lock");
  } catch (err) {
    console.error("[leader-lock] Failed to release lock:", err);
  }

  await redis.quit();
  redis = null;
}

/**
 * Keep the lock alive with periodic heartbeats.
 */
function startHeartbeat(): void {
  if (heartbeatTimer) return;

  heartbeatTimer = setInterval(async () => {
    if (!redis || !instanceId) return;

    // Skip heartbeat if not connected
    if (!isConnected) {
      heartbeatFailures++;
      console.warn(
        `[leader-lock] Skipping heartbeat (disconnected), failures: ${heartbeatFailures}/${MAX_HEARTBEAT_FAILURES}`
      );
      if (heartbeatFailures >= MAX_HEARTBEAT_FAILURES) {
        console.error(
          "[leader-lock] Too many heartbeat failures, shutting down..."
        );
        stopHeartbeat();
        process.exit(1);
      }
      return;
    }

    try {
      // Extend TTL only if we still hold the lock
      const script = `
        if redis.call("get", KEYS[1]) == ARGV[1] then
          return redis.call("pexpire", KEYS[1], ARGV[2])
        else
          return 0
        end
      `;
      const result = await redis.eval(
        script,
        1,
        LOCK_KEY,
        instanceId,
        LOCK_TTL_MS.toString()
      );

      if (result === 0) {
        console.error("[leader-lock] Lost leader lock! Shutting down...");
        stopHeartbeat();
        process.exit(1);
      }

      // Reset failures on success
      heartbeatFailures = 0;
    } catch (err) {
      heartbeatFailures++;
      console.error(
        `[leader-lock] Heartbeat failed (${heartbeatFailures}/${MAX_HEARTBEAT_FAILURES}):`,
        err
      );
      if (heartbeatFailures >= MAX_HEARTBEAT_FAILURES) {
        console.error(
          "[leader-lock] Too many heartbeat failures, shutting down..."
        );
        stopHeartbeat();
        process.exit(1);
      }
    }
  }, HEARTBEAT_INTERVAL_MS);
}

/**
 * Stop the heartbeat timer.
 */
function stopHeartbeat(): void {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
}
