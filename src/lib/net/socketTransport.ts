"use client";

import { io, Socket } from "socket.io-client";
import type { RemoteCursorState } from "@/lib/game/store";
import type {
  InteractionEnvelope,
  InteractionRequestMessage,
  InteractionResponseMessage,
} from "@/lib/net/interactions";
import { Protocol } from "@/lib/net/protocol";
import type {
  LobbyVisibility,
  ChatScope,
  DraftConfig,
  PlayerLocation,
} from "@/lib/net/protocol";
import type {
  GameTransport,
  TransportEvent,
  TransportHandler,
  StartMatchConfig,
  DraftState,
  CustomMessage,
  TransportEventMap,
} from "@/lib/net/transport";
import type {
  CardPreviewEvent,
  StackInteractionEvent,
  UIUpdateEvent,
} from "@/types/draft-3d-events";
import {
  fetchSocketToken,
  clearSocketTokenCache,
  getCachedTokenSync,
} from "./socketTokenCache";

const RECONNECT_ATTEMPTS_ENV = Number(
  process.env.NEXT_PUBLIC_WS_RECONNECT_ATTEMPTS,
);
const RECONNECT_DELAY_MAX_ENV = Number(
  process.env.NEXT_PUBLIC_WS_RECONNECT_DELAY_MAX,
);
const WS_TIMEOUT_ENV = Number(process.env.NEXT_PUBLIC_WS_TIMEOUT_MS);

// --- Helper normalization: tolerate older servers or partial sealed config ---
function normalizeSealedConfigClient(sc: unknown): unknown {
  if (!sc || typeof sc !== "object") return null;
  const obj = sc as Record<string, unknown>;
  const n = (v: unknown): number => {
    const x = typeof v === "string" ? Number(v) : (v as number);
    return Number.isFinite(x) ? Number(x) : NaN;
  };
  const packCounts =
    obj.packCounts && typeof obj.packCounts === "object"
      ? (obj.packCounts as Record<string, unknown>)
      : {};
  let sum = 0;
  const entries = Object.entries(packCounts);
  for (const [, v] of entries) sum += Number(n(v)) || 0;
  const rawPackCount = n(obj.packCount);
  const candidatePackCount =
    Number.isFinite(rawPackCount) && rawPackCount > 0
      ? Math.floor(rawPackCount)
      : sum > 0
        ? sum
        : 6;
  // Clamp to protocol bounds (3..8)
  const packCount = Math.max(3, Math.min(8, candidatePackCount));
  let setMix: string[] = Array.isArray(obj.setMix)
    ? ((obj.setMix as unknown[]).filter(
        (s) => typeof s === "string",
      ) as string[])
    : [];
  if (setMix.length === 0) setMix = ["Beta"];
  const rawTimeLimit = n(obj.timeLimit);
  const candidateTime =
    Number.isFinite(rawTimeLimit) && rawTimeLimit > 0
      ? Math.floor(rawTimeLimit)
      : 40;
  // Clamp to protocol bounds (15..90)
  const timeLimit = Math.max(15, Math.min(90, candidateTime));
  const cstRaw = n(obj.constructionStartTime);
  const constructionStartTime =
    Number.isFinite(cstRaw) && cstRaw > 0 ? Math.floor(cstRaw) : Date.now();
  const replaceAvatars = !!obj.replaceAvatars;
  // Keep original packCounts if it was an object; otherwise omit
  const pcOut = Object.keys(packCounts).length
    ? Object.fromEntries(
        entries.map(([k, v]) => [String(k), Number(n(v)) || 0]),
      )
    : undefined;
  return {
    packCount,
    setMix,
    timeLimit,
    constructionStartTime,
    ...(pcOut ? { packCounts: pcOut } : {}),
    replaceAvatars,
  };
}

function normalizeMatchInfoClient(
  input: unknown,
): Record<string, unknown> | null {
  if (!input || typeof input !== "object") return null;
  const match = { ...(input as Record<string, unknown>) };

  const coerceOptionalStringField = (key: string) => {
    const value = match[key];
    if (value == null) {
      delete match[key];
      return;
    }
    if (typeof value !== "string") {
      try {
        match[key] = String(value);
      } catch {
        delete match[key];
      }
    }
  };

  const coerceNullableStringField = (key: string) => {
    const value = match[key];
    if (value == null) {
      match[key] = null;
      return;
    }
    if (typeof value !== "string") {
      try {
        match[key] = String(value);
      } catch {
        match[key] = null;
      }
    }
  };

  [
    "id",
    "lobbyId",
    "lobbyName",
    "tournamentId",
    "draftSessionId",
    "seed",
    "turn",
  ].forEach(coerceOptionalStringField);
  coerceNullableStringField("winnerId");

  const arrayFromUnknown = (value: unknown): unknown[] => {
    if (Array.isArray(value)) return value;
    if (value instanceof Map) return Array.from(value.values());
    if (value && typeof value === "object") {
      return Object.values(value as Record<string, unknown>);
    }
    return [];
  };

  const mapToRecord = (value: unknown): Record<string, unknown> | undefined => {
    if (!value) return undefined;
    if (value instanceof Map) return Object.fromEntries(value);
    if (Array.isArray(value)) {
      const entries = value.filter(
        (item): item is [string, unknown] =>
          Array.isArray(item) &&
          item.length === 2 &&
          typeof item[0] === "string",
      );
      if (entries.length > 0) return Object.fromEntries(entries);
      return undefined;
    }
    if (typeof value === "object") return value as Record<string, unknown>;
    return undefined;
  };

  const sanitizePlayers = (value: unknown): unknown[] => {
    const arr = arrayFromUnknown(value);
    return arr
      .map((entry) => {
        if (!entry || typeof entry !== "object") return null;
        const player = { ...(entry as Record<string, unknown>) };
        if (player.id != null && typeof player.id !== "string") {
          player.id = String(player.id);
        }
        if (
          player.displayName != null &&
          typeof player.displayName !== "string"
        ) {
          player.displayName = String(player.displayName);
        }
        if (player.seat != null && typeof player.seat !== "string") {
          player.seat = String(player.seat);
        }
        if (player.id == null || player.displayName == null) return null;
        return player;
      })
      .filter((p): p is Record<string, unknown> => p !== null);
  };

  const players = sanitizePlayers(match.players);
  match.players = players;

  const playerIds = arrayFromUnknown(match.playerIds).map((id) => String(id));
  match.playerIds = playerIds;

  const deckSubmissions = arrayFromUnknown(match.deckSubmissions)
    .map((id) => String(id))
    .filter((id) => id.length > 0);
  if (deckSubmissions.length > 0) {
    match.deckSubmissions = deckSubmissions;
  } else {
    delete match.deckSubmissions;
  }

  const playerDecks = mapToRecord(match.playerDecks);
  if (playerDecks) {
    match.playerDecks = playerDecks;
  } else {
    delete match.playerDecks;
  }

  const sealedPacks = mapToRecord(match.sealedPacks);
  if (sealedPacks) {
    match.sealedPacks = sealedPacks;
  } else {
    delete match.sealedPacks;
  }

  if (match.sealedConfig !== undefined) {
    match.sealedConfig = normalizeSealedConfigClient(match.sealedConfig);
  }

  if (match.matchType != null && typeof match.matchType !== "string") {
    try {
      match.matchType = String(match.matchType);
    } catch {
      delete match.matchType;
    }
  }

  if (match.status != null && typeof match.status !== "string") {
    try {
      match.status = String(match.status);
    } catch {
      delete match.status;
    }
  }

  return match;
}

