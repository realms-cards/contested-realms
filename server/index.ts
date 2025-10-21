// Simple Socket.IO server for Sorcery online MVP
// Run with: npm run server:dev (development) or npm run server:start (production)

// T019: Import extracted modules
const { createBootstrap } = require("./core/bootstrap");
const { createPersistenceLayer } = require("./core/persistence");
const { createContainer } = require("./core/container");
const { registerFeatures } = require("./features");
const {
  createInteractionModule,
  INTERACTION_VERSION,
  INTERACTION_ENFORCEMENT_ENABLED,
  INTERACTION_REQUEST_KINDS,
  INTERACTION_DECISIONS,
} = require("./modules/interactions") as typeof import("./modules/interactions");
const modules = require("./modules") as typeof import("./modules");
const tournamentModules = modules.tournament;
const draftModules = modules.draft;
const { replay } = modules;
const tournamentBroadcast = tournamentModules.broadcast;
// T021: Import draft config service
const draftConfig = modules.draft.config;
const { createMatchDraftService } = modules.draft;
const { createMatchLeaderService } = require("./modules/match-leader") as typeof import("./modules/match-leader");
// T023: Import standings service
const standingsService = modules.tournament.standings;
const { enrichPatchWithCosts } = require("./modules/card-costs") as typeof import("./modules/card-costs");
const {
  getSeatForPlayer,
  getPlayerIdForSeat,
  getOpponentSeat: getOpponentSeatRaw,
  inferLoserId,
} = require("./modules/match-utils") as typeof import("./modules/match-utils");
const {
  normalizeDeckPayload,
  validateDeckCards,
} = require("./modules/deck-utils") as typeof import("./modules/deck-utils");
const { createLeaderboardService } = require("./modules/leaderboard") as typeof import("./modules/leaderboard");
const {
  deepMergeReplaceArrays,
  dedupePermanents,
  mergeEvents,
} = require("./modules/shared/match-helpers") as typeof import("./modules/shared/match-helpers");
const { registerRtcHandlers } = require("./socket/rtc-handlers") as typeof import("./socket/rtc-handlers");

const jwt = require("jsonwebtoken");
const {
  createRngFromString,
  generateBoosterDeterministic,
  generateCubeBoosterDeterministic,
} = require("./booster");
const { BotManager } = require("./botManager");
const {
  applyTurnStart,
  validateAction,
  ensureCosts,
  applyMovementAndCombat,
} = require("./rules");
const { applyGenesis, applyKeywordAnnotations } = require("./rules/triggers");
const { buildMatchInfo } = require("./matchInfo");

import type {
  AnyRecord,
  DraftPresenceEntry,
  MatchPatch,
  PendingVoiceRequest,
  PlayerState,
  Seat,
  ServerMatchState,
  VoiceParticipant,
  LobbyState,
} from "./types";

type SocketServer = import("socket.io").Server;
type SocketClient = import("socket.io").Socket;
type RedisClient = import("ioredis").Redis;
type PrismaClient = import("@prisma/client").PrismaClient;
type IncomingMessage = import("http").IncomingMessage;
type ServerResponse = import("http").ServerResponse;
type PlayersMap = Map<string, PlayerState>;
type MatchMap = Map<string, ServerMatchState>;
interface NextAuthJwtPayload {
  uid?: string;
  sub?: string;
  name?: string;
}

interface DraftSessionJoinPayload {
  sessionId: string;
}

interface DraftSessionLeavePayload {
  sessionId?: string | null;
}

interface TournamentBroadcastPayload {
  event: string;
  data: Record<string, unknown>;
}

const TOURNAMENT_BROADCAST_EVENT_NAMES = [
  "TOURNAMENT_UPDATED",
  "PHASE_CHANGED",
  "ROUND_STARTED",
  "PLAYER_JOINED",
  "PLAYER_LEFT",
  "DRAFT_READY",
  "UPDATE_PREPARATION",
  "STATISTICS_UPDATED",
  "MATCH_ASSIGNED",
  "matchEnded",
] as const;

type TournamentBroadcastEventName = (typeof TOURNAMENT_BROADCAST_EVENT_NAMES)[number];

const TOURNAMENT_BROADCAST_EVENT_SET: ReadonlySet<string> = new Set(
  TOURNAMENT_BROADCAST_EVENT_NAMES
);

interface TournamentBroadcastData extends Record<string, unknown> {
  id?: string;
  tournamentId?: string;
  newPhase?: string;
  roundNumber?: number;
  matches?: unknown;
  playerId?: string;
  playerName?: string | null;
  currentPlayerCount?: number;
  draftSessionId?: string;
  preparationStatus?: string;
  readyPlayerCount?: number;
  totalPlayerCount?: number;
  deckSubmitted?: boolean;
  reason?: string;
  matchId?: string;
}

type ChatScope = "global" | "lobby" | "match";

interface ChatPayload extends Record<string, unknown> {
  content?: unknown;
  scope?: unknown;
}

const CHAT_SCOPE_VALUES: ReadonlySet<ChatScope> = new Set(["global", "lobby", "match"]);

interface DraggingPayload extends Record<string, unknown> {
  kind?: unknown;
  from?: unknown;
  index?: unknown;
  who?: unknown;
  source?: unknown;
  cardId?: unknown;
  slug?: unknown;
  meta?: unknown;
}

interface DraggingMeta {
  owner?: number;
}

interface NormalizedDragging {
  kind: string;
  from?: string;
  index?: number;
  who?: "p1" | "p2";
  source?: string;
  cardId?: number;
  slug?: string;
  meta?: DraggingMeta;
}

interface HighlightPayload extends Record<string, unknown> {
  cardId?: unknown;
  slug?: unknown;
}

function isTournamentBroadcastEvent(value: unknown): value is TournamentBroadcastEventName {
  return typeof value === "string" && TOURNAMENT_BROADCAST_EVENT_SET.has(value);
}

function normalizeTournamentBroadcastData(input: unknown): TournamentBroadcastData {
  if (!input || typeof input !== "object") {
    return {};
  }
  return { ...(input as Record<string, unknown>) };
}

function isChatScope(value: unknown): value is ChatScope {
  return typeof value === "string" && CHAT_SCOPE_VALUES.has(value as ChatScope);
}

function toOptionalString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function toOptionalNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))
    ? Number(value)
    : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object";
}

type MatchLeaderService = ReturnType<typeof createMatchLeaderService>;

interface MatchDraftService {
  leaderDraftPlayerReady(matchId: string, playerId: string, ready: boolean): Promise<void>;
  leaderStartDraft(
    matchId: string,
    requestingPlayerId?: string | null,
    overrideConfig?: AnyRecord | null,
    requestingSocketId?: string | null
  ): Promise<void>;
  leaderMakeDraftPick(matchId: string, playerId: string, payload: AnyRecord): Promise<void>;
  leaderChooseDraftPack(matchId: string, playerId: string, payload: AnyRecord): Promise<void>;
  updateDraftPresence(
    sessionId: string,
    playerId: string,
    playerName: string | null,
    isConnected: boolean
  ): Promise<DraftPresenceEntry[]>;
  getDraftPresenceList(sessionId: string): DraftPresenceEntry[];
  clearDraftWatchdog(matchId: string): void;
}
const getOpponentSeat = (seat: Seat | null | undefined): Seat | null =>
  seat ? (getOpponentSeatRaw(seat) as Seat | null) : null;
const getOpponentSeatStrict = (seat: Seat): Seat => {
  const result = getOpponentSeatRaw(seat);
  return result === "p1" || result === "p2" ? result : seat === "p1" ? "p2" : "p1";
};
const enrichPatchWithCostsSafe = async (
  patch: MatchPatch | null,
  prismaClient: PrismaClient
): Promise<MatchPatch | null> => {
  if (!patch) return null;
  return (await enrichPatchWithCosts(patch, prismaClient)) as MatchPatch;
};

interface MetricsSnapshot extends AnyRecord {
  time: number;
  uptimeSec: number;
  matchesCached: number;
  persistBuffers: number;
  bufferedActions: number;
  socketsConnected: number;
  dbReady: boolean;
  redisAdapterStatus: string | undefined;
  storeRedisStatus: string | undefined;
  memory: {
    rss: number;
    heapUsed: number;
    heapTotal: number;
    external: number;
  };
  counters: Record<string, number>;
  hist: Record<string, { sum: number; count: number; avg: number }>;
}

interface MetricsRegistry {
  counters: Map<string, number>;
  hist: Map<string, { sum: number; count: number }>;
}

interface MatchRecordingEntry {
  matchId: string;
  playerNames: string[];
  startTime: number;
  endTime?: number;
  actions: Array<{ patch: unknown; timestamp: number; playerId: string }>;
  initialState?: AnyRecord;
}

const safeErrorMessage = (err: unknown): unknown => {
  if (err && typeof err === "object" && "message" in err) {
    const msg = (err as { message?: unknown }).message;
    if (typeof msg === "string") {
      return msg;
    }
  }
  return err;
};

const bootstrap = createBootstrap();
const {
  config: serverConfig,
  prisma,
  httpServer: server,
  io,
  redis,
} = bootstrap;
const { pubClient, subClient, storeRedis, storeSub } = redis;
const PORT = serverConfig.port;
const INSTANCE_ID = serverConfig.instanceId;
const CORS_ORIGINS = Array.isArray(serverConfig.corsOrigins)
  ? serverConfig.corsOrigins
  : [serverConfig.corsOrigins].filter(Boolean);
// Optional: start periodic pruning of old replay actions/sessions
try {
  replay.setupReplayRetentionPruner?.(prisma);
} catch {}
let isReady = false; // readiness flips true once DB connected and recovery done
let isShuttingDown = false;
// Rules enforcement modes:
//  - off: helpers only, no strict gating
//  - bot_only: enforce for CPU bots only
//  - all: enforce for all players
const RULES_ENFORCE_MODE = (
  process.env.RULES_ENFORCE_MODE || "off"
).toLowerCase();
const RULES_HELPERS_ENABLED = !(
  process.env.RULES_HELPERS_ENABLED === "0" ||
  (process.env.RULES_HELPERS_ENABLED || "").toLowerCase() === "false"
);

// Persistence strategy: default to Redis write-behind to avoid DB pool pressure
const PERSIST_STRATEGY = (
  process.env.PERSIST_STRATEGY || "write_behind"
).toLowerCase();
const PERSIST_IS_WRITE_BEHIND =
  PERSIST_STRATEGY === "write_behind" ||
  PERSIST_STRATEGY === "redis" ||
  PERSIST_STRATEGY === "redis_writebehind";
const PERSIST_FLUSH_INTERVAL_MS = Number(
  process.env.PERSIST_FLUSH_INTERVAL_MS || 3000
);
const PERSIST_MAX_WAIT_MS = Number(process.env.PERSIST_MAX_WAIT_MS || 2000);
const PERSIST_TIMEOUT_MS = Number(process.env.PERSIST_TIMEOUT_MS || 2000);
const PERSIST_ACTION_BATCH_SIZE = Number(
  process.env.PERSIST_ACTION_BATCH_SIZE || 200
);
const REDIS_SESSION_TTL_SEC = Number(
  process.env.MATCH_SESSION_TTL_SEC || 60 * 60 * 24
);

// Simple in-memory metrics registry (process lifetime)
const METRICS: MetricsRegistry = {
  counters: new Map<string, number>(),
  hist: new Map<string, { sum: number; count: number }>(),
};
function metricsInc(key: string, delta = 1): void {
  METRICS.counters.set(key, (METRICS.counters.get(key) || 0) + delta);
}
function metricsGet(key: string): number {
  return METRICS.counters.get(key) || 0;
}
function metricsObserveMs(key: string, ms: number): void {
  const cur = METRICS.hist.get(key) || { sum: 0, count: 0 };
  cur.sum += ms;
  cur.count += 1;
  METRICS.hist.set(key, cur);
}

function promSafe(name: string): string {
  return String(name).replace(/[^a-zA-Z0-9_]/g, "_");
}

let getPersistenceBufferStats: () => { bufferCount: number; bufferedActions: number } = () => ({
  bufferCount: 0,
  bufferedActions: 0,
});
let flushAllPersistenceBuffers: (reason?: string) => Promise<void> = async () => {};

function collectMetricsSnapshot(): MetricsSnapshot {
  const now = Date.now();
  const counters: Record<string, number> = {};
  for (const [k, v] of METRICS.counters.entries()) counters[k] = v;
  const hist: MetricsSnapshot["hist"] = {};
  for (const [k, v] of METRICS.hist.entries()) {
    hist[k] = {
      sum: v.sum,
      count: v.count,
      avg: v.count > 0 ? v.sum / v.count : 0,
    };
  }
  const sockets = (() => {
    try {
      return io.of("/").sockets.size;
    } catch {
      return 0;
    }
  })();
  const mem = process.memoryUsage();
  const { bufferCount, bufferedActions } = getPersistenceBufferStats();
  return {
    time: now,
    uptimeSec: Math.floor(process.uptime()),
    matchesCached: typeof matches !== "undefined" && matches ? matches.size : 0,
    persistBuffers: bufferCount,
    bufferedActions,
    socketsConnected: sockets,
    dbReady: !!isReady,
    redisAdapterStatus: pubClient ? pubClient.status : "none",
    storeRedisStatus: storeRedis ? storeRedis.status : "none",
    memory: {
      rss: mem.rss,
      heapUsed: mem.heapUsed,
      heapTotal: mem.heapTotal,
      external: mem.external,
    },
    counters,
    hist,
  };
}

