// Simple Socket.IO server for Sorcery online MVP
// Run with: npm run server:dev (development) or npm run server:start (production)

// T019: Import extracted modules
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createBootstrap } = require("./core/bootstrap");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createPersistenceLayer } = require("./core/persistence");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createContainer } = require("./core/container");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { registerFeatures } = require("./features");
const {
  createInteractionModule,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  INTERACTION_VERSION,
  INTERACTION_ENFORCEMENT_ENABLED,
  INTERACTION_REQUEST_KINDS,
  INTERACTION_DECISIONS,
  // eslint-disable-next-line @typescript-eslint/no-require-imports
} = require("./modules/interactions");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const modules = require("./modules");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createMatchLeaderService } = require("./modules/match-leader");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { enrichPatchWithCosts } = require("./modules/card-costs");
const {
  getSeatForPlayer,
  getPlayerIdForSeat,
  getOpponentSeat: getOpponentSeatRaw,
  inferLoserId,
  // eslint-disable-next-line @typescript-eslint/no-require-imports
} = require("./modules/match-utils");
const {
  normalizeDeckPayload,
  validateDeckCards,
  // eslint-disable-next-line @typescript-eslint/no-require-imports
} = require("./modules/deck-utils");
const seatFromOwner = (owner: 1 | 2): "p1" | "p2" =>
  owner === 1 ? "p1" : "p2";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createLeaderboardService } = require("./modules/leaderboard");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createMatchRecordingService } = require("./modules/match-recording");
const {
  deepMergeReplaceArrays,
  dedupePermanents,
  mergeEvents,
  // eslint-disable-next-line @typescript-eslint/no-require-imports
} = require("./modules/shared/match-helpers");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createRequestHandler } = require("./http/request-handler");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { registerRtcHandlers } = require("./socket/rtc-handlers");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { registerPubSubListeners } = require("./socket/pubsub-listeners");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createRedisStateManager } = require("./core/redis-state");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createPlayerRegistry } = require("./modules/player-registry");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { LEADER_HEARTBEAT_INTERVAL_MS } = require("./core/redis-keys");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { startMaintenanceTimers } = require("./maintenance/timers");

// eslint-disable-next-line @typescript-eslint/no-require-imports
const jwt = require("jsonwebtoken");
const {
  createRngFromString,
  generateBoosterDeterministic,
  generateCubeBoosterDeterministic,
  // eslint-disable-next-line @typescript-eslint/no-require-imports
} = require("./booster");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { BotManager } = require("./botManager");
// Rules modules (TypeScript)
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { applyTurnStart } = require("./modules/rules-turn-start");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { applyMovementAndCombat } = require("./modules/rules-movement");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const {
  validateAction: validateActionTs,
} = require("./modules/rules-validation");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { ensureCosts: ensureCostsTs } = require("./modules/rules-costs");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { applyGenesis, applyKeywordAnnotations } = require("./rules/triggers");

// eslint-disable-next-line @typescript-eslint/no-unused-vars, @typescript-eslint/no-require-imports
const { buildMatchInfo } = require("./matchInfo");

const tournamentModules = modules.tournament;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const draftModules = modules.draft;
const { replay } = modules;
const tournamentBroadcast = tournamentModules.broadcast;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { registerChatHandlers } = require("./socket/chat-handlers");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const {
  sanitizeMatchInfoForSpectator,
  sanitizeGameForSpectator,
  broadcastSpectatorsUpdated,
} = require("./modules/spectator");
// T021: Import draft config service
const draftConfig = modules.draft.config;
const { createMatchDraftService } = modules.draft;
// T023: Import standings service
const standingsService = modules.tournament.standings;

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
import {
  getRateLimitsForSocket,
  tryConsume,
  cleanupRateLimits,
} from "./rateLimiter";
import { incrementMetric, incrementRateLimitHit, debugLog } from "./metrics";

// eslint-disable-next-line @typescript-eslint/no-unused-vars
type SocketServer = import("socket.io").Server;
type SocketClient = import("socket.io").Socket;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type RedisClient = import("ioredis").Redis;
type PrismaClient = import("@prisma/client").PrismaClient;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type IncomingMessage = import("http").IncomingMessage;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
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

// eslint-disable-next-line @typescript-eslint/no-unused-vars
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

type TournamentBroadcastEventName =
  (typeof TOURNAMENT_BROADCAST_EVENT_NAMES)[number];

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

function isTournamentBroadcastEvent(
  value: unknown
): value is TournamentBroadcastEventName {
  return typeof value === "string" && TOURNAMENT_BROADCAST_EVENT_SET.has(value);
}

function normalizeTournamentBroadcastData(
  input: unknown
): TournamentBroadcastData {
  if (!input || typeof input !== "object") {
    return {};
  }
  return { ...(input as Record<string, unknown>) };
}

function toOptionalString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function toOptionalNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : typeof value === "string" &&
      value.trim() !== "" &&
      Number.isFinite(Number(value))
    ? Number(value)
    : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object";
}

type MatchLeaderService = ReturnType<typeof createMatchLeaderService>;