function normalizeMatchStartedPayload(payload: unknown): unknown {
  try {
    if (!payload || typeof payload !== "object") return payload;
    const p = payload as { match?: Record<string, unknown> };
    if (!p.match) return payload;
    const sanitized = normalizeMatchInfoClient(p.match);
    if (!sanitized) return payload;
    return { ...p, match: sanitized };
  } catch {
    return payload;
  }
}

function normalizeResyncResponsePayload(payload: unknown): unknown {
  try {
    if (!payload || typeof payload !== "object") return payload;
    const p = payload as { snapshot?: { match?: Record<string, unknown> } };
    if (!p.snapshot || !p.snapshot.match) return payload;
    const sanitized = normalizeMatchInfoClient(p.snapshot.match);
    if (!sanitized) return payload;
    return { ...p, snapshot: { ...p.snapshot, match: sanitized } };
  } catch {
    return payload;
  }
}

// Auth failure tracking - uses exponential backoff AND hard stop after max failures
const AUTH_FAILURE_RESET_MS = 300000; // Reset failure count after 5 minutes
const AUTH_BACKOFF_DELAYS = [2000, 5000, 10000, 30000, 60000]; // 2s, 5s, 10s, 30s, 60s
const MAX_AUTH_FAILURES = 10; // Stop reconnecting entirely after this many auth failures

// Client version for server compatibility check
// Increment this when making breaking changes that require client refresh
export const CLIENT_PROTOCOL_VERSION = 2;

// Token caching handled by socketTokenCache.ts

export class SocketTransport implements GameTransport {
  private handlers: Partial<
    Record<TransportEvent, Set<(payload: unknown) => void>>
  > = {};
  private socket?: Socket;
  private reconnectionAttempts = 0;
  private maxReconnectionAttempts =
    Number.isFinite(RECONNECT_ATTEMPTS_ENV) && RECONNECT_ATTEMPTS_ENV > 0
      ? RECONNECT_ATTEMPTS_ENV
      : Number.POSITIVE_INFINITY;
  private reconnectionDelay = 1000; // Start with 1 second
  private reconnectionDelayMax =
    Number.isFinite(RECONNECT_DELAY_MAX_ENV) && RECONNECT_DELAY_MAX_ENV > 0
      ? RECONNECT_DELAY_MAX_ENV
      : 30000;
  private connectionState:
    | "disconnected"
    | "connecting"
    | "connected"
    | "reconnecting" = "disconnected";
  private isIntentionalDisconnect = false;
  private genericHandlers: Map<string, Set<(payload: unknown) => void>> =
    new Map();
  private inflightWatch: Map<string, Promise<void>> = new Map();

  // Auth failure tracking - prevents infinite reconnection when user is not authenticated
  private authFailureCount = 0;
  private lastAuthFailureTime = 0;

  // Visibility change handler for reconnection on tab focus
  private visibilityHandler: (() => void) | null = null;
  private connectionOpts: { playerId?: string; displayName: string } | null =
    null;

  private static getMessageType(m: unknown): string {
    if (
      m &&
      typeof m === "object" &&
      "type" in (m as Record<string, unknown>)
    ) {
      const t = (m as Record<string, unknown>).type;
      return typeof t === "string" ? t : "unknown";
    }
    return "unknown";
  }

  private getAuthBackoffDelay(): number {
    const index = Math.min(
      this.authFailureCount,
      AUTH_BACKOFF_DELAYS.length - 1,
    );
    return AUTH_BACKOFF_DELAYS[index];
  }

  private shouldDelayReconnection(): boolean {
    // Reset failure count if enough time has passed
    if (Date.now() - this.lastAuthFailureTime > AUTH_FAILURE_RESET_MS) {
      this.authFailureCount = 0;
      return false;
    }

    // If we have failures, check if enough time has passed since last failure
    if (this.authFailureCount > 0) {
      const backoffDelay = this.getAuthBackoffDelay();
      const timeSinceLastFailure = Date.now() - this.lastAuthFailureTime;
      return timeSinceLastFailure < backoffDelay;
    }

    return false;
  }

  private recordAuthFailure(): number {
    this.authFailureCount++;
    this.lastAuthFailureTime = Date.now();
    const delay = this.getAuthBackoffDelay();
    if (this.authFailureCount > 2) {
      console.warn(
        `[Transport] Auth failure #${
          this.authFailureCount
        }/${MAX_AUTH_FAILURES}, backing off for ${delay / 1000}s`,
      );
    }
    return delay;
  }

  private hasExceededMaxAuthFailures(): boolean {
    return this.authFailureCount >= MAX_AUTH_FAILURES;
  }

  private resetAuthFailures(): void {
    // Auth failures reset silently
    this.authFailureCount = 0;
    this.lastAuthFailureTime = 0;
  }