function buildPromMetrics(): string {
  const snap = collectMetricsSnapshot();
  const lines: string[] = [];
  const pushGauge = (name: string, value: unknown, help?: string) => {
    const n = `sorcery_${promSafe(name)}`;
    if (help) lines.push(`# HELP ${n} ${help}`);
    lines.push(`# TYPE ${n} gauge`);
    lines.push(`${n} ${Number(value)}`);
  };
  const pushCounter = (name: string, value: unknown, help?: string) => {
    const n = `sorcery_${promSafe(name)}_total`;
    if (help) lines.push(`# HELP ${n} ${help}`);
    lines.push(`# TYPE ${n} counter`);
    lines.push(`${n} ${Number(value)}`);
  };
  const pushSummary = (name: string, sum: unknown, count: unknown, help?: string) => {
    const base = `sorcery_${promSafe(name)}`;
    if (help) lines.push(`# HELP ${base} ${help}`);
    lines.push(`# TYPE ${base} summary`);
    lines.push(`${base}_sum ${Number(sum)}`);
    lines.push(`${base}_count ${Number(count)}`);
  };
  // Gauges
  pushGauge(
    "matches_cached",
    snap.matchesCached,
    "Number of matches in memory"
  );
  pushGauge(
    "persist_buffers",
    snap.persistBuffers,
    "Number of write-behind buffers"
  );
  pushGauge(
    "persist_buffered_actions",
    snap.bufferedActions,
    "Queued actions in buffers"
  );
  pushGauge(
    "sockets_connected",
    snap.socketsConnected,
    "Connected WebSocket clients"
  );
  pushGauge("uptime_seconds", snap.uptimeSec, "Process uptime in seconds");
  pushGauge(
    "process_heap_used_bytes",
    snap.memory.heapUsed,
    "Node.js heap used"
  );
  pushGauge("process_rss_bytes", snap.memory.rss, "Resident set size");
  // Counters
  for (const [k, v] of Object.entries(snap.counters)) {
    pushCounter(k.replace(/\./g, "_"), v, `Counter ${k}`);
  }
  // Summaries
  for (const [k, v] of Object.entries(snap.hist)) {
    pushSummary(`${k.replace(/\./g, "_")}_ms`, v.sum, v.count, `Summary ${k}`);
  }
  return lines.join("\n") + "\n";
}

// Wire tournament engine dependencies (Prisma, Socket.IO, Redis, InstanceID)
(async () => {
  try {
    const mod = await tournamentModules.loadEngine();
    if (mod && typeof mod.setDeps === "function") {
      mod.setDeps({
        prismaClient: prisma,
        ioServer: io,
        storeRedisClient: storeRedis,
        instanceId: INSTANCE_ID,
      });
      try {
        console.log("[tourney] engine dependencies injected");
      } catch {}
    }
  } catch (e) {
    try {
      console.warn("[tourney] engine init failed:", safeErrorMessage(e));
    } catch {}
  }
})();

// Match control pub/sub channel
const MATCH_CONTROL_CHANNEL = "match:control";
const DRAFT_STATE_CHANNEL = "draft:session:update";
const MATCH_CLEANUP_DELAY_MS = Number(
  process.env.MATCH_CLEANUP_DELAY_MS || 60000
); // 60s default
const STALE_WAITING_MS = Number(
  process.env.STALE_MATCH_WAITING_MS || 10 * 60 * 1000
); // 10 min default
const INACTIVE_MATCH_CLEANUP_MS = Number(
  process.env.INACTIVE_MATCH_CLEANUP_MS || 3 * 60 * 60 * 1000
); // 3 hours default
const LOBBY_CONTROL_CHANNEL = "lobby:control";
const LOBBY_STATE_CHANNEL = "lobby:state";
let clusterStateReady = false; // flip after maps are initialized
if (storeSub) {
  try {
    storeSub.subscribe(MATCH_CONTROL_CHANNEL, (err: Error | null) => {
      if (err)
        try {
          console.warn(
            `[store] subscribe ${MATCH_CONTROL_CHANNEL} failed:`,
            safeErrorMessage(err)
          );
        } catch {}
    });
    storeSub.subscribe(LOBBY_CONTROL_CHANNEL, (err: Error | null) => {
      if (err)
        try {
          console.warn(
            `[store] subscribe ${LOBBY_CONTROL_CHANNEL} failed:`,
            safeErrorMessage(err)
          );
        } catch {}
    });
    storeSub.subscribe(LOBBY_STATE_CHANNEL, (err: Error | null) => {
      if (err)
        try {
          console.warn(
            `[store] subscribe ${LOBBY_STATE_CHANNEL} failed:`,
            safeErrorMessage(err)
          );
        } catch {}
    });
    storeSub.subscribe(DRAFT_STATE_CHANNEL, (err: Error | null) => {
      if (err)
        try {
          console.warn(
            `[store] subscribe ${DRAFT_STATE_CHANNEL} failed:`,
            safeErrorMessage(err)
          );
        } catch {}
    });
    storeSub.on("message", async (channel: string, message: string) => {
      if (!clusterStateReady) return;
      let msg = null;
      try {
        msg = JSON.parse(message);
      } catch {
        return;
      }
      if (channel === MATCH_CONTROL_CHANNEL) {
        if (!msg || !msg.type) return;
        const { matchId } = msg;
        if (!matchId) return;
        try {
          const leader = await getOrClaimMatchLeader(matchId);
          if (leader !== INSTANCE_ID) return;
        } catch {
          return;
        }
        try {
          if (msg.type === "join" && msg.playerId && msg.socketId) {
            await ensurePlayerCached(msg.playerId);
            await leaderJoinMatch(matchId, msg.playerId, msg.socketId);
          } else if (msg.type === "action" && msg.playerId) {
            await leaderApplyAction(
              matchId,
              msg.playerId,
              msg.patch || null,
              msg.socketId || null
            );
          } else if (msg.type === "interaction:request" && msg.playerId) {
            await leaderHandleInteractionRequest(
              matchId,
              msg.playerId,
              msg.payload || null
            );
          } else if (msg.type === "interaction:response" && msg.playerId) {
            await leaderHandleInteractionResponse(
              matchId,
              msg.playerId,
              msg.payload || null
            );
          } else if (
            msg.type === "draft:playerReady" &&
            typeof msg.ready === "boolean" &&
            msg.playerId
          ) {
            await leaderDraftPlayerReady(matchId, msg.playerId, !!msg.ready);
          } else if (msg.type === "draft:start" && msg.playerId) {
            const m = await getOrLoadMatch(matchId);
            if (!m || m.matchType !== "draft" || !m.draftState) return;
            if (m.draftState.phase !== "waiting") {
              // Already started: broadcast current state to sync clients
              try {
                io.to(`match:${m.id}`).emit("draftUpdate", m.draftState);
              } catch {}
            } else {
              await leaderStartDraft(
                matchId,
                msg.playerId,
                msg.draftConfig || null,
                msg.socketId || null
              );
            }
          } else if (msg.type === "draft:pick" && msg.playerId && msg.cardId) {
            await leaderMakeDraftPick(matchId, msg.playerId, {
              cardId: msg.cardId,
              packIndex: Number(msg.packIndex || 0),
              pickNumber: Number(msg.pickNumber || 1),
            });
          } else if (
            msg.type === "draft:choosePack" &&
            msg.playerId &&
            msg.setChoice
          ) {
            await leaderChooseDraftPack(matchId, msg.playerId, {
              setChoice: msg.setChoice,
              packIndex: Number(msg.packIndex || 0),
            });
          } else if (msg.type === "mulligan:done" && msg.playerId) {
            await leaderHandleMulliganDone(matchId, msg.playerId);
          } else if (msg.type === "match:cleanup" && msg.reason) {
            await cleanupMatchNow(matchId, msg.reason, !!msg.force);
          }
        } catch (e) {
          try {
            console.warn("[match:control] handler error:", safeErrorMessage(e));
          } catch {}
        }
        return;
      }
      if (channel === DRAFT_STATE_CHANNEL) {
        // Forward tournament draft session updates to room subscribers
        // Skip echo: if this instance published the message, it already emitted locally
        try {
          const { sessionId, draftState, instanceId } = msg || {};
          if (!sessionId) return;
          if (instanceId && instanceId === INSTANCE_ID) {
            // This is an echo of our own publish - skip re-broadcast
            return;
          }
          io.to(`draft:${sessionId}`).emit("draftUpdate", draftState);
        } catch (e) {
          try {
            console.warn("[draft] failed to forward state:", safeErrorMessage(e));
          } catch {}
        }
        return;
      }
      if (channel === LOBBY_CONTROL_CHANNEL) {
        if (!msg || !msg.type) return;
        try {
          const leader = await getOrClaimLobbyLeader();
          if (leader !== INSTANCE_ID) return;
        } catch {
          return;
        }
        try {
          await handleLobbyControlAsLeader(msg);
        } catch (e) {
          try {
            console.warn("[lobby:control] handler error:", safeErrorMessage(e));
          } catch {}
        }
        return;
      }
      if (channel === LOBBY_STATE_CHANNEL) {
        if (!msg) return;
        if (msg.type === "upsert" && msg.lobby && msg.lobby.id) {
          try {
            upsertLobbyFromSerialized(msg.lobby);
          } catch {}
        } else if (msg.type === "delete" && msg.id) {
          try {
            lobbies.delete(msg.id);
          } catch {}
        }
        return;
      }
    });
  } catch {}
}