interface MatchDraftService {
  leaderDraftPlayerReady(
    matchId: string,
    playerId: string,
    ready: boolean
  ): Promise<void>;
  leaderStartDraft(
    matchId: string,
    requestingPlayerId?: string | null,
    overrideConfig?: AnyRecord | null,
    requestingSocketId?: string | null
  ): Promise<void>;
  leaderMakeDraftPick(
    matchId: string,
    playerId: string,
    payload: AnyRecord
  ): Promise<void>;
  leaderChooseDraftPack(
    matchId: string,
    playerId: string,
    payload: AnyRecord
  ): Promise<void>;
  updateDraftPresence(
    sessionId: string,
    playerId: string,
    playerName: string | null,
    isConnected: boolean
  ): Promise<DraftPresenceEntry[]>;
  getDraftPresenceList(sessionId: string): DraftPresenceEntry[];
  clearDraftWatchdog(matchId: string): void;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const getOpponentSeat = (seat: Seat | null | undefined): Seat | null =>
  seat ? (getOpponentSeatRaw(seat) as Seat | null) : null;
const getOpponentSeatStrict = (seat: Seat): Seat => {
  const result = getOpponentSeatRaw(seat);
  return result === "p1" || result === "p2"
    ? result
    : seat === "p1"
    ? "p2"
    : "p1";
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
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const CORS_ORIGINS = Array.isArray(serverConfig.corsOrigins)
  ? serverConfig.corsOrigins
  : [serverConfig.corsOrigins].filter(Boolean);
// Provide Prisma to broadcast service for audit logging
try {
  tournamentBroadcast.setPrismaClient?.(prisma);
} catch {}
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
// eslint-disable-next-line @typescript-eslint/no-unused-vars
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
// eslint-disable-next-line @typescript-eslint/no-unused-vars
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

let getPersistenceBufferStats: () => {
  bufferCount: number;
  bufferedActions: number;
} = () => ({
  bufferCount: 0,
  bufferedActions: 0,
});
let flushAllPersistenceBuffers: (
  reason?: string
) => Promise<void> = async () => {};

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
  const pushSummary = (
    name: string,
    sum: unknown,
    count: unknown,
    help?: string
  ) => {
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

// Basic health endpoints (liveness/readiness) and lightweight HTTP API

// In-memory state
// Players keyed by stable playerId (not socket id)
/** @type {Map<string, { id: string, displayName: string, socketId: string|null, lobbyId?: string|null, matchId?: string|null }>} */
const players: PlayersMap = new Map();
const playerIdBySocket: Map<string, string> = new Map();
const matches: MatchMap = new Map();
const matchRecordings = new Map();
const rtcParticipants: Map<string, Set<string>> = new Map();
const participantDetails: Map<string, VoiceParticipant> = new Map();
const pendingVoiceRequests: Map<string, PendingVoiceRequest> = new Map();

// ─────────────────────────────────────────────────────────────────────────────
// Redis State Manager (Horizontal Scaling)
// ─────────────────────────────────────────────────────────────────────────────
const REDIS_STATE_ENABLED = serverConfig.enableRedisState;
const redisState = createRedisStateManager({
  redis: storeRedis,
  instanceId: INSTANCE_ID,
  enabled: REDIS_STATE_ENABLED,
});

if (REDIS_STATE_ENABLED) {
  try {
    console.log(`[scaling] Redis state enabled (instance=${INSTANCE_ID})`);
  } catch {}
} else {
  try {
    console.log(`[scaling] Redis state disabled, using local Maps only`);
  } catch {}
}

// Player Registry (uses Redis state for cross-instance awareness)
const playerRegistry = createPlayerRegistry({
  io,
  storeRedis,
  redisState,
  instanceId: INSTANCE_ID,
  players,
  playerIdBySocket,
});

// Leader heartbeat interval (refreshes match leader TTLs)
let leaderHeartbeatInterval: ReturnType<typeof setInterval> | null = null;
if (REDIS_STATE_ENABLED) {
  leaderHeartbeatInterval = setInterval(async () => {
    try {
      // Refresh leadership for all matches we own
      for (const matchId of matches.keys()) {
        const isLeader = await redisState.refreshMatchLeader(matchId);
        if (!isLeader) {
          // We lost leadership, log it
          try {
            console.log(`[scaling] Lost leadership for match ${matchId}`);
          } catch {}
        }
      }
      // Also refresh lobby leadership if we're the leader
      await redisState.refreshLobbyLeader();
    } catch (err) {
      try {
        console.warn(
          "[scaling] Leader heartbeat error:",
          safeErrorMessage(err)
        );
      } catch {}
    }
  }, LEADER_HEARTBEAT_INTERVAL_MS);
}

const leaderboardService = createLeaderboardService({
  prisma,
  players,
  matchRecordings,
});
const { recordMatchResult: recordLeaderboardMatchResult } = leaderboardService;

const matchRecordingService = createMatchRecordingService({
  players,
  matchRecordings,
});

const { startMatchRecording, recordMatchAction, finishMatchRecording } =
  matchRecordingService;

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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getOrLoadMatch: getOrLoadMatch as unknown as (
    matchId: string
  ) => Promise<any>,
  ensurePlayerCached,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
  // Use the new TypeScript validateAction for runtime enforcement/warnings
  validateAction: validateActionTs,
  // Use the new TypeScript ensureCosts for cost helpers/enforcement
  ensureCosts: ensureCostsTs,
  enrichPatchWithCosts: enrichPatchWithCostsSafe,
  recordMatchAction,
  persistMatchUpdate,
  finalizeMatch: finalizeMatch as unknown as (
    match: unknown,
    options: Record<string, unknown>
  ) => Promise<void>,
  rulesEnforceMode: RULES_ENFORCE_MODE,
  rulesHelpersEnabled: RULES_HELPERS_ENABLED,
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
    // eslint-disable-next-line @typescript-eslint/no-require-imports
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

registerPubSubListeners({
  subscriber: storeSub,
  io,
  instanceId: INSTANCE_ID,
  channels: {
    matchControl: MATCH_CONTROL_CHANNEL,
    lobbyControl: LOBBY_CONTROL_CHANNEL,
    lobbyState: LOBBY_STATE_CHANNEL,
    draftState: DRAFT_STATE_CHANNEL,
  },
  isClusterReady: () => clusterStateReady,
  safeErrorMessage,
  getOrClaimMatchLeader,
  ensurePlayerCached,
  leaderJoinMatch,
  leaderApplyAction,
  leaderHandleInteractionRequest,
  leaderHandleInteractionResponse,
  leaderDraftPlayerReady,
  getOrLoadMatch,
  leaderStartDraft,
  leaderMakeDraftPick,
  leaderChooseDraftPack,
  leaderHandleMulliganDone,
  cleanupMatchNow,
  getOrClaimLobbyLeader,
  handleLobbyControlAsLeader,
  upsertLobbyFromSerialized,
  lobbies,
});

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

const handleHttpRequest = createRequestHandler({
  io,
  serverConfig,
  prisma,
  isReady: () => isReady,
  collectMetricsSnapshot,
  buildPromMetrics,
  metricsInc,
  matchesMap: matches,
  players,
  tournamentBroadcast: {
    emitTournamentUpdate: (
      _io: SocketServer,
      tournamentId: string,
      data: AnyRecord
    ) => broadcastTournamentUpdate(tournamentId, data),
    emitPhaseChanged: (
      _io: SocketServer,
      tournamentId: string,
      newPhase: string,
      additionalData?: AnyRecord
    ) => broadcastPhaseChanged(tournamentId, newPhase, additionalData),
    emitRoundStarted: (
      _io: SocketServer,
      tournamentId: string,
      roundNumber: number,
      matchesPayload: unknown
    ) =>
      broadcastRoundStarted(
        tournamentId,
        roundNumber,
        matchesPayload as AnyRecord[]
      ),
    emitPlayerJoined: (
      _io: SocketServer,
      tournamentId: string,
      playerId: string,
      playerName: string | undefined,
      currentPlayerCount: number | undefined
    ) =>
      broadcastPlayerJoined(
        tournamentId,
        playerId,
        playerName ?? "",
        typeof currentPlayerCount === "number" ? currentPlayerCount : 0
      ),
    emitPlayerLeft: (
      _io: SocketServer,
      tournamentId: string,
      playerId: string,
      playerName: string | undefined,
      currentPlayerCount: number | undefined
    ) =>
      broadcastPlayerLeft(
        tournamentId,
        playerId,
        playerName ?? "",
        typeof currentPlayerCount === "number" ? currentPlayerCount : 0
      ),
    emitDraftReady: (
      _io: SocketServer,
      tournamentId: string,
      payload: AnyRecord
    ) => broadcastDraftReady(tournamentId, payload),
    emitPreparationUpdate: (
      _io: SocketServer,
      tournamentId: string,
      playerId: string,
      preparationStatus: string | undefined,
      readyPlayerCount: number | undefined,
      totalPlayerCount: number | undefined,
      deckSubmitted?: boolean
    ) =>
      broadcastPreparationUpdate(
        tournamentId,
        playerId,
        preparationStatus ?? "inProgress",
        typeof readyPlayerCount === "number" ? readyPlayerCount : 0,
        typeof totalPlayerCount === "number" ? totalPlayerCount : 0,
        !!deckSubmitted
      ),
    emitStatisticsUpdate: (
      _io: SocketServer,
      tournamentId: string,
      statistics: AnyRecord
    ) => broadcastStatisticsUpdate(tournamentId, statistics),
  },
  normalizeTournamentBroadcastData,
  isTournamentBroadcastEvent,
  toOptionalString,
  toOptionalNumber,
  safeErrorMessage,
});

server.on("request", handleHttpRequest);

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

function getVoiceRoomIdForPlayer(
  player: PlayerState | null | undefined
): string | null {
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
function matchHasHumanPlayers(
  match: ServerMatchState | null | undefined
): boolean {
  if (!match || !Array.isArray(match.playerIds) || match.playerIds.length === 0)
    return false;
  for (const pid of match.playerIds) {
    if (!isCpuPlayerId(pid)) return true;
  }
  return false;
}

async function finalizeMatch(
  match: ServerMatchState,
  options: AnyRecord = {}
): Promise<void> {
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

  // Determine whether this result should count towards global stats/leaderboard.
  // For early forfeits (opponent leaves very early), we still end the match but do not
  // record it as a rated result unless the game has progressed to at least turn 5.
  const gameRaw = (match.game ?? null) as AnyRecord | null;
  const gameTurnFromGame =
    gameRaw && typeof gameRaw["turn"] === "number"
      ? (gameRaw["turn"] as number)
      : null;
  const matchTurnRaw = (match as AnyRecord)["turn"];
  const gameTurnFromMatch =
    typeof matchTurnRaw === "number"
      ? matchTurnRaw
      : typeof matchTurnRaw === "string" && matchTurnRaw.trim() !== ""
      ? Number(matchTurnRaw)
      : null;
  const gameTurn =
    (gameTurnFromGame != null && Number.isFinite(gameTurnFromGame)
      ? gameTurnFromGame
      : gameTurnFromMatch != null && Number.isFinite(gameTurnFromMatch)
      ? gameTurnFromMatch
      : 1) || 1;
  const isForfeitReason =
    typeof options?.reason === "string" && options.reason === "forfeit";
  const isRatedResult = !isForfeitReason || gameTurn >= 5;

  match.status = "ended";
  match.winnerId = winnerId || null;
  match.lastTs = now;
  match._finalized = true;

  const detachedPlayers = Array.isArray(match.playerIds)
    ? [...match.playerIds]
    : [];
  for (const pid of detachedPlayers) {
    const pState = players.get(pid);
    if (pState && pState.matchId === match.id) {
      pState.matchId = null;
      // Keep sockets connected so players can review the final board,
      // but ensure server-side state no longer treats them as in-match.
    }
  }
  broadcastPlayers();

  const room = `match:${match.id}`;
  io.to(room).emit("matchStarted", { match: getMatchInfo(match) });
  // Also broadcast a minimal state patch with match end flags so all clients
  // immediately reflect the end-of-match state (drives victory/defeat overlay).
  // This is redundant with the actor's final patch but ensures the opponent
  // receives matchEnded/winner even if their local check didn't run.
  try {
    const endPatch = {
      matchEnded: true,
      // Explicitly normalize to "p1" | "p2" | null for the client reducer
      winner:
        winnerSeat === "p1" || winnerSeat === "p2"
          ? (winnerSeat as "p1" | "p2")
          : null,
    };
    io.to(room).emit("statePatch", { patch: endPatch, t: now });
    try {
      io.to(`spectate:${match.id}`).emit("statePatch", {
        patch: endPatch,
        t: now,
      });
    } catch {}
    // Also emit an explicit event for compatibility with clients that rely on a
    // status transition rather than the game patch (older builds or dropped patch).
    io.to(room).emit("matchEnded", {
      matchId: match.id,
      winnerId: winnerId || null,
      result: isDraw ? "draw" : "win",
      reason:
        options && typeof options.reason === "string"
          ? options.reason
          : "normal_end",
      rated: isRatedResult,
    });
  } catch {}
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
    const allHuman =
      Array.isArray(match.playerIds) &&
      match.playerIds.length > 0 &&
      match.playerIds.every((pid) => !isCpuPlayerId(pid));
    if (allHuman) {
      const rec = matchRecordings.get(match.id);
      const formatRaw =
        match.matchType === "draft" ||
        match.matchType === "sealed" ||
        match.matchType === "constructed"
          ? match.matchType
          : "constructed";
      if (rec && rec.cardPlays && prisma?.humanCardStats) {
        const p1Cards: number[] = Array.from(rec.cardPlays.p1 || []);
        const p2Cards: number[] = Array.from(rec.cardPlays.p2 || []);
        const winnerSeatVal =
          winnerSeat === "p1" || winnerSeat === "p2" ? winnerSeat : null;
        const loserSeatVal =
          loserSeat === "p1" || loserSeat === "p2" ? loserSeat : null;
        const ops: Promise<unknown>[] = [];
        const bump = (cardId: number, seat: "p1" | "p2") => {
          const isWin = winnerSeatVal ? seat === winnerSeatVal : false;
          const isLoss = loserSeatVal ? seat === loserSeatVal : false;
          const isDrawLocal = !!isDraw;
          ops.push(
            prisma.humanCardStats.upsert({
              where: { cardId_format: { cardId, format: formatRaw } },
              create: {
                cardId,
                format: formatRaw,
                plays: 1,
                wins: isWin ? 1 : 0,
                losses: isLoss ? 1 : 0,
                draws: isDrawLocal ? 1 : 0,
              },
              update: {
                plays: { increment: 1 },
                ...(isWin ? { wins: { increment: 1 } } : {}),
                ...(isLoss ? { losses: { increment: 1 } } : {}),
                ...(isDrawLocal ? { draws: { increment: 1 } } : {}),
              },
            })
          );
        };
        for (const id of p1Cards) bump(id, "p1");
        for (const id of p2Cards) bump(id, "p2");
        await Promise.allSettled(ops);
      }
    }
  } catch {}
  try {
    if (match._cleanupTimer) {
      clearTimeout(match._cleanupTimer);
      match._cleanupTimer = null;
    }
  } catch {}

  const leaderboardPayload = isDraw ? { isDraw: true } : { winnerId, loserId };

  if (isRatedResult) {
    recordLeaderboardMatchResult(match, leaderboardPayload).catch(() => {});
  }

  // If this is a tournament match, persist result into Tournament Match and update round completion
  if (match.tournamentId) {
    try {
      const nowIso = new Date().toISOString();
      const tMatch = await prisma.match.findUnique({
        where: { id: match.id },
        include: { tournament: true, round: true },
      });
      if (tMatch) {
        const res = (match.game as AnyRecord | null | undefined)?.results;
        const gameResults = Array.isArray(res) ? (res as unknown[]) : [];
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

        // Use standings service for atomic updates; failures shouldn't prevent round completion
        try {
          const playersVal: Array<{
            id?: string;
            playerId?: string;
            userId?: string;
          } | null> = Array.isArray(tMatch.players) ? tMatch.players : [];
          const playerIds = playersVal
            .map(
              (
                p: { id?: string; playerId?: string; userId?: string } | null
              ) => {
                if (p && typeof p === "object") {
                  const id = p.id || p.playerId || p.userId;
                  return typeof id === "string" ? id : null;
                }
                return null;
              }
            )
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
          // Standings service handles retry logic internally; proceed with round completion
          console.error(
            "[Match] Failed to update standings:",
            err && typeof err === "object" && "message" in err
              ? (err as Error).message
              : err
          );
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
    } catch (err) {
      console.warn(
        "[tournament] failed to record result into rounds:",
        err && typeof err === "object" && "message" in err
          ? (err as Error).message
          : err
      );
    }
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

type BasicPlayerInfo = {
  id: string;
  displayName: string;
  seat?: Seat;
  location?: string;
  inLobby?: boolean;
  inMatch?: boolean;
};

function getPlayerInfo(
  playerId: string,
  seat: Seat | null = null
): BasicPlayerInfo | null {
  const p = players.get(playerId);
  if (!p) return null;
  const info: BasicPlayerInfo = { id: p.id, displayName: p.displayName };
  if (seat === "p1" || seat === "p2") {
    info.seat = seat;
  }
  // Add location info for presence tracking
  if (p.location) {
    info.location = p.location;
  }
  info.inLobby = !!p.lobbyId;
  info.inMatch = !!p.matchId;
  return info;
}

function getPlayerBySocket(
  socket: SocketClient | null | undefined
): PlayerState | null {
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

// eslint-disable-next-line @typescript-eslint/no-unused-vars
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
    // Use new Redis state manager if enabled (15s TTL with heartbeat)
    if (REDIS_STATE_ENABLED) {
      return redisState.claimMatchLeader(matchId);
    }
    // Legacy fallback (60s TTL, no heartbeat)
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
    const setRes = await storeRedis.set(key, INSTANCE_ID, "EX", 60, "NX");
    if (setRes) return INSTANCE_ID;
    // Someone else won
    return await storeRedis.get(key);
  } catch {
    return INSTANCE_ID;
  }
}

async function getOrLoadMatch(
  matchId: string
): Promise<ServerMatchState | null> {
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
              const value =
                (it as Record<string, unknown>).id ??
                (it as Record<string, unknown>).playerId ??
                (it as Record<string, unknown>).userId;
              return typeof value === "string"
                ? value
                : value != null
                ? String(value)
                : null;
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
    const botOnly = !matchHasHumanPlayers(match);
    // Allow cleanup for bot-only matches even if they are tournament matches
    if (match.tournamentId && !botOnly) {
      try {
        console.log(
          `[match] cleanup blocked for active tournament match ${matchId} (status: ${match.status})`
        );
      } catch {}
      return;
    }
    // Also protect any in-progress match (tournament or not) to preserve game state for reconnects,
    // except when the match is bot-only (bots can be cleaned by timers/force)
    if (match.status === "in_progress" && !botOnly) {
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
  const serializeSealedPacks = (
    packs: unknown
  ): Record<string, unknown> | undefined => {
    if (!packs) return undefined;
    if (packs instanceof Map) {
      const out: Record<string, unknown> = {};
      for (const [key, value] of packs.entries()) {
        out[String(key)] = Array.isArray(value) ? value : value ?? [];
      }
      return out;
    }
    if (typeof packs === "object") {
      const out: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(
        packs as Record<string, unknown>
      )) {
        out[String(key)] = Array.isArray(value) ? value : value ?? [];
      }
      return out;
    }
    return undefined;
  };

  const serializePlayerDecks = (
    decks: unknown
  ): Record<string, unknown> | undefined => {
    if (!decks) return undefined;
    if (decks instanceof Map) return Object.fromEntries(decks);
    if (typeof decks === "object") return decks as Record<string, unknown>;
    return undefined;
  };

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
    turn: match.turn ?? undefined,
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
    playerDecks: serializePlayerDecks(match.playerDecks),
    sealedPacks: serializeSealedPacks(match.sealedPacks),
    draftState:
      match.draftState && typeof match.draftState === "object"
        ? match.draftState
        : undefined,
  };
}

async function hydrateMatchFromDatabase(
  matchId: string,
  match: ServerMatchState
): Promise<void> {
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
          const hasExisting =
            match.playerDecks instanceof Map && match.playerDecks.size > 0;
          if (!hasExisting) {
            match.playerDecks = new Map(Object.entries(dbMatch.playerDecks));
          }
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
          const includeCubeSideboardInStandard =
            (settings as { includeCubeSideboardInStandard?: boolean })
              .includeCubeSideboardInStandard === true;

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
              typeof entry?.packCount === "number" &&
              Number.isFinite(entry.packCount)
                ? entry.packCount
                : 0;
            packCounts[setId] = (packCounts[setId] || 0) + packs;
          }

          match.draftConfig = {
            cubeId: cubeId || undefined,
            includeCubeSideboardInStandard:
              includeCubeSideboardInStandard || undefined,
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

const REQUIRE_JWT = Boolean(
  (process.env.SOCKET_REQUIRE_JWT || "").toLowerCase() === "1" ||
    (process.env.SOCKET_REQUIRE_JWT || "").toLowerCase() === "true"
);

// Enforce NextAuth-signed JWT at connect time
io.use((socket: SocketClient, next: (err?: Error) => void) => {
  try {
    const handshakeAuth = socket.handshake?.auth as
      | { token?: string }
      | undefined;
    const token = handshakeAuth?.token ?? null;
    if (token && process.env.NEXTAUTH_SECRET) {
      const payload = jwt.verify(
        token,
        process.env.NEXTAUTH_SECRET
      ) as NextAuthJwtPayload;
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
  let authUser: { id?: string; name?: string } | null = null;
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

  registerChatHandlers({
    io,
    socket,
    isAuthed: () => authed,
    getPlayerBySocket,
    getPlayerInfo,
    getRateLimitsForSocket,
    tryConsume,
    incrementMetric,
    incrementRateLimitHit,
    debugLog,
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

    let player: PlayerState;

    // Use player registry for Redis-backed state when enabled
    if (REDIS_STATE_ENABLED) {
      player = await playerRegistry.registerPlayer(
        playerId,
        displayName,
        socket
      );
    } else {
      // Legacy local-only state management
      const existing = players.get(playerId);
      if (!existing) {
        player = {
          id: playerId,
          displayName,
          socketId: socket.id,
          lobbyId: null,
          matchId: null,
        };
        players.set(playerId, player);
      } else {
        existing.displayName = displayName;
        existing.socketId = socket.id;
        player = existing;
      }
      playerIdBySocket.set(socket.id, playerId);

      // Cache player displayName in Redis for cross-instance lookups (legacy)
      try {
        if (storeRedis) {
          await storeRedis.hset(`player:${playerId}`, { displayName });
        }
      } catch {}
    }

    // Always join player-specific room for cross-instance messaging
    try {
      await socket.join(`player:${playerId}`);
    } catch {}

    authed = true;

    try {
      console.log(
        `[auth] hello <= name="${displayName}" id=${playerId} providedId=${!!providedId} tokenId=${
          tokenId ? "yes" : "no"
        } socket=${socket.id}`
      );
    } catch {}

    socket.emit("welcome", {
      you: { id: player.id, displayName: player.displayName },
    });
    broadcastPlayers();

    if (player.matchId && matches.has(player.matchId)) {
      socket.join(`match:${player.matchId}`);
      const m = matches.get(player.matchId);
      if (m) {
        socket.emit("matchStarted", { match: getMatchInfo(m) });

        if (
          m.matchType === "draft" &&
          m.draftState &&
          m.draftState.phase !== "waiting"
        ) {
          try {
            console.log(
              `[Draft] Player ${player.displayName} (${player.id}) rejoining active draft - sending current draft state`
            );
          } catch {}
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

  socket.on(
    "draft:session:leave",
    async (payload?: DraftSessionLeavePayload) => {
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
    }
  );

  // Per-player mulligan completion. When all players are done, advance to Main.
  socket.on("mulliganDone", async () => {
    if (!authed) return;
    const player = getPlayerBySocket(socket);
    if (!player || !player.matchId) return;
    const matchId = player.matchId;
    try {
      console.log("[Setup] mulliganDone recv", {
        matchId,
        playerId: player.id,
        instance: INSTANCE_ID,
      });
    } catch {}
    try {
      const leader = await getOrClaimMatchLeader(matchId);
      try {
        console.log("[Setup] mulliganDone leader decision", {
          matchId,
          leader,
          instance: INSTANCE_ID,
          forwarded: leader && leader !== INSTANCE_ID,
        });
      } catch {}
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
    const matchSnapshot = matches.get(matchId);
    if (matchSnapshot && matchSnapshot.status === "ended") {
      try {
        socket.emit("match:error", {
          matchId,
          code: "closed",
          message: "This match has already ended.",
        });
      } catch {}
      return;
    }
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

  socket.on("watchMatch", async (payload) => {
    const matchId =
      payload && typeof payload.matchId === "string" ? payload.matchId : null;
    if (!matchId) return;
    const player = getPlayerBySocket(socket);
    try {
      const match = await getOrLoadMatch(matchId);
      if (!match) {
        try {
          socket.emit("watch:error", { matchId, message: "match_not_found" });
        } catch {}
        return;
      }
      // Disallow spectating your own active match
      if (
        player &&
        Array.isArray(match.playerIds) &&
        match.playerIds.includes(player.id)
      ) {
        try {
          socket.emit("watch:error", {
            matchId,
            message: "cannot_spectate_own_match",
          });
        } catch {}
        return;
      }

      // Join spectate room and tag socket as spectator for sanitization
      try {
        await socket.join(`spectate:${matchId}`);
      } catch {}
      try {
        socket.data = socket.data || {};
        (
          socket.data as { isSpectator?: boolean; watchMatchId?: string }
        ).isSpectator = true;
        (
          socket.data as { isSpectator?: boolean; watchMatchId?: string }
        ).watchMatchId = matchId;
        // Commentator mode: tournament host or IDs listed in env COMMENTATOR_IDS can view hands
        let canViewHands = false;
        try {
          const pid = player?.id || playerIdBySocket.get(socket.id) || null;
          const rawList = String(process.env.COMMENTATOR_IDS || "")
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean);
          if (pid && rawList.includes(pid)) canViewHands = true;
        } catch {}
        (socket.data as { canViewHands?: boolean }).canViewHands = canViewHands;
        try {
          io.to(socket.id).emit("message", {
            type: "spectatorPermits",
            matchId,
            viewHands: canViewHands,
          });
        } catch {}
        if (canViewHands) {
          try {
            await socket.join(`spectate:${matchId}:hands`);
          } catch {}
        }
      } catch {}
      try {
        await broadcastSpectatorsUpdated(io, matchId);
      } catch {}

      // Announce spectator join to players via console event
      try {
        const name = player?.displayName || "Spectator";
        const canViewHands = Boolean(
          (
            socket as unknown as {
              data?: { canViewHands?: boolean } | undefined;
            }
          ).data?.canViewHands
        );
        const handsText = canViewHands ? " (can see hands)" : "";
        io.to(`match:${matchId}`).emit("statePatch", {
          patch: {
            events: [
              {
                ts: Date.now(),
                text: `${name} joined as spectator${handsText}`,
              },
            ],
          },
          t: Date.now(),
        });
      } catch {}

      // Send sanitized match info ack so client resolves watch promise
      try {
        const base = getMatchInfo(match);
        const info = sanitizeMatchInfoForSpectator(base);
        io.to(socket.id).emit("matchStarted", { match: info });
      } catch {}

      // Initial sanitized snapshot
      try {
        const base = getMatchInfo(match);
        const info = sanitizeMatchInfoForSpectator(base);
        const snap: { match: AnyRecord; game?: MatchPatch | null; t?: number } =
          { match: info };
        const game = match?.game;
        let meaningful = false;
        if (isRecord(game)) {
          if (match.status === "in_progress") meaningful = true;
          else meaningful = Object.keys(game).length > 0;
        }
        if (meaningful) {
          const enriched = await enrichPatchWithCostsSafe(
            (match.game ?? null) as MatchPatch | null,
            prisma
          );
          snap.game = sanitizeGameForSpectator(
            enriched as unknown as AnyRecord
          ) as unknown as MatchPatch | null;
          snap.t = typeof match.lastTs === "number" ? match.lastTs : Date.now();
        }
        io.to(socket.id).emit("resyncResponse", { snapshot: snap });
      } catch {}

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
    } catch {}
  });

  socket.on("leaveMatch", async () => {
    if (!authed) return;
    const player = getPlayerBySocket(socket);
    if (!player || !player.matchId) return;
    const matchId = player.matchId;
    const match = matches.get(matchId);
    // Compute forfeit winner before mutating the roster
    let forfeitWinnerId: string | null = null;
    let forfeitWinnerSeat: Seat | null = null;
    try {
      if (match) {
        const leftSeat = getSeatForPlayer(
          match as unknown as { playerIds?: string[] | null },
          player.id
        ) as Seat | null;
        const oppSeat = leftSeat ? getOpponentSeatStrict(leftSeat) : null;
        const candidate = oppSeat
          ? (getPlayerIdForSeat(
              match as unknown as { playerIds?: string[] | null },
              oppSeat
            ) as string | null)
          : (inferLoserId(
              match as unknown as { playerIds?: string[] | null },
              player.id
            ) as string | null);
        if (candidate && (oppSeat === "p1" || oppSeat === "p2")) {
          forfeitWinnerId = candidate;
          forfeitWinnerSeat = oppSeat;
        } else if (candidate) {
          // Fallback when seat couldn't be determined reliably
          forfeitWinnerId = candidate;
          forfeitWinnerSeat = null;
        }
      }
    } catch {}
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
      // If at least one player remains and match hasn't ended, count this as a forfeit
      try {
        if (
          match.status !== "ended" &&
          forfeitWinnerId &&
          Array.isArray(match.playerIds) &&
          match.playerIds.length > 0
        ) {
          await finalizeMatch(match, {
            winnerId: forfeitWinnerId,
            winnerSeat: forfeitWinnerSeat ?? undefined,
            loserId: player.id,
            reason: "forfeit",
          });
        }
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
    broadcastPlayers();
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
        const playerKey = getSeatForPlayer(match, player.id) || "p1";
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
        try {
          io.to(`spectate:${matchId}`).emit("message", out);
        } catch {}
      } catch {}
    } else if (type === "d20Roll") {
      try {
        const match = await getOrLoadMatch(matchId);
        const room = `match:${matchId}`;
        const playerKey = getSeatForPlayer(match, player.id) || "p1";
        // Sanitize and clamp roll value or generate one server-side
        let value = Number((payload as { value?: unknown })?.value);
        if (!Number.isFinite(value) || value < 1 || value > 20) {
          value = Math.floor(Math.random() * 20) + 1;
        } else {
          value = Math.max(1, Math.min(20, Math.floor(value)));
        }
        const out = {
          type: "d20Roll",
          value,
          playerKey,
          from: player.id,
          ts: Date.now(),
        } as const;
        io.to(room).emit("message", out);
        try {
          io.to(`spectate:${matchId}`).emit("message", out);
        } catch {}
      } catch {}
    } else if (type === "attackDeclare") {
      try {
        const match = await getOrLoadMatch(matchId);
        const room = `match:${matchId}`;
        const playerKey = getSeatForPlayer(match, player.id) || "p1";
        const msg = payload as {
          id?: unknown;
          tile?: { x?: unknown; y?: unknown };
          attacker?: {
            at?: unknown;
            index?: unknown;
            instanceId?: unknown;
            owner?: unknown;
          };
          target?: { kind?: unknown; at?: unknown; index?: unknown };
        };
        const id = typeof msg.id === "string" ? msg.id : rid("cmb");
        const x = Number(msg.tile?.x);
        const y = Number(msg.tile?.y);
        const at =
          typeof msg.attacker?.at === "string"
            ? (msg.attacker?.at as string)
            : null;
        const indexVal = Number(msg.attacker?.index);
        const ownerVal = Number(msg.attacker?.owner);
        if (
          !Number.isFinite(x) ||
          !Number.isFinite(y) ||
          !at ||
          !Number.isFinite(indexVal) ||
          !Number.isFinite(ownerVal)
        )
          return;
        // Normalize optional target
        let target: {
          kind: "permanent" | "avatar" | "site";
          at: string;
          index: number | null;
        } | null = null;
        try {
          const raw = msg.target as unknown;
          if (raw && typeof raw === "object") {
            const rec = raw as Record<string, unknown>;
            const k = typeof rec.kind === "string" ? (rec.kind as string) : "";
            const a = typeof rec.at === "string" ? (rec.at as string) : "";
            const idx = (rec.index == null ? null : Number(rec.index)) as
              | number
              | null;
            const okKind = k === "permanent" || k === "avatar" || k === "site";
            if (okKind && a && (idx === null || Number.isFinite(idx))) {
              target = {
                kind: k as "permanent" | "avatar" | "site",
                at: a,
                index: idx,
              };
            }
          }
        } catch {}
        const out = {
          type: "attackDeclare",
          id,
          tile: { x, y },
          attacker: {
            at,
            index: Number(indexVal),
            instanceId:
              typeof msg.attacker?.instanceId === "string"
                ? (msg.attacker?.instanceId as string)
                : null,
            owner: Number(ownerVal) as 1 | 2,
          },
          ...(target ? { target } : {}),
          playerKey,
          ts: Date.now(),
        } as const;
        io.to(room).emit("message", out);
        try {
          io.to(`spectate:${matchId}`).emit("message", out);
        } catch {}
      } catch {}
    } else if (type === "interceptOffer") {
      try {
        const match = await getOrLoadMatch(matchId);
        const room = `match:${matchId}`;
        const playerKey = getSeatForPlayer(match, player.id) || "p1";
        const msg = payload as {
          id?: unknown;
          tile?: { x?: unknown; y?: unknown };
          attacker?: {
            at?: unknown;
            index?: unknown;
            instanceId?: unknown;
            owner?: unknown;
          };
        };
        const id = typeof msg.id === "string" ? msg.id : rid("cmb");
        const x = Number(msg.tile?.x);
        const y = Number(msg.tile?.y);
        const at =
          typeof msg.attacker?.at === "string"
            ? (msg.attacker?.at as string)
            : null;
        const indexVal = Number(msg.attacker?.index);
        const ownerVal = Number(msg.attacker?.owner);
        const instanceId =
          typeof msg.attacker?.instanceId === "string"
            ? (msg.attacker?.instanceId as string)
            : null;
        if (
          !Number.isFinite(x) ||
          !Number.isFinite(y) ||
          !at ||
          !Number.isFinite(indexVal) ||
          !Number.isFinite(ownerVal)
        )
          return;
        const out = {
          type: "interceptOffer",
          id,
          tile: { x, y },
          attacker: {
            at,
            index: Number(indexVal),
            instanceId,
            owner: Number(ownerVal) as 1 | 2,
          },
          playerKey,
          ts: Date.now(),
        } as const;
        io.to(room).emit("message", out);
        try {
          io.to(`spectate:${matchId}`).emit("message", out);
        } catch {}
      } catch {}
    } else if (type === "combatSetDefenders") {
      try {
        const match = await getOrLoadMatch(matchId);
        const room = `match:${matchId}`;
        const playerKey = getSeatForPlayer(match, player.id) || "p1";
        const msg = payload as { id?: unknown; defenders?: unknown };
        const id = typeof msg.id === "string" ? msg.id : rid("cmb");
        const raw = Array.isArray(msg.defenders)
          ? (msg.defenders as unknown[])
          : [];
        const defenders = raw
          .map((d) =>
            d && typeof d === "object" ? (d as Record<string, unknown>) : null
          )
          .filter(Boolean)
          .map((d) => {
            const at = typeof d!.at === "string" ? (d!.at as string) : null;
            const indexVal = Number(d!.index);
            const ownerVal = Number(d!.owner);
            const instanceId =
              typeof d!.instanceId === "string"
                ? (d!.instanceId as string)
                : null;
            if (!at || !Number.isFinite(indexVal) || !Number.isFinite(ownerVal))
              return null;
            return {
              at,
              index: Number(indexVal),
              owner: Number(ownerVal) as 1 | 2,
              instanceId,
            };
          })
          .filter(Boolean);
        const out = {
          type: "combatSetDefenders",
          id,
          defenders,
          playerKey,
          ts: Date.now(),
        } as const;
        io.to(room).emit("message", out);
        try {
          io.to(`spectate:${matchId}`).emit("message", out);
        } catch {}
      } catch {}
    } else if (type === "combatResolve") {
      try {
        const match = await getOrLoadMatch(matchId);
        const room = `match:${matchId}`;
        const playerKey = getSeatForPlayer(match, player.id) || "p1";
        const msg = payload as {
          id?: unknown;
          tile?: { x?: unknown; y?: unknown };
          attacker?: {
            at?: unknown;
            index?: unknown;
            instanceId?: unknown;
            owner?: unknown;
          };
          defenders?: unknown[];
        };
        const id = typeof msg.id === "string" ? msg.id : rid("cmb");
        const x = Number(msg.tile?.x);
        const y = Number(msg.tile?.y);
        const tile =
          Number.isFinite(x) && Number.isFinite(y) ? { x, y } : undefined;
        const at =
          typeof msg.attacker?.at === "string"
            ? (msg.attacker?.at as string)
            : null;
        const indexVal = Number(msg.attacker?.index);
        const attacker =
          at && Number.isFinite(indexVal)
            ? { at, index: Number(indexVal) }
            : undefined;
        const raw = Array.isArray(msg.defenders)
          ? (msg.defenders as unknown[])
          : [];
        const defenders = raw
          .map((d) =>
            d && typeof d === "object" ? (d as Record<string, unknown>) : null
          )
          .filter(Boolean)
          .map((d) => {
            const dat = typeof d!.at === "string" ? (d!.at as string) : null;
            const didx = Number(d!.index);
            if (!dat || !Number.isFinite(didx)) return null;
            return { at: dat, index: Number(didx) };
          })
          .filter(Boolean);
        const out = {
          type: "combatResolve",
          id,
          ...(tile ? { tile } : {}),
          ...(attacker ? { attacker } : {}),
          defenders,
          playerKey,
          ts: Date.now(),
        } as const;
        io.to(room).emit("message", out);
        try {
          io.to(`spectate:${matchId}`).emit("message", out);
        } catch {}
      } catch {}
    } else if (type === "combatCancel") {
      try {
        const match = await getOrLoadMatch(matchId);
        const room = `match:${matchId}`;
        const out = {
          type: "combatCancel",
          id: (payload as { id?: unknown })?.id ?? rid("cmb"),
          ts: Date.now(),
        } as const;
        io.to(room).emit("message", out);
        try {
          io.to(`spectate:${matchId}`).emit("message", out);
        } catch {}
      } catch {}
    } else if (type === "combatCommit") {
      try {
        const match = await getOrLoadMatch(matchId);
        const room = `match:${matchId}`;
        const playerKey = getSeatForPlayer(match, player.id) || "p1";
        const msg = payload as {
          id?: unknown;
          defenders?: unknown;
          target?: { kind?: unknown; at?: unknown; index?: unknown } | null;
          tile?: { x?: unknown; y?: unknown };
        };
        const id = typeof msg.id === "string" ? msg.id : rid("cmb");
        const rawDefs = Array.isArray(msg.defenders)
          ? (msg.defenders as unknown[])
          : [];
        const defenders = rawDefs
          .map((d) =>
            d && typeof d === "object" ? (d as Record<string, unknown>) : null
          )
          .filter(Boolean)
          .map((d) => {
            const at = typeof d!.at === "string" ? (d!.at as string) : null;
            const indexVal = Number(d!.index);
            const ownerVal = Number(d!.owner);
            const instanceId =
              typeof d!.instanceId === "string"
                ? (d!.instanceId as string)
                : null;
            if (!at || !Number.isFinite(indexVal) || !Number.isFinite(ownerVal))
              return null;
            return {
              at,
              index: Number(indexVal),
              owner: Number(ownerVal) as 1 | 2,
              instanceId,
            };
          })
          .filter(Boolean);
        const tx = Number(msg.tile?.x);
        const ty = Number(msg.tile?.y);
        const tile =
          Number.isFinite(tx) && Number.isFinite(ty)
            ? { x: tx, y: ty }
            : undefined;
        let target:
          | {
              kind: "permanent" | "avatar" | "site";
              at: string;
              index: number | null;
            }
          | undefined;
        try {
          const rec = msg.target as Record<string, unknown> | null | undefined;
          const k = typeof rec?.kind === "string" ? (rec!.kind as string) : "";
          const a = typeof rec?.at === "string" ? (rec!.at as string) : "";
          const idx = (rec?.index == null ? null : Number(rec!.index)) as
            | number
            | null;
          if (
            (k === "permanent" || k === "avatar" || k === "site") &&
            a &&
            (idx === null || Number.isFinite(idx))
          ) {
            target = {
              kind: k as "permanent" | "avatar" | "site",
              at: a,
              index: idx,
            };
          }
        } catch {}
        const out = {
          type: "combatCommit",
          id,
          defenders,
          ...(tile ? { tile } : {}),
          ...(target ? { target } : {}),
          playerKey,
          ts: Date.now(),
        } as const;
        io.to(room).emit("message", out);
        try {
          io.to(`spectate:${matchId}`).emit("message", out);
        } catch {}
      } catch {}
    } else if (type === "combatAutoApply") {
      // Auto-resolve combat: broadcast kill list to all players so each applies their own kills
      try {
        const match = await getOrLoadMatch(matchId);
        const room = `match:${matchId}`;
        const playerKey = getSeatForPlayer(match, player.id) || "p1";
        const msg = payload as { id?: unknown; kills?: unknown };
        const id = typeof msg.id === "string" ? msg.id : rid("cmb");
        const rawKills = Array.isArray(msg.kills) ? msg.kills : [];
        const kills = rawKills
          .filter(
            (k): k is Record<string, unknown> => k && typeof k === "object"
          )
          .map((k) => ({
            at: typeof k.at === "string" ? k.at : "",
            index: Number(k.index),
            owner: typeof k.owner === "string" ? k.owner : "",
            instanceId: typeof k.instanceId === "string" ? k.instanceId : null,
          }))
          .filter((k) => k.at && Number.isFinite(k.index) && k.owner);
        const out = {
          type: "combatAutoApply",
          id,
          kills,
          playerKey,
          ts: Date.now(),
        } as const;
        io.to(room).emit("message", out);
        try {
          io.to(`spectate:${matchId}`).emit("message", out);
        } catch {}
      } catch {}
    } else if (type === "combatSummary") {
      // Combat summary: broadcast final result to all players
      try {
        const match = await getOrLoadMatch(matchId);
        const room = `match:${matchId}`;
        const playerKey = getSeatForPlayer(match, player.id) || "p1";
        const msg = payload as {
          id?: unknown;
          text?: unknown;
          actor?: unknown;
          targetSeat?: unknown;
        };
        const id = typeof msg.id === "string" ? msg.id : rid("cmb");
        const text = typeof msg.text === "string" ? msg.text : "";
        const actor = typeof msg.actor === "string" ? msg.actor : undefined;
        const targetSeat =
          typeof msg.targetSeat === "string" ? msg.targetSeat : undefined;
        const out = {
          type: "combatSummary",
          id,
          text,
          actor,
          targetSeat,
          playerKey,
          ts: Date.now(),
        } as const;
        io.to(room).emit("message", out);
        try {
          io.to(`spectate:${matchId}`).emit("message", out);
        } catch {}
      } catch {}
    } else if (type === "combatDamage") {
      // Combat damage: broadcast damage assignments to all players
      try {
        const match = await getOrLoadMatch(matchId);
        const room = `match:${matchId}`;
        const playerKey = getSeatForPlayer(match, player.id) || "p1";
        const msg = payload as { id?: unknown; damage?: unknown };
        const id = typeof msg.id === "string" ? msg.id : rid("cmb");
        const rawDamage = Array.isArray(msg.damage) ? msg.damage : [];
        const damage = rawDamage
          .filter(
            (d): d is Record<string, unknown> => d && typeof d === "object"
          )
          .map((d) => ({
            at: typeof d.at === "string" ? d.at : "",
            index: Number(d.index),
            amount: Number(d.amount),
          }))
          .filter(
            (d) => d.at && Number.isFinite(d.index) && Number.isFinite(d.amount)
          );
        const out = {
          type: "combatDamage",
          id,
          damage,
          playerKey,
          ts: Date.now(),
        } as const;
        io.to(room).emit("message", out);
        try {
          io.to(`spectate:${matchId}`).emit("message", out);
        } catch {}
      } catch {}
    } else if (type === "guidePref") {
      try {
        const match = await getOrLoadMatch(matchId);
        const room = `match:${matchId}`;
        const seat = getSeatForPlayer(match, player.id) || "p1";
        const combatRaw = (payload as { combatGuides?: unknown })?.combatGuides;
        const magicRaw = (payload as { magicGuides?: unknown })?.magicGuides;
        const combatGuides = !!combatRaw;
        const magicGuides = !!magicRaw;
        const out = {
          type: "guidePref",
          seat,
          combatGuides,
          magicGuides,
          ts: Date.now(),
        } as const;
        io.to(room).emit("message", out);
        try {
          io.to(`spectate:${matchId}`).emit("message", out);
        } catch {}
      } catch {}
    } else if (type === "toast") {
      try {
        const match = await getOrLoadMatch(matchId);
        const room = `match:${matchId}`;
        const playerKey = getSeatForPlayer(match, player.id) || "p1";
        const raw = (payload as { text?: unknown })?.text;
        const text = typeof raw === "string" ? raw.slice(0, 200) : null;
        if (!text) return;
        const out = { type: "toast", text, playerKey, ts: Date.now() } as const;
        io.to(room).emit("message", out);
        try {
          io.to(`spectate:${matchId}`).emit("message", out);
        } catch {}
      } catch {}
    } else if (type === "magicBegin") {
      try {
        const match = await getOrLoadMatch(matchId);
        const room = `match:${matchId}`;
        const playerKey = getSeatForPlayer(match, player.id) || "p1";
        const msg = payload as {
          id?: unknown;
          tile?: { x?: unknown; y?: unknown };
          spell?: unknown;
        };
        const id = typeof msg.id === "string" ? msg.id : rid("mag");
        const x = Number(msg.tile?.x);
        const y = Number(msg.tile?.y);
        const rec = (
          msg.spell && typeof msg.spell === "object"
            ? (msg.spell as Record<string, unknown>)
            : {}
        ) as Record<string, unknown>;
        const at = typeof rec.at === "string" ? (rec.at as string) : null;
        const indexVal = Number(rec.index);
        const ownerVal = Number(rec.owner);
        const instanceId =
          typeof rec.instanceId === "string"
            ? (rec.instanceId as string)
            : null;
        const card =
          rec.card && typeof rec.card === "object"
            ? (rec.card as Record<string, unknown>)
            : undefined;
        if (
          !Number.isFinite(x) ||
          !Number.isFinite(y) ||
          !at ||
          !Number.isFinite(indexVal) ||
          !(ownerVal === 1 || ownerVal === 2) ||
          !card
        )
          return;
        const out = {
          type: "magicBegin",
          id,
          tile: { x, y },
          spell: {
            at,
            index: Number(indexVal),
            instanceId,
            owner: ownerVal as 1 | 2,
            card,
          },
          playerKey,
          ts: Date.now(),
        } as const;
        io.to(room).emit("message", out);
        try {
          io.to(`spectate:${matchId}`).emit("message", out);
        } catch {}
      } catch {}
    } else if (type === "magicSetCaster") {
      try {
        const match = await getOrLoadMatch(matchId);
        const room = `match:${matchId}`;
        const playerKey = getSeatForPlayer(match, player.id) || "p1";
        const msg = payload as { id?: unknown; caster?: unknown };
        const id = typeof msg.id === "string" ? msg.id : rid("mag");
        let caster: {
          kind: "avatar" | "permanent";
          seat?: "p1" | "p2";
          at?: string;
          index?: number;
          owner?: 1 | 2;
        } | null = null;
        try {
          if (msg.caster && typeof msg.caster === "object") {
            const c = msg.caster as Record<string, unknown>;
            const kind =
              c.kind === "avatar" || c.kind === "permanent"
                ? (c.kind as "avatar" | "permanent")
                : null;
            if (kind === "avatar") {
              const seat =
                c.seat === "p1" || c.seat === "p2"
                  ? (c.seat as "p1" | "p2")
                  : null;
              if (seat) caster = { kind: "avatar", seat };
            } else if (kind === "permanent") {
              const at = typeof c.at === "string" ? (c.at as string) : null;
              const indexVal = Number(c.index);
              const ownerVal = Number(c.owner);
              if (
                at &&
                Number.isFinite(indexVal) &&
                (ownerVal === 1 || ownerVal === 2)
              )
                caster = {
                  kind: "permanent",
                  at,
                  index: Number(indexVal),
                  owner: ownerVal as 1 | 2,
                };
            }
          }
        } catch {}
        const out = {
          type: "magicSetCaster",
          id,
          caster,
          playerKey,
          ts: Date.now(),
        } as const;
        io.to(room).emit("message", out);
        try {
          io.to(`spectate:${matchId}`).emit("message", out);
        } catch {}
      } catch {}
    } else if (type === "magicSetTarget") {
      try {
        const match = await getOrLoadMatch(matchId);
        const room = `match:${matchId}`;
        const playerKey = getSeatForPlayer(match, player.id) || "p1";
        const msg = payload as { id?: unknown; target?: unknown };
        const id = typeof msg.id === "string" ? msg.id : rid("mag");
        let target:
          | {
              kind: "location" | "permanent" | "avatar";
              at?: string;
              index?: number;
              seat?: "p1" | "p2";
            }
          | {
              kind: "projectile";
              direction: "N" | "E" | "S" | "W";
              firstHit?: {
                kind: "permanent" | "avatar";
                at: string;
                index?: number;
              };
              intended?:
                | { kind: "permanent"; at: string; index: number }
                | { kind: "avatar"; seat: "p1" | "p2" };
            }
          | null = null;
        try {
          if (msg.target && typeof msg.target === "object") {
            const rec = msg.target as Record<string, unknown>;
            const k = typeof rec.kind === "string" ? (rec.kind as string) : "";
            if (k === "location") {
              const at = typeof rec.at === "string" ? (rec.at as string) : null;
              if (at) target = { kind: "location", at };
            } else if (k === "permanent") {
              const at = typeof rec.at === "string" ? (rec.at as string) : null;
              const indexVal = Number(rec.index);
              if (at && Number.isFinite(indexVal))
                target = { kind: "permanent", at, index: Number(indexVal) };
            } else if (k === "avatar") {
              const seat =
                rec.seat === "p1" || rec.seat === "p2"
                  ? (rec.seat as "p1" | "p2")
                  : null;
              if (seat) target = { kind: "avatar", seat };
            } else if (k === "projectile") {
              const dir =
                rec.direction === "N" ||
                rec.direction === "E" ||
                rec.direction === "S" ||
                rec.direction === "W"
                  ? (rec.direction as "N" | "E" | "S" | "W")
                  : null;
              if (dir) {
                let firstHit:
                  | { kind: "permanent" | "avatar"; at: string; index?: number }
                  | undefined;
                let intended:
                  | { kind: "permanent"; at: string; index: number }
                  | { kind: "avatar"; seat: "p1" | "p2" }
                  | undefined;
                try {
                  const fh = rec.firstHit as
                    | Record<string, unknown>
                    | null
                    | undefined;
                  if (fh && typeof fh === "object") {
                    const fhKind =
                      fh.kind === "permanent" || fh.kind === "avatar"
                        ? (fh.kind as "permanent" | "avatar")
                        : null;
                    const fhAt =
                      typeof fh.at === "string" ? (fh.at as string) : null;
                    if (fhKind && fhAt) {
                      if (fhKind === "permanent") {
                        const idx = Number(fh.index);
                        if (Number.isFinite(idx)) {
                          firstHit = {
                            kind: "permanent",
                            at: fhAt,
                            index: Number(idx),
                          };
                        }
                      } else {
                        firstHit = { kind: "avatar", at: fhAt };
                      }
                    }
                  }
                } catch {}
                try {
                  const it = rec.intended as
                    | Record<string, unknown>
                    | null
                    | undefined;
                  if (it && typeof it === "object") {
                    const itKind =
                      it.kind === "permanent" || it.kind === "avatar"
                        ? (it.kind as "permanent" | "avatar")
                        : null;
                    if (itKind === "permanent") {
                      const itAt =
                        typeof it.at === "string" ? (it.at as string) : null;
                      const itIdx = Number(it.index);
                      if (itAt && Number.isFinite(itIdx)) {
                        intended = {
                          kind: "permanent",
                          at: itAt,
                          index: Number(itIdx),
                        };
                      }
                    } else if (itKind === "avatar") {
                      const seat =
                        it.seat === "p1" || it.seat === "p2"
                          ? (it.seat as "p1" | "p2")
                          : null;
                      if (seat) {
                        intended = { kind: "avatar", seat };
                      }
                    }
                  }
                } catch {}
                target = {
                  kind: "projectile",
                  direction: dir,
                  ...(firstHit ? { firstHit } : {}),
                  ...(intended ? { intended } : {}),
                };
              }
            }
          }
        } catch {}
        const out = {
          type: "magicSetTarget",
          id,
          target,
          playerKey,
          ts: Date.now(),
        } as const;
        io.to(room).emit("message", out);
        try {
          io.to(`spectate:${matchId}`).emit("message", out);
        } catch {}
      } catch {}
    } else if (type === "magicResolve") {
      try {
        const match = await getOrLoadMatch(matchId);
        const room = `match:${matchId}`;
        const playerKey = getSeatForPlayer(match, player.id) || "p1";
        const msg = payload as {
          id?: unknown;
          tile?: { x?: unknown; y?: unknown };
          spell?: unknown;
        };
        const id = typeof msg.id === "string" ? msg.id : rid("mag");
        const x = Number(msg.tile?.x);
        const y = Number(msg.tile?.y);
        const tile =
          Number.isFinite(x) && Number.isFinite(y) ? { x, y } : undefined;
        const rec = (
          msg.spell && typeof msg.spell === "object"
            ? (msg.spell as Record<string, unknown>)
            : {}
        ) as Record<string, unknown>;
        const at = typeof rec.at === "string" ? (rec.at as string) : null;
        const indexVal = Number(rec.index);
        const ownerVal = Number(rec.owner);
        const instanceId =
          typeof rec.instanceId === "string"
            ? (rec.instanceId as string)
            : null;
        const card =
          rec.card && typeof rec.card === "object"
            ? (rec.card as Record<string, unknown>)
            : undefined;
        const spell =
          at &&
          Number.isFinite(indexVal) &&
          (ownerVal === 1 || ownerVal === 2) &&
          card
            ? {
                at,
                index: Number(indexVal),
                instanceId,
                owner: ownerVal as 1 | 2,
                card,
              }
            : undefined;
        const out = {
          type: "magicResolve",
          id,
          ...(tile ? { tile } : {}),
          ...(spell ? { spell } : {}),
          playerKey,
          ts: Date.now(),
        } as const;
        io.to(room).emit("message", out);
        try {
          io.to(`spectate:${matchId}`).emit("message", out);
        } catch {}
      } catch {}
    } else if (type === "magicSummary") {
      try {
        const match = await getOrLoadMatch(matchId);
        const room = `match:${matchId}`;
        const playerKey = getSeatForPlayer(match, player.id) || "p1";
        const msg = payload as { id?: unknown; text?: unknown };
        const id = typeof msg.id === "string" ? msg.id : rid("mag");
        const text = typeof msg.text === "string" ? msg.text.slice(0, 400) : "";
        const out = {
          type: "magicSummary",
          id,
          text,
          playerKey,
          ts: Date.now(),
        } as const;
        io.to(room).emit("message", out);
        try {
          io.to(`spectate:${matchId}`).emit("message", out);
        } catch {}
      } catch {}
    } else if (type === "magicCancel") {
      try {
        const match = await getOrLoadMatch(matchId);
        const room = `match:${matchId}`;
        const playerKey = getSeatForPlayer(match, player.id) || "p1";
        const msg = payload as {
          id?: unknown;
          tile?: { x?: unknown; y?: unknown };
          spell?: unknown;
        };
        const id = typeof msg.id === "string" ? msg.id : rid("mag");
        const x = Number(msg.tile?.x);
        const y = Number(msg.tile?.y);
        const tile =
          Number.isFinite(x) && Number.isFinite(y) ? { x, y } : undefined;
        const rec = (
          msg.spell && typeof msg.spell === "object"
            ? (msg.spell as Record<string, unknown>)
            : {}
        ) as Record<string, unknown>;
        const at = typeof rec.at === "string" ? (rec.at as string) : null;
        const indexVal = Number(rec.index);
        const ownerVal = Number(rec.owner);
        const instanceId =
          typeof rec.instanceId === "string"
            ? (rec.instanceId as string)
            : null;
        const card =
          rec.card && typeof rec.card === "object"
            ? (rec.card as Record<string, unknown>)
            : undefined;
        const spell =
          at &&
          Number.isFinite(indexVal) &&
          (ownerVal === 1 || ownerVal === 2) &&
          card
            ? {
                at,
                index: Number(indexVal),
                instanceId,
                owner: ownerVal as 1 | 2,
                card,
              }
            : undefined;
        const out = {
          type: "magicCancel",
          id,
          ...(tile ? { tile } : {}),
          ...(spell ? { spell } : {}),
          playerKey,
          ts: Date.now(),
        } as const;
        io.to(room).emit("message", out);
        try {
          io.to(`spectate:${matchId}`).emit("message", out);
        } catch {}
      } catch {}
    } else if (type === "magicDamage") {
      try {
        const match = await getOrLoadMatch(matchId);
        const room = `match:${matchId}`;
        const playerKey = getSeatForPlayer(match, player.id) || "p1";
        const msg = payload as { id?: unknown; damage?: unknown };
        const id = typeof msg.id === "string" ? msg.id : rid("mag");
        const raw = Array.isArray(msg.damage) ? (msg.damage as unknown[]) : [];
        const damage = raw
          .map((d) =>
            d && typeof d === "object" ? (d as Record<string, unknown>) : null
          )
          .filter(Boolean)
          .map((d) => {
            const kind =
              d!.kind === "permanent" || d!.kind === "avatar"
                ? (d!.kind as "permanent" | "avatar")
                : null;
            const amount = Number(d!.amount);
            if (!Number.isFinite(amount)) return null;
            if (kind === "permanent") {
              const at = typeof d!.at === "string" ? (d!.at as string) : null;
              const indexVal = Number(d!.index);
              if (!at || !Number.isFinite(indexVal)) return null;
              return {
                kind: "permanent" as const,
                at,
                index: Number(indexVal),
                amount: Math.max(0, Math.floor(amount)),
              };
            } else if (kind === "avatar") {
              const seat =
                d!.seat === "p1" || d!.seat === "p2"
                  ? (d!.seat as "p1" | "p2")
                  : null;
              if (!seat) return null;
              return {
                kind: "avatar" as const,
                seat,
                amount: Math.max(0, Math.floor(amount)),
              };
            }
            return null;
          })
          .filter(Boolean);
        const out = {
          type: "magicDamage",
          id,
          damage,
          playerKey,
          ts: Date.now(),
        } as const;
        io.to(room).emit("message", out);
        try {
          io.to(`spectate:${matchId}`).emit("message", out);
        } catch {}
      } catch {}
    } else if (type === "boardCursor") {
      try {
        // Increment receive metric
        incrementMetric("cursorRecvTotal");

        // Rate limit check - silently drop if exceeded
        const rateLimits = getRateLimitsForSocket(socket.id);
        if (!tryConsume(rateLimits.cursor)) {
          incrementRateLimitHit("cursor");
          debugLog(`[cursor] rate limit exceeded for socket ${socket.id}`);
          return; // Silently drop cursor update
        }

        const match = await getOrLoadMatch(matchId);
        const room = `match:${matchId}`;
        const playerKey = getSeatForPlayer(match, player.id) || "p1";
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
            typeof draggingCandidate.kind === "string"
              ? draggingCandidate.kind
              : null;
          const allowedKinds: ReadonlySet<NormalizedDragging["kind"]> = new Set(
            ["permanent", "hand", "pile", "avatar", "token"]
          );
          if (kind && allowedKinds.has(kind)) {
            const next: NormalizedDragging = { kind };
            if (kind === "permanent") {
              const from =
                typeof draggingCandidate.from === "string"
                  ? draggingCandidate.from.slice(0, 32)
                  : null;
              const indexValue =
                typeof draggingCandidate.index === "number" &&
                Number.isFinite(draggingCandidate.index)
                  ? draggingCandidate.index
                  : typeof draggingCandidate.index === "string"
                  ? Number(draggingCandidate.index)
                  : NaN;
              const index = Number.isFinite(indexValue)
                ? Number(indexValue)
                : null;
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
            const cardId = Number.isFinite(cardIdValue)
              ? Number(cardIdValue)
              : null;
            if (cardId !== null) next.cardId = cardId;
            const slug =
              typeof draggingCandidate.slug === "string"
                ? draggingCandidate.slug.slice(0, 64)
                : null;
            if (slug) next.slug = slug;
            const metaRaw =
              typeof draggingCandidate.meta === "object" &&
              draggingCandidate.meta
                ? (draggingCandidate.meta as Record<string, unknown>)
                : null;
            if (metaRaw) {
              const meta: DraggingMeta = {};
              const ownerValue =
                typeof metaRaw.owner === "number" &&
                Number.isFinite(metaRaw.owner)
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
          const cardId = Number.isFinite(cardIdValue)
            ? Number(cardIdValue)
            : null;
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
        // Only emit on boardCursor channel (no duplicate message broadcast)
        io.to(room).emit("boardCursor", out);
        try {
          io.to(`spectate:${matchId}`).emit("boardCursor", out);
        } catch {}
        incrementMetric("cursorSentTotal");
        debugLog(`[cursor] sent for player ${player.id} in room ${room}`);
      } catch {}
    }
  });

  socket.on("resyncRequest", async () => {
    if (!authed) return;
    const player = getPlayerBySocket(socket);
    if (player && player.matchId) {
      const match = await getOrLoadMatch(player.matchId);
      if (match) {
        const isSpectator = Boolean(
          (
            socket as unknown as {
              data?: { isSpectator?: boolean } | undefined;
            }
          ).data?.isSpectator
        );
        const baseMatchInfo = getMatchInfo(match);
        const matchInfo = isSpectator
          ? sanitizeMatchInfoForSpectator(baseMatchInfo)
          : baseMatchInfo;
        const snap: { match: AnyRecord; game?: MatchPatch | null; t?: number } =
          { match: matchInfo };
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
            typeof game["phase"] === "string"
              ? (game["phase"] as string)
              : null;
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
          const enrichedGameRaw = await enrichPatchWithCostsSafe(
            (match.game ?? null) as MatchPatch | null,
            prisma
          );
          snap.game = isSpectator
            ? (sanitizeGameForSpectator(
                enrichedGameRaw as unknown as AnyRecord
              ) as unknown as MatchPatch | null)
            : enrichedGameRaw;
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
    // Spectator resync: if this socket is watching a match, send a sanitized snapshot
    const watchMatchId = (
      socket as unknown as {
        data?: { isSpectator?: boolean; watchMatchId?: string } | undefined;
      }
    ).data?.watchMatchId;
    const isSpectatorSock = Boolean(
      (socket as unknown as { data?: { isSpectator?: boolean } | undefined })
        .data?.isSpectator
    );
    if (
      isSpectatorSock &&
      typeof watchMatchId === "string" &&
      watchMatchId.length > 0
    ) {
      try {
        const match = await getOrLoadMatch(watchMatchId);
        if (match) {
          const baseMatchInfo = getMatchInfo(match);
          const matchInfo = sanitizeMatchInfoForSpectator(baseMatchInfo);
          const snap: {
            match: AnyRecord;
            game?: MatchPatch | null;
            t?: number;
          } = { match: matchInfo };
          const hasMeaningfulGame = (() => {
            const game = match?.game;
            if (!isRecord(game)) return false;
            if (match.status === "in_progress") return true;
            const keys = Object.keys(game);
            if (keys.length === 0) return false;
            return true;
          })();
          if (hasMeaningfulGame) {
            const enrichedGameRaw = await enrichPatchWithCostsSafe(
              (match.game ?? null) as MatchPatch | null,
              prisma
            );
            const canViewHands = Boolean(
              (
                socket as unknown as {
                  data?: { canViewHands?: boolean } | undefined;
                }
              ).data?.canViewHands
            );
            snap.game = canViewHands
              ? (enrichedGameRaw as unknown as MatchPatch | null)
              : (sanitizeGameForSpectator(
                  enrichedGameRaw as unknown as AnyRecord
                ) as unknown as MatchPatch | null);
            snap.t =
              typeof match.lastTs === "number" ? match.lastTs : Date.now();
          }
          socket.emit("resyncResponse", { snapshot: snap });
          return;
        }
      } catch {}
      // Fallback for spectator if match not found
      socket.emit("resyncResponse", { snapshot: {} });
      return;
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

    // Persist updated playerDecks
    try {
      persistMatchUpdate(match, null, player.id, Date.now());
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
      try {
        persistMatchUpdate(match, null, player.id, Date.now());
      } catch {}
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
            typeof playerId === "string" ? playerId : String(playerId ?? "");
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

    // Persist updated playerDecks for recovery and cross-instance consistency
    try {
      persistMatchUpdate(match, null, player.id, Date.now());
    } catch {}

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

    // Ensure persistence after broadcast as well
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
    try {
      const watchId = (
        socket as unknown as { data?: { watchMatchId?: string } | undefined }
      ).data?.watchMatchId;
      if (typeof watchId === "string" && watchId.length > 0) {
        void broadcastSpectatorsUpdated(io, watchId);
      }
    } catch {}

    // Use player registry for disconnect handling when enabled
    if (REDIS_STATE_ENABLED) {
      playerRegistry.handleDisconnect(socket);
    }

    const pid = playerIdBySocket.get(socket.id);
    if (!pid) {
      // Still cleanup rate limiters even if player not found
      cleanupRateLimits(socket.id);
      return;
    }
    const player = players.get(pid);

    // Legacy cleanup (always run for local state consistency)
    if (!REDIS_STATE_ENABLED) {
      playerIdBySocket.delete(socket.id);
    }

    // Cleanup rate limiters for disconnected socket
    cleanupRateLimits(socket.id);

    rtcHandlers.handleDisconnect(player ?? null);

    // Update draft presence on disconnect (cluster-aware)
    // Capture session ID at disconnect time to avoid stale closure in async callback
    const disconnectedDraftSessionId = currentDraftSessionId;
    try {
      if (disconnectedDraftSessionId) {
        updateDraftPresence(
          disconnectedDraftSessionId,
          pid,
          players.get(pid)?.displayName || null,
          false
        )
          .then((list) => {
            try {
              io.to(`draft:${disconnectedDraftSessionId}`).emit(
                "draft:session:presence",
                { sessionId: disconnectedDraftSessionId, players: list }
              );
            } catch (emitErr) {
              console.warn(
                "[draft] Failed to emit presence on disconnect:",
                emitErr
              );
            }
          })
          .catch((presenceErr) => {
            console.warn(
              "[draft] Failed to update presence on disconnect:",
              presenceErr
            );
          });
      }
    } catch (err) {
      console.warn("[draft] Draft presence disconnect cleanup failed:", err);
    }

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

startMaintenanceTimers({
  lobbies,
  matches,
  botManager,
  broadcastLobbies,
  lobbyHasHumanPlayers,
  matchHasHumanPlayers,
  cleanupMatchNow,
  getOrClaimMatchLeader,
  instanceId: INSTANCE_ID,
  io,
  storeRedis,
  matchControlChannel: MATCH_CONTROL_CHANNEL,
  staleWaitingMs: STALE_WAITING_MS,
  inactiveMatchCleanupMs: INACTIVE_MATCH_CLEANUP_MS,
  prisma,
  safeErrorMessage,
});

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
    // Warm up connection pool with a simple query
    try {
      await prisma.$queryRaw`SELECT 1`;
      try {
        console.log("[db] connection pool warmed up");
      } catch {}
    } catch (e) {
      try {
        console.warn("[db] connection warmup failed:", safeErrorMessage(e));
      } catch {}
    }
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

  // Stop leader heartbeat interval
  try {
    if (leaderHeartbeatInterval) {
      clearInterval(leaderHeartbeatInterval);
      leaderHeartbeatInterval = null;
    }
  } catch {}

  // Cleanup player registry timers
  try {
    playerRegistry.shutdown();
  } catch {}

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

process.on("SIGTERM", () => {
  void shutdown();
});
process.on("SIGINT", () => {
  void shutdown();
});
