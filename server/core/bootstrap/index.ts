import http from "http";
import type { PrismaClient } from "@prisma/client";
import { createAdapter } from "@socket.io/redis-adapter";
import Redis from "ioredis";
import { Server } from "socket.io";
import { buildServerConfig, type ServerConfig } from "../config";
import { createLogger } from "../logger";
import { createPrismaClient } from "../prisma";

export interface RedisClients {
  pubClient: Redis | null;
  subClient: Redis | null;
  storeRedis: Redis | null;
  storeSub: Redis | null;
}

export interface BootstrapOptions {
  envOverrides?: Record<string, unknown>;
  prismaClient?: PrismaClient;
  httpServer?: http.Server;
  ioServer?: Server;
}

export interface BootstrapResult {
  config: ServerConfig;
  prisma: PrismaClient;
  httpServer: http.Server;
  io: Server;
  redis: RedisClients;
}

const socketLogger = createLogger("socket.io");
const storeLogger = createLogger("store");

export function loadEnv(): void {
  try {
    // Dynamically import dotenv for optional loading
    import("dotenv").then((dotenv) => dotenv.config()).catch(() => {
      // Ignore missing dotenv in production environments
    });
  } catch {
    // Ignore missing dotenv in production environments
  }
}

function createSocketServer(httpServer: http.Server, config: ServerConfig): Server {
  return new Server(httpServer, {
    cors: {
      origin: config.corsOrigins,
      credentials: true,
    },
    pingInterval: config.pingIntervalMs,
    pingTimeout: config.pingTimeoutMs,
  });
}

function createRedisClients(config: ServerConfig): RedisClients {
  const clients: RedisClients = {
    pubClient: null,
    subClient: null,
    storeRedis: null,
    storeSub: null,
  };

  try {
    if (config.enableRedisAdapter) {
      clients.pubClient = new Redis(config.redisUrl, config.redisOptions);
      clients.subClient = clients.pubClient.duplicate();
    }
  } catch (err) {
    socketLogger.warn("Redis adapter initialization failed:", err instanceof Error ? err.message : err);
    clients.pubClient = null;
    clients.subClient = null;
  }

  try {
    if (config.enableStoreRedis) {
      clients.storeRedis = new Redis(config.redisUrl, config.redisOptions);
      clients.storeSub = clients.storeRedis.duplicate();
    }
  } catch (err) {
    storeLogger.warn("Redis state init failed:", err instanceof Error ? err.message : err);
    clients.storeRedis = null;
    clients.storeSub = null;
  }

  return clients;
}

export function createBootstrap(options: BootstrapOptions = {}): BootstrapResult {
  loadEnv();
  const config = buildServerConfig(options.envOverrides);

  const prisma = options.prismaClient || createPrismaClient();
  const httpServer = options.httpServer || http.createServer();
  const io = options.ioServer || createSocketServer(httpServer, config);

  const redis = createRedisClients(config);

  if (config.enableRedisAdapter && redis.pubClient && redis.subClient) {
    try {
      io.adapter(createAdapter(redis.pubClient, redis.subClient));
      const redacted = config.redisPassword ? config.redisUrl.replace(/redis:\/\//, "redis://redacted@") : config.redisUrl;
      socketLogger.info(`Redis adapter enabled -> ${redacted}`);
    } catch (err) {
      socketLogger.warn("Failed to attach Redis adapter:", err instanceof Error ? err.message : err);
    }
  } else if (!config.enableRedisAdapter) {
    socketLogger.info("Redis adapter disabled by config");
  }

  if (redis.storeRedis) {
    const redacted = config.redisPassword ? config.redisUrl.replace(/redis:\/\//, "redis://redacted@") : config.redisUrl;
    storeLogger.info(`Redis state connected -> ${redacted} (instance=${config.instanceId})`);
  }

  return {
    config,
    prisma,
    httpServer,
    io,
    redis,
  };
}
