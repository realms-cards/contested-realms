/**
 * Leader lock using Redis to ensure only one bot instance runs at a time.
 * This prevents duplicate Discord connections when scaling horizontally.
 */

import type { Redis } from "ioredis";
import { getSharedRedis } from "./redis.js";

const LOCK_KEY = "realms:discord-bot:leader";
const LOCK_TTL_MS = 30_000; // 30 seconds
const HEARTBEAT_INTERVAL_MS = 10_000; // 10 seconds
const MAX_HEARTBEAT_FAILURES = 3;

let redis: Redis | null = null;
let heartbeatTimer: NodeJS.Timeout | null = null;
let instanceId: string | null = null;
let heartbeatFailures = 0;

function getRedis(): Redis {
  if (!redis) {
    redis = getSharedRedis();
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

  // The connection is shared; index.ts closes it during shutdown.
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
    if (redis.status !== "ready") {
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