// Basic health endpoints (liveness/readiness) and lightweight HTTP API
server.on("request", async (req: IncomingMessage, res: ServerResponse) => {
  try {
    // Helper: dynamic CORS based on SOCKET_CORS_ORIGIN
    const reqOrigin = (req && req.headers && req.headers.origin) || null;
    const allowCors = (): void => {
      if (
        reqOrigin &&
        (CORS_ORIGINS.includes("*") || CORS_ORIGINS.includes(reqOrigin))
      ) {
        res.setHeader("Access-Control-Allow-Origin", reqOrigin);
        res.setHeader("Vary", "Origin");
      }
      res.setHeader("Access-Control-Allow-Credentials", "true");
    };
    const allowCorsForOptions = (): void => {
      allowCors();
      res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
      res.setHeader(
        "Access-Control-Allow-Headers",
        "Content-Type, Authorization"
      );
    };

    const method = (req && req.method) || "GET";
    const u = new URL((req && req.url) || "/", "http://localhost");
    const pathname = u.pathname;

    // Health endpoints
    if (
      pathname === "/healthz" ||
      pathname === "/readyz" ||
      pathname === "/status"
    ) {
      const dbOk = !!isReady;
      const redisOk = pubClient
        ? pubClient.status === "ready" || pubClient.status === "connect"
        : false;
      const storeOk = storeRedis
        ? storeRedis.status === "ready" || storeRedis.status === "connect"
        : false;
      const body = JSON.stringify({
        ok: true,
        db: dbOk,
        redis: redisOk,
        store: storeOk,
        shuttingDown: isShuttingDown,
        matches: typeof matches !== "undefined" && matches ? matches.size : 0,
        uptimeSec: Math.floor(process.uptime()),
      });
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json");
      res.end(body);
      return;
    }

    // Metrics endpoints
    if (pathname === "/metrics" && method === "GET") {
      allowCors();
      try {
        metricsInc("http.metrics.requests", 1);
      } catch {}
      const text = buildPromMetrics();
      res.statusCode = 200;
      res.setHeader("Content-Type", "text/plain; version=0.0.4; charset=utf-8");
      res.end(text);
      return;
    }
    if (pathname === "/metrics.json" && method === "GET") {
      allowCors();
      try {
        metricsInc("http.metrics_json.requests", 1);
      } catch {}
      const snap = collectMetricsSnapshot();
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify(snap));
      return;
    }

    // Preflight for HTTP API
    if (method === "OPTIONS") {
      allowCorsForOptions();
      res.statusCode = 204;
      res.end();
      return;
    }

    // Lightweight HTTP API: list available players (MVP)
    if (pathname === "/players/available" && method === "GET") {
      allowCors();

      // Parse query
      const q = (u.searchParams.get("q") || "").trim().toLowerCase();
      const sortParam = (u.searchParams.get("sort") || "recent").toLowerCase();
      const sort = sortParam === "alphabetical" ? "alphabetical" : "recent";
      const limit = Math.max(
        1,
        Math.min(100, Number(u.searchParams.get("limit") || 100))
      );
      let offset = Number(u.searchParams.get("cursor") || 0);
      if (!Number.isFinite(offset) || offset < 0) offset = 0;

      // Optional: identify requesting user from Authorization: Bearer <token>
      let requesterId = null;
      try {
        const auth = (req.headers && req.headers.authorization) || "";
        const m = auth.match(/^Bearer\s+(.+)$/i);
        if (m && process.env.NEXTAUTH_SECRET) {
          const payload = jwt.verify(m[1], process.env.NEXTAUTH_SECRET);
          requesterId = String((payload && (payload.uid || payload.sub)) || "");
        }
      } catch {}

      try {
        console.info(
          `[http] GET /players/available q="${q}" sort=${sort} limit=${limit} cursor=${offset} requester=${
            requesterId ? String(requesterId).slice(-6) : "anon"
          }`
        );
      } catch {}

      // Build candidate list: online and not in a match
      const candidates = [];
      for (const [pid, p] of players.entries()) {
        if (!p) continue;
        const online = !!p.socketId;
        const inMatch = !!p.matchId;
        // Filter out CPU bots and host accounts (IDs starting with 'cpu_' or 'host_')
        const isBotOrHost =
          String(pid).startsWith("cpu_") || String(pid).startsWith("host_");
        if (online && !inMatch && !isBotOrHost) {
          if (!q || (p.displayName || "").toLowerCase().includes(q)) {
            candidates.push({
              id: pid,
              displayName: p.displayName || "Player",
            });
          }
        }
      }

      // Filter out hidden presence via DB, and fetch shortId/avatar
      const ids = candidates.map((c) => c.id);
      let publicUsers: Array<{ id: string; shortId: string | null; image: string | null }> = [];
      if (ids.length > 0) {
        publicUsers = await prisma.user.findMany({
          where: { id: { in: ids }, presenceHidden: false },
          select: { id: true, shortId: true, image: true },
        });
      }
      const publicMap = new Map(publicUsers.map((u) => [u.id, u]));
      const visible = candidates.filter((c) => publicMap.has(c.id));

      // Friendship flags (relative to requester)
      let friendSet: Set<string> = new Set();
      if (requesterId && visible.length > 0) {
        const fr = await prisma.friendship.findMany({
          where: {
            ownerUserId: requesterId,
            targetUserId: { in: visible.map((v) => v.id) },
          },
          select: { targetUserId: true },
        });
        friendSet = new Set(fr.map((r: { targetUserId: string }) => r.targetUserId));
      }

      // Recent opponents (last 10 results) for prioritization when applicable
      const freq = new Map<string, number>();
      const lastAt = new Map<string, number>();
      if (requesterId && sort === "recent") {
        const recent = (await prisma.matchResult.findMany({
          where: { OR: [{ winnerId: requesterId }, { loserId: requesterId }] },
          orderBy: { completedAt: "desc" },
          take: 10,
        })) as Array<Record<string, any>>;
        for (const r of recent) {
          let oppIds: string[] = [];
          try {
            const arr = Array.isArray(r.players)
              ? r.players
              : typeof r.players === "string"
              ? JSON.parse(r.players)
              : [];
            if (Array.isArray(arr)) {
              for (const info of arr) {
                const oid = info && (info.id || info.playerId || info.uid);
                if (oid && String(oid) !== String(requesterId))
                  oppIds.push(String(oid));
              }
            }
          } catch {}
          // Fallback: if players JSON not helpful, try winner/loser IDs
          if (oppIds.length === 0) {
            if (r.winnerId && r.winnerId !== requesterId)
              oppIds.push(r.winnerId);
            if (r.loserId && r.loserId !== requesterId) oppIds.push(r.loserId);
          }
          const ts = r.completedAt
            ? new Date(r.completedAt).getTime()
            : Date.now();
          for (const oid of oppIds) {
            const prev = freq.get(oid) || 0;
            freq.set(oid, prev + 1);
            const prevTs = lastAt.get(oid) || 0;
            if (ts > prevTs) lastAt.set(oid, ts);
          }
        }
      }

      // Compose items
      const items = visible.map((c) => {
        const u = publicMap.get(c.id);
        const mcount = freq.has(c.id) ? freq.get(c.id) || null : null;
        const lpa = lastAt.has(c.id)
          ? new Date(lastAt.get(c.id) || 0).toISOString()
          : null;
        return {
          userId: c.id,
          shortUserId: u?.shortId || String(c.id).slice(-8),
          displayName: c.displayName,
          avatarUrl: u?.image || null,
          presence: { online: true, inMatch: false },
          isFriend: requesterId ? friendSet.has(c.id) : false,
          lastPlayedAt: lpa,
          matchCountInLast10: mcount,
        };
      });

      // Sort
      const alphaSort = (
        a: { displayName?: string | null; userId: string },
        b: { displayName?: string | null; userId: string }
      ): number => {
        const an = (a.displayName || "").toLowerCase();
        const bn = (b.displayName || "").toLowerCase();
        if (an < bn) return -1;
        if (an > bn) return 1;
        return a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0;
      };
      let ordered = items.slice();
      if (sort === "recent" && requesterId) {
        const groupA = items.filter(
          (it) =>
            typeof it.matchCountInLast10 === "number" &&
            it.matchCountInLast10 > 0
        );
        const groupB = items.filter((it) => !groupA.includes(it));
        groupA.sort((x, y) => {
          const c = (y.matchCountInLast10 || 0) - (x.matchCountInLast10 || 0);
          if (c !== 0) return c;
          const tx = x.lastPlayedAt ? Date.parse(x.lastPlayedAt) : 0;
          const ty = y.lastPlayedAt ? Date.parse(y.lastPlayedAt) : 0;
          if (ty !== tx) return ty - tx;
          return alphaSort(x, y);
        });
        groupB.sort(alphaSort);
        ordered = groupA.concat(groupB);
      } else {
        ordered = items.sort(alphaSort);
      }

      // Pagination via cursor as offset
      const total = ordered.length;
      const page = ordered.slice(offset, offset + limit);
      const nextCursor = offset + limit < total ? String(offset + limit) : null;

      const body = JSON.stringify({ items: page, nextCursor });
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json");
      res.end(body);
      return;
    }

    // Handle tournament broadcast requests from Next.js API routes
    if (pathname === "/tournament/broadcast" && method === "POST") {
      allowCors();

      // Collect request body
      const chunks: Buffer[] = [];
      req.on("data", (chunk: Buffer) => chunks.push(chunk));
      req.on("end", () => {
        try {
          const body = Buffer.concat(chunks).toString();
          const parsed = JSON.parse(body) as Partial<TournamentBroadcastPayload>;
          const event = isTournamentBroadcastEvent(parsed.event)
            ? parsed.event
            : null;
          if (!event) {
            throw new Error("Missing event");
          }

          const data = normalizeTournamentBroadcastData(parsed.data);

          // Call the appropriate broadcast function
          switch (event) {
            case "TOURNAMENT_UPDATED": {
              const id = toOptionalString(data.id);
              if (id) {
                broadcastTournamentUpdate(id, data);
              }
              break;
            }
            case "PHASE_CHANGED": {
              const tournamentId = toOptionalString(data.tournamentId);
              const newPhase = toOptionalString(data.newPhase);
              if (tournamentId && newPhase) {
                const { tournamentId: _ti, newPhase: _np, ...additionalData } = data;
                broadcastPhaseChanged(tournamentId, newPhase, additionalData);
              }
              break;
            }
            case "ROUND_STARTED": {
              const tournamentId = toOptionalString(data.tournamentId);
              const roundNumber = toOptionalNumber(data.roundNumber);
              const matchesPayload = Array.isArray(data.matches) ? data.matches : null;
              if (tournamentId && roundNumber !== null && matchesPayload) {
                broadcastRoundStarted(tournamentId, roundNumber, matchesPayload);
              }
              break;
            }
            case "PLAYER_JOINED": {
              const tournamentId = toOptionalString(data.tournamentId);
              const playerId = toOptionalString(data.playerId);
              if (tournamentId && playerId) {
                const playerName = toOptionalString(data.playerName);
                const currentPlayerCount = toOptionalNumber(data.currentPlayerCount);
                broadcastPlayerJoined(
                  tournamentId,
                  playerId,
                  playerName ?? undefined,
                  currentPlayerCount ?? undefined
                );
              }
              break;
            }
            case "PLAYER_LEFT": {
              const tournamentId = toOptionalString(data.tournamentId);
              const playerId = toOptionalString(data.playerId);
              if (tournamentId && playerId) {
                const playerName = toOptionalString(data.playerName);
                const currentPlayerCount = toOptionalNumber(data.currentPlayerCount);
                broadcastPlayerLeft(
                  tournamentId,
                  playerId,
                  playerName ?? undefined,
                  currentPlayerCount ?? undefined
                );
              }
              break;
            }
            case "DRAFT_READY": {
              const tournamentId = toOptionalString(data.tournamentId);
              const draftSessionId = toOptionalString(data.draftSessionId);
              if (tournamentId && draftSessionId) {
                const { tournamentId: _ti, ...rest } = data;
                broadcastDraftReady(tournamentId, rest);
              }
              break;
            }
            case "UPDATE_PREPARATION": {
              const tournamentId = toOptionalString(data.tournamentId);
              const playerId = toOptionalString(data.playerId);
              if (tournamentId && playerId) {
                const preparationStatus = toOptionalString(data.preparationStatus);
                const readyPlayerCount = toOptionalNumber(data.readyPlayerCount);
                const totalPlayerCount = toOptionalNumber(data.totalPlayerCount);
                const deckSubmitted =
                  typeof data.deckSubmitted === "boolean" ? data.deckSubmitted : undefined;
                broadcastPreparationUpdate(
                  tournamentId,
                  playerId,
                  preparationStatus ?? undefined,
                  readyPlayerCount ?? undefined,
                  totalPlayerCount ?? undefined,
                  deckSubmitted
                );
              }
              break;
            }
            case "STATISTICS_UPDATED": {
              const tournamentId = toOptionalString(data.tournamentId);
              if (tournamentId) {
                broadcastStatisticsUpdate(tournamentId, data);
              }
              break;
            }
            case "MATCH_ASSIGNED": {
              // For now, just log - MATCH_ASSIGNED needs player-specific routing
              console.log("[Tournament] MATCH_ASSIGNED broadcast received");
              break;
            }
            case "matchEnded": {
              const matchId = toOptionalString(data.matchId);
              if (matchId) {
                const match = matches.get(matchId);
                if (match && Array.isArray(match.playerIds)) {
                  for (const playerId of match.playerIds) {
                    const player = players.get(playerId);
                    if (player && player.matchId === matchId) {
                      player.matchId = null;
                    }
                  }
                  io.to(`match:${matchId}`).emit("matchEnded", data);
                  const reason = toOptionalString(data.reason) ?? "unknown_reason";
                  console.log(`[Match] Ended match ${matchId} due to ${reason}`);
                }
              }
              break;
            }
          }

          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: true }));
        } catch (err) {
          console.error("[Tournament] Broadcast error:", safeErrorMessage(err));
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({
              error: "Invalid request",
              details: String(safeErrorMessage(err)),
            })
          );
        }
      });

      req.on("error", (err: Error) => {
        console.error("[Tournament] Request error:", safeErrorMessage(err));
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Server error" }));
      });

      return;
    }

    // For all other paths, do nothing here; allow Socket.IO and other handlers to respond.
    return;
  } catch (e) {
    try {
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          error: "internal_error",
          message: String(safeErrorMessage(e)),
        })
      );
    } catch {}
  }
});

// In-memory state
// Players keyed by stable playerId (not socket id)
/** @type {Map<string, { id: string, displayName: string, socketId: string|null, lobbyId?: string|null, matchId?: string|null }>} */
const players: PlayersMap = new Map();
const playerIdBySocket: Map<string, string> = new Map();
const matches: MatchMap = new Map();
const matchRecordings: Map<string, MatchRecordingEntry> = new Map();
const rtcParticipants: Map<string, Set<string>> = new Map();
const participantDetails: Map<string, VoiceParticipant> = new Map();
const pendingVoiceRequests: Map<string, PendingVoiceRequest> = new Map();

const leaderboardService = createLeaderboardService({
  prisma,
  players,
  matchRecordings,
});
const { recordMatchResult: recordLeaderboardMatchResult } = leaderboardService;

const persistence = createPersistenceLayer({
  prisma,
  storeRedis,
  pubClient,
  metricsInc,
  metricsObserveMs,
  matches,
  hydrateMatchFromDatabase,
  config: {
    isWriteBehind: PERSIST_IS_WRITE_BEHIND,
    flushIntervalMs: PERSIST_FLUSH_INTERVAL_MS,
    actionBatchSize: PERSIST_ACTION_BATCH_SIZE,
    maxWaitMs: PERSIST_MAX_WAIT_MS,
    timeoutMs: PERSIST_TIMEOUT_MS,
    redisSessionTtlSec: REDIS_SESSION_TTL_SEC,
  },
});

const {
  persistMatchCreated,
  persistMatchUpdate,
  persistMatchEnded,
  recoverActiveMatches,
  findActiveMatchForPlayer,
  rehydrateMatch,
  getBufferStats,
  flushAll,
} = persistence;

getPersistenceBufferStats = getBufferStats;
flushAllPersistenceBuffers = flushAll;

const matchDraftService = createMatchDraftService({
  io,
  storeRedis,
  prisma,
  draftConfig,
  hydrateMatchFromDatabase,
  persistMatchUpdate,
  getOrLoadMatch,
  getMatchInfo,
  createRngFromString,
  generateBoosterDeterministic,
  generateCubeBoosterDeterministic,
}) as MatchDraftService;

const {
  leaderDraftPlayerReady,
  leaderStartDraft,
  leaderMakeDraftPick,
  leaderChooseDraftPack,
  updateDraftPresence,
  clearDraftWatchdog,
} = matchDraftService;

const {
  ensureInteractionState,
  sanitizeGrantOptions,
  purgeExpiredGrants,
  collectInteractionRequirements,
  usePermitForRequirement,
  createGrantRecord,
  recordInteractionRequest,
  recordInteractionResponse,
  emitInteraction,
  emitInteractionResult,
  applyPendingAction,
  sanitizePendingAction,
} = createInteractionModule({
  io,
  rid,
  enrichPatchWithCosts: enrichPatchWithCostsSafe,
  deepMergeReplaceArrays,
  finalizeMatch,
  persistMatchUpdate,
  prisma,
});

const matchLeaderService: MatchLeaderService = createMatchLeaderService({
  io,
  storeRedis,
  prisma,
  players,
  getOrLoadMatch: getOrLoadMatch as unknown as (matchId: string) => Promise<any>,
  ensurePlayerCached,
  getMatchInfo: getMatchInfo as unknown as (match: any) => unknown,
  rid,
  getSeatForPlayer,
  getOpponentSeat: getOpponentSeatStrict,
  ensureInteractionState,
  purgeExpiredGrants,
  collectInteractionRequirements,
  usePermitForRequirement,
  sanitizeGrantOptions,
  sanitizePendingAction,
  recordInteractionRequest,
  createGrantRecord,
  recordInteractionResponse,
  applyPendingAction,
  emitInteraction,
  emitInteractionResult,
  mergeEvents,
  dedupePermanents,
  deepMergeReplaceArrays,
  applyMovementAndCombat,
  applyTurnStart,
  applyGenesis,
  applyKeywordAnnotations,
  enrichPatchWithCosts: enrichPatchWithCostsSafe,
  recordMatchAction,
  persistMatchUpdate,
  finalizeMatch: finalizeMatch as unknown as (match: unknown, options: Record<string, unknown>) => Promise<void>,
  rulesEnforceMode: RULES_ENFORCE_MODE,
  interactionEnforcementEnabled: INTERACTION_ENFORCEMENT_ENABLED,
  interactionKinds: INTERACTION_REQUEST_KINDS,
  interactionDecisions: INTERACTION_DECISIONS,
  isCpuPlayerId,
});

const {
  applyAction: leaderApplyAction,
  joinMatch: leaderJoinMatch,
  handleMulliganDone: leaderHandleMulliganDone,
  handleInteractionRequest: leaderHandleInteractionRequest,
  handleInteractionResponse: leaderHandleInteractionResponse,
} = matchLeaderService;

// Global feature flag for CPU bots (default: disabled)
const CPU_BOTS_ENABLED =
  process.env.NEXT_PUBLIC_CPU_BOTS_ENABLED === "1" ||
  process.env.NEXT_PUBLIC_CPU_BOTS_ENABLED === "true";

// Lazy loader: only require the headless BotClient when feature is enabled
function loadBotClientCtor() {
  if (!CPU_BOTS_ENABLED) return null;
  try {
    const mod = require("../bots/headless-bot-client");
    return mod && mod.BotClient ? mod.BotClient : null;
  } catch (e) {
    try {
      console.warn("[Bot] BotClient module unavailable:", safeErrorMessage(e));
    } catch {}
    return null;
  }
}

