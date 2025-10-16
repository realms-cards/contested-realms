import type { RedisOptions } from "ioredis";

export interface ServerConfig {
  port: number;
  pingIntervalMs: number;
  pingTimeoutMs: number;
  corsOrigins: string[];
  redisUrl: string;
  redisPassword: string;
  redisOptions: RedisOptions;
  enableRedisAdapter: boolean;
  enableStoreRedis: boolean;
  instanceId: string;
}

export function parseBoolean(value: unknown, fallback = false): boolean {
  if (value === undefined || value === null) return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (["1", "true", "on", "yes"].includes(normalized)) return true;
  if (["0", "false", "off", "no"].includes(normalized)) return false;
  return fallback;
}

export function buildServerConfig(envOverrides: Record<string, unknown> = {}): ServerConfig {
  const env = { ...process.env, ...envOverrides };
  const port = env.PORT ? Number(env.PORT) : 3010;
  const pingIntervalMs = Number(env.SOCKET_PING_INTERVAL_MS || 15000);
  const pingTimeoutMs = Number(env.SOCKET_PING_TIMEOUT_MS || 30000);
  const redisUrl =
    (typeof env.REDIS_URL === "string" && env.REDIS_URL) ||
    (typeof env.SOCKET_REDIS_URL === "string" && env.SOCKET_REDIS_URL) ||
    "redis://localhost:6379";
  const redisPassword = typeof env.REDIS_PASSWORD === "string" ? env.REDIS_PASSWORD : "";
  const enableRedisAdapter = !parseBoolean(env.SOCKET_REDIS_DISABLED, false);
  const enableStoreRedis = !parseBoolean(env.SOCKET_STORE_DISABLED, false);
  const corsOrigins = (typeof env.SOCKET_CORS_ORIGIN === "string" ? env.SOCKET_CORS_ORIGIN : "http://localhost:3000")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const instanceId =
    (typeof env.INSTANCE_ID === "string" && env.INSTANCE_ID) || `srv-${Math.random().toString(36).slice(2, 7)}`;

  const redisOptions: RedisOptions = redisPassword ? { password: redisPassword } : {};

  return {
    port,
    pingIntervalMs,
    pingTimeoutMs,
    corsOrigins,
    redisUrl,
    redisPassword,
    redisOptions,
    enableRedisAdapter,
    enableStoreRedis,
    instanceId,
  };
}
