// @ts-nocheck
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
} = require("./modules/interactions");
const {
  tournament: tournamentModules,
  draft: draftModules,
  replay,
} = require("./modules");
const tournamentBroadcast = tournamentModules.broadcast;
// T021: Import draft config service
const draftConfig = draftModules.config;
const { createMatchDraftService } = draftModules;
const { createMatchLeaderService } = require('./modules/match-leader');
// T023: Import standings service
const standingsService = tournamentModules.standings;
const { enrichPatchWithCosts } = require("./modules/card-costs");
const {
  getSeatForPlayer,
  getPlayerIdForSeat,
  getOpponentSeat,
  inferLoserId,
} = require("./modules/match-utils");
const {
  normalizeDeckPayload,
  validateDeckCards,
} = require("./modules/deck-utils");
const { createLeaderboardService } = require("./modules/leaderboard");

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
const METRICS = {
  counters: new Map(), // key -> number
  hist: new Map(), // key -> { sum:number, count:number }
};
function metricsInc(key, delta = 1) {
  METRICS.counters.set(key, (METRICS.counters.get(key) || 0) + delta);
}
function metricsGet(key) {
  return METRICS.counters.get(key) || 0;
}
function metricsObserveMs(key, ms) {
  const cur = METRICS.hist.get(key) || { sum: 0, count: 0 };
  cur.sum += ms;
  cur.count += 1;
  METRICS.hist.set(key, cur);
}

function promSafe(name) {
  return String(name).replace(/[^a-zA-Z0-9_]/g, "_");
}

let getPersistenceBufferStats = () => ({ bufferCount: 0, bufferedActions: 0 });
let flushAllPersistenceBuffers = async () => {};

function collectMetricsSnapshot() {
  const now = Date.now();
  const counters = {};
  for (const [k, v] of METRICS.counters.entries()) counters[k] = v;
  const hist = {};
  for (const [k, v] of METRICS.hist.entries())
    hist[k] = {
      sum: v.sum,
      count: v.count,
      avg: v.count > 0 ? v.sum / v.count : 0,
    };
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

function buildPromMetrics() {
  const snap = collectMetricsSnapshot();
  const lines = [];
  const pushGauge = (name, value, help) => {
    const n = `sorcery_${promSafe(name)}`;
    if (help) lines.push(`# HELP ${n} ${help}`);
    lines.push(`# TYPE ${n} gauge`);
    lines.push(`${n} ${Number(value)}`);
  };
  const pushCounter = (name, value, help) => {
    const n = `sorcery_${promSafe(name)}_total`;
    if (help) lines.push(`# HELP ${n} ${help}`);
    lines.push(`# TYPE ${n} counter`);
    lines.push(`${n} ${Number(value)}`);
  };
  const pushSummary = (name, sum, count, help) => {
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
      console.warn("[tourney] engine init failed:", e?.message || e);
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
    storeSub.subscribe(MATCH_CONTROL_CHANNEL, (err) => {
      if (err)
        try {
          console.warn(
            `[store] subscribe ${MATCH_CONTROL_CHANNEL} failed:`,
            err?.message || err
          );
        } catch {}
    });
    storeSub.subscribe(LOBBY_CONTROL_CHANNEL, (err) => {
      if (err)
        try {
          console.warn(
            `[store] subscribe ${LOBBY_CONTROL_CHANNEL} failed:`,
            err?.message || err
          );
        } catch {}
    });
    storeSub.subscribe(LOBBY_STATE_CHANNEL, (err) => {
      if (err)
        try {
          console.warn(
            `[store] subscribe ${LOBBY_STATE_CHANNEL} failed:`,
            err?.message || err
          );
        } catch {}
    });
    storeSub.subscribe(DRAFT_STATE_CHANNEL, (err) => {
      if (err)
        try {
          console.warn(
            `[store] subscribe ${DRAFT_STATE_CHANNEL} failed:`,
            err?.message || err
          );
        } catch {}
    });
    storeSub.on("message", async (channel, message) => {
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
              msg.payload || null,
              msg.socketId || null
            );
          } else if (msg.type === "interaction:response" && msg.playerId) {
            await leaderHandleInteractionResponse(
              matchId,
              msg.playerId,
              msg.payload || null,
              msg.socketId || null
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
            console.warn("[match:control] handler error:", e?.message || e);
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
            console.warn("[draft] failed to forward state:", e?.message || e);
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
            console.warn("[lobby:control] handler error:", e?.message || e);
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
server.on("request", async (req, res) => {
  try {
    // Helper: dynamic CORS based on SOCKET_CORS_ORIGIN
    const reqOrigin = (req && req.headers && req.headers.origin) || null;
    const allowCors = () => {
      if (
        reqOrigin &&
        (CORS_ORIGINS.includes("*") || CORS_ORIGINS.includes(reqOrigin))
      ) {
        res.setHeader("Access-Control-Allow-Origin", reqOrigin);
        res.setHeader("Vary", "Origin");
      }
      res.setHeader("Access-Control-Allow-Credentials", "true");
    };
    const allowCorsForOptions = () => {
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
      let publicUsers = [];
      if (ids.length > 0) {
        publicUsers = await prisma.user.findMany({
          where: { id: { in: ids }, presenceHidden: false },
          select: { id: true, shortId: true, image: true },
        });
      }
      const publicMap = new Map(publicUsers.map((u) => [u.id, u]));
      const visible = candidates.filter((c) => publicMap.has(c.id));

      // Friendship flags (relative to requester)
      let friendSet = new Set();
      if (requesterId && visible.length > 0) {
        const fr = await prisma.friendship.findMany({
          where: {
            ownerUserId: requesterId,
            targetUserId: { in: visible.map((v) => v.id) },
          },
          select: { targetUserId: true },
        });
        friendSet = new Set(fr.map((r) => r.targetUserId));
      }

      // Recent opponents (last 10 results) for prioritization when applicable
      const freq = new Map();
      const lastAt = new Map();
      if (requesterId && sort === "recent") {
        const recent = await prisma.matchResult.findMany({
          where: { OR: [{ winnerId: requesterId }, { loserId: requesterId }] },
          orderBy: { completedAt: "desc" },
          take: 10,
        });
        for (const r of recent) {
          let oppIds = [];
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
        const u = publicMap.get(c.id) || {};
        const mcount = freq.has(c.id) ? freq.get(c.id) : null;
        const lpa = lastAt.has(c.id)
          ? new Date(lastAt.get(c.id)).toISOString()
          : null;
        return {
          userId: c.id,
          shortUserId: u.shortId || String(c.id).slice(-8),
          displayName: c.displayName,
          avatarUrl: u.image || null,
          presence: { online: true, inMatch: false },
          isFriend: requesterId ? friendSet.has(c.id) : false,
          lastPlayedAt: lpa,
          matchCountInLast10: mcount,
        };
      });

      // Sort
      const alphaSort = (a, b) => {
        const an = (a.displayName || "").toLowerCase();
        const bn = (b.displayName || "").toLowerCase();
        if (an < bn) return -1;
        if (an > bn) return 1;
        return a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0;
      };
      let ordered = items;
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
      const chunks = [];
      req.on("data", (chunk) => chunks.push(chunk));
      req.on("end", () => {
        try {
          const body = Buffer.concat(chunks).toString();
          const { event, data } = JSON.parse(body);

          // Call the appropriate broadcast function
          switch (event) {
            case "TOURNAMENT_UPDATED":
              if (data.id) broadcastTournamentUpdate(data.id, data);
              break;
            case "PHASE_CHANGED":
              if (data.tournamentId && data.newPhase) {
                const { tournamentId, newPhase, ...additionalData } = data;
                broadcastPhaseChanged(tournamentId, newPhase, additionalData);
              }
              break;
            case "ROUND_STARTED":
              if (data.tournamentId && data.roundNumber && data.matches) {
                broadcastRoundStarted(
                  data.tournamentId,
                  data.roundNumber,
                  data.matches
                );
              }
              break;
            case "PLAYER_JOINED":
              if (data.tournamentId) {
                broadcastPlayerJoined(
                  data.tournamentId,
                  data.playerId,
                  data.playerName,
                  data.currentPlayerCount
                );
              }
              break;
            case "PLAYER_LEFT":
              if (data.tournamentId) {
                broadcastPlayerLeft(
                  data.tournamentId,
                  data.playerId,
                  data.playerName,
                  data.currentPlayerCount
                );
              }
              break;
            case "DRAFT_READY":
              if (data.tournamentId && data.draftSessionId) {
                const { tournamentId, ...rest } = data;
                broadcastDraftReady(tournamentId, rest);
              }
              break;
            case "UPDATE_PREPARATION":
              if (data.tournamentId) {
                broadcastPreparationUpdate(
                  data.tournamentId,
                  data.playerId,
                  data.preparationStatus,
                  data.readyPlayerCount,
                  data.totalPlayerCount,
                  data.deckSubmitted
                );
              }
              break;
            case "STATISTICS_UPDATED":
              if (data.tournamentId) {
                broadcastStatisticsUpdate(data.tournamentId, data);
              }
              break;
            case "MATCH_ASSIGNED":
              // For now, just log - MATCH_ASSIGNED needs player-specific routing
              console.log("[Tournament] MATCH_ASSIGNED broadcast received");
              break;
            case "matchEnded":
              if (data.matchId) {
                const match = matches.get(data.matchId);
                if (match) {
                  // Clear player associations
                  for (const playerId of match.playerIds || []) {
                    const player = players.get(playerId);
                    if (player && player.matchId === data.matchId) {
                      player.matchId = null;
                    }
                  }
                  // Broadcast to match room
                  io.to(`match:${data.matchId}`).emit("matchEnded", data);
                  console.log(
                    `[Match] Ended match ${data.matchId} due to ${data.reason}`
                  );
                }
              }
              break;
          }

          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: true }));
        } catch (err) {
          console.error("[Tournament] Broadcast error:", err);
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({ error: "Invalid request", details: err.message })
          );
        }
      });

      req.on("error", (err) => {
        console.error("[Tournament] Request error:", err);
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
          message: e && e.message ? e.message : String(e),
        })
      );
    } catch {}
  }
});