const container = createContainer();

container.registerValue("io", io);
container.registerValue("storeRedis", storeRedis);
container.registerValue("instanceId", INSTANCE_ID);
container.registerValue("rid", rid);
container.registerValue("matches", matches);
container.registerValue("players", players);
container.registerValue("playerIdBySocket", playerIdBySocket);
container.registerValue("prisma", prisma);
container.registerValue("config", serverConfig);

const { lobby: lobbyFeature, tournament: tournamentFeature } = registerFeatures(
  container,
  {
    rid,
    ensurePlayerCached,
    players,
    matches,
    playerIdBySocket,
    getPlayerInfo,
    getMatchInfo,
    lobbyHasHumanPlayers,
    createRngFromString,
    generateBoosterDeterministic,
    startMatchRecording,
    persistMatchCreated,
    hydrateMatchFromDatabase,
    lobbyControlChannel: LOBBY_CONTROL_CHANNEL,
    lobbyStateChannel: LOBBY_STATE_CHANNEL,
    cpuBotsEnabled: CPU_BOTS_ENABLED,
    loadBotClientCtor,
    port: PORT,
    isCpuPlayerId,
    tournamentBroadcast,
  }
);

const {
  lobbies,
  getLobbyInfo,
  normalizeSealedConfig,
  normalizeDraftConfig,
  broadcastLobbies,
  playersArray,
  publishLobbyState,
  publishLobbyDelete,
  getOrClaimLobbyLeader,
  handleLobbyControlAsLeader,
  setBotManager,
  upsertLobbyFromSerialized,
} = lobbyFeature;

const {
  broadcastTournamentUpdate,
  broadcastPhaseChanged,
  broadcastRoundStarted,
  broadcastPlayerJoined,
  broadcastPlayerLeft,
  broadcastPreparationUpdate,
  broadcastDraftReady,
  broadcastStatisticsUpdate,
} = tournamentFeature;

container.initialize().catch((err: unknown) => {
  try {
    console.error(
      "[container] Initialization failed:",
      err instanceof Error ? err.message : err
    );
  } catch {
    // noop
  }
});

function getVoiceRoomIdForPlayer(player: PlayerState | null | undefined): string | null {
  if (!player) return null;
  if (player.lobbyId) return `lobby:${player.lobbyId}`;
  if (player.matchId) return `match:${player.matchId}`;
  return null;
}
clusterStateReady = true;

// Bot manager for headless CPU clients
// Initialized after lobby feature wiring so it can access shared state
const botManager = new BotManager(
  io,
  players,
  lobbies,
  matches,
  getLobbyInfo,
  getMatchInfo,
  isCpuPlayerId
);
setBotManager(botManager);

// -----------------------------
// Helpers: CPU detection & cleanup
// -----------------------------
function isCpuPlayerId(id: string | null | undefined): boolean {
  return typeof id === "string" && id.startsWith("cpu_");
}

// Returns true if there is at least one non-CPU (human) player in the lobby
function lobbyHasHumanPlayers(lobby: LobbyState | null | undefined): boolean {
  if (!lobby || !lobby.playerIds || lobby.playerIds.size === 0) return false;
  for (const pid of lobby.playerIds) {
    if (!isCpuPlayerId(pid)) return true;
  }
  return false;
}

// Returns true if there is at least one non-CPU (human) player in the match
function matchHasHumanPlayers(match: ServerMatchState | null | undefined): boolean {
  if (!match || !Array.isArray(match.playerIds) || match.playerIds.length === 0)
    return false;
  for (const pid of match.playerIds) {
    if (!isCpuPlayerId(pid)) return true;
  }
  return false;
}

async function finalizeMatch(match: ServerMatchState, options: AnyRecord = {}): Promise<void> {
  if (!match) return;
  if (match._finalized) {
    if (!match.winnerId && typeof options?.winnerId === "string") {
      match.winnerId = options.winnerId;
    }
    return;
  }

  const now = Date.now();
  const winnerSeatOption = options?.winnerSeat;
  const loserSeatOption = options?.loserSeat;
  const winnerSeat =
    winnerSeatOption === "p1" || winnerSeatOption === "p2"
      ? winnerSeatOption
      : match.game && (match.game.winner === "p1" || match.game.winner === "p2")
      ? match.game.winner
      : null;
  const loserSeat =
    loserSeatOption === "p1" || loserSeatOption === "p2"
      ? loserSeatOption
      : winnerSeat
      ? getOpponentSeatStrict(winnerSeat)
      : null;

  let winnerId =
    typeof options?.winnerId === "string" ? options.winnerId : null;
  if (!winnerId && winnerSeat) {
    winnerId = getPlayerIdForSeat(match, winnerSeat);
  }

  let loserId = typeof options?.loserId === "string" ? options.loserId : null;
  if (!loserId && loserSeat) {
    loserId = getPlayerIdForSeat(match, loserSeat);
  }
  if (!loserId && winnerId) {
    loserId = inferLoserId(match, winnerId);
  }

  let isDraw = options?.isDraw === true;
  if (!winnerId && !isDraw) {
    isDraw = true;
  }
  if (winnerId && loserId && winnerId === loserId) {
    loserId = inferLoserId(match, winnerId);
  }
  if (isDraw) {
    winnerId = null;
    loserId = null;
  }

  match.status = "ended";
  match.winnerId = winnerId || null;
  match.lastTs = now;
  match._finalized = true;

  const room = `match:${match.id}`;
  io.to(room).emit("matchStarted", { match: getMatchInfo(match) });
  try {
    botManager.cleanupBotsAfterMatch(match);
  } catch {}
  try {
    await persistMatchEnded(match);
  } catch {}
  try {
    finishMatchRecording(match.id);
  } catch {}
  try {
    if (match._cleanupTimer) {
      clearTimeout(match._cleanupTimer);
      match._cleanupTimer = null;
    }
  } catch {}

  const leaderboardPayload = isDraw ? { isDraw: true } : { winnerId, loserId };

  recordLeaderboardMatchResult(match, leaderboardPayload).catch(() => {});

  // If this is a tournament match, persist result into Tournament Match and update round completion
  try {
    if (match.tournamentId) {
      const nowIso = new Date().toISOString();
      const tMatch = await prisma.match.findUnique({
        where: { id: match.id },
        include: { tournament: true, round: true },
      });
      if (tMatch) {
        const gameResults = Array.isArray(match?.game?.results)
          ? match.game.results
          : [];
        const matchResults = {
          winnerId: winnerId || null,
          loserId: loserId || null,
          isDraw,
          gameResults,
          completedAt: nowIso,
        };

        // Idempotent completion: only update if not already completed
        await prisma.match.updateMany({
          where: { id: match.id, status: { not: "completed" } },
          data: {
            status: "completed",
            results: matchResults,
            completedAt: new Date(),
          },
        });

        // FIXED T015/T023: Use standings service for atomic updates
        try {
          const playersVal: Array<{ id?: string; playerId?: string; userId?: string } | null> = Array.isArray(
            tMatch.players
          )
            ? tMatch.players
            : [];
          const playerIds = playersVal
            .map((p: { id?: string; playerId?: string; userId?: string } | null) => {
              if (p && typeof p === "object") {
                const id = p.id || p.playerId || p.userId;
                return typeof id === "string" ? id : null;
              }
              return null;
            })
            .filter(Boolean);
          if (playerIds.length === 2) {
            const [p1, p2] = playerIds;
            const w = isDraw ? p1 : winnerId;
            const l = isDraw ? p2 : loserId;
            if (w && l) {
              await standingsService.recordMatchResult(
                prisma,
                tMatch.tournamentId || "",
                w,
                l,
                isDraw
              );
            }
          }
        } catch (err) {
          // Standings service handles retry logic internally
          console.error(
            "[Match] Failed to update standings:",
            err && typeof err === "object" && "message" in err
              ? err.message
              : err
          );
          throw err; // Re-throw to prevent marking match as complete
        }

        // If part of a round, possibly mark the round complete and (optionally) the tournament
        if (tMatch.roundId) {
          const pendingMatches = await prisma.match.count({
            where: {
              roundId: tMatch.roundId,
              status: { in: ["pending", "active"] },
            },
          });
          if (pendingMatches === 0) {
            await prisma.tournamentRound.update({
              where: { id: tMatch.roundId },
              data: { status: "completed", completedAt: new Date() },
            });

            // End tournament if this was the last configured round
            if (tMatch.tournament && tMatch.round) {
              const settings = tMatch.tournament.settings || {};
              const pairingFormat =
                settings &&
                typeof settings === "object" &&
                "pairingFormat" in settings
                  ? settings.pairingFormat
                  : "swiss";
              let totalRounds =
                settings &&
                typeof settings === "object" &&
                "totalRounds" in settings
                  ? Number(settings.totalRounds)
                  : 0;
              if (!totalRounds) {
                const playerCount = await prisma.playerStanding.count({
                  where: { tournamentId: tMatch.tournament.id },
                });
                if (pairingFormat === "round_robin")
                  totalRounds = Math.max(0, playerCount - 1);
                else if (pairingFormat === "elimination")
                  totalRounds = Math.max(
                    1,
                    Math.ceil(Math.log2(Math.max(playerCount, 1)))
                  );
                else totalRounds = 3;
              }
              if (tMatch.round.roundNumber >= totalRounds) {
                await prisma.tournament.update({
                  where: { id: tMatch.tournament.id },
                  data: { status: "completed", completedAt: new Date() },
                });
              }
            }
          }
        }
      }
    }
  } catch (err) {
    try {
      console.warn(
        "[tournament] failed to record result into rounds:",
        safeErrorMessage(err)
      );
    } catch {}
  }
}

// Bot lifecycle helpers moved into BotManager

// -----------------------------
// Helpers: deck normalization & validation
// -----------------------------
function rid(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 8)}${Date.now()
    .toString(36)
    .slice(-4)}`;
}

type BasicPlayerInfo = { id: string; displayName: string; seat?: Seat };

function getPlayerInfo(playerId: string, seat: Seat | null = null): BasicPlayerInfo | null {
  const p = players.get(playerId);
  if (!p) return null;
  const info: BasicPlayerInfo = { id: p.id, displayName: p.displayName };
  if (seat === "p1" || seat === "p2") {
    info.seat = seat;
  }
  return info;
}

function getPlayerBySocket(socket: SocketClient | null | undefined): PlayerState | null {
  if (!socket) return null;
  const pid = playerIdBySocket.get(socket.id);
  if (!pid) return null;
  return players.get(pid) || null;
}

// Ensure basic player profile is cached locally; fetch displayName from Redis if needed
async function ensurePlayerCached(playerId: string): Promise<PlayerState> {
  const cached = players.get(playerId);
  if (cached) return cached;
  try {
    const dn = storeRedis
      ? await storeRedis.hget(`player:${playerId}`, "displayName")
      : null;
    const p: PlayerState = {
      id: playerId,
      displayName: dn || `Player ${String(playerId).slice(-4)}`,
      socketId: null,
      lobbyId: null,
      matchId: null,
    };
    players.set(playerId, p);
    return p;
  } catch {
    const p: PlayerState = {
      id: playerId,
      displayName: `Player ${String(playerId).slice(-4)}`,
      socketId: null,
      lobbyId: null,
      matchId: null,
    };
    players.set(playerId, p);
    return p;
  }
}

function isPlayerConnected(playerId: string): boolean {
  const p = players.get(playerId);
  if (!p || !p.socketId) return false;
  return !!io.sockets.sockets.get(p.socketId);
}

// -----------------------------
// Distributed match coordination helpers (Redis)
// -----------------------------
async function getOrClaimMatchLeader(matchId: string): Promise<string | null> {
  try {
    if (!storeRedis) return INSTANCE_ID; // single-instance fallback
    const key = `match:leader:${matchId}`;
    const current = await storeRedis.get(key);
    if (current) {
      if (current === INSTANCE_ID) {
        try {
          await storeRedis.expire(key, 60);
        } catch {}
      }
      return current;
    }
    // Try to claim leadership
    const setRes = await storeRedis.set(key, INSTANCE_ID, "NX", "EX", 60);
    if (setRes) return INSTANCE_ID;
    // Someone else won
    return await storeRedis.get(key);
  } catch {
    return INSTANCE_ID;
  }
}

async function getOrLoadMatch(matchId: string): Promise<ServerMatchState | null> {
  if (matches.has(matchId)) return matches.get(matchId) ?? null;
  // Try Redis cache first
  try {
    if (storeRedis) {
      const raw = await storeRedis.get(`match:session:${matchId}`);
      if (raw) {
        try {
          const cached = JSON.parse(raw);
          if (cached && cached.id === matchId) {
            const m = rehydrateMatch(cached);
            if (m) {
              try {
                await hydrateMatchFromDatabase(matchId, m);
              } catch {}
              matches.set(matchId, m);
              return m;
            }
          }
        } catch {}
      }
    }
  } catch {}
  // Fallback to DB
  try {
    const row = await prisma.onlineMatchSession.findUnique({
      where: { id: matchId },
    });
    if (row) {
      const m = rehydrateMatch(row as AnyRecord);
      if (m) {
        // Backfill tournament context/decks from Match table if available
        try {
          await hydrateMatchFromDatabase(matchId, m);
        } catch {}
        matches.set(matchId, m);
        return m;
      }
    }
  } catch {}
  // Additional fallback: if no OnlineMatchSession, try to hydrate from tournament Match table
  try {
    const t = await prisma.match.findUnique({
      where: { id: matchId },
      include: { tournament: { select: { format: true, name: true } } },
    });
    if (t) {
      // Extract playerIds from flexible tournament match players JSON
      const playersJson = t.players as unknown;
      let playerIds: string[] = [];
      try {
        let arr: unknown[] = [];
        if (Array.isArray(playersJson)) {
          arr = playersJson;
        } else if (playersJson && typeof playersJson === "object") {
          const json = playersJson as Record<string, unknown>;
          if (Array.isArray(json.playerIds)) arr = json.playerIds;
          else if (Array.isArray(json.players)) arr = json.players as unknown[];
        }
        const normalized = arr
          .map((it) => {
            if (typeof it === "string") return it;
            if (it && typeof it === "object") {
              const value = (it as Record<string, unknown>).id ??
                (it as Record<string, unknown>).playerId ??
                (it as Record<string, unknown>).userId;
              return typeof value === "string" ? value : value != null ? String(value) : null;
            }
            return null;
          })
          .filter((value): value is string => typeof value === "string");
        playerIds = Array.from(new Set(normalized));
      } catch {}

      // Map tournament format/status to session matchType/status
      const tf = t?.tournament?.format;
      const matchType =
        tf === "sealed" || tf === "draft" || tf === "constructed"
          ? tf
          : "constructed";
      let status = matchType === "sealed" ? "deck_construction" : "waiting";
      try {
        const s = t.status;
        if (s === "active") status = "in_progress";
        else if (s === "completed" || s === "cancelled") status = "ended";
      } catch {}

      // Build in-memory session from tournament Match, then persist as OnlineMatchSession
      // IMPORTANT: This fallback should only be used for new matches. If status is 'active',
      // it means an OnlineMatchSession was lost and game state will be reset.
      if (status === "in_progress") {
        try {
          console.warn(
            `[match] WARNING: Creating tournament match ${matchId} from Match table with status in_progress. This indicates OnlineMatchSession was lost and game state will be reset. This should not happen with cleanup protection.`
          );
        } catch {}
      }

      const match = {
        id: matchId,
        lobbyId: null,
        lobbyName: t?.tournament?.name || null,
        tournamentId: t.tournamentId || null,
        playerIds,
        status,
        seed: `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
        turn: playerIds[0] || null,
        winnerId: null,
        matchType,
        sealedConfig: null,
        draftConfig: null,
        playerDecks: (() => {
          try {
            return t.playerDecks && typeof t.playerDecks === "object"
              ? new Map(Object.entries(t.playerDecks))
              : new Map();
          } catch {
            return new Map();
          }
        })(),
        game: {},
        lastTs: 0,
        interactionRequests: new Map(),
        interactionGrants: new Map(),
      };

      matches.set(matchId, match);
      // Elect leadership for this match and persist the session so other instances can recover it
      try {
        if (storeRedis)
          await storeRedis.set(
            `match:leader:${match.id}`,
            INSTANCE_ID,
            "NX",
            "EX",
            60
          );
      } catch {}
      try {
        await persistMatchCreated(match);
      } catch {}
      try {
        await hydrateMatchFromDatabase(matchId, match);
      } catch {}
      return match;
    }
  } catch {}
  return null;
}