  private setupVisibilityHandler(): void {
    if (typeof document === "undefined") return;
    if (this.visibilityHandler) return; // Already set up

    this.visibilityHandler = async () => {
      if (document.visibilityState !== "visible") return;

      // Check if socket exists but is disconnected
      if (
        this.socket &&
        !this.socket.connected &&
        !this.isIntentionalDisconnect
      ) {
        // Tab visible - reconnecting silently

        // Refresh token before reconnecting (rate-limited)
        try {
          const token = await fetchSocketToken();
          type ManagerWithOpts = {
            opts: { auth?: Record<string, unknown> };
            reconnection: boolean;
          };
          const mgr = this.socket.io as unknown as ManagerWithOpts;
          if (token) {
            mgr.opts.auth = { token };
          }
          mgr.reconnection = true;
          this.connectionState = "reconnecting";
          this.socket.connect();
        } catch (e) {
          console.warn(
            "[Transport] Failed to refresh token on visibility change:",
            e,
          );
          // Still try to reconnect with existing auth
          this.connectionState = "reconnecting";
          this.socket.connect();
        }
      }
    };

    document.addEventListener("visibilitychange", this.visibilityHandler);
  }

  private cleanupVisibilityHandler(): void {
    if (typeof document === "undefined") return;
    if (this.visibilityHandler) {
      document.removeEventListener("visibilitychange", this.visibilityHandler);
      this.visibilityHandler = null;
    }
  }

  getConnectionState():
    | "disconnected"
    | "connecting"
    | "connected"
    | "reconnecting" {
    return this.connectionState;
  }

  isConnected(): boolean {
    return this.connectionState === "connected";
  }

  /**
   * Get the underlying socket.io Socket instance
   * Use this to share the socket with other hooks (e.g., useTournamentSocket)
   * instead of creating duplicate connections
   */
  getSocket(): Socket | null {
    return this.socket ?? null;
  }

  // Track if we're in the middle of connecting to prevent duplicate connections
  private connectingPromise: Promise<void> | null = null;

  async connect(opts: {
    playerId?: string;
    displayName: string;
  }): Promise<void> {
    // Already connected - return immediately
    if (this.socket && this.socket.connected) return;

    // Already connecting - wait for the existing connection attempt
    if (this.connectingPromise) {
      // Connection already in progress
      return this.connectingPromise;
    }

    // Socket exists but disconnected - try to reconnect existing socket first
    if (
      this.socket &&
      !this.socket.connected &&
      !this.isIntentionalDisconnect
    ) {
      // Reconnecting existing socket
      this.socket.connect();
      return;
    }

    this.connectionState = "connecting";
    this.isIntentionalDisconnect = false;

    // Wrap the entire connection in a tracked promise
    this.connectingPromise = this.doConnect(opts);
    try {
      await this.connectingPromise;
    } finally {
      this.connectingPromise = null;
    }
  }

  private async doConnect(opts: {
    playerId?: string;
    displayName: string;
  }): Promise<void> {
    // Prefer explicit env; otherwise use the standard local Socket.IO dev port (3010)
    // Client runs on 3000/3002; signaling server on 3010.
    const defaultUrl = "http://localhost:3010";
    const url = process.env.NEXT_PUBLIC_WS_URL || defaultUrl;
    const path = process.env.NEXT_PUBLIC_WS_PATH || undefined;
    const transportsEnv = (
      process.env.NEXT_PUBLIC_WS_TRANSPORTS || "websocket,polling"
    )
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean) as Array<"polling" | "websocket">;
    // Sanitize and fallback the display name to avoid validation issues
    const trimmed = (opts.displayName ?? "").trim();
    const finalName = (trimmed || "Player").slice(0, 40);
    // Connection initiated silently - errors will be logged
    // Fetch short-lived auth token from app API (signed by NEXTAUTH_SECRET)
    // Uses rate-limited helper to prevent spam during rapid reconnection cycles
    const token = await fetchSocketToken();

    const socket = io(url, {
      transports: transportsEnv.length
        ? transportsEnv
        : ["websocket", "polling"],
      autoConnect: true,
      path,
      reconnection: true,
      reconnectionAttempts: Number.isFinite(this.maxReconnectionAttempts)
        ? this.maxReconnectionAttempts
        : undefined,
      reconnectionDelay: this.reconnectionDelay,
      reconnectionDelayMax: this.reconnectionDelayMax,
      timeout:
        Number.isFinite(WS_TIMEOUT_ENV) && WS_TIMEOUT_ENV > 5000
          ? WS_TIMEOUT_ENV
          : 45000,
      withCredentials: true,
      auth: { token, clientVersion: CLIENT_PROTOCOL_VERSION },
    }) as Socket;

    if (this.socket) {
      this.detachGenericHandlers(this.socket);
    }

    this.socket = socket;
    this.connectionOpts = opts; // Store for visibility-triggered reconnects
    this.setupReconnectionHandlers(socket, opts);
    this.attachGenericHandlers(socket);
    this.setupVisibilityHandler();