// In-memory state
// Players keyed by stable playerId (not socket id)
/** @type {Map<string, { id: string, displayName: string, socketId: string|null, lobbyId?: string|null, matchId?: string|null }>} */
const players = new Map();
/** @type {Map<string, string>} socket.id -> playerId */
const playerIdBySocket = new Map();
/** @type {Map<string, { id: string, lobbyId?: string|null, playerIds: string[], status: 'waiting'|'deck_construction'|'in_progress'|'ended', seed: string, turn?: string, winnerId?: string|null, matchType?: 'constructed'|'sealed', sealedConfig?: { packCount: number, setMix: string[], timeLimit: number, constructionStartTime?: number, packCounts?: Record<string, number>, replaceAvatars?: boolean }, playerDecks?: Map<string, any>, sealedPacks?: Record<string, Array<{ id: string, set: string, cards: Array<{ id: string, name: string, set: string, slug: string, type?: string|null, cost?: number|null, rarity: string }> }>> }>} */
const matches = new Map();
/** @type {Map<string, { matchId: string, playerNames: string[], startTime: number, endTime?: number, initialState?: any, actions: Array<{ patch: any, timestamp: number, playerId: string }> }>} */
const matchRecordings = new Map();
/** @type {Map<string, Set<string>>} voiceRoomId -> set of playerIds participating in WebRTC */
const rtcParticipants = new Map();
/** @type {Map<string, { id: string, displayName: string, lobbyId: string|null, matchId: string|null, roomId: string, joinedAt: number }>} playerId -> participant details */
const participantDetails = new Map();
/** @type {Map<string, { id: string, from: string, to: string, lobbyId: string|null, matchId: string|null, createdAt: number }>} */
const pendingVoiceRequests = new Map();

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
});

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
  enrichPatchWithCosts,
  deepMergeReplaceArrays,
  finalizeMatch,
  persistMatchUpdate,
  prisma,
});

const matchLeaderService = createMatchLeaderService({
  io,
  storeRedis,
  prisma,
  getOrLoadMatch,
  getSeatForPlayer,
  getOpponentSeat,
  ensureInteractionState,
  purgeExpiredGrants,
  collectInteractionRequirements,
  usePermitForRequirement,
  mergeEvents,
  dedupePermanents,
  deepMergeReplaceArrays,
  applyMovementAndCombat,
  applyTurnStart,
  applyGenesis,
  applyKeywordAnnotations,
  enrichPatchWithCosts,
  recordMatchAction,
  persistMatchUpdate,
  finalizeMatch,
  rulesEnforceMode: RULES_ENFORCE_MODE,
  interactionEnforcementEnabled: INTERACTION_ENFORCEMENT_ENABLED,
  isCpuPlayerId,
});

const { applyAction: leaderApplyAction } = matchLeaderService;

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
      console.warn("[Bot] BotClient module unavailable:", e?.message || e);
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

container.initialize().catch((err) => {
  try {
    console.error(
      "[container] Initialization failed:",
      err instanceof Error ? err.message : err
    );
  } catch {
    // noop
  }
});

function getVoiceRoomIdForPlayer(player) {
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
function isCpuPlayerId(id) {
  return typeof id === "string" && id.startsWith("cpu_");
}

// Returns true if there is at least one non-CPU (human) player in the lobby
function lobbyHasHumanPlayers(lobby) {
  if (!lobby || !lobby.playerIds || lobby.playerIds.size === 0) return false;
  for (const pid of lobby.playerIds) {
    if (!isCpuPlayerId(pid)) return true;
  }
  return false;
}

// Returns true if there is at least one non-CPU (human) player in the match
function matchHasHumanPlayers(match) {
  if (!match || !Array.isArray(match.playerIds) || match.playerIds.length === 0)
    return false;
  for (const pid of match.playerIds) {
    if (!isCpuPlayerId(pid)) return true;
  }
  return false;
}

async function finalizeMatch(match, options = {}) {
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
      ? getOpponentSeat(winnerSeat)
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
          const playersVal = Array.isArray(tMatch.players)
            ? tMatch.players
            : [];
          const playerIds = playersVal
            .map((p) => {
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
        err?.message || err
      );
    } catch {}
  }
}