// Permanently remove a match if truly empty (no players, no sockets in room)
async function cleanupMatchNow(
  matchId: string,
  reason: string | null,
  force = false
): Promise<void> {
  const match = await getOrLoadMatch(matchId);
  if (!match) return;

  // Protect active tournament matches and in-progress matches from cleanup (but allow ended matches to be cleaned)
  if (
    match.status === "in_progress" ||
    match.status === "waiting" ||
    match.status === "deck_construction"
  ) {
    if (match.tournamentId) {
      try {
        console.log(
          `[match] cleanup blocked for active tournament match ${matchId} (status: ${match.status})`
        );
      } catch {}
      return;
    }
    // Also protect any in-progress match (tournament or not) to preserve game state for reconnects
    if (match.status === "in_progress") {
      try {
        console.log(`[match] cleanup blocked for in-progress match ${matchId}`);
      } catch {}
      return;
    }
  }

  // Check roster empty condition
  const rosterEmpty =
    !Array.isArray(match.playerIds) || match.playerIds.length === 0;
  // Check room occupancy across cluster (requires Redis adapter)
  let roomEmpty = true;
  try {
    const room = `match:${matchId}`;
    if (typeof io.in(room).allSockets === "function") {
      const sockets = await io.in(room).allSockets();
      roomEmpty = !sockets || sockets.size === 0;
    }
  } catch {}
  // Force allows cleanup of orphaned waiting matches even if roster still lists players,
  // as long as the room is empty across the cluster.
  if ((!rosterEmpty && !force) || !roomEmpty) {
    try {
      console.log(
        `[match] cleanup skipped for ${matchId}: rosterEmpty=${rosterEmpty}, roomEmpty=${roomEmpty}, force=${force}`
      );
    } catch {}
    return;
  }
  // Clear any pending timers
  try {
    if (match._cleanupTimer) {
      clearTimeout(match._cleanupTimer);
      match._cleanupTimer = null;
    }
  } catch {}
  try {
    console.log(`[match] cleaning up ${matchId} (reason=${reason})`);
  } catch {}
  // Delete from DB and cache
  try {
    if (storeRedis) await storeRedis.del(`match:session:${matchId}`);
  } catch {}
  try {
    await prisma.onlineMatchAction.deleteMany({ where: { matchId } });
  } catch {}
  try {
    await prisma.onlineMatchSession.delete({ where: { id: matchId } });
  } catch {}
  try {
    matches.delete(matchId);
  } catch {}
}



// Handle per-player mulligan completion as the cluster leader
function getMatchInfo(match: ServerMatchState): AnyRecord {
  const playerIds = Array.isArray(match.playerIds) ? match.playerIds : [];
  const playersWithSeat = playerIds
    .map((playerId, index) => {
      const seat = index === 0 ? "p1" : index === 1 ? "p2" : null;
      return getPlayerInfo(playerId, seat);
    })
    .filter(Boolean);

  return {
    id: match.id,
    lobbyId: match.lobbyId || undefined,
    lobbyName: match.lobbyName || undefined,
    tournamentId: match.tournamentId || undefined,
    draftSessionId: match.draftSessionId || undefined,
    players: playersWithSeat,
    playerIds,
    status: match.status,
    seed: match.seed,
    turn: match.turn,
    winnerId: match.winnerId ?? null,
    matchType: match.matchType || "constructed",
    sealedConfig: match.sealedConfig
      ? normalizeSealedConfig(match.sealedConfig)
      : null,
    draftConfig: match.draftConfig
      ? normalizeDraftConfig(match.draftConfig)
      : null,
    deckSubmissions: match.playerDecks
      ? Array.from(match.playerDecks.keys())
      : [],
    playerDecks: match.playerDecks
      ? Object.fromEntries(match.playerDecks)
      : undefined,
    sealedPacks: match.sealedPacks || undefined,
    draftState: match.draftState || undefined,
  };
}

async function hydrateMatchFromDatabase(matchId: string, match: ServerMatchState): Promise<void> {
  console.log("[hydrateMatchFromDatabase] Called for match:", {
    matchId,
    matchType: match.matchType,
    tournamentId: match.tournamentId,
  });
  try {
    const dbMatch = await prisma.match.findUnique({
      where: { id: matchId },
      select: {
        tournamentId: true,
        roundId: true,
        playerDecks: true,
      },
    });
    if (dbMatch) {
      try {
        if (!match.tournamentId && dbMatch.tournamentId)
          match.tournamentId = dbMatch.tournamentId;
      } catch {}
      try {
        if (!match.roundId && dbMatch.roundId) match.roundId = dbMatch.roundId;
      } catch {}
      if (dbMatch.playerDecks && typeof dbMatch.playerDecks === "object") {
        try {
          match.playerDecks = new Map(Object.entries(dbMatch.playerDecks));
        } catch {}
      }
    }
    if (!match.playerDecks || !(match.playerDecks instanceof Map)) {
      match.playerDecks = new Map();
    }
    if (!match.sealedConfig && match.matchType === "sealed") {
      match.sealedConfig = normalizeSealedConfig({
        packCount: 6,
        setMix: ["Alpha"],
        timeLimit: 40,
        replaceAvatars: false,
      });
    }
    // Load DraftSession config for tournament draft matches to get cubeId
    if (match.matchType === "draft" && match.tournamentId) {
      console.log(
        "[hydrateMatchFromDatabase] Loading DraftSession for tournament draft:",
        { matchId, tournamentId: match.tournamentId }
      );
      try {
          const draftSession = await prisma.draftSession.findFirst({
            where: { tournamentId: match.tournamentId },
            select: { settings: true, packConfiguration: true },
          });
          if (draftSession) {
            // Extract cubeId from DraftSession settings
            const settings =
              draftSession.settings && typeof draftSession.settings === "object"
                ? (draftSession.settings as Record<string, unknown>)
                : {};
            const cubeId = toOptionalString(settings.cubeId);

            // Build draftConfig from DraftSession
            type DraftPackConfigurationEntry = {
              setId?: string | null;
              packCount?: number | null;
            };
            const packConfig = Array.isArray(draftSession.packConfiguration)
              ? (draftSession.packConfiguration as DraftPackConfigurationEntry[])
              : [];
            const packCounts: Record<string, number> = {};
            for (const entry of packConfig) {
              const setId =
                entry && typeof entry.setId === "string" && entry.setId
                  ? entry.setId
                  : "Beta";
              const packs =
                typeof entry?.packCount === "number" && Number.isFinite(entry.packCount)
                  ? entry.packCount
                  : 0;
              packCounts[setId] = (packCounts[setId] || 0) + packs;
            }

            match.draftConfig = {
              cubeId: cubeId || undefined,
              packCounts,
              packCount:
              Object.values(packCounts).reduce((a, b) => a + b, 0) || 3,
            packSize: 15,
          };

          console.log(
            "[Tournament Draft] Loaded draftConfig from DraftSession:",
            { matchId, cubeId, packCount: match.draftConfig.packCount }
          );
        }
      } catch (err) {
        console.warn(
          "[Tournament Draft] Failed to load DraftSession:",
          safeErrorMessage(err)
        );
      }
    }
  } catch (err) {
    try {
      console.warn(
        `[Tournament] Failed to hydrate match ${matchId} from database:`,
        safeErrorMessage(err)
      );
    } catch {}
  }
}

// T019: Tournament broadcast helpers - now use extracted module
function broadcastPlayers() {
  io.emit("playerList", { players: playersArray() });
}

function startMatchRecording(match: ServerMatchState): void {
  const playerNames = match.playerIds.map((pid) => {
    const p = players.get(pid);
    return p ? p.displayName : `Player ${pid}`;
  });

  const recording: MatchRecordingEntry = {
    matchId: match.id,
    playerNames,
    startTime: Date.now(),
    initialState: {
      playerIds: [...match.playerIds],
      seed: (match as AnyRecord).seed ?? null,
      matchType: match.matchType,
      playerDecks: match.playerDecks
        ? Object.fromEntries(match.playerDecks)
        : undefined,
    },
    actions: [],
  };

  matchRecordings.set(match.id, recording);
  try {
    console.log(
      `[Recording] Started recording match ${
        match.id
      } with players: ${playerNames.join(", ")}`
    );
  } catch {}
}

function recordMatchAction(matchId: string, patch: MatchPatch | null, playerId: string): void {
  const recording = matchRecordings.get(matchId);
  if (!recording) {
    try {
      console.log(`[Recording] No recording found for match ${matchId}`);
    } catch {}
    return;
  }

  recording.actions.push({
    patch,
    timestamp: Date.now(),
    playerId,
  });
  try {
    console.log(
      `[Recording] Recorded action ${recording.actions.length} for match ${matchId} by player ${playerId}`
    );
  } catch {}
}

function finishMatchRecording(matchId: string): void {
  const recording = matchRecordings.get(matchId);
  if (!recording) return;

  recording.endTime = Date.now();
  try {
    console.log(
      `[Recording] Finished recording match ${matchId}, total actions: ${recording.actions.length}`
    );
  } catch {}
}

const REQUIRE_JWT = Boolean(
  (process.env.SOCKET_REQUIRE_JWT || "").toLowerCase() === "1" ||
    (process.env.SOCKET_REQUIRE_JWT || "").toLowerCase() === "true"
);

// Enforce NextAuth-signed JWT at connect time
io.use((socket: SocketClient, next: (err?: Error) => void) => {
  try {
    const handshakeAuth = socket.handshake?.auth as { token?: string } | undefined;
    const token = handshakeAuth?.token ?? null;
    if (token && process.env.NEXTAUTH_SECRET) {
      const payload = jwt.verify(token, process.env.NEXTAUTH_SECRET) as NextAuthJwtPayload;
      socket.data = socket.data || {};
      socket.data.authUser = {
        id: payload?.uid || payload?.sub || null,
        name: payload?.name,
      };
      return next();
    }
    if (REQUIRE_JWT) {
      try {
        console.warn("[auth] connect rejected: auth_required", {
          tokenPresent: !!token,
          origin:
            socket.handshake &&
            socket.handshake.headers &&
            socket.handshake.headers.origin,
          referer:
            socket.handshake &&
            socket.handshake.headers &&
            socket.handshake.headers.referer,
        });
      } catch {}
      return next(new Error("auth_required"));
    }
    return next();
  } catch (e) {
    try {
      console.warn("[auth] connect rejected: invalid_token", {
        message: String(safeErrorMessage(e)),
      });
    } catch {}
    return next(new Error("invalid_token"));
  }
});