    await new Promise<void>((resolve, reject) => {
      let resolved = false;
      const sendHello = () => {
        socket.emit(
          "hello",
          Protocol.HelloPayload.parse({
            displayName: finalName,
            playerId: opts.playerId,
          }),
        );
      };
      const onError = (err: unknown) => {
        if (!resolved) reject(err);
      };

      const onWelcome = () => {
        if (!resolved) {
          resolved = true;
          this.connectionState = "connected";
          resolve();
        }
      };

      // Send hello on every connect (initial and reconnects)
      socket.on("connect", () => {
        this.reconnectionAttempts = 0;
        this.reconnectionDelay = 1000;
        sendHello();
      });

      // Wait for welcome response before considering connection complete
      socket.once("welcome", onWelcome);
      socket.once("connect_error", onError);

      // Wire server events
      socket.on("welcome", (payload) =>
        this.dispatch("welcome", Protocol.WelcomePayload.parse(payload)),
      );
      socket.on("lobbyUpdated", (payload) =>
        this.dispatch(
          "lobbyUpdated",
          Protocol.LobbyUpdatedPayload.parse(payload),
        ),
      );
      socket.on("joinedLobby", (payload) =>
        this.dispatch(
          "lobbyUpdated",
          Protocol.JoinedLobbyPayload.parse(payload),
        ),
      );
      socket.on("lobbiesUpdated", (payload) =>
        this.dispatch(
          "lobbiesUpdated",
          Protocol.LobbiesUpdatedPayload.parse(payload),
        ),
      );
      socket.on("playerList", (payload) =>
        this.dispatch("playerList", Protocol.PlayerListPayload.parse(payload)),
      );
      socket.on("lobbyInvite", (payload) =>
        this.dispatch(
          "lobbyInvite",
          Protocol.LobbyInvitePayload.parse(payload),
        ),
      );
      socket.on("inviteResponseReceived", (payload) =>
        this.dispatch(
          "inviteResponseReceived",
          Protocol.InviteResponsePayload.parse(payload),
        ),
      );
      socket.on("matchStarted", (payload) => {
        const fixed = normalizeMatchStartedPayload(payload);
        this.dispatch(
          "matchStarted",
          Protocol.MatchStartedPayload.parse(fixed),
        );
      });
      socket.on("statePatch", (payload) =>
        this.dispatch("statePatch", Protocol.StatePatchPayload.parse(payload)),
      );
      // D20 acknowledgment - server confirms receipt of D20 roll
      socket.on("d20Ack", (payload) => {
        const p = payload as {
          matchId: string;
          seat: string;
          roll: number | null;
          t: number;
        };
        // d20Ack received silently
        this.dispatch("d20Ack", p);
      });
      // Draft updates (server-emitted, custom payload)
      socket.on("draftUpdate", (payload) => {
        const s = payload as DraftState;
        const myPackSize =
          s.currentPacks && Array.isArray(s.currentPacks[0])
            ? (s.currentPacks[0] as unknown[]).length
            : 0;
        console.log(
          `[Transport] draftUpdate <= phase=${s?.phase} pack=${
            s?.packIndex
          } pick=${s?.pickNumber} waitingFor=${
            (s?.waitingFor || []).length
          } (p1 pack ~${myPackSize})`,
        );
        this.dispatch(
          "draftUpdate",
          payload as unknown as TransportEventMap["draftUpdate"],
        );
      });
      socket.on("chat", (payload) =>
        this.dispatch("chat", Protocol.ServerChatPayload.parse(payload)),
      );
      socket.on("chatHistory", (payload) => {
        const p = payload as {
          messages?: unknown[];
          hasMore?: boolean;
          oldestIndex?: number;
        };
        if (Array.isArray(p?.messages)) {
          const messages = p.messages
            .map((m) => {
              try {
                return Protocol.ServerChatPayload.parse(m);
              } catch {
                return null;
              }
            })
            .filter(
              (m): m is import("@/lib/net/protocol").ServerChatPayloadT =>
                m !== null,
            );
          this.dispatch("chatHistory", {
            messages,
            hasMore: p.hasMore ?? false,
            oldestIndex: p.oldestIndex ?? messages.length,
          });
        }
      });
      socket.on("interaction", (payload) => {
        this.dispatch("interaction", payload as InteractionEnvelope);
      });
      socket.on("interaction:request", (payload) => {
        this.dispatch(
          "interaction:request",
          payload as InteractionRequestMessage,
        );
      });
      socket.on("interaction:response", (payload) => {
        this.dispatch(
          "interaction:response",
          payload as InteractionResponseMessage,
        );
      });
      socket.on("interaction:result", (payload) => {
        this.dispatch(
          "interaction:result",
          payload as TransportEventMap["interaction:result"],
        );
      });
      // Generic lightweight messages (e.g., draft ready toggles)
      socket.on("message", (payload) => {
        const m = payload as TransportEventMap["message"];
        const t = SocketTransport.getMessageType(m);
        if (t !== "boardCursor") {
          // Incoming message logged only in debug mode
        }
        this.dispatch("message", m);
      });
      socket.on("boardCursor", (payload) => {
        this.dispatch("boardCursor", payload as RemoteCursorState);
      });
      socket.on("resyncResponse", (payload) => {
        const fixed = normalizeResyncResponsePayload(payload);
        this.dispatch("resync", Protocol.ResyncResponsePayload.parse(fixed));
      });
      socket.on("error", (payload) =>
        this.dispatch("error", Protocol.ErrorPayload.parse(payload)),
      );
      socket.on("connect_error", (err: unknown) => {
        console.warn(`[Transport] Connection error:`, err);
        this.connectionState = "disconnected";
        this.dispatch("error", { message: String(err) });
      });

      // Draft-3D enhanced events for online integration
      socket.on("draft:card:preview", (payload) =>
        this.dispatch("draft:card:preview", payload),
      );
      socket.on("draft:card:preview_update", (payload) =>
        this.dispatch("draft:card:preview_update", payload),
      );
      socket.on("draft:stack:interact", (payload) =>
        this.dispatch("draft:stack:interact", payload),
      );
      socket.on("draft:stack:interaction_result", (payload) =>
        this.dispatch("draft:stack:interaction_result", payload),
      );
      socket.on("draft:stack:state_sync", (payload) =>
        this.dispatch("draft:stack:state_sync", payload),
      );
      socket.on("draft:ui:update", (payload) =>
        this.dispatch("draft:ui:update", payload),
      );
      socket.on("draft:ui:sync_batch", (payload) =>
        this.dispatch("draft:ui:sync_batch", payload),
      );
      socket.on("draft:session:join", (payload) =>
        this.dispatch("draft:session:join", payload),
      );
      socket.on("draft:session:joined", (payload) =>
        this.dispatch("draft:session:joined", payload),
      );
      socket.on("draft:session:leave", (payload) =>
        this.dispatch("draft:session:leave", payload),
      );
      socket.on("draft:session:presence", (payload) =>
        this.dispatch(
          "draft:session:presence",
          payload as TransportEventMap["draft:session:presence"],
        ),
      );
      socket.on("draft:error", (payload) =>
        this.dispatch("draft:error", payload),
      );
      socket.on("draft:system:reconnect", (payload) =>
        this.dispatch("draft:system:reconnect", payload),
      );

      // Lightweight deck submission acknowledgement
      socket.on("deckAccepted", (payload) => {
        const p = payload as {
          matchId: string;
          playerId: string;
          mode: string;
          counts?: unknown;
          ts?: number;
        };
        console.log(
          `[Transport] deckAccepted <= mode=${p?.mode} match=${p?.matchId} player=${p?.playerId}`,
        );
        this.dispatch("message", {
          type: "deckAccepted",
          ...p,
        } as unknown as TransportEventMap["message"]);
      });

      // Tournament events
      socket.on("tournamentCreated", (payload) =>
        this.dispatch("tournamentCreated", payload),
      );
      socket.on("tournamentUpdated", (payload) =>
        this.dispatch("tournamentUpdated", payload),
      );
      socket.on("tournamentJoined", (payload) =>
        this.dispatch("tournamentJoined", payload),
      );
      socket.on("tournamentLeft", (payload) =>
        this.dispatch("tournamentLeft", payload),
      );
      socket.on("tournamentStarted", (payload) =>
        this.dispatch("tournamentStarted", payload),
      );
      socket.on("tournamentRoundStarted", (payload) =>
        this.dispatch("tournamentRoundStarted", payload),
      );
      socket.on("tournamentMatchReady", (payload) =>
        this.dispatch("tournamentMatchReady", payload),
      );
      socket.on("tournamentCompleted", (payload) =>
        this.dispatch("tournamentCompleted", payload),
      );
      socket.on("tournamentsListUpdated", (payload) =>
        this.dispatch("tournamentsListUpdated", payload),
      );
    });

