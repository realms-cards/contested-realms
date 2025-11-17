"use strict";

import type { Server as SocketIOServer, Socket } from "socket.io";
import type {
  PlayerState,
  SocketRateLimits,
  TokenBucket,
} from "../types";

type ChatScope = "global" | "lobby" | "match";

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
  isAuthed: () => boolean;
  getPlayerBySocket: (
    socket: Socket | null | undefined
  ) => PlayerState | null;
  getPlayerInfo: (
    playerId: string
  ) => { id: string; displayName: string; seat?: string } | null;
  getRateLimitsForSocket: (socketId: string) => SocketRateLimits;
  tryConsume: (bucket: TokenBucket) => boolean;
  incrementMetric: (name: string) => void;
  incrementRateLimitHit: (name: string) => void;
  debugLog: (message: string) => void;
}

export function registerChatHandlers({
  io,
  socket,
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
      io.emit("chat", { from, content, scope: "global" as ChatScope });
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
      io.to(room).emit("chat", { from, content, scope });
      incrementMetric("chatSentTotal");
      debugLog(`[chat] room message sent from ${player.id} to ${room}`);
    } else {
      socket.emit("chat", { from: null, content, scope });
      incrementMetric("chatSentTotal");
    }
  });
}