io.on("connection", async (socket: SocketClient) => {
  let authed = false;
  let authUser = null;
  // Track current draft session room for this socket (if any)
  let currentDraftSessionId: string | null = null;
  container.applyConnectionHandlers({
    socket,
    isAuthed: () => authed,
    getPlayerBySocket,
  });

  const rtcHandlers = registerRtcHandlers({
    io,
    socket,
    isAuthed: () => authed,
    getPlayerBySocket,
    getPlayerInfo,
    getVoiceRoomIdForPlayer,
    players,
    lobbies,
    matches,
    pendingVoiceRequests,
    rtcParticipants,
    participantDetails,
    rid,
  });

  // Read auth result from middleware (fallback to soft-allow if not required)
  if (socket.data && socket.data.authUser) {
    authUser = socket.data.authUser;
  } else if (REQUIRE_JWT) {
    try {
      socket.emit("error", { message: "auth_required" });
    } catch {}
    try {
      socket.disconnect(true);
    } catch {}
    return;
  }

  socket.on("hello", async (payload) => {
    const rawName =
      payload && typeof payload.displayName === "string"
        ? payload.displayName
        : "";
    let displayName = (rawName.trim() || "Player").slice(0, 40);
    if (authUser && authUser.name) {
      displayName = String(authUser.name).slice(0, 40);
    }
    const providedId =
      payload && payload.playerId ? String(payload.playerId) : null;
    const tokenId = authUser && authUser.id ? String(authUser.id) : null;
    const playerId = tokenId || providedId || rid("p");

    let player = players.get(playerId);
    if (!player) {
      player = {
        id: playerId,
        displayName,
        socketId: socket.id,
        lobbyId: null,
        matchId: null,
      };
      players.set(playerId, player);
    } else {
      player.displayName = displayName;
      player.socketId = socket.id;
    }
    playerIdBySocket.set(socket.id, playerId);
    authed = true;

    // Cache player displayName in Redis for cross-instance lookups
    try {
      if (storeRedis) {
        await storeRedis.hset(`player:${playerId}`, { displayName });
      }
    } catch {}

    console.log(
      `[auth] hello <= name="${displayName}" id=${playerId} providedId=${!!providedId} tokenId=${
        tokenId ? "yes" : "no"
      } socket=${socket.id}`
    );

    socket.emit("welcome", {
      you: { id: player.id, displayName: player.displayName },
    });
    broadcastPlayers();

    // Rejoin previous rooms if any
    if (player.matchId && matches.has(player.matchId)) {
      socket.join(`match:${player.matchId}`);
      const m = matches.get(player.matchId);
      if (m) {
        socket.emit("matchStarted", { match: getMatchInfo(m) });

        // If rejoining during an active draft, send current draft state
        if (
          m.matchType === "draft" &&
          m.draftState &&
          m.draftState.phase !== "waiting"
        ) {
          console.log(
            `[Draft] Player ${player.displayName} (${player.id}) rejoining active draft - sending current draft state`
          );
          socket.emit("draftUpdate", m.draftState);
        }
      }
    } else if (player.lobbyId && lobbies.has(player.lobbyId)) {
      socket.join(`lobby:${player.lobbyId}`);
      const l = lobbies.get(player.lobbyId);
      if (l) {
        socket.emit("joinedLobby", { lobby: getLobbyInfo(l) });
      }
    } else {
      // Server restart recovery path: attach player to an active match from DB if found
      try {
        const recovered = await findActiveMatchForPlayer(player.id);
        if (recovered) {
          player.matchId = recovered.id;
          socket.join(`match:${recovered.id}`);
          socket.emit("matchStarted", { match: getMatchInfo(recovered) });
          if (
            recovered.matchType === "draft" &&
            recovered.draftState &&
            recovered.draftState.phase !== "waiting"
          ) {
            socket.emit("draftUpdate", recovered.draftState);
          }
        }
      } catch {}
    }
  });

  // --- Tournament Draft session rooms + presence ---
  socket.on("draft:session:join", async (payload?: DraftSessionJoinPayload) => {
    if (!authed) return;
    const sessionId = payload?.sessionId;
    if (!sessionId) return;
    try {
      await socket.join(`draft:${sessionId}`);
      currentDraftSessionId = sessionId;
      // Ack
      try {
        socket.emit("draft:session:joined", { sessionId });
      } catch {}
      // Presence update
      try {
        const pid = playerIdBySocket.get(socket.id);
        const p = pid ? players.get(pid) : null;
        const list = await updateDraftPresence(
          sessionId,
          pid || "unknown",
          p?.displayName || null,
          true
        );
        if (pid) {
          try {
            await prisma.draftParticipant.updateMany({
              where: { draftSessionId: sessionId, playerId: pid },
              data: { status: "active" },
            });
          } catch (err) {
            try {
              console.warn(
                "[draft] failed to mark participant active",
                safeErrorMessage(err)
              );
            } catch {}
          }
        }
        io.to(`draft:${sessionId}`).emit("draft:session:presence", {
          sessionId,
          players: list,
        });
        // Also emit directly to the joining socket after a short delay to avoid missing the snapshot
        try {
          setTimeout(() => {
            try {
              io.to(socket.id).emit("draft:session:presence", {
                sessionId,
                players: list,
              });
            } catch {}
          }, 25);
        } catch {}
        // Send current draft state snapshot to the joining socket (tournament draft engine)
        try {
          const mod = await tournamentModules.loadEngine();
          if (mod && typeof mod.getState === "function") {
            const s = await mod.getState(sessionId);
            if (s) {
              try {
                io.to(socket.id).emit("draftUpdate", s);
              } catch {}
            }
          }
        } catch {}
      } catch {}
    } catch (e) {
      try {
        socket.emit("draft:error", {
          errorCode: "join_failed",
          errorMessage: String(safeErrorMessage(e)),
        });
      } catch {}
    }
  });

  socket.on("draft:session:leave", async (payload?: DraftSessionLeavePayload) => {
    const sessionId = payload?.sessionId || currentDraftSessionId;
    if (!sessionId) return;
    try {
      await socket.leave(`draft:${sessionId}`);
    } finally {
      if (currentDraftSessionId === sessionId) currentDraftSessionId = null;
      try {
        const pid = playerIdBySocket.get(socket.id);
        if (pid) {
          const list = await updateDraftPresence(
            sessionId,
            pid,
            players.get(pid)?.displayName || null,
            false
          );
          io.to(`draft:${sessionId}`).emit("draft:session:presence", {
            sessionId,
            players: list,
          });
          try {
            await prisma.draftParticipant.updateMany({
              where: { draftSessionId: sessionId, playerId: pid },
              data: { status: "disconnected" },
            });
          } catch (err) {
            try {
              console.warn(
                "[draft] failed to mark participant disconnected",
                safeErrorMessage(err)
              );
            } catch {}
          }
        }
      } catch {}
    }
  });

  // Per-player mulligan completion. When all players are done, advance to Main.
  socket.on("mulliganDone", async () => {
    if (!authed) return;
    const player = getPlayerBySocket(socket);
    if (!player || !player.matchId) return;
    const matchId = player.matchId;
    try {
      const leader = await getOrClaimMatchLeader(matchId);
      if (leader && leader !== INSTANCE_ID) {
        if (storeRedis)
          await storeRedis.publish(
            MATCH_CONTROL_CHANNEL,
            JSON.stringify({
              type: "mulligan:done",
              matchId,
              playerId: player.id,
            })
          );
        return;
      }
      await leaderHandleMulliganDone(matchId, player.id);
    } catch {}
  });

  socket.on("joinMatch", async (payload) => {
    if (!authed) return;
    const matchId = payload && payload.matchId;
    if (!matchId) return;
    const player = getPlayerBySocket(socket);
    if (!player) return;
    try {
      const leader = await getOrClaimMatchLeader(matchId);
      if (leader && leader !== INSTANCE_ID) {
        // Forward to leader via pub/sub
        if (storeRedis)
          await storeRedis.publish(
            MATCH_CONTROL_CHANNEL,
            JSON.stringify({
              type: "join",
              matchId,
              playerId: player.id,
              socketId: socket.id,
            })
          );
        return;
      }
      // We are the leader (or no leader configured but we claimed it), handle locally
      await leaderJoinMatch(matchId, player.id, socket.id);
    } catch {}
  });

  socket.on("leaveMatch", async () => {
    if (!authed) return;
    const player = getPlayerBySocket(socket);
    if (!player || !player.matchId) return;
    const matchId = player.matchId;
    const match = matches.get(matchId);
    // Clear player association first
    player.matchId = null;
    // Leave the match room
    socket.leave(`match:${matchId}`);
    // Remove from match roster and broadcast updated info
    if (match) {
      match.playerIds = match.playerIds.filter((pid) => pid !== player.id);
      io.to(`match:${matchId}`).emit("matchStarted", {
        match: getMatchInfo(match),
      });
      // Persist roster change
      try {
        await persistMatchUpdate(match, null, player.id, Date.now());
      } catch {}
      // If no players left, schedule cleanup
      if (!Array.isArray(match.playerIds) || match.playerIds.length === 0) {
        try {
          // Debounce existing timer
          if (match._cleanupTimer) {
            clearTimeout(match._cleanupTimer);
            match._cleanupTimer = null;
          }
        } catch {}
        const delay = MATCH_CLEANUP_DELAY_MS;
        try {
          console.log(
            `[match] scheduling cleanup in ${delay}ms for ${matchId} (both players left)`
          );
        } catch {}
        try {
          match._cleanupTimer = setTimeout(async () => {
            try {
              const leader = await getOrClaimMatchLeader(matchId);
              if (leader && leader !== INSTANCE_ID) {
                if (storeRedis)
                  await storeRedis.publish(
                    MATCH_CONTROL_CHANNEL,
                    JSON.stringify({
                      type: "match:cleanup",
                      matchId,
                      reason: "timeout_after_empty",
                    })
                  );
                return;
              }
              await cleanupMatchNow(matchId, "timeout_after_empty");
            } catch {}
          }, delay);
        } catch {}
      }
    }
  });

  socket.on("action", async (payload) => {
    if (!authed) return;
    const player = getPlayerBySocket(socket);
    if (!player || !player.matchId) return;
    const matchId = player.matchId;
    const patch = payload ? payload.action : null;
    try {
      const leader = await getOrClaimMatchLeader(matchId);
      if (leader && leader !== INSTANCE_ID) {
        if (storeRedis)
          await storeRedis.publish(
            MATCH_CONTROL_CHANNEL,
            JSON.stringify({
              type: "action",
              matchId,
              playerId: player.id,
              socketId: socket.id,
              patch,
            })
          );
        return;
      }
      await leaderApplyAction(matchId, player.id, patch, socket.id);
    } catch {}
  });

  socket.on("interaction:request", async (payload = {}) => {
    if (!authed) return;
    const player = getPlayerBySocket(socket);
    if (!player || !player.matchId) return;
    const matchId = player.matchId;
    try {
      const leader = await getOrClaimMatchLeader(matchId);
      if (leader && leader !== INSTANCE_ID) {
        if (storeRedis) {
          const msg = {
            type: "interaction:request",
            matchId,
            playerId: player.id,
            socketId: socket.id,
            payload,
          };
          await storeRedis.publish(MATCH_CONTROL_CHANNEL, JSON.stringify(msg));
        }
        return;
      }
      await leaderHandleInteractionRequest(matchId, player.id, payload);
    } catch (err) {
      try {
        console.warn(
          "[interaction] request handler error",
          safeErrorMessage(err)
        );
      } catch {}
    }
  });

  socket.on("interaction:response", async (payload = {}) => {
    if (!authed) return;
    const player = getPlayerBySocket(socket);
    if (!player || !player.matchId) return;
    const matchId = player.matchId;
    try {
      const leader = await getOrClaimMatchLeader(matchId);
      if (leader && leader !== INSTANCE_ID) {
        if (storeRedis) {
          const msg = {
            type: "interaction:response",
            matchId,
            playerId: player.id,
            socketId: socket.id,
            payload,
          };
          await storeRedis.publish(MATCH_CONTROL_CHANNEL, JSON.stringify(msg));
        }
        return;
      }
      await leaderHandleInteractionResponse(matchId, player.id, payload);
    } catch (err) {
      try {
        console.warn(
          "[interaction] response handler error",
          safeErrorMessage(err)
        );
      } catch {}
    }
  });

  socket.on("chat", (incoming?: ChatPayload) => {
    if (!authed) return;
    const payload = incoming ?? {};
    const player = getPlayerBySocket(socket);
    if (!player) return;
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

    // Global chat: broadcast to all connected clients
    if (requestedScope === "global") {
      io.emit("chat", { from, content, scope: "global" as ChatScope });
      return;
    }

    // Room-scoped chat (lobby or match). Prefer requested scope if valid and the player is in that context; otherwise infer from player state.
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

    if (room) io.to(room).emit("chat", { from, content, scope });
    else socket.emit("chat", { from: null, content, scope });
  });

  // Generic lightweight message channel
  socket.on("message", async (payload = {}) => {
    if (!authed) return;
    const player = getPlayerBySocket(socket);
    if (!player || !player.matchId) return;
    const matchId = player.matchId;
    const type =
      payload && typeof payload.type === "string" ? payload.type : null;
    if (type === "playerReady") {
      const ready = !!(payload && payload.ready);
      try {
        const leader = await getOrClaimMatchLeader(matchId);
        if (leader && leader !== INSTANCE_ID) {
          if (storeRedis)
            await storeRedis.publish(
              MATCH_CONTROL_CHANNEL,
              JSON.stringify({
                type: "draft:playerReady",
                matchId,
                playerId: player.id,
                ready,
              })
            );
          return;
        }
        await leaderDraftPlayerReady(matchId, player.id, ready);
      } catch {}
    } else if (type === "boardPing") {
      try {
        const match = await getOrLoadMatch(matchId);
        const room = `match:${matchId}`;
        const idx = Array.isArray(match?.playerIds)
          ? match.playerIds.indexOf(player.id)
          : 0;
        const playerKey = idx === 1 ? "p2" : "p1";
        const x = Number(payload && payload.position && payload.position.x);
        const z = Number(payload && payload.position && payload.position.z);
        if (!Number.isFinite(x) || !Number.isFinite(z)) return;
        const id =
          payload && typeof payload.id === "string" ? payload.id : rid("ping");
        const out = {
          type: "boardPing",
          id,
          position: { x, z },
          playerKey,
          ts: Date.now(),
        };
        io.to(room).emit("message", out);
      } catch {}
    } else if (type === "boardCursor") {
      try {
        const match = await getOrLoadMatch(matchId);
        const room = `match:${matchId}`;
        const idx = Array.isArray(match?.playerIds)
          ? match.playerIds.indexOf(player.id)
          : 0;
        const playerKey = idx === 1 ? "p2" : "p1";
        const positionPayload =
          payload && payload.position ? payload.position : null;
        const x = Number(positionPayload && positionPayload.x);
        const z = Number(positionPayload && positionPayload.z);
        const position =
          Number.isFinite(x) && Number.isFinite(z) ? { x, z } : null;
        let dragging = null;
        const draggingCandidate =
          payload && typeof payload.dragging === "object" && payload.dragging
            ? (payload.dragging as DraggingPayload)
            : null;
        if (draggingCandidate) {
          const kind =
            typeof draggingCandidate.kind === "string" ? draggingCandidate.kind : null;
          const allowedKinds: ReadonlySet<NormalizedDragging["kind"]> = new Set([
            "permanent",
            "hand",
            "pile",
            "avatar",
            "token",
          ]);
          if (kind && allowedKinds.has(kind)) {
            const next: NormalizedDragging = { kind };
            if (kind === "permanent") {
              const from =
                typeof draggingCandidate.from === "string"
                  ? draggingCandidate.from.slice(0, 32)
                  : null;
              const indexValue =
                typeof draggingCandidate.index === "number" && Number.isFinite(draggingCandidate.index)
                  ? draggingCandidate.index
                  : typeof draggingCandidate.index === "string"
                  ? Number(draggingCandidate.index)
                  : NaN;
              const index = Number.isFinite(indexValue) ? Number(indexValue) : null;
              if (from) next.from = from;
              if (index !== null) next.index = index;
            }
            if (kind === "avatar") {
              const who =
                draggingCandidate.who === "p1" || draggingCandidate.who === "p2"
                  ? draggingCandidate.who
                  : null;
              if (who) next.who = who;
            }
            const source =
              typeof draggingCandidate.source === "string"
                ? draggingCandidate.source.slice(0, 32)
                : null;
            if (source) next.source = source;
            const cardIdValue =
              typeof draggingCandidate.cardId === "number" &&
              Number.isFinite(draggingCandidate.cardId)
                ? draggingCandidate.cardId
                : typeof draggingCandidate.cardId === "string"
                ? Number(draggingCandidate.cardId)
                : NaN;
            const cardId = Number.isFinite(cardIdValue) ? Number(cardIdValue) : null;
            if (cardId !== null) next.cardId = cardId;
            const slug =
              typeof draggingCandidate.slug === "string"
                ? draggingCandidate.slug.slice(0, 64)
                : null;
            if (slug) next.slug = slug;
            const metaRaw =
              typeof draggingCandidate.meta === "object" && draggingCandidate.meta
                ? (draggingCandidate.meta as Record<string, unknown>)
                : null;
            if (metaRaw) {
              const meta: DraggingMeta = {};
              const ownerValue =
                typeof metaRaw.owner === "number" && Number.isFinite(metaRaw.owner)
                  ? metaRaw.owner
                  : typeof metaRaw.owner === "string"
                  ? Number(metaRaw.owner)
                  : null;
              if (ownerValue !== null && Number.isFinite(ownerValue)) {
                meta.owner = Number(ownerValue);
              }
              if (meta.owner !== undefined) next.meta = meta;
            }
            const allowBareKind =
              kind === "hand" || kind === "pile" || kind === "token";
            dragging =
              Object.keys(next).length > 1 || allowBareKind ? next : null;
          }
        }
        // Sanitize highlight from payload: expect an object with { cardId?, slug? }
        let highlight = null;
        const highlightCandidate =
          payload && typeof payload.highlight === "object" && payload.highlight
            ? (payload.highlight as HighlightPayload)
            : null;
        if (highlightCandidate) {
          const cardIdValue =
            typeof highlightCandidate.cardId === "number" &&
            Number.isFinite(highlightCandidate.cardId)
              ? highlightCandidate.cardId
              : typeof highlightCandidate.cardId === "string"
              ? Number(highlightCandidate.cardId)
              : NaN;
          const cardId = Number.isFinite(cardIdValue) ? Number(cardIdValue) : null;
          const slug =
            typeof highlightCandidate.slug === "string"
              ? highlightCandidate.slug.slice(0, 64)
              : null;
          if (cardId !== null || (slug && slug.length > 0)) {
            highlight = {
              ...(cardId !== null ? { cardId } : {}),
              ...(slug ? { slug } : {}),
            };
          }
        }
        const out = {
          type: "boardCursor",
          playerId: player.id,
          playerKey,
          position,
          dragging,
          highlight,
          ts: Date.now(),
        };
        io.to(room).emit("message", out);
        io.to(room).emit("boardCursor", out);
      } catch {}
    }
  });

  socket.on("resyncRequest", async () => {
    if (!authed) return;
    const player = getPlayerBySocket(socket);
    if (player && player.matchId) {
      const match = await getOrLoadMatch(player.matchId);
      if (match) {
        const snap: { match: AnyRecord; game?: MatchPatch | null; t?: number } = {
          match: getMatchInfo(match),
        };
        // Only include a game snapshot when it's meaningful.
        // During sealed/draft setup the server-side game can be an empty object ({}),
        // while the client has already loaded decks locally. Sending an empty game here
        // would wipe the client state on every resync. Avoid that by requiring either
        // an in-progress match or detectable game content.
        const hasMeaningfulGame = (() => {
          const game = match?.game;
          if (!isRecord(game)) return false;
          if (match.status === "in_progress") return true;
          const keys = Object.keys(game);
          if (keys.length === 0) return false;
          const hasKey = (key: string) => key in game;
          if (
            hasKey("libraries") ||
            hasKey("zones") ||
            hasKey("board") ||
            hasKey("permanents") ||
            hasKey("currentPlayer")
          ) {
            return true;
          }
          const phase =
            typeof game["phase"] === "string" ? (game["phase"] as string) : null;
          if (phase === "Setup" && hasKey("mulligans")) return true;
          // Consider avatars meaningful when at least one seat has a card or position
          try {
            const avatarsRaw = isRecord(game["avatars"])
              ? (game["avatars"] as Record<string, unknown>)
              : {};
            const avatarHasData = (candidate: unknown): boolean => {
              if (!isRecord(candidate)) return false;
              const card = candidate["card"];
              if (card != null) return true;
              const pos = candidate["pos"];
              return Array.isArray(pos) && pos.length === 2;
            };
            const p1Has = avatarHasData(avatarsRaw["p1"]);
            const p2Has = avatarHasData(avatarsRaw["p2"]);
            if (p1Has || p2Has) return true;
          } catch {}
          // D20 rolls are meaningful during Setup phase - needed for player seat selection
          const rollsRaw = isRecord(game["d20Rolls"])
            ? (game["d20Rolls"] as Record<string, unknown>)
            : null;
          if (rollsRaw) {
            const hasRollValue = (value: unknown): boolean =>
              typeof value === "number" ||
              (typeof value === "string" && value.trim().length > 0);
            if (hasRollValue(rollsRaw["p1"]) || hasRollValue(rollsRaw["p2"])) {
              return true;
            }
          }
          return false;
        })();
        if (hasMeaningfulGame) {
          // Enrich game state with card costs before sending to client
          const enrichedGame = await enrichPatchWithCostsSafe(
            (match.game ?? null) as MatchPatch | null,
            prisma
          );
          snap.game = enrichedGame;
          snap.t = typeof match.lastTs === "number" ? match.lastTs : Date.now();
          try {
            console.log("[resync] sending game state with d20Rolls:", {
              matchId: match.id,
              d20Rolls: match.game?.d20Rolls,
              setupWinner: match.game?.setupWinner,
              phase: match.game?.phase,
              hasMeaningfulGame,
            });
          } catch {}
        } else {
          try {
            console.log("[resync] NOT sending game state", {
              matchId: match?.id,
              gameKeys: match.game ? Object.keys(match.game) : [],
              hasMeaningfulGame,
            });
          } catch {}
        }
        socket.emit("resyncResponse", { snapshot: snap });
        // If a draft is in progress, proactively sync draft state to this socket
        try {
          if (
            match.matchType === "draft" &&
            match.draftState &&
            match.draftState.phase &&
            match.draftState.phase !== "waiting"
          ) {
            io.to(socket.id).emit("draftUpdate", match.draftState);
          }
        } catch {}
        return;
      }
    }
    if (player && player.lobbyId && lobbies.has(player.lobbyId)) {
      const lobby = lobbies.get(player.lobbyId);
      socket.emit("resyncResponse", {
        snapshot: { lobby: getLobbyInfo(lobby) },
      });
    } else {
      socket.emit("resyncResponse", { snapshot: {} });
    }
  });

  // Submit sealed deck during deck construction phase (with validation)
  socket.on("submitDeck", (payload) => {
    if (!authed) return;
    const player = getPlayerBySocket(socket);
    if (!player || !player.matchId) return;
    const match = matches.get(player.matchId);
    if (!match || match.status !== "deck_construction") return;
    if (match.matchType !== "sealed") return;
    if (!(match.playerDecks instanceof Map)) {
      match.playerDecks = new Map<string, unknown>();
    }
    const playerDecks = match.playerDecks;

    // Idempotency: if this player already submitted, ignore duplicates
    if (playerDecks.has(player.id)) {
      return;
    }

    const deckRaw = payload && payload.deck;
    if (!deckRaw) return;
    const cards = normalizeDeckPayload(deckRaw);
    const val = validateDeckCards(cards);
    if (!val.isValid) {
      socket.emit("error", {
        message: `Deck invalid: ${val.errors.join(", ")}`,
      });
      return;
    }

    // Store the player's deck
    playerDecks.set(player.id, cards);

    // Lightweight ack so client UI can flip instantly
    try {
      socket.emit("deckAccepted", {
        matchId: match.id,
        playerId: player.id,
        mode: "sealed",
        counts: val.counts || null,
        ts: Date.now(),
      });
    } catch {}

    // Check if all players have submitted decks
    const allSubmitted = match.playerIds.every((pid) => playerDecks.has(pid));

    // Broadcast deck submission update
    const room = `match:${match.id}`;
    io.to(room).emit("matchStarted", { match: getMatchInfo(match) });

    if (allSubmitted) {
      // All decks submitted, transition to waiting phase for game start
      match.status = "waiting";

      // Keep lobby visible during the match for rematch/voting UX
      const lobby = match.lobbyId ? lobbies.get(match.lobbyId) : null;
      if (lobby) {
        try {
          lobby.status = "started";
        } catch {}
        try {
          publishLobbyState(lobby);
        } catch {}
        broadcastLobbies();
      }

      io.to(room).emit("matchStarted", { match: getMatchInfo(match) });
    }
  });

  socket.on("ping", (payload) => {
    const t = payload && typeof payload.t === "number" ? payload.t : Date.now();
    socket.emit("pong", { t });
  });

  // Match recording endpoints (DB-backed)
  socket.on("getMatchRecordings", async () => {
    if (!authed) return;
    const player = getPlayerBySocket(socket);
    try {
      const allRecordings = (await replay.listRecordings(prisma, {
        limit: 200,
      })) as Array<Record<string, unknown>>;

      // Filter out bot matches (those with CPU bots or host accounts)
      // Only admins should see bot matches (via admin endpoints)
      const recordings = allRecordings.filter((recording) => {
        const playerIds = Array.isArray(recording.playerIds)
          ? (recording.playerIds as unknown[])
          : null;
        if (!playerIds) return true;
        // Exclude if any player is a bot (ID starts with 'cpu_' or 'host_')
        return !playerIds.some((playerId) => {
          const pid =
            typeof playerId === "string"
              ? playerId
              : String(playerId ?? "");
          return pid.startsWith("cpu_") || pid.startsWith("host_");
        });
      });

      try {
        console.log(
          `[Recording] Request for recordings from ${
            player?.displayName || "unknown"
          }, returning ${recordings.length} DB-backed summaries (filtered ${
            allRecordings.length - recordings.length
          } bot matches)`
        );
      } catch {}
      socket.emit("matchRecordingsResponse", { recordings });
    } catch (e) {
      try {
        console.warn("[Recording] listRecordings failed:", safeErrorMessage(e));
      } catch {}
      socket.emit("matchRecordingsResponse", { recordings: [] });
    }
  });

  socket.on("getMatchRecording", async (payload) => {
    if (!authed) return;
    const matchId = payload?.matchId;
    if (!matchId) return;
    try {
      const recording = await replay.loadRecording(prisma, matchId);
      if (!recording) {
        socket.emit("matchRecordingResponse", { error: "Recording not found" });
        return;
      }

      // Block access to bot matches for regular users
      // Check if any player is a bot (ID starts with 'cpu_' or 'host_')
      const playerIds = recording.initialState?.playerIds || [];
      const isBotMatch =
        Array.isArray(playerIds) &&
        playerIds.some((id) => {
          const pid = String(id || "");
          return pid.startsWith("cpu_") || pid.startsWith("host_");
        });

      if (isBotMatch) {
        socket.emit("matchRecordingResponse", { error: "Recording not found" });
        return;
      }

      socket.emit("matchRecordingResponse", { recording });
    } catch (e) {
      try {
        console.warn("[Recording] loadRecording failed:", safeErrorMessage(e));
      } catch {}
      socket.emit("matchRecordingResponse", { error: "Recording not found" });
    }
  });

  // Draft-specific handlers
  socket.on("startDraft", async (payload) => {
    if (!authed) return;
    const player = getPlayerBySocket(socket);
    if (!player || !player.matchId) return;
    const matchId = player.matchId;
    try {
      const leader = await getOrClaimMatchLeader(matchId);
      if (leader && leader !== INSTANCE_ID) {
        if (storeRedis)
          await storeRedis.publish(
            MATCH_CONTROL_CHANNEL,
            JSON.stringify({
              type: "draft:start",
              matchId,
              playerId: player.id,
              draftConfig: payload?.draftConfig || null,
              socketId: socket.id,
            })
          );
        return;
      }
      const match = await getOrLoadMatch(matchId);
      if (!match || match.matchType !== "draft" || !match.draftState) return;
      if (match.draftState.phase !== "waiting") {
        // Already started or in-progress: re-emit current state to salvage stuck clients
        try {
          io.to(`match:${match.id}`).emit("draftUpdate", match.draftState);
        } catch {}
      } else {
        await leaderStartDraft(
          matchId,
          player.id,
          payload?.draftConfig || null,
          socket.id
        );
      }
      // Failsafe: fetch fresh state and broadcast to ensure clients transition
      try {
        const m2 = await getOrLoadMatch(matchId);
        if (m2 && m2.draftState) {
          io.to(`match:${m2.id}`).emit("draftUpdate", m2.draftState);
        }
      } catch {}
    } catch {}
  });

  socket.on("makeDraftPick", async (payload) => {
    if (!authed) return;
    const player = getPlayerBySocket(socket);
    if (!player || !player.matchId) return;
    const matchId = player.matchId;
    const { cardId, packIndex, pickNumber } = payload || {};
    try {
      const leader = await getOrClaimMatchLeader(matchId);
      if (leader && leader !== INSTANCE_ID) {
        if (storeRedis)
          await storeRedis.publish(
            MATCH_CONTROL_CHANNEL,
            JSON.stringify({
              type: "draft:pick",
              matchId,
              playerId: player.id,
              cardId,
              packIndex,
              pickNumber,
            })
          );
        return;
      }
      await leaderMakeDraftPick(matchId, player.id, {
        cardId,
        packIndex,
        pickNumber,
      });
    } catch {}
  });

  socket.on("chooseDraftPack", async (payload) => {
    if (!authed) return;
    const player = getPlayerBySocket(socket);
    if (!player || !player.matchId) return;
    const matchId = player.matchId;
    const { setChoice, packIndex } = payload || {};
    try {
      const leader = await getOrClaimMatchLeader(matchId);
      if (leader && leader !== INSTANCE_ID) {
        if (storeRedis)
          await storeRedis.publish(
            MATCH_CONTROL_CHANNEL,
            JSON.stringify({
              type: "draft:choosePack",
              matchId,
              playerId: player.id,
              setChoice,
              packIndex,
            })
          );
        return;
      }
      await leaderChooseDraftPack(matchId, player.id, { setChoice, packIndex });
    } catch {}
  });

  // Tournament draft handlers (extracted module)
  const { registerTournamentDraftHandlers } = await import(
    "./modules/tournament/draft-socket-handler.js"
  );
  registerTournamentDraftHandlers(socket, () => authed, getPlayerBySocket);

  // Submit draft deck during deck construction phase (with validation)
  socket.on("submitDeck", (payload) => {
    if (!authed) return;
    const player = getPlayerBySocket(socket);
    if (!player || !player.matchId) return;

    const match = matches.get(player.matchId);
    if (!match) return;
    if (!(match.playerDecks instanceof Map)) {
      match.playerDecks = new Map<string, unknown>();
    }
    const playerDecks = match.playerDecks;
    if (match.matchType !== "draft") return;

    // Idempotency: ignore duplicate submissions by the same player
    if (playerDecks.has(player.id)) return;

    // Validate and store the submitted deck cards
    const deckRaw = payload && payload.deck ? payload.deck : payload;
    const cards = normalizeDeckPayload(deckRaw);
    const val = validateDeckCards(cards);
    if (!val.isValid) {
      socket.emit("error", {
        message: `Deck invalid: ${val.errors.join(", ")}`,
      });
      return;
    }
    playerDecks.set(player.id, cards);

    // Lightweight ack so client UI can flip instantly
    try {
      socket.emit("deckAccepted", {
        matchId: match.id,
        playerId: player.id,
        mode: "draft",
        counts: val.counts || null,
        ts: Date.now(),
      });
    } catch {}

    console.log(
      `[Match] Deck submitted by ${player.displayName} for match ${match.id}`
    );

    // Check if all players have submitted decks
    const allSubmitted = match.playerIds.every((pid) => playerDecks.has(pid));
    if (allSubmitted && match.status === "deck_construction") {
      console.log(
        `[Match] All draft decks submitted for match ${match.id}, transitioning to waiting (setup)`
      );
      // Do NOT skip setup for draft; mirror sealed flow: move to waiting and keep lobby visible
      match.status = "waiting";
      try {
        io.to(`match:${match.id}`).emit("matchStarted", {
          match: getMatchInfo(match),
        });
      } catch {}

      // Keep lobby visible (mark as started) for in-progress match
      if (match.lobbyId) {
        const lobby = lobbies.get(match.lobbyId);
        if (lobby) {
          try {
            lobby.status = "started";
          } catch {}
          try {
            publishLobbyState(lobby);
          } catch {}
          broadcastLobbies();
        }
      }
    }

    // Broadcast updated match info
    io.to(`match:${match.id}`).emit("matchStarted", {
      match: getMatchInfo(match),
    });
    try {
      persistMatchUpdate(match, null, player.id, Date.now());
    } catch {}
  });

  // Explicit end match (optional). Allows cleanup and status update.
  socket.on("endMatch", async (payload = {}) => {
    if (!authed) return;
    const player = getPlayerBySocket(socket);
    if (!player || !player.matchId) return;
    const match = matches.get(player.matchId);
    if (!match) return;
    try {
      await finalizeMatch(match, payload || {});
    } catch (err) {
      try {
        console.warn("[match] explicit finalize failed", safeErrorMessage(err));
      } catch {}
    }
    try {
      clearDraftWatchdog(match.id);
    } catch {}
  });

  socket.on("disconnect", () => {
    const pid = playerIdBySocket.get(socket.id);
    if (!pid) return;
    const player = players.get(pid);
    playerIdBySocket.delete(socket.id);

    rtcHandlers.handleDisconnect(player ?? null);

    // Update draft presence on disconnect (cluster-aware)
    try {
      if (currentDraftSessionId) {
        updateDraftPresence(
          currentDraftSessionId,
          pid,
          players.get(pid)?.displayName || null,
          false
        )
          .then((list) => {
            try {
              io.to(`draft:${currentDraftSessionId}`).emit(
                "draft:session:presence",
                { sessionId: currentDraftSessionId, players: list }
              );
            } catch {}
          })
          .catch(() => {});
      }
    } catch {}

    if (player) {
      // If the player was in a lobby, remove them immediately to prevent ghost lobbies
      if (player.lobbyId && lobbies.has(player.lobbyId)) {
        const lobby = lobbies.get(player.lobbyId);
        if (!lobby) {
          lobbies.delete(player.lobbyId);
          player.lobbyId = null;
        } else {
          lobby.playerIds.delete(player.id);
          lobby.ready.delete(player.id);
          // If now empty or CPU-only, close and cleanup bots; otherwise if host left, reassign preferring humans
          if (lobby.playerIds.size === 0 || !lobbyHasHumanPlayers(lobby)) {
            lobby.status = "closed";
            try {
              botManager.cleanupBotsForLobby(lobby.id);
            } catch {}
            lobbies.delete(lobby.id);
            // Replicate deletion cluster-wide
            try {
              publishLobbyDelete(lobby.id);
            } catch {}
            broadcastLobbies();
          } else if (lobby.hostId === player.id) {
            const remaining: string[] = Array.from(lobby.playerIds);
            const humanNext =
              remaining.find((pid) => !isCpuPlayerId(pid)) ??
              remaining[0] ??
              null;
            lobby.hostId = humanNext;
            lobby.ready.clear();
            io.to(`lobby:${lobby.id}`).emit("lobbyUpdated", {
              lobby: getLobbyInfo(lobby),
            });
            // Replicate update cluster-wide
            try {
              publishLobbyState(lobby);
            } catch {}
            broadcastLobbies();
          } else {
            io.to(`lobby:${lobby.id}`).emit("lobbyUpdated", {
              lobby: getLobbyInfo(lobby),
            });
            // Replicate update cluster-wide
            try {
              publishLobbyState(lobby);
            } catch {}
            broadcastLobbies();
          }
          // Clear association last so future logic sees player out of lobby
          player.lobbyId = null;
        }
      }

      // Clean up bot-only matches immediately when any player disconnects
      // Bot matches don't need the "rejoin" grace period that human matches get
      if (player.matchId && matches.has(player.matchId)) {
        const match = matches.get(player.matchId);
        if (match && !matchHasHumanPlayers(match)) {
          try {
            console.log(
              `[Match] Cleaning up bot-only match ${match.id} after disconnect`
            );
            cleanupMatchNow(match.id, "bot_only_disconnect", true).catch(
              (err) => {
                console.warn(
                  `[Match] Failed to cleanup bot match ${match.id}:`,
                  err
                );
              }
            );
          } catch (err) {
            console.warn(`[Match] Error initiating bot match cleanup:`, err);
          }
        }
      }

      // Keep player record for potential rejoin, just clear socket association
      player.socketId = null;
    }
    broadcastPlayers();
  });
});

