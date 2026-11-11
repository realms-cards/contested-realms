"use strict";

import type { PrismaClient } from "@prisma/client";
import type { Redis } from "ioredis";
import type { Server as SocketIOServer, Socket } from "socket.io";
import { chatKeys } from "../core/redis-keys";
import type { PlayerState, SocketRateLimits, TokenBucket } from "../types";

type ChatScope = "global" | "lobby" | "match";

interface ChatMessage {
  from: { id: string; displayName: string; seat?: string } | null;
  content: string;
  scope: ChatScope;
  ts?: number;
}

interface ChatPayload extends Record<string, unknown> {
  content?: unknown;
  scope?: unknown;
}

const CHAT_SCOPE_VALUES: ReadonlySet<ChatScope> = new Set([
  "global",
  "lobby",
  "match",
]);

function isChatScope(value: unknown): value is ChatScope {
  return typeof value === "string" && CHAT_SCOPE_VALUES.has(value as ChatScope);
}

interface ChatHandlersDeps {
  io: SocketIOServer;
  socket: Socket;
  storeRedis: Redis | null;
  prisma: PrismaClient | null;
  isAuthed: () => boolean;
  getPlayerBySocket: (socket: Socket | null | undefined) => PlayerState | null;
  getPlayerInfo: (
    playerId: string
  ) => { id: string; displayName: string; seat?: string } | null;
  getRateLimitsForSocket: (socketId: string) => SocketRateLimits;
  tryConsume: (bucket: TokenBucket) => boolean;
  incrementMetric: (name: string) => void;
  incrementRateLimitHit: (name: string) => void;
  debugLog: (message: string) => void;
}

/** How many messages a cold Redis list is refilled with from the database. */
const HYDRATE_LIMIT = chatKeys.maxMessages;

/** Append to the Redis list only while it is empty (one atomic step, so two
 *  sockets connecting at once can't both refill it). */
const HYDRATE_IF_EMPTY_LUA =
  "if redis.call('LLEN', KEYS[1]) == 0 then return redis.call('RPUSH', KEYS[1], unpack(ARGV)) end return 0";

/**
 * Persist a global chat message: Redis keeps the newest 500 for history (no
 * expiry), Postgres keeps every message durably.
 */
async function persistGlobalMessage(
  redis: Redis | null,
  prisma: PrismaClient | null,
  message: ChatMessage
): Promise<void> {
  const ts = message.ts ?? Date.now();
  if (prisma) {
    try {
      await prisma.globalChatMessage.create({
        data: {
          senderId: message.from?.id ?? null,
          senderName: message.from?.displayName ?? null,
          content: message.content,
          createdAt: new Date(ts),
        },
      });
    } catch (err) {
      console.error("[chat] Failed to store global message:", err);
    }
  }
  if (!redis) return;
  try {
    const key = chatKeys.global;
    // Refill first if the list was lost, so this message lands after its history
    // instead of being the only one (the DB row above is already part of the refill).
    if (prisma && (await redis.llen(key)) === 0) {
      await hydrateFromDatabase(redis, prisma);
      return;
    }
    await redis.rpush(key, JSON.stringify({ ...message, ts }));
    await redis.ltrim(key, -chatKeys.maxMessages, -1);
    // Lists written before the history stopped expiring still carry a TTL
    await redis.persist(key);
  } catch (err) {
    // Log but don't fail the message send
    console.error("[chat] Failed to persist global message:", err);
  }
}

/** Newest messages from the database, oldest first. */
async function loadFromDatabase(
  prisma: PrismaClient,
  limit: number
): Promise<ChatMessage[]> {
  const rows = await prisma.globalChatMessage.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  return rows.reverse().map((row) => ({
    from: row.senderId
      ? { id: row.senderId, displayName: row.senderName ?? "Player" }
      : null,
    content: row.content,
    scope: "global" as const,
    ts: row.createdAt.getTime(),
  }));
}

/** Refill an empty Redis history list from the database. */
async function hydrateFromDatabase(
  redis: Redis,
  prisma: PrismaClient
): Promise<void> {
  const messages = await loadFromDatabase(prisma, HYDRATE_LIMIT);
  if (messages.length === 0) return;
  await redis.eval(
    HYDRATE_IF_EMPTY_LUA,
    1,
    chatKeys.global,
    ...messages.map((m) => JSON.stringify(m))
  );
}

/**
 * Get global chat history with pagination. Reads the Redis list, refilling it
 * from the database when it is empty; without Redis, reads the database.
 * @param limit - Max messages to return (default: all)
 * @param before - Return messages older than this index (for pagination)
 * @returns Messages in chronological order (oldest first)
 */