    // Refresh token prior to reconnection attempts
    // CRITICAL: Use synchronous token check first to prevent stale token reconnection
    type ManagerWithOpts = {
      opts: { auth?: Record<string, unknown> };
      reconnection: boolean;
    };
    (this.socket as Socket).io.on("reconnect_attempt", async () => {
      const mgr = (this.socket as Socket).io as unknown as ManagerWithOpts;

      // First, try to use cached token synchronously (this actually updates opts.auth before reconnect)
      const cachedToken = getCachedTokenSync();
      if (cachedToken) {
        mgr.opts.auth = { token: cachedToken };
        return; // Let reconnection proceed with cached token
      }

      // No valid cached token - disable reconnection until we get a fresh one
      // Fetching fresh token for reconnect
      mgr.reconnection = false;

      const token = await fetchSocketToken();
      if (token) {
        mgr.opts.auth = { token };
        mgr.reconnection = true;
        // Manually trigger reconnect since we disabled it
        if (
          !(this.socket as Socket).connected &&
          !this.isIntentionalDisconnect
        ) {
          (this.socket as Socket).connect();
        }
      }
    });
  }

  async watchMatch(matchId: string, token?: string): Promise<void> {
    console.log("[Transport] watchMatch called for:", matchId);
    const s = this.requireSocket();
    if (!s.connected) {
      console.error("[Transport] Socket not connected!");
      throw new Error("Socket not connected");
    }
    const existing = this.inflightWatch.get(matchId);
    if (existing) return existing;
    const promise = new Promise<void>((resolve, reject) => {
      const onMatch = (payload: unknown) => {
        const fixed = normalizeMatchStartedPayload(payload);
        console.log("[Transport] Received matchStarted (normalized)", fixed);
        const parsed = Protocol.MatchStartedPayload.parse(fixed);
        this.dispatch("matchStarted", parsed);
        s.off("matchStarted", onMatch);
        s.off("match:error", onError);
        s.off("watch:error", onError);
        resolve();
      };
      const onError = (payload: unknown) => {
        const err = payload as { matchId?: string; message?: string };
        if (!err || err.matchId !== matchId) return;
        s.off("matchStarted", onMatch);
        s.off("match:error", onError);
        s.off("watch:error", onError);
        reject(new Error(err.message || "Unable to watch match"));
      };
      s.on("matchStarted", onMatch);
      s.on("match:error", onError);
      s.on("watch:error", onError);
      const payload = Protocol.WatchMatchPayload.parse({ matchId, token });
      console.log("[Transport] Emitting watchMatch with payload:", payload);
      s.emit("watchMatch", payload);
    }).finally(() => {
      this.inflightWatch.delete(matchId);
    });
    this.inflightWatch.set(matchId, promise);
    return promise;
  }

  leaveLobby(): void {
    this.requireSocket().emit(
      "leaveLobby",
      Protocol.LeaveLobbyPayload.parse({}),
    );
  }

  disconnect(): void {
    if (!this.socket) return;
    this.isIntentionalDisconnect = true;
    this.connectionState = "disconnected";
    this.cleanupVisibilityHandler();
    this.socket.disconnect();
    this.socket = undefined;
    this.connectionOpts = null;
  }

  async joinLobby(lobbyId?: string): Promise<{ lobbyId: string }> {
    const s = this.requireSocket();

    return new Promise((resolve) => {
      const onJoin = (payload: unknown) => {
        const parsed = Protocol.JoinedLobbyPayload.parse(payload);
        this.dispatch("lobbyUpdated", parsed);
        s.off("joinedLobby", onJoin);
        resolve({ lobbyId: parsed.lobby.id });
      };
      s.on("joinedLobby", onJoin);
      s.emit("joinLobby", Protocol.JoinLobbyPayload.parse({ lobbyId }));
    });
  }

  async createLobby(options?: {
    name?: string;
    visibility?: LobbyVisibility;
    maxPlayers?: number;
  }): Promise<{ lobbyId: string }> {
    const s = this.requireSocket();
    const name = options?.name;
    const visibility = options?.visibility;
    const maxPlayers = options?.maxPlayers;
    return new Promise((resolve) => {
      const onJoin = (payload: unknown) => {
        const parsed = Protocol.JoinedLobbyPayload.parse(payload);
        this.dispatch("lobbyUpdated", parsed);
        s.off("joinedLobby", onJoin);
        resolve({ lobbyId: parsed.lobby.id });
      };
      s.on("joinedLobby", onJoin);
      s.emit(
        "createLobby",
        Protocol.CreateLobbyPayload.parse({ name, visibility, maxPlayers }),
      );
    });
  }

  async joinMatch(matchId: string): Promise<void> {
    console.log("[Transport] joinMatch called for:", matchId);
    const s = this.requireSocket();
    if (!s.connected) {
      console.error("[Transport] Socket not connected!");
      throw new Error("Socket not connected");
    }

    console.log("[Transport] Socket connected, emitting joinMatch");
    return new Promise((resolve, reject) => {
      const onMatch = (payload: unknown) => {
        const fixed = normalizeMatchStartedPayload(payload);
        console.log("[Transport] Received matchStarted (normalized)", fixed);
        const parsed = Protocol.MatchStartedPayload.parse(fixed);
        this.dispatch("matchStarted", parsed);
        s.off("matchStarted", onMatch);
        s.off("match:error", onError);
        resolve();
      };
      const onError = (payload: unknown) => {
        const err = payload as { matchId?: string; message?: string };
        if (!err || err.matchId !== matchId) return;
        s.off("matchStarted", onMatch);
        s.off("match:error", onError);
        reject(new Error(err.message || "Unable to join match"));
      };
      s.on("matchStarted", onMatch);
      s.on("match:error", onError);
      const payload = Protocol.JoinMatchPayload.parse({ matchId });
      console.log("[Transport] Emitting joinMatch with payload:", payload);
      s.emit("joinMatch", payload);
    });
  }

  leaveMatch(): void {
    this.requireSocket().emit(
      "leaveMatch",
      Protocol.LeaveMatchPayload.parse({}),
    );
  }

  ready(ready: boolean): void {
    this.requireSocket().emit("ready", Protocol.ReadyPayload.parse({ ready }));
  }

  startMatch(matchConfig?: StartMatchConfig): void {
    this.requireSocket().emit(
      "startMatch",
      matchConfig ? matchConfig : Protocol.StartMatchPayload.parse({}),
    );
  }

  sendAction(action: unknown): void {
    this.requireSocket().emit(
      "action",
      Protocol.ActionPayload.parse({ action }),
    );
  }

  // Explicit mulligan completion signal (per-player)
  mulliganDone(): void {
    this.requireSocket().emit(
      "mulliganDone",
      Protocol.MulliganDonePayload.parse({}),
    );
  }

  sendChat(content: string, scope?: ChatScope): void {
    this.requireSocket().emit(
      "chat",
      Protocol.ChatPayload.parse({ content, scope }),
    );
  }

  requestChatHistory(before?: number, limit?: number): void {
    this.requireSocket().emit("chatHistory:request", { before, limit });
  }

  // Generic lightweight message channel for transient signals (e.g., draft ready)
  sendMessage(msg: CustomMessage): void {
    const t = SocketTransport.getMessageType(msg);
    if (t !== "boardCursor") {
      // Outgoing message logged only in debug mode
    }
    this.requireSocket().emit("message", msg);
  }

  sendInteractionEnvelope(envelope: InteractionEnvelope): void {
    this.requireSocket().emit("interaction", envelope);
  }

  sendInteractionRequest(message: InteractionRequestMessage): void {
    this.requireSocket().emit("interaction:request", message);
  }

  sendInteractionResponse(message: InteractionResponseMessage): void {
    this.requireSocket().emit("interaction:response", message);
  }

  resync(): void {
    this.requireSocket().emit(
      "resyncRequest",
      Protocol.ResyncRequestPayload.parse({}),
    );
  }

  requestLobbies(): void {
    this.requireSocket().emit(
      "requestLobbies",
      Protocol.RequestLobbiesPayload.parse({}),
    );
  }

  requestPlayers(): void {
    this.requireSocket().emit(
      "requestPlayers",
      Protocol.RequestPlayersPayload.parse({}),
    );
  }

  setLobbyVisibility(visibility: LobbyVisibility): void {
    this.requireSocket().emit(
      "setLobbyVisibility",
      Protocol.SetLobbyVisibilityPayload.parse({ visibility }),
    );
  }

  inviteToLobby(targetPlayerId: string, lobbyId?: string): void {
    this.requireSocket().emit(
      "inviteToLobby",
      Protocol.InviteToLobbyPayload.parse({ targetPlayerId, lobbyId }),
    );
  }

  setLocation(location: PlayerLocation): void {
    this.requireSocket().emit("setLocation", { location });
  }

  respondToInvite(lobbyId: string, response: "declined" | "postponed"): void {
    this.requireSocket().emit("inviteResponse", { lobbyId, response });
  }

  setLobbyPlan(planned: "constructed" | "sealed" | "draft"): void {
    this.requireSocket().emit(
      "setLobbyPlan",
      Protocol.SetLobbyPlanPayload.parse({ plannedMatchType: planned }),
    );
  }

  openLobby(): void {
    this.requireSocket().emit("openLobby");
  }

  addCpuBot(displayName?: string): void {
    // Host-only server handler will validate permissions.
    // Optional displayName allows picking a difficulty label.
    this.requireSocket().emit("addCpuBot", displayName ? { displayName } : {});
  }

  removeCpuBot(playerId?: string): void {
    // Host-only server handler will validate permissions.
    this.requireSocket().emit("removeCpuBot", playerId ? { playerId } : {});
  }

  submitDeck(deck: unknown): void {
    this.requireSocket().emit("submitDeck", { deck });
  }

  // Draft-specific methods
  async startDraft(config: {
    matchId: string;
    draftConfig: DraftConfig;
  }): Promise<void> {
    // Server currently derives match by socket's player; payload is optional
    console.log(
      `[Transport] startDraft -> match=${config.matchId} cfg=${JSON.stringify(
        config.draftConfig,
      )}`,
    );
    this.requireSocket().emit("startDraft", config);
  }

  makeDraftPick(config: {
    matchId: string;
    cardId: string;
    packIndex: number;
    pickNumber: number;
  }): void {
    console.log(
      `[Transport] makeDraftPick -> cardId=${config.cardId} pack=${config.packIndex} pick=${config.pickNumber} match=${config.matchId}`,
    );
    this.requireSocket().emit("makeDraftPick", config);
  }

  chooseDraftPack(config: {
    matchId: string;
    setChoice: string;
    packIndex: number;
  }): void {
    console.log(
      `[Transport] chooseDraftPack -> pack=${config.packIndex} choice=${config.setChoice} match=${config.matchId}`,
    );
    this.requireSocket().emit("chooseDraftPack", config);
  }

  // Draft-3D enhanced methods for online integration
  sendCardPreview(event: CardPreviewEvent): void {
    console.log(
      `[Transport] sendCardPreview -> cardId=${event.cardId} playerId=${event.playerId} type=${event.previewType}`,
    );
    this.requireSocket().emit("draft:card:preview", event);
  }

  sendStackInteraction(event: StackInteractionEvent): void {
    console.log(
      `[Transport] sendStackInteraction -> type=${
        event.interactionType
      } cardIds=[${event.cardIds.join(",")}] playerId=${event.playerId}`,
    );
    this.requireSocket().emit("draft:stack:interact", event);
  }

  sendUIUpdate(event: UIUpdateEvent): void {
    console.log(
      `[Transport] sendUIUpdate -> playerId=${event.playerId} updates=${event.uiUpdates.length}`,
    );
    this.requireSocket().emit("draft:ui:update", event);
  }

  // Tournament methods implementation
  async createTournament(config: {
    name: string;
    format: "swiss" | "elimination" | "round_robin";
    matchType: "constructed" | "sealed" | "draft";
    maxPlayers: number;
    sealedConfig?: unknown;
    draftConfig?: unknown;
  }): Promise<{ tournamentId: string }> {
    const s = this.requireSocket();
    return new Promise((resolve, reject) => {
      const onCreated = (payload: unknown) => {
        const tournament = payload as { id: string };
        s.off("tournamentCreated", onCreated);
        resolve({ tournamentId: tournament.id });
      };
      const onError = (error: unknown) => {
        s.off("error", onError);
        reject(error);
      };
      s.on("tournamentCreated", onCreated);
      s.on("error", onError);
      s.emit("createTournament", config);
    });
  }

  async joinTournament(
    tournamentId: string,
    displayName?: string,
  ): Promise<void> {
    const s = this.requireSocket();
    return new Promise((resolve, reject) => {
      const onJoined = (payload: unknown) => {
        const data = payload as { tournamentId: string };
        if (data.tournamentId === tournamentId) {
          s.off("tournamentJoined", onJoined);
          resolve();
        }
      };
      const onError = (error: unknown) => {
        s.off("error", onError);
        reject(error);
      };
      s.on("tournamentJoined", onJoined);
      s.on("error", onError);
      s.emit("joinTournament", { tournamentId, displayName });
    });
  }

  async leaveTournament(tournamentId: string): Promise<void> {
    const s = this.requireSocket();
    return new Promise((resolve, reject) => {
      const onLeft = (payload: unknown) => {
        const data = payload as { tournamentId: string };
        if (data.tournamentId === tournamentId) {
          s.off("tournamentLeft", onLeft);
          resolve();
        }
      };
      const onError = (error: unknown) => {
        s.off("error", onError);
        reject(error);
      };
      s.on("tournamentLeft", onLeft);
      s.on("error", onError);
      s.emit("leaveTournament", { tournamentId });
    });
  }

  async startTournament(tournamentId: string): Promise<void> {
    const s = this.requireSocket();
    return new Promise((resolve, reject) => {
      const onStarted = (payload: unknown) => {
        const data = payload as { tournamentId: string };
        if (data.tournamentId === tournamentId) {
          s.off("tournamentStarted", onStarted);
          resolve();
        }
      };
      const onError = (error: unknown) => {
        s.off("error", onError);
        reject(error);
      };
      s.on("tournamentStarted", onStarted);
      s.on("error", onError);
      s.emit("startTournament", { tournamentId });
    });
  }

  requestTournaments(): void {
    console.log(`[Transport] Requesting tournaments list`);
    this.requireSocket().emit("requestTournaments", {});
  }

  on<E extends TransportEvent>(
    event: E,
    handler: TransportHandler<E>,
  ): () => void {
    const set = (this.handlers[event] ??= new Set());
    // Store as unknown-typed wrapper to satisfy our internal map
    const wrapper: (payload: unknown) => void = (payload) =>
      handler(payload as TransportEventMap[E]);
    set.add(wrapper);
    return () => set.delete(wrapper);
  }

  private dispatch<E extends TransportEvent>(
    event: E,
    payload: TransportEventMap[E],
  ) {
    const set = this.handlers[event];
    if (!set) return;
    for (const h of Array.from(set)) h(payload as unknown);
  }

  private setupReconnectionHandlers(
    socket: Socket,
    opts: { playerId?: string; displayName: string },
  ): void {
    socket.on("disconnect", (reason: string) => {
      // Disconnect reason logged only for debugging
      this.connectionState = "disconnected";

      if (!this.isIntentionalDisconnect) {
        const shouldRetry =
          reason === "io server disconnect" ||
          reason === "transport close" ||
          reason === "transport error" ||
          reason === "ping timeout";
        if (shouldRetry) {
          this.attemptReconnection(opts);
        }
      }
    });

    socket.on("connect_error", async (error: Error) => {
      const msg = error?.message?.toLowerCase() || "";

      // CRITICAL: If server says client is outdated, force page refresh immediately
      if (msg.includes("version_outdated") || msg.includes("client_outdated")) {
        console.error(
          "[Transport] Client version outdated - forcing page refresh",
        );
        if (typeof window !== "undefined") {
          // Force hard refresh to get new client code
          window.location.reload();
        }
        return;
      }

      const isAuthError =
        msg.includes("token") ||
        msg.includes("jwt") ||
        msg.includes("unauthor") ||
        msg.includes("invalid") ||
        msg.includes("rate_limited");

      // CRITICAL: If we've exceeded max auth failures, stop immediately
      if (isAuthError && this.hasExceededMaxAuthFailures()) {
        console.error(
          "[Transport] Max auth failures already reached - ignoring connect_error",
        );
        return;
      }

      // Only log non-auth errors at warn level (auth errors are expected during token refresh)
      if (isAuthError) {
        // Auth error - refreshing token silently
      } else {
        console.warn("[Transport] Connect error:", error);
        if (!this.isIntentionalDisconnect) {
          this.connectionState = "reconnecting";
          this.attemptReconnection(opts);
        }
        return;
      }

      // CRITICAL: Temporarily disable socket.io's auto-reconnection to prevent
      // it from racing ahead with the old token while we fetch a new one
      type ManagerWithOpts = {
        opts: { auth?: Record<string, unknown> };
        reconnection: boolean;
      };
      const mgr = socket.io as unknown as ManagerWithOpts;
      mgr.reconnection = false;

      // Check if we should wait before trying again (exponential backoff)
      if (this.shouldDelayReconnection()) {
        const delay = this.getAuthBackoffDelay();
        // Backing off before retry
        setTimeout(() => {
          mgr.reconnection = true;
          if (!socket.connected && !this.isIntentionalDisconnect) {
            socket.connect();
          }
        }, delay);
        return;
      }

      // Clear cached token on auth error - we need a fresh one
      clearSocketTokenCache();

      try {
        // Force refresh to bypass cache since we got an auth error
        const token = await fetchSocketToken(true);
        if (token) {
          mgr.opts.auth = { token };
          // Token refreshed - reconnecting
          // Re-enable reconnection and connect
          mgr.reconnection = true;
          if (!socket.connected && !this.isIntentionalDisconnect) {
            socket.connect();
          }
        } else {
          // Token fetch failed (likely 401) - record failure and back off
          console.warn(
            "[Transport] Token fetch failed - user may not be authenticated",
          );
          this.recordAuthFailure();

          // CRITICAL: Stop trying after too many auth failures to prevent infinite loops
          if (this.hasExceededMaxAuthFailures()) {
            console.error(
              `[Transport] Max auth failures (${MAX_AUTH_FAILURES}) reached - stopping reconnection. User must refresh page.`,
            );
            this.connectionState = "disconnected";
            mgr.reconnection = false;
            return; // Stop - don't schedule another retry
          }

          const delay = this.getAuthBackoffDelay();
          // Backing off silently
          setTimeout(() => {
            mgr.reconnection = true;
            if (!socket.connected && !this.isIntentionalDisconnect) {
              socket.connect();
            }
          }, delay);
        }
      } catch (tokenError) {
        console.warn("[Transport] Failed to refresh token:", tokenError);
        // Re-enable reconnection after delay
        const delay = this.getAuthBackoffDelay();
        setTimeout(() => {
          mgr.reconnection = true;
        }, delay);
      }
    });

    socket.on("reconnect", (_attemptNumber: number) => {
      // Reconnected successfully
      this.connectionState = "connected";
      this.reconnectionAttempts = 0;
      this.resetAuthFailures(); // Reset auth failure tracking on successful reconnection
    });

    socket.on("reconnect_error", (error: Error) => {
      console.warn(`[Transport] Reconnection error:`, error);
      this.connectionState = "disconnected";
    });

    socket.on("reconnect_failed", () => {
      console.error("[Transport] All reconnection attempts failed");
      this.connectionState = "disconnected";
      this.dispatch("error", { message: "Failed to reconnect to server" });
    });
  }

  private attemptReconnection(opts: {
    playerId?: string;
    displayName: string;
  }): void {
    // Check if we should delay this attempt (exponential backoff)
    if (this.shouldDelayReconnection()) {
      // Schedule retry after backoff delay
      const delay = this.getAuthBackoffDelay();
      setTimeout(() => this.attemptReconnection(opts), delay);
      return;
    }

    if (
      Number.isFinite(this.maxReconnectionAttempts) &&
      this.reconnectionAttempts >= this.maxReconnectionAttempts
    ) {
      console.error("[Transport] Max reconnection attempts reached");
      return;
    }

    this.connectionState = "reconnecting";
    this.reconnectionAttempts++;

    // Reconnection attempt in progress

    setTimeout(() => {
      if (
        this.connectionState === "reconnecting" &&
        !this.isIntentionalDisconnect
      ) {
        this.connect(opts).catch((error) => {
          console.warn(
            `[Transport] Reconnection attempt ${this.reconnectionAttempts} failed:`,
            error,
          );
          // Exponential backoff
          this.reconnectionDelay = Math.min(
            this.reconnectionDelay * 1.5,
            this.reconnectionDelayMax,
          );
          this.connectionState = "reconnecting";
        });
      }
    }, this.reconnectionDelay);
  }

  private requireSocket(): Socket {
    if (!this.socket || !this.socket.connected) {
      throw new Error(`Socket not connected (state: ${this.connectionState})`);
    }
    return this.socket;
  }

  // Generic methods for replay and other custom events
  emit(event: string, payload?: unknown): void {
    this.requireSocket().emit(event, payload);
  }

  /**
   * Emit an event only if the socket is connected.
   * Returns true if emitted, false if socket not available.
   */
  emitIfConnected(event: string, payload?: unknown): boolean {
    if (this.socket?.connected) {
      this.socket.emit(event, payload);
      return true;
    }
    return false;
  }

  /**
   * Update the stored display name and emit to server if connected.
   * This ensures reconnects use the new name.
   */
  updateDisplayName(newName: string): boolean {
    const trimmed = (newName || "").trim().slice(0, 40) || "Player";
    if (this.connectionOpts) {
      this.connectionOpts.displayName = trimmed;
    }
    return this.emitIfConnected("updateDisplayName", { displayName: trimmed });
  }

  // Generic on/off methods for arbitrary events (used by replay functionality)
  // Note: This overloads the typed 'on' method for specific events
  onGeneric(event: string, handler: (payload: unknown) => void): void {
    let set = this.genericHandlers.get(event);
    if (!set) {
      set = new Set();
      this.genericHandlers.set(event, set);
    }
    if (set.has(handler)) return;
    set.add(handler);
    if (this.socket) {
      this.socket.on(event, handler);
    }
  }

  offGeneric(event: string, handler: (payload: unknown) => void): void {
    const set = this.genericHandlers.get(event);
    if (set) {
      set.delete(handler);
      if (set.size === 0) {
        this.genericHandlers.delete(event);
      }
    }
    if (this.socket) {
      this.socket.off(event, handler);
    }
  }

  private attachGenericHandlers(socket: Socket): void {
    for (const [event, handlers] of this.genericHandlers.entries()) {
      for (const handler of handlers) {
        socket.on(event, handler);
      }
    }
  }

  private detachGenericHandlers(socket: Socket): void {
    for (const [event, handlers] of this.genericHandlers.entries()) {
      for (const handler of handlers) {
        socket.off(event, handler);
      }
    }
  }
}