// Periodic cleanup: trim CPU-only lobbies and bot-only matches; keep human lobbies/matches alive
setInterval(() => {
  // Clean up CPU-only lobbies
  for (const lobby of lobbies.values()) {
    if (lobby.status !== "open") continue;
    // Close CPU-only lobbies immediately
    if (!lobbyHasHumanPlayers(lobby)) {
      lobby.status = "closed";
      try {
        botManager.cleanupBotsForLobby(lobby.id);
      } catch {}
      lobbies.delete(lobby.id);
      broadcastLobbies();
      continue;
    }
  }

  // Clean up bot-only matches that are completed or have been idle
  for (const match of matches.values()) {
    try {
      if (!match) continue;

      // Skip matches with human players
      if (matchHasHumanPlayers(match)) continue;

      // Clean up bot-only matches that are completed or have been inactive for 5+ minutes
      const age = Date.now() - (Number(match.lastTs) || Date.now());
      const shouldCleanup =
        match.status === "completed" || age >= 5 * 60 * 1000;

      if (shouldCleanup) {
        console.log(
          `[Match] Periodic cleanup of bot-only match ${match.id} (status=${
            match.status
          }, age=${Math.floor(age / 1000)}s)`
        );
        cleanupMatchNow(match.id, "bot_only_periodic", true).catch((err) => {
          console.warn(`[Match] Failed to cleanup bot match ${match.id}:`, err);
        });
      }
    } catch (err) {
      console.warn("[Match] Error in bot match periodic cleanup:", err);
    }
  }
}, 30 * 1000);