export async function getGlobalChatHistory(
  redis: Redis | null,
  prisma: PrismaClient | null,
  limit?: number,
  before?: number
): Promise<{ messages: ChatMessage[]; hasMore: boolean; oldestIndex: number }> {
  const empty = { messages: [], hasMore: false, oldestIndex: 0 };
  try {
    if (!redis) {
      if (!prisma) return empty;
      // Same window as the Redis list: the newest 500, paged from the end
      const all = await loadFromDatabase(prisma, chatKeys.maxMessages);
      const end = all.length - (before ?? 0);
      const start = limit !== undefined ? Math.max(0, end - limit) : 0;
      const messages = all.slice(start, Math.max(start, end));
      return {
        messages,
        hasMore: start > 0,
        oldestIndex: (before ?? 0) + messages.length,
      };
    }

    const key = chatKeys.global;
    let totalLen = await redis.llen(key);
    if (totalLen === 0 && prisma) {
      await hydrateFromDatabase(redis, prisma);
      totalLen = await redis.llen(key);
    }
    if (totalLen === 0) return empty;

    // Calculate range: newest messages are at the end (right) of the list
    // before = index from the end (0 = newest, totalLen-1 = oldest)
    const endIndex = before !== undefined ? -(before + 1) : -1;
    const startIndex = limit !== undefined ? endIndex - limit + 1 : 0;

    const raw = await redis.lrange(key, startIndex, endIndex);
    const messages = raw
      .map((json) => {
        try {
          return JSON.parse(json) as ChatMessage;
        } catch {
          return null;
        }
      })
      .filter((m): m is ChatMessage => m !== null);

    // Calculate if there are more messages before these
    const actualStart =
      startIndex < 0 ? Math.max(0, totalLen + startIndex) : startIndex;
    const hasMore = actualStart > 0;
    const oldestIndex =
      before !== undefined ? before + messages.length : messages.length;

    return { messages, hasMore, oldestIndex };
  } catch (err) {
    console.error("[chat] Failed to get global chat history:", err);
    return empty;
  }
}

const chatHandlersModule = { registerChatHandlers, getGlobalChatHistory };
export default chatHandlersModule;

export function registerChatHandlers({
  io,
  socket,
  storeRedis,
  prisma,
  isAuthed,
  getPlayerBySocket,
  getPlayerInfo,
  getRateLimitsForSocket,
  tryConsume,
  incrementMetric,
  incrementRateLimitHit,
  debugLog,
}: ChatHandlersDeps): void {
  try {
    // Lightweight registration log to help debug wiring issues
    debugLog?.(`[chat] registering handlers for socket ${socket.id}`);
  } catch {}

  socket.on("chat", (incoming?: ChatPayload) => {
    try {
      debugLog?.("[chat] incoming payload");
    } catch {}
    if (!isAuthed()) {
      try {
        debugLog?.("[chat] dropped message: not authed");
      } catch {}
      return;
    }

    const payload = incoming ?? {};
    const player = getPlayerBySocket(socket);
    if (!player) {
      try {
        debugLog?.("[chat] dropped message: no player for socket");
      } catch {}
      return;
    }

    incrementMetric("chatRecvTotal");

    const rateLimits = getRateLimitsForSocket(socket.id);
    if (!tryConsume(rateLimits.chat)) {
      incrementRateLimitHit("chat");
      debugLog(`[chat] rate limit exceeded for socket ${socket.id}`);
      socket.emit("chat", {
        from: null,
        content: "Rate limit exceeded. Please slow down.",
        scope: "global" as ChatScope,
        error: "rate_limited",
      });
      return;
    }

    const rawContent = payload.content;
    const normalizedContent =
      typeof rawContent === "string"
        ? rawContent
        : rawContent != null
        ? String(rawContent)
        : "";
    const content = normalizedContent.slice(0, 500);
    if (!content) return;

    const requestedScope = isChatScope(payload.scope) ? payload.scope : null;
    const from = getPlayerInfo(player.id);

    if (requestedScope === "global") {
      const message: ChatMessage = {
        from,
        content,
        scope: "global",
        ts: Date.now(),
      };
      io.emit("chat", message);
      // Persist to Redis for history (ts already included)
      persistGlobalMessage(storeRedis, prisma, message).catch(() => {});
      incrementMetric("chatSentTotal");
      debugLog(`[chat] global message sent from ${player.id}`);
      return;
    }

    let scope: Exclude<ChatScope, "global"> = "lobby";
    let room: string | null = null;

    if (requestedScope === "match" && player.matchId) {
      scope = "match";
      room = `match:${player.matchId}`;
    } else if (requestedScope === "lobby" && player.lobbyId) {
      scope = "lobby";
      room = `lobby:${player.lobbyId}`;
    } else if (player.matchId) {
      scope = "match";
      room = `match:${player.matchId}`;
    } else if (player.lobbyId) {
      scope = "lobby";
      room = `lobby:${player.lobbyId}`;
    }

    if (room) {
      io.to(room).emit("chat", { from, content, scope, ts: Date.now() });
      incrementMetric("chatSentTotal");
      debugLog(`[chat] room message sent from ${player.id} to ${room}`);
    } else {
      socket.emit("chat", { from: null, content, scope, ts: Date.now() });
      incrementMetric("chatSentTotal");
    }
  });

  // Handler for requesting more chat history (pagination)
  socket.on(
    "chatHistory:request",
    async (payload?: { before?: number; limit?: number }) => {
      if (!isAuthed()) return;
      try {
        const before =
          typeof payload?.before === "number" ? payload.before : undefined;
        const limit =
          typeof payload?.limit === "number" ? Math.min(payload.limit, 50) : 10;
        const result = await getGlobalChatHistory(storeRedis, prisma, limit, before);
        socket.emit("chatHistory", result);
      } catch (err) {
        console.error("[chat] Failed to handle chatHistory:request:", err);
      }
    }
  );
}
