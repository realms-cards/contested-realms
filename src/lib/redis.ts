import Redis from "ioredis";

// Use globalThis to persist Redis connection across serverless invocations
// This prevents connection churn in Vercel/serverless environments
const globalForRedis = globalThis as unknown as {
  redis: Redis | undefined;
};

export function getRedis(): Redis {
  if (!globalForRedis.redis) {
    const url = process.env.REDIS_URL || "redis://localhost:6379";
    globalForRedis.redis = new Redis(url, {
      // Connection pool settings for serverless
      maxRetriesPerRequest: 3,
      retryStrategy: (times) => Math.min(times * 50, 2000),
      connectTimeout: 5000,
      // Keep connection alive
      keepAlive: 10000,
      // Lazy connect - don't block on startup
      lazyConnect: true,
    });

    // Handle connection errors gracefully
    globalForRedis.redis.on("error", (err) => {
      console.warn("[redis] connection error:", err.message);
    });
  }
  return globalForRedis.redis;
}

export async function publish(
  channel: string,
  message: unknown
): Promise<void> {
  try {
    const cli = getRedis();
    await cli.publish(channel, JSON.stringify(message ?? null));
  } catch (e) {
    // Best-effort; avoid throwing from API routes on broadcast failures
    try {
      console.warn("[redis] publish failed:", (e as Error)?.message || e);
    } catch {}
  }
}
