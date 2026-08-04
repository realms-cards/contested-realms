/**
 * Shared Redis client factory.
 *
 * The bot needs more than one connection: a command connection (leader lock,
 * guild config) and a dedicated subscriber, because a client in subscriber
 * mode cannot issue normal commands.
 */

import { Redis, type RedisOptions } from "ioredis";

const clients = new Set<Redis>();
let shared: Redis | null = null;

function buildOptions(label: string): RedisOptions {
  const url = process.env.REDIS_URL || "redis://localhost:6379";

  const options: RedisOptions = {
    maxRetriesPerRequest: 3,
    retryStrategy: (times: number) => {
      if (times > 5) {
        console.error(`[redis:${label}] Connection failed after 5 retries`);
        return null;
      }
      return Math.min(times * 200, 3000);
    },
    lazyConnect: false,
  };

  // Passwords with special characters survive object config but not always the
  // URL string form, so split the URL when credentials are present.
  try {
    const parsed = new URL(url);
    if (parsed.password) {
      return {
        ...options,
        host: parsed.hostname,
        port: parseInt(parsed.port || "6379"),
        password: parsed.password,
      };
    }
  } catch {
    console.warn(`[redis:${label}] Failed to parse REDIS_URL, using as-is`);
  }

  return options;
}

/**
 * Create a new Redis connection. Use for subscribers, which cannot share a
 * connection with command traffic.
 */
export function createRedisClient(label: string): Redis {
  const url = process.env.REDIS_URL || "redis://localhost:6379";
  const options = buildOptions(label);

  const client =
    "host" in options ? new Redis(options) : new Redis(url, options);

  let connected = false;
  client.on("connect", () => {
    connected = true;
    console.log(`[redis:${label}] Connected`);
  });
  client.on("close", () => {
    connected = false;
  });
  client.on("error", (err: Error) => {
    // Only log once we've been up, to avoid spam while reconnecting.
    if (connected) console.error(`[redis:${label}] Error:`, err.message);
  });

  clients.add(client);
  return client;
}

/**
 * The shared command connection, created on first use.
 */
export function getSharedRedis(): Redis {
  if (!shared) {
    shared = createRedisClient("shared");
  }
  return shared;
}

/**
 * Close every connection this module handed out (shutdown only).
 */
export async function closeRedisClients(): Promise<void> {
  const open = Array.from(clients);
  clients.clear();
  shared = null;
  await Promise.all(
    open.map((client) => client.quit().catch(() => client.disconnect())),
  );
}