// Bot lifecycle helpers moved into BotManager

// -----------------------------
// Helpers: deck normalization & validation
// -----------------------------
function rid(prefix) {
  return `${prefix}_${Math.random().toString(36).slice(2, 8)}${Date.now()
    .toString(36)
    .slice(-4)}`;
}

function getPlayerInfo(playerId) {
  const p = players.get(playerId);
  if (!p) return null;
  return { id: p.id, displayName: p.displayName };
}

function getPlayerBySocket(socket) {
  const pid = playerIdBySocket.get(socket.id);
  if (!pid) return null;
  return players.get(pid) || null;
}

// Ensure basic player profile is cached locally; fetch displayName from Redis if needed
async function ensurePlayerCached(playerId) {
  if (players.has(playerId)) return players.get(playerId);
  try {
    const dn = storeRedis
      ? await storeRedis.hget(`player:${playerId}`, "displayName")
      : null;
    const p = {
      id: playerId,
      displayName: dn || `Player ${String(playerId).slice(-4)}`,
      socketId: null,
      lobbyId: null,
      matchId: null,
    };
    players.set(playerId, p);
    return p;
  } catch {
    const p = {
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

function isPlayerConnected(playerId) {
  const p = players.get(playerId);
  if (!p || !p.socketId) return false;
  return !!io.sockets.sockets.get(p.socketId);
}

// -----------------------------
// Distributed match coordination helpers (Redis)
// -----------------------------
async function getOrClaimMatchLeader(matchId) {
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

async function getOrLoadMatch(matchId) {
  if (matches.has(matchId)) return matches.get(matchId);
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
      const m = rehydrateMatch(row);
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
      const playersJson = t.players;
      /** @type {string[]} */
      let playerIds = [];
      try {
        /** @type {any[]} */
        let arr = [];
        if (Array.isArray(playersJson)) {
          arr = playersJson;
        } else if (playersJson && typeof playersJson === "object") {
          if (Array.isArray(playersJson.playerIds)) arr = playersJson.playerIds;
          else if (Array.isArray(playersJson.players))
            arr = playersJson.players;
          else arr = [];
        }
        playerIds = Array.from(
          new Set(
            arr
              .map((it) => {
                if (typeof it === "string") return it;
                if (it && typeof it === "object") {
                  const v = it.id ?? it.playerId ?? it.userId;
                  return v ? String(v) : null;
                }
                return null;
              })
              .filter(Boolean)
          )
        );
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

async function leaderJoinMatch(matchId, playerId, socketId) {
  const match = await getOrLoadMatch(matchId);
  if (!match) return;
  // Update roster
  if (!Array.isArray(match.playerIds)) match.playerIds = [];
  if (!match.playerIds.includes(playerId)) match.playerIds.push(playerId);
  // Update player mapping in local cache
  const p = await ensurePlayerCached(playerId);
  try {
    p.matchId = matchId;
  } catch {}
  // Join the socket (works cluster-wide with Redis adapter)
  const room = `match:${matchId}`;
  try {
    await io.in(socketId).socketsJoin(room);
    console.log("[joinMatch] Socket joined room", { socketId, room, playerId });
  } catch (e) {
    console.error("[joinMatch] Failed to join room", {
      socketId,
      room,
      playerId,
      error: e?.message,
    });
  }
  // Send match info directly to the joiner to avoid any race, then broadcast to the room
  try {
    if (socketId)
      io.to(socketId).emit("matchStarted", { match: getMatchInfo(match) });
  } catch {}
  try {
    io.to(room).emit("matchStarted", { match: getMatchInfo(match) });
  } catch {}
  // If a draft is in progress, immediately sync the joining socket with the current draft state
  try {
    if (
      match.matchType === "draft" &&
      match.draftState &&
      match.draftState.phase &&
      match.draftState.phase !== "waiting"
    ) {
      if (socketId) io.to(socketId).emit("draftUpdate", match.draftState);
    }
  } catch {}
  // Persist roster change and refresh cache
  try {
    await persistMatchUpdate(match, null, playerId, Date.now());
  } catch {}
  // Keep our leadership fresh
  try {
    if (storeRedis) await storeRedis.expire(`match:leader:${matchId}`, 60);
  } catch {}
}

// Permanently remove a match if truly empty (no players, no sockets in room)
async function cleanupMatchNow(matchId, reason, force = false) {
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
async function leaderHandleMulliganDone(matchId, playerId) {
  const match = await getOrLoadMatch(matchId);
  if (!match) return;
  // Accept mulligans during "waiting", "deck_construction", or "in_progress"
  if (
    match.status !== "waiting" &&
    match.status !== "deck_construction" &&
    match.status !== "in_progress"
  )
    return;
  // If already in Main phase, mulligans are no longer relevant
  if (match.game && match.game.phase === "Main") return;

  // Track per-player mulligan completion for this match
  if (!match.mulliganDone || !(match.mulliganDone instanceof Set)) {
    match.mulliganDone = new Set();
  }

  const wasAlreadyDone = match.mulliganDone.has(playerId);
  match.mulliganDone.add(playerId);

  try {
    const doneCount = match.mulliganDone.size;
    const total = Array.isArray(match.playerIds) ? match.playerIds.length : 0;
    const waitingFor = Array.isArray(match.playerIds)
      ? match.playerIds.filter((pid) => !match.mulliganDone.has(pid))
      : [];
    const names = waitingFor.map((pid) => players.get(pid)?.displayName || pid);
    console.log(
      `[Setup] mulliganDone <= ${playerId}${
        wasAlreadyDone ? " (duplicate)" : ""
      }. ${doneCount}/${total} complete. Waiting for: ${
        names.join(", ") || "none"
      }`
    );
  } catch {}

  // If all current players have finished mulligans, start the game
  const allDone =
    Array.isArray(match.playerIds) &&
    match.playerIds.every((pid) => match.mulliganDone.has(pid));
  if (!allDone) {
    // Even if this player was already done, send them current state to ensure they're synced
    if (wasAlreadyDone) {
      const room = `match:${match.id}`;
      try {
        console.log(
          `[Setup] Player ${playerId} resubmitted mulligan - sending current game state`
        );
        io.to(room).emit("matchStarted", { match: getMatchInfo(match) });
      } catch {}
    }
    return;
  }

  const room = `match:${match.id}`;
  // Flip match status and broadcast updated match info for strict sync
  match.status = "in_progress";
  io.to(room).emit("matchStarted", { match: getMatchInfo(match) });
  // Broadcast a deterministic patch to set phase to Main
  const now = Date.now();
  // If currentPlayer isn't set yet (e.g., human winner hasn't chosen), set a sensible default
  let cp =
    match.game && typeof match.game.currentPlayer === "number"
      ? match.game.currentPlayer
      : null;
  if (cp !== 1 && cp !== 2) {
    const sw = match.game ? match.game.setupWinner : null;
    cp = sw === "p2" ? 2 : 1; // default to P1 if undefined
  }
  // Ensure avatar positions exist so first-site placement rule can be applied client/server
  const sz = (match.game && match.game.board && match.game.board.size) || {
    w: 5,
    h: 4,
  };
  const cx = Math.floor(Math.max(1, Number(sz.w) || 5) / 2);
  const topY = (Number(sz.h) || 4) - 1;
  const botY = 0;
  const avPrev = (match.game && match.game.avatars) || { p1: {}, p2: {} };
  const p1Prev = avPrev.p1 || {};
  const p2Prev = avPrev.p2 || {};
  const avatars = {
    p1: { ...p1Prev, pos: Array.isArray(p1Prev.pos) ? p1Prev.pos : [cx, topY] },
    p2: { ...p2Prev, pos: Array.isArray(p2Prev.pos) ? p2Prev.pos : [cx, botY] },
  };
  const mainPatch = { phase: "Main", currentPlayer: cp, avatars };
  // Update server-side aggregated snapshot
  match.game = deepMergeReplaceArrays(match.game || {}, mainPatch);
  match.lastTs = now;
  const enrichedMainPatch = await enrichPatchWithCosts(mainPatch, prisma);
  io.to(room).emit("statePatch", { patch: enrichedMainPatch, t: now });
  try {
    await persistMatchUpdate(match, mainPatch, playerId, now);
  } catch {}
  try {
    console.log(
      `[Setup] All mulligans complete for match ${match.id}. Starting game.`
    );
  } catch {}
  try {
    if (storeRedis) await storeRedis.expire(`match:leader:${matchId}`, 60);
  } catch {}
}

async function leaderHandleInteractionRequest(
  matchId,
  playerId,
  payload,
  actorSocketId
) {
  try {
    const match = await getOrLoadMatch(matchId);
    if (!match) return;
    const now = Date.now();
    const actorSeat = getSeatForPlayer(match, playerId);
    if (!actorSeat) {
      return {
        ok: false,
        error: "Interaction requests are only available to seated players",
        code: "interaction_invalid",
      };
    }
    const opponentSeat = getOpponentSeat(actorSeat);
    if (!opponentSeat) return;
    const opponentIndex = actorSeat === "p1" ? 1 : 0;
    const opponentId = Array.isArray(match.playerIds)
      ? match.playerIds[opponentIndex]
      : null;
    if (!opponentId) {
      return {
        ok: false,
        error: "Opponent unavailable for interaction",
        code: "interaction_invalid_opponent",
      };
    }

    const rawKind = typeof payload?.kind === "string" ? payload.kind : null;
    if (!rawKind || !INTERACTION_REQUEST_KINDS.has(rawKind)) {
      return {
        ok: false,
        error: "Unsupported interaction kind",
        code: "interaction_invalid_kind",
      };
    }

    const requestId =
      typeof payload?.requestId === "string" && payload.requestId.length >= 6
        ? payload.requestId
        : rid("intl");
    const expiresAtRaw = Number(payload?.expiresAt);
    const expiresAt =
      Number.isFinite(expiresAtRaw) && expiresAtRaw > now ? expiresAtRaw : null;
    const note =
      typeof payload?.note === "string"
        ? payload.note.slice(0, 280)
        : undefined;

    const rawPayload =
      payload && typeof payload.payload === "object" && payload.payload !== null
        ? payload.payload
        : {};
    const sanitizedPayload = {};
    for (const [key, value] of Object.entries(rawPayload)) {
      if (key === "grant" || key === "proposedGrant") continue;
      sanitizedPayload[key] = value;
    }

    const proposedGrant = sanitizeGrantOptions(
      payload?.grant ?? rawPayload?.grant ?? rawPayload?.proposedGrant,
      opponentSeat
    );
    if (proposedGrant) {
      sanitizedPayload.proposedGrant = proposedGrant;
    }

    const message = {
      type: "interaction:request",
      requestId,
      matchId: match.id,
      from: playerId,
      to: opponentId,
      kind: rawKind,
      createdAt: now,
    };
    if (expiresAt) message.expiresAt = expiresAt;
    if (note) message.note = note;
    if (Object.keys(sanitizedPayload).length > 0)
      message.payload = sanitizedPayload;

    const pendingAction = sanitizePendingAction(
      rawKind,
      sanitizedPayload,
      actorSeat,
      playerId
    );
    recordInteractionRequest(
      match,
      message,
      proposedGrant || null,
      pendingAction
    );
    match.lastTs = now;
    emitInteraction(matchId, message);
    try {
      await persistMatchUpdate(match, null, playerId, now);
    } catch {}
    return { ok: true };
  } catch (err) {
    try {
      console.warn("[interaction] request failed", err?.message || err);
    } catch {}
    return {
      ok: false,
      error: "Failed to process interaction request",
      code: "interaction_internal",
    };
  }
}

async function leaderHandleInteractionResponse(
  matchId,
  playerId,
  payload,
  actorSocketId
) {
  try {
    const match = await getOrLoadMatch(matchId);
    if (!match) return;
    ensureInteractionState(match);
    const now = Date.now();
    const actorSeat = getSeatForPlayer(match, playerId);
    const requestId =
      typeof payload?.requestId === "string" ? payload.requestId : null;
    if (!requestId) {
      return {
        ok: false,
        error: "Missing interaction request identifier",
        code: "interaction_invalid_request",
      };
    }
    const entry =
      match.interactionRequests instanceof Map
        ? match.interactionRequests.get(requestId)
        : null;
    const request = entry && entry.request ? entry.request : null;
    if (!request) {
      return {
        ok: false,
        error: "Interaction request not found",
        code: "interaction_unknown_request",
      };
    }

    const rawDecision =
      typeof payload?.decision === "string" ? payload.decision : null;
    if (!rawDecision || !INTERACTION_DECISIONS.has(rawDecision)) {
      return {
        ok: false,
        error: "Invalid interaction decision",
        code: "interaction_invalid_decision",
      };
    }

    const responderTargetsOpponent = rawDecision !== "cancelled";
    if (responderTargetsOpponent && playerId !== request.to) {
      return {
        ok: false,
        error: "Only the targeted opponent may respond",
        code: "interaction_not_authorized",
      };
    }
    if (!responderTargetsOpponent && playerId !== request.from) {
      return {
        ok: false,
        error: "Only the requester may cancel",
        code: "interaction_not_authorized",
      };
    }

    const reason =
      typeof payload?.reason === "string"
        ? payload.reason.slice(0, 280)
        : undefined;
    const rawPayload =
      payload && typeof payload.payload === "object" && payload.payload !== null
        ? payload.payload
        : {};
    const sanitizedPayload = {};
    for (const [key, value] of Object.entries(rawPayload)) {
      if (key === "grant" || key === "proposedGrant") continue;
      sanitizedPayload[key] = value;
    }

    let grantOpts = null;
    if (rawDecision === "approved") {
      grantOpts = sanitizeGrantOptions(
        payload?.grant ?? rawPayload?.grant ?? rawPayload?.proposedGrant,
        actorSeat || getOpponentSeat(getSeatForPlayer(match, request.from))
      );
      if (grantOpts) {
        sanitizedPayload.grant = grantOpts;
      }
    }

    const recipientId = playerId === request.from ? request.to : request.from;
    const responseMessage = {
      type: "interaction:response",
      requestId: request.requestId,
      matchId: match.id,
      from: playerId,
      to: recipientId,
      kind: request.kind,
      decision: rawDecision,
      createdAt: request.createdAt,
      expiresAt: request.expiresAt,
      respondedAt: now,
    };
    if (reason) responseMessage.reason = reason;
    if (Object.keys(sanitizedPayload).length > 0)
      responseMessage.payload = sanitizedPayload;

    let grantRecord = null;
    if (rawDecision === "approved" && grantOpts) {
      grantRecord = createGrantRecord(request, responseMessage, grantOpts, now);
      const existing = match.interactionGrants.get(grantRecord.grantedTo) || [];
      existing.push(grantRecord);
      match.interactionGrants.set(grantRecord.grantedTo, existing);
    }

    recordInteractionResponse(match, responseMessage, grantRecord);
    if (rawDecision === "approved") {
      try {
        const entry = match.interactionRequests.get(requestId);
        if (entry) {
          const result = await applyPendingAction(match, entry, now);
          if (result) {
            entry.result = result;
            entry.pendingAction = null;
            match.interactionRequests.set(requestId, entry);
            emitInteractionResult(matchId, result);
          }
        }
      } catch (err) {
        try {
          console.warn(
            "[interaction] failed to execute pending action",
            err?.message || err
          );
        } catch {}
      }
    }
    match.lastTs = now;
    emitInteraction(matchId, responseMessage);
    try {
      await persistMatchUpdate(match, null, playerId, now);
    } catch {}
    return { ok: true };
  } catch (err) {
    try {
      console.warn("[interaction] response failed", err?.message || err);
    } catch {}
    return {
      ok: false,
      error: "Failed to process interaction response",
      code: "interaction_internal",
    };
  }
}

function getMatchInfo(match) {
  return {
    id: match.id,
    lobbyId: match.lobbyId || undefined,
    lobbyName: match.lobbyName || undefined,
    tournamentId: match.tournamentId || undefined,
    draftSessionId: match.draftSessionId || undefined,
    players: match.playerIds.map(getPlayerInfo).filter(Boolean),
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

async function hydrateMatchFromDatabase(matchId, match) {
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
          const settings = draftSession.settings || {};
          const cubeId = settings.cubeId;

          // Build draftConfig from DraftSession
          const packConfig = draftSession.packConfiguration || [];
          const packCounts = {};
          for (const entry of packConfig) {
            const setId = entry.setId || "Beta";
            packCounts[setId] =
              (packCounts[setId] || 0) + (entry.packCount || 0);
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
          err?.message || err
        );
      }
    }
  } catch (err) {
    try {
      console.warn(
        `[Tournament] Failed to hydrate match ${matchId} from database:`,
        err?.message || err
      );
    } catch {}
  }
}

// Deep merge that replaces arrays and merges plain objects.
// Primitives and nulls overwrite. Undefined in patch leaves value as-is.
function deepMergeReplaceArrays(base, patch) {
  if (patch === undefined) return base;
  if (patch === null) return null;
  if (Array.isArray(patch)) return patch; // replace arrays fully
  if (typeof patch !== "object") return patch; // primitives overwrite

  const baseObj =
    base && typeof base === "object" && !Array.isArray(base) ? base : {};
  const out = { ...baseObj };
  for (const [k, v] of Object.entries(patch)) {
    const cur = out[k];
    out[k] = deepMergeReplaceArrays(cur, v);
  }
  return out;
}

// Normalize permanents arrays without dropping duplicates across the board.
// Trust client/server sync to resolve identity; allow multiple copies of same cardId.
function dedupePermanents(per) {
  try {
    if (!per || typeof per !== "object") return per;
    const out = {};
    for (const [cell, arrAny] of Object.entries(per)) {
      const arr = Array.isArray(arrAny) ? arrAny : [];
      const next = [];
      for (const item of arr) {
        if (!item || typeof item !== "object") continue;
        next.push(item);
      }
      out[cell] = next;
    }
    return out;
  } catch {
    return per;
  }
}

// Cap for multiplayer console events to avoid unbounded growth
const MAX_EVENTS = 200;
// Merge console events by stable key and chronological order, trimming to MAX_EVENTS.
function mergeEvents(prev, add) {
  const m = new Map();
  if (Array.isArray(prev)) {
    for (const e of prev) {
      if (!e) continue;
      m.set(`${e.id}|${e.ts}|${e.text}`, e);
    }
  }
  if (Array.isArray(add)) {
    for (const e of add) {
      if (!e) continue;
      m.set(`${e.id}|${e.ts}|${e.text}`, e);
    }
  }
  const merged = Array.from(m.values()).sort(
    (a, b) => a.ts - b.ts || a.id - b.id
  );
  return merged.length > MAX_EVENTS ? merged.slice(-MAX_EVENTS) : merged;
}

// T019: Tournament broadcast helpers - now use extracted module
function broadcastPlayers() {
  io.emit("playerList", { players: playersArray() });
}

function startMatchRecording(match) {
  const playerNames = match.playerIds.map((pid) => {
    const p = players.get(pid);
    return p ? p.displayName : `Player ${pid}`;
  });

  const recording = {
    matchId: match.id,
    playerNames,
    startTime: Date.now(),
    endTime: null,
    initialState: {
      playerIds: match.playerIds,
      seed: match.seed,
      matchType: match.matchType,
      playerDecks: match.playerDecks
        ? Object.fromEntries(match.playerDecks)
        : null,
    },
    actions: [],
  };

  matchRecordings.set(match.id, recording);
  console.log(
    `[Recording] Started recording match ${
      match.id
    } with players: ${playerNames.join(", ")}`
  );
}

function recordMatchAction(matchId, patch, playerId) {
  const recording = matchRecordings.get(matchId);
  if (!recording) {
    console.log(`[Recording] No recording found for match ${matchId}`);
    return;
  }

  recording.actions.push({
    patch,
    timestamp: Date.now(),
    playerId,
  });
  console.log(
    `[Recording] Recorded action ${recording.actions.length} for match ${matchId} by player ${playerId}`
  );
}

function finishMatchRecording(matchId) {
  const recording = matchRecordings.get(matchId);
  if (!recording) return;

  recording.endTime = Date.now();
  console.log(
    `[Recording] Finished recording match ${matchId}, total actions: ${recording.actions.length}`
  );
}

const REQUIRE_JWT = Boolean(
  (process.env.SOCKET_REQUIRE_JWT || "").toLowerCase() === "1" ||
    (process.env.SOCKET_REQUIRE_JWT || "").toLowerCase() === "true"
);

// Enforce NextAuth-signed JWT at connect time
io.use((socket, next) => {
  try {
    const token =
      (socket.handshake &&
        socket.handshake.auth &&
        socket.handshake.auth.token) ||
      null;
    if (token && process.env.NEXTAUTH_SECRET) {
      const payload = jwt.verify(token, process.env.NEXTAUTH_SECRET);
      socket.data = socket.data || {};
      socket.data.authUser = {
        id: (payload && (payload.uid || payload.sub)) || null,
        name: payload && payload.name,
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
        message: e?.message || String(e),
      });
    } catch {}
    return next(new Error("invalid_token"));
  }
});

io.on("connection", async (socket) => {
  let authed = false;
  let authUser = null;
  // Track current draft session room for this socket (if any)
  let currentDraftSessionId = null;
  container.applyConnectionHandlers({
    socket,
    isAuthed: () => authed,
    getPlayerBySocket,
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
    } else if (player.lobbyId && lobbies.has(player.lobbyId)) {
      socket.join(`lobby:${player.lobbyId}`);
      const l = lobbies.get(player.lobbyId);
      socket.emit("joinedLobby", { lobby: getLobbyInfo(l) });
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
  socket.on("draft:session:join", async (payload = {}) => {
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
                err?.message || err
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
          errorMessage: String(e?.message || e),
        });
      } catch {}
    }
  });

  socket.on("draft:session:leave", async (payload = {}) => {
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
                err?.message || err
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
      await leaderHandleInteractionRequest(
        matchId,
        player.id,
        payload,
        socket.id
      );
    } catch (err) {
      try {
        console.warn(
          "[interaction] request handler error",
          err?.message || err
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
      await leaderHandleInteractionResponse(
        matchId,
        player.id,
        payload,
        socket.id
      );
    } catch (err) {
      try {
        console.warn(
          "[interaction] response handler error",
          err?.message || err
        );
      } catch {}
    }
  });

  socket.on("chat", (payload = {}) => {
    if (!authed) return;
    const player = getPlayerBySocket(socket);
    if (!player) return;
    const content = String(
      payload && payload.content ? payload.content : ""
    ).slice(0, 500);
    if (!content) return;
    const requestedScope =
      payload && typeof payload.scope === "string" ? payload.scope : null;

    const from = getPlayerInfo(player.id);

    // Global chat: broadcast to all connected clients
    if (requestedScope === "global") {
      io.emit("chat", { from, content, scope: "global" });
      return;
    }

    // Room-scoped chat (lobby or match). Prefer requested scope if valid and the player is in that context; otherwise infer from player state.
    /** @type {'lobby'|'match'} */
    let scope = "lobby";
    let room = null;

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
        if (
          payload &&
          typeof payload.dragging === "object" &&
          payload.dragging
        ) {
          const raw = payload.dragging;
          const kind = typeof raw.kind === "string" ? raw.kind : null;
          const allowedKinds = new Set([
            "permanent",
            "hand",
            "pile",
            "avatar",
            "token",
          ]);
          if (kind && allowedKinds.has(kind)) {
            const next = { kind };
            if (kind === "permanent") {
              const from =
                typeof raw.from === "string" ? raw.from.slice(0, 32) : null;
              const index = Number.isFinite(Number(raw.index))
                ? Number(raw.index)
                : null;
              if (from) next.from = from;
              if (index !== null) next.index = index;
            }
            if (kind === "avatar") {
              const who = raw.who === "p1" || raw.who === "p2" ? raw.who : null;
              if (who) next.who = who;
            }
            const source =
              typeof raw.source === "string" ? raw.source.slice(0, 32) : null;
            if (source) next.source = source;
            const cardId = Number.isFinite(Number(raw.cardId))
              ? Number(raw.cardId)
              : null;
            if (cardId !== null) next.cardId = cardId;
            const slug =
              typeof raw.slug === "string" ? raw.slug.slice(0, 64) : null;
            if (slug) next.slug = slug;
            if (typeof raw.meta === "object" && raw.meta) {
              const meta = {};
              if (
                typeof raw.meta.owner === "number" &&
                Number.isFinite(raw.meta.owner)
              ) {
                meta.owner = Number(raw.meta.owner);
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
        if (
          payload &&
          typeof payload.highlight === "object" &&
          payload.highlight
        ) {
          const h = payload.highlight;
          const cardId = Number.isFinite(Number(h.cardId))
            ? Number(h.cardId)
            : null;
          const slug =
            typeof h.slug === "string" ? String(h.slug).slice(0, 64) : null;
          if (cardId !== null || (slug && slug.length > 0)) {
            highlight = { cardId, slug };
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
        const snap = { match: getMatchInfo(match) };
        // Only include a game snapshot when it's meaningful.
        // During sealed/draft setup the server-side game can be an empty object ({}),
        // while the client has already loaded decks locally. Sending an empty game here
        // would wipe the client state on every resync. Avoid that by requiring either
        // an in-progress match or detectable game content.
        const hasMeaningfulGame = (() => {
          if (!match || !match.game) return false;
          if (match.status === "in_progress") return true;
          if (typeof match.game === "object") {
            const g = match.game;
            const keys = Object.keys(g);
            if (keys.length === 0) return false;
            // Heuristic: presence of core state indicates a real snapshot (phase alone is not enough)
            if ("libraries" in g) return true;
            if ("zones" in g) return true;
            if ("board" in g) return true;
            if ("permanents" in g) return true;
            if ("currentPlayer" in g) return true;
            // Setup phase with mulligans is meaningful - needed for tournament sealed matches
            if (g.phase === "Setup" && "mulligans" in g) return true;
            // Consider avatars meaningful when at least one seat has a card or position
            try {
              const a = g.avatars || {};
              const p1Has = !!(
                a.p1 &&
                (a.p1.card ||
                  (Array.isArray(a.p1.pos) && a.p1.pos.length === 2))
              );
              const p2Has = !!(
                a.p2 &&
                (a.p2.card ||
                  (Array.isArray(a.p2.pos) && a.p2.pos.length === 2))
              );
              if (p1Has || p2Has) return true;
            } catch {}
            // D20 rolls are meaningful during Setup phase - needed for player seat selection
            if (
              "d20Rolls" in g &&
              g.d20Rolls &&
              typeof g.d20Rolls === "object"
            ) {
              const rolls = g.d20Rolls;
              if (rolls.p1 !== null && rolls.p1 !== undefined) return true;
              if (rolls.p2 !== null && rolls.p2 !== undefined) return true;
            }
          }
          return false;
        })();
        if (hasMeaningfulGame) {
          // Enrich game state with card costs before sending to client
          const enrichedGame = await enrichPatchWithCosts(match.game, prisma);
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

  // --- Enhanced WebRTC signaling with participant tracking ---------------
  // Manages WebRTC participant state and scoped message delivery.
  // Only participants who have joined WebRTC receive signals.
  socket.on("rtc:join", () => {
    if (!authed) return;
    const player = getPlayerBySocket(socket);
    if (!player) return;

    const roomId = getVoiceRoomIdForPlayer(player);
    if (!roomId) return;

    const playerId = player.id;

    console.log("[RTC][join] join request", {
      playerId,
      socket: socket.id,
      roomId,
      lobbyId: player.lobbyId || null,
      matchId: player.matchId || null,
    });

    if (!rtcParticipants.has(roomId)) {
      rtcParticipants.set(roomId, new Set());
    }

    const roomParticipants = rtcParticipants.get(roomId);
    roomParticipants.add(playerId);

    participantDetails.set(playerId, {
      id: playerId,
      displayName: player.displayName,
      lobbyId: player.lobbyId || null,
      matchId: player.matchId || null,
      roomId,
      joinedAt: Date.now(),
    });

    const participants = Array.from(roomParticipants)
      .map((pid) => {
        const details = participantDetails.get(pid);
        return details
          ? {
              id: details.id,
              displayName: details.displayName,
              lobbyId: details.lobbyId,
              matchId: details.matchId,
              roomId: details.roomId,
              joinedAt: details.joinedAt,
            }
          : null;
      })
      .filter(Boolean);

    roomParticipants.forEach((pid) => {
      if (pid === playerId) return;
      const participantPlayer = players.get(pid);
      if (participantPlayer && participantPlayer.socketId) {
        io.to(participantPlayer.socketId).emit("rtc:peer-joined", {
          from: getPlayerInfo(playerId),
          participants,
        });
      }
    });

    socket.emit("rtc:participants", { participants });
  });

  socket.on("rtc:signal", (payload = {}) => {
    if (!authed) return;
    const player = getPlayerBySocket(socket);
    if (!player) return;

    const roomId = getVoiceRoomIdForPlayer(player);
    if (!roomId) return;

    const playerId = player.id;
    const data = payload && typeof payload === "object" ? payload.data : null;
    if (!data) return;

    console.log("[RTC][signal] forwarding signal", {
      from: playerId,
      roomId,
      hasSdp: !!data.sdp,
      hasCandidate: !!data.candidate,
    });

    const roomParticipants = rtcParticipants.get(roomId);
    if (!roomParticipants || !roomParticipants.has(playerId)) return;

    roomParticipants.forEach((pid) => {
      if (pid === playerId) return;
      const participantPlayer = players.get(pid);
      if (participantPlayer && participantPlayer.socketId) {
        io.to(participantPlayer.socketId).emit("rtc:signal", {
          from: playerId,
          data,
        });
      }
    });
  });

  socket.on("rtc:leave", () => {
    if (!authed) return;
    const player = getPlayerBySocket(socket);
    if (!player) return;

    const roomId = getVoiceRoomIdForPlayer(player);
    if (!roomId) return;

    const playerId = player.id;

    const roomParticipants = rtcParticipants.get(roomId);
    if (roomParticipants) {
      roomParticipants.delete(playerId);

      if (roomParticipants.size === 0) {
        rtcParticipants.delete(roomId);
      }

      const remainingParticipants = Array.from(roomParticipants)
        .map((pid) => {
          const details = participantDetails.get(pid);
          return details
            ? {
                id: details.id,
                displayName: details.displayName,
                lobbyId: details.lobbyId,
                matchId: details.matchId,
                roomId: details.roomId,
                joinedAt: details.joinedAt,
              }
            : null;
        })
        .filter(Boolean);

      roomParticipants.forEach((pid) => {
        const participantPlayer = players.get(pid);
        if (participantPlayer && participantPlayer.socketId) {
          io.to(participantPlayer.socketId).emit("rtc:peer-left", {
            from: playerId,
            participants: remainingParticipants,
          });
        }
      });
    }

    participantDetails.delete(playerId);
  });

  // WebRTC connection failure reporting
  socket.on("rtc:connection-failed", (payload = {}) => {
    if (!authed) return;
    const player = getPlayerBySocket(socket);
    if (!player) return;

    const roomId = getVoiceRoomIdForPlayer(player);
    if (!roomId) return;

    const playerId = player.id;
    const reason = payload.reason || "unknown";
    const code = payload.code || "CONNECTION_ERROR";

    console.warn(
      `WebRTC connection failed for player ${playerId} in ${roomId}: ${reason} (${code})`
    );

    const roomParticipants = rtcParticipants.get(roomId);
    if (roomParticipants && roomParticipants.has(playerId)) {
      roomParticipants.forEach((pid) => {
        if (pid === playerId) return;
        const participantPlayer = players.get(pid);
        if (participantPlayer && participantPlayer.socketId) {
          io.to(participantPlayer.socketId).emit("rtc:peer-connection-failed", {
            from: playerId,
            reason,
            code,
            timestamp: Date.now(),
          });
        }
      });
    }

    socket.emit("rtc:connection-failed-ack", {
      playerId,
      matchId: player.matchId || null,
      roomId,
      timestamp: Date.now(),
    });
  });

  socket.on("rtc:request", (payload = {}) => {
    if (!authed) return;
    const player = getPlayerBySocket(socket);
    if (!player) return;

    const targetId =
      payload && typeof payload.targetId === "string" ? payload.targetId : null;
    const requestedLobbyId =
      payload && typeof payload.lobbyId === "string" ? payload.lobbyId : null;
    const requestedMatchId =
      payload && typeof payload.matchId === "string" ? payload.matchId : null;
    if (!targetId || targetId === player.id) {
      console.warn("[RTC][request] invalid target", {
        from: player.id,
        targetId,
        requestedLobbyId,
        requestedMatchId,
      });
      return;
    }

    const targetPlayer = players.get(targetId);
    if (!targetPlayer || !targetPlayer.socketId) {
      console.warn("[RTC][request] target not connected", {
        from: player.id,
        targetId,
      });
      return;
    }

    const shareLobby =
      player.lobbyId &&
      targetPlayer.lobbyId &&
      player.lobbyId === targetPlayer.lobbyId;
    const shareMatch =
      player.matchId &&
      targetPlayer.matchId &&
      player.matchId === targetPlayer.matchId;

    let lobbyId = null;
    if (requestedLobbyId) {
      const lobby = lobbies.get(requestedLobbyId);
      if (
        lobby &&
        lobby.playerIds.has(player.id) &&
        lobby.playerIds.has(targetId)
      ) {
        lobbyId = requestedLobbyId;
      }
    }
    if (!lobbyId && shareLobby) {
      lobbyId = player.lobbyId;
    }

    let matchId = null;
    if (requestedMatchId) {
      const match = matches.get(requestedMatchId);
      if (
        match &&
        Array.isArray(match.playerIds) &&
        match.playerIds.includes(player.id) &&
        match.playerIds.includes(targetId)
      ) {
        matchId = requestedMatchId;
      }
    }
    if (!matchId && shareMatch) {
      matchId = player.matchId;
    }

    if (!lobbyId && !matchId) {
      console.warn("[RTC][request] rejected - no shared scope", {
        from: player.id,
        targetId,
        requestedLobbyId,
        requestedMatchId,
        shareLobby,
        shareMatch,
      });
      return;
    }

    const requestId = rid("rtc_req");

    pendingVoiceRequests.set(requestId, {
      id: requestId,
      from: player.id,
      to: targetId,
      lobbyId,
      matchId,
      createdAt: Date.now(),
    });

    console.log("[RTC][request] forwarding request", {
      requestId,
      from: player.id,
      to: targetId,
      lobbyId,
      matchId,
    });

    io.to(targetPlayer.socketId).emit("rtc:request", {
      requestId,
      from: getPlayerInfo(player.id),
      lobbyId,
      matchId,
      timestamp: Date.now(),
    });

    socket.emit("rtc:request:sent", {
      requestId,
      targetId,
      lobbyId,
      matchId,
      timestamp: Date.now(),
    });
  });

  socket.on("rtc:request:respond", (payload = {}) => {
    if (!authed) return;
    const player = getPlayerBySocket(socket);
    if (!player) return;

    const requestId =
      payload && typeof payload.requestId === "string"
        ? payload.requestId
        : null;
    const requesterId =
      payload && typeof payload.requesterId === "string"
        ? payload.requesterId
        : null;
    const accepted =
      payload && typeof payload.accepted === "boolean"
        ? payload.accepted
        : false;

    if (!requestId || !requesterId) {
      console.warn("[RTC][request:respond] missing identifiers", {
        player: player.id,
        requestId,
        requesterId,
        accepted,
      });
      return;
    }

    const request = pendingVoiceRequests.get(requestId);
    if (!request) {
      console.warn("[RTC][request:respond] unknown request", {
        player: player.id,
        requestId,
        requesterId,
        accepted,
      });
      return;
    }
    if (request.to !== player.id || request.from !== requesterId) {
      console.warn("[RTC][request:respond] mismatched request ownership", {
        player: player.id,
        request,
        requesterId,
      });
      return;
    }

    const requesterPlayer = players.get(requesterId);
    if (!requesterPlayer || !requesterPlayer.socketId) {
      pendingVoiceRequests.delete(requestId);
      console.warn("[RTC][request:respond] requester offline", {
        requestId,
        requesterId,
      });
      return;
    }

    const sameLobby =
      request.lobbyId &&
      player.lobbyId === request.lobbyId &&
      requesterPlayer.lobbyId === request.lobbyId;
    const sameMatch =
      request.matchId &&
      player.matchId === request.matchId &&
      requesterPlayer.matchId === request.matchId;
    if (!sameLobby && !sameMatch) {
      pendingVoiceRequests.delete(requestId);
      return;
    }

    pendingVoiceRequests.delete(requestId);

    const responsePayload = {
      requestId,
      from: getPlayerInfo(player.id),
      lobbyId: request.lobbyId,
      matchId: request.matchId,
      accepted,
      timestamp: Date.now(),
    };

    console.log("[RTC][request:respond]", {
      requestId,
      requesterId,
      responder: player.id,
      accepted,
      lobbyId: request.lobbyId,
      matchId: request.matchId,
    });

    io.to(requesterPlayer.socketId).emit(
      accepted ? "rtc:request:accepted" : "rtc:request:declined",
      responsePayload
    );

    // Confirm to responder so UI can clear state
    socket.emit("rtc:request:ack", responsePayload);

    if (accepted) {
      // Also let responder's client handle unified acceptance flow
      socket.emit("rtc:request:accepted", responsePayload);
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

    // Idempotency: if this player already submitted, ignore duplicates
    if (match.playerDecks && match.playerDecks.has(player.id)) {
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
    match.playerDecks.set(player.id, cards);

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
    const allSubmitted = match.playerIds.every((pid) =>
      match.playerDecks.has(pid)
    );

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
      const allRecordings = await replay.listRecordings(prisma, { limit: 200 });

      // Filter out bot matches (those with CPU bots or host accounts)
      // Only admins should see bot matches (via admin endpoints)
      const recordings = allRecordings.filter((recording) => {
        if (!Array.isArray(recording.playerIds)) return true;
        // Exclude if any player is a bot (ID starts with 'cpu_' or 'host_')
        return !recording.playerIds.some((id) => {
          const pid = String(id || "");
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
        console.warn("[Recording] listRecordings failed:", e?.message || e);
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
        console.warn("[Recording] loadRecording failed:", e?.message || e);
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
    if (!match || !match.playerDecks) return;
    if (match.matchType !== "draft") return;

    // Idempotency: ignore duplicate submissions by the same player
    if (match.playerDecks.has(player.id)) return;

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
    match.playerDecks.set(player.id, cards);

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
    const allSubmitted = match.playerIds.every((pid) =>
      match.playerDecks.has(pid)
    );
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
        console.warn("[match] explicit finalize failed", err?.message || err);
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

    for (const [requestId, request] of Array.from(
      pendingVoiceRequests.entries()
    )) {
      if (request.from === pid || request.to === pid) {
        pendingVoiceRequests.delete(requestId);
        const otherId = request.from === pid ? request.to : request.from;
        const otherPlayer = players.get(otherId);
        if (otherPlayer && otherPlayer.socketId) {
          console.log("[RTC][request:cancelled] disconnect cleanup", {
            requestId,
            cancelledBy: pid,
            other: otherId,
          });
          io.to(otherPlayer.socketId).emit("rtc:request:cancelled", {
            requestId,
            cancelledBy: pid,
            lobbyId: request.lobbyId,
            matchId: request.matchId,
            timestamp: Date.now(),
          });
        }
      }
    }

    // Clean up WebRTC participant state on disconnect
    const participantInfo = participantDetails.get(pid);
    const roomId =
      participantInfo?.roomId ||
      (player ? getVoiceRoomIdForPlayer(player) : null);
    if (roomId) {
      const roomParticipants = rtcParticipants.get(roomId);
      if (roomParticipants && roomParticipants.has(pid)) {
        roomParticipants.delete(pid);

        if (roomParticipants.size === 0) {
          rtcParticipants.delete(roomId);
        }

        const remainingParticipants = Array.from(roomParticipants)
          .map((participantId) => {
            const details = participantDetails.get(participantId);
            return details
              ? {
                  id: details.id,
                  displayName: details.displayName,
                  lobbyId: details.lobbyId,
                  matchId: details.matchId,
                  roomId: details.roomId,
                  joinedAt: details.joinedAt,
                }
              : null;
          })
          .filter(Boolean);

        roomParticipants.forEach((participantId) => {
          const participantPlayer = players.get(participantId);
          if (participantPlayer && participantPlayer.socketId) {
            io.to(participantPlayer.socketId).emit("rtc:peer-left", {
              from: pid,
              participants: remainingParticipants,
            });
          }
        });
      }
    }

    participantDetails.delete(pid);

    if (player) {
      // If the player was in a lobby, remove them immediately to prevent ghost lobbies
      if (player.lobbyId && lobbies.has(player.lobbyId)) {
        const lobby = lobbies.get(player.lobbyId);
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
          const remaining = Array.from(lobby.playerIds);
          const humanNext =
            remaining.find((id) => !isCpuPlayerId(id)) || remaining[0];
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
      console.warn(`[db] cleanup failed:`, e?.message || e);
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
      console.error("[db] connection failed:", e?.message || e);
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
    await new Promise((resolve) => io.close(() => resolve()));
  } catch {}
  try {
    await new Promise((resolve) => server.close(() => resolve()));
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