// Periodic cleanup: remove stale matches (waiting matches after 10min, any match inactive after configured timeout)
setInterval(async () => {
  const now = Date.now();

  for (const match of matches.values()) {
    try {
      if (!match) continue;

      const age = now - (Number(match.lastTs) || now);

      // Rule 1: Cleanup waiting matches after 10 minutes (existing logic)
      if (match.status === "waiting" && age >= STALE_WAITING_MS) {
        const room = `match:${match.id}`;
        let roomEmpty = true;
        try {
          if (typeof io.in(room).allSockets === "function") {
            const sockets = await io.in(room).allSockets();
            roomEmpty = !sockets || sockets.size === 0;
          }
        } catch {}
        if (!roomEmpty) continue;

        try {
          const leader = await getOrClaimMatchLeader(match.id);
          if (leader && leader !== INSTANCE_ID) {
            if (storeRedis)
              await storeRedis.publish(
                MATCH_CONTROL_CHANNEL,
                JSON.stringify({
                  type: "match:cleanup",
                  matchId: match.id,
                  reason: "stale_waiting",
                  force: true,
                })
              );
            continue;
          }
          await cleanupMatchNow(match.id, "stale_waiting", true);
        } catch {}
        continue;
      }

      // Rule 2: Cleanup ANY match (including in_progress/deck_construction) inactive beyond configured timeout
      if (age >= INACTIVE_MATCH_CLEANUP_MS) {
        // Skip active tournament matches (they have their own lifecycle)
        if (match.tournamentId) continue;

        const room = `match:${match.id}`;
        let roomEmpty = true;
        try {
          if (typeof io.in(room).allSockets === "function") {
            const sockets = await io.in(room).allSockets();
            roomEmpty = !sockets || sockets.size === 0;
          }
        } catch {}
        if (!roomEmpty) continue;

        try {
          const leader = await getOrClaimMatchLeader(match.id);
          if (leader && leader !== INSTANCE_ID) {
            if (storeRedis)
              await storeRedis.publish(
                MATCH_CONTROL_CHANNEL,
                JSON.stringify({
                  type: "match:cleanup",
                  matchId: match.id,
                  reason: "inactive_timeout",
                  force: true,
                })
              );
            continue;
          }
          try {
            console.log(
              `[match] cleanup inactive match ${match.id} (status: ${
                match.status
              }, age: ${Math.round(age / 1000 / 60)}min)`
            );
          } catch {}
          await cleanupMatchNow(match.id, "inactive_timeout", true);
        } catch {}
      }
    } catch {}
  }
}, 60 * 1000);

// Database cleanup: remove old completed/cancelled/ended matches from database
setInterval(async () => {
  try {
    const CLEANUP_THRESHOLD = new Date(Date.now() - INACTIVE_MATCH_CLEANUP_MS);

    // Delete completed/cancelled/ended matches older than configured timeout
    const result = await prisma.onlineMatchSession.deleteMany({
      where: {
        status: { in: ["completed", "cancelled", "ended"] },
        updatedAt: { lt: CLEANUP_THRESHOLD },
      },
    });

    if (result.count > 0) {
      try {
        console.log(
          `[db] cleaned up ${result.count} old match(es) from database`
        );
      } catch {}
    }
  } catch (e) {
    try {
      console.warn(`[db] cleanup failed:`, safeErrorMessage(e));
    } catch {}
  }
}, 5 * 60 * 1000); // Run every 5 minutes

server.listen(PORT, () => {
  console.log(
    `[sorcery] Socket.IO server listening on http://localhost:${PORT}`
  );
});

// Startup: connect DB and attempt recovery
(async () => {
  try {
    await prisma.$connect();
    try {
      console.log("[db] connected");
    } catch {}
  } catch (e) {
    try {
      console.error("[db] connection failed:", safeErrorMessage(e));
    } catch {}
  }
  try {
    await recoverActiveMatches();
  } catch {}
  // Enable cluster pub/sub processing now that maps are initialized
  try {
    clusterStateReady = true;
    console.log("[store] cluster state ready; pub/sub handlers active");
  } catch {}
  isReady = true;
})();

// Graceful shutdown
async function shutdown() {
  if (isShuttingDown) return;
  isShuttingDown = true;
  const timeout = Number(process.env.SHUTDOWN_TIMEOUT_MS || 10000);
  try {
    console.log("[server] shutting down...");
  } catch {}
  const timer = setTimeout(() => process.exit(0), timeout);
  try {
    await new Promise<void>((resolve) => io.close(() => resolve()));
  } catch {}
  try {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  } catch {}
  try {
    if (pubClient) await pubClient.quit();
  } catch {}
  try {
    if (subClient) await subClient.quit();
  } catch {}
  // Flush any buffered persists before disconnecting from DB
  try {
    if (PERSIST_IS_WRITE_BEHIND) {
      await flushAllPersistenceBuffers("shutdown");
    }
  } catch {}
  try {
    await prisma.$disconnect();
  } catch {}
  clearTimeout(timer);
  process.exit(0);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
