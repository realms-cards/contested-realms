type MetricsCounterFn = (name: string, delta?: number) => void;
type MetricsTimerFn = (name: string, durationMs: number) => void;

interface PersistenceConfig {
  isWriteBehind: boolean;
  flushIntervalMs: number;
  actionBatchSize: number;
  maxWaitMs: number;
  timeoutMs: number;
  redisSessionTtlSec: number;
}

interface PersistedAction {
  playerId: string;
  timestamp: number;
  patch: unknown;
}

interface PersistBuffer {
  latestData: Record<string, unknown> | null;
  actions: PersistedAction[];
  timer: NodeJS.Timeout | null;
  lastFlushAt: number;
}

interface PersistenceDeps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  prisma: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  storeRedis?: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  pubClient?: any;
  metricsInc: MetricsCounterFn;
  metricsObserveMs: MetricsTimerFn;
  matches: Map<string, Record<string, unknown>>;
  hydrateMatchFromDatabase: (matchId: string, match: Record<string, unknown>) => Promise<void>;
  config: PersistenceConfig;
}

const createPersistenceLayerInternal = ({
  prisma,
  storeRedis,
  pubClient,
  metricsInc,
  metricsObserveMs,
  matches,
  hydrateMatchFromDatabase,
  config,
}: PersistenceDeps) => {
  const {
    isWriteBehind,
    flushIntervalMs,
    actionBatchSize,
    maxWaitMs,
    timeoutMs,
    redisSessionTtlSec,
  } = config;

  const safeErrorMessage = (err: unknown): unknown => {
    if (err && typeof err === "object" && "message" in err) {
      const msg = (err as { message?: unknown }).message;
      if (typeof msg === "string") {
        return msg;
      }
    }
    return err;
  };

  /**
   * matchId -> {
   *   latestData,
   *   actions: Array<{ playerId: string, timestamp: number, patch: any }>,
   *   timer?: NodeJS.Timeout|null,
   *   lastFlushAt?: number
   * }
   */
  const persistBuffers: Map<string, PersistBuffer> = new Map();

  function toPlainPlayerDecks(playerDecks: unknown) {
    if (!playerDecks || !(playerDecks instanceof Map)) return playerDecks || null;
    return Object.fromEntries(playerDecks);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function matchToSessionUpsertData(match: Record<string, any>) {
    return {
      lobbyId: match.lobbyId || null,
      lobbyName: match.lobbyName || null,
      playerIds: Array.isArray(match.playerIds) ? match.playerIds : [],
      status: match.status,
      seed: match.seed,
      turn: match.turn || null,
      winnerId: match.winnerId || null,
      matchType: match.matchType || "constructed",
      sealedConfig: match.sealedConfig || null,
      draftConfig: match.draftConfig || null,
      draftState: match.draftState || null,
      playerDecks: match.playerDecks ? toPlainPlayerDecks(match.playerDecks) : null,
      sealedPacks: match.sealedPacks || null,
      game: match.game || null,
      lastTs: BigInt(Number(match.lastTs || Date.now())),
    };
  }

  async function cacheSessionToRedis(sessionData: Record<string, unknown> & { id: string }) {
    try {
      const client = storeRedis || pubClient;
      if (!client) return;
      const key = `match:session:${sessionData.id}`;
      await client.set(
        key,
        JSON.stringify(sessionData, (_k, v) => (typeof v === "bigint" ? Number(v) : v)),
        "EX",
        redisSessionTtlSec
      );
      try {
        metricsInc("persist.redis.cache.set", 1);
      } catch {}
    } catch {}
  }

  function bufferPersistUpdate(
    matchId: string,
    data: Record<string, unknown>,
    action: PersistedAction | null
  ) {
    if (!isWriteBehind) return;
    const buf: PersistBuffer =
      persistBuffers.get(matchId) ?? {
        latestData: null,
        actions: [],
        timer: null,
        lastFlushAt: 0,
      };
    buf.latestData = data;
    if (action) {
      buf.actions.push(action);
      if (buf.actions.length > actionBatchSize * 2) {
        buf.actions = buf.actions.slice(-actionBatchSize * 2);
      }
      try {
        metricsInc("persist.buffer.action", 1);
      } catch {}
    }
    try {
      metricsInc("persist.buffer.update", 1);
    } catch {}
    persistBuffers.set(matchId, buf);
    schedulePersistFlush(matchId);
  }

  function schedulePersistFlush(matchId: string, dataOverride: Record<string, unknown> | null = null) {
    if (!isWriteBehind) return;
    const buf: PersistBuffer =
      persistBuffers.get(matchId) ?? {
        latestData: null,
        actions: [],
        timer: null,
        lastFlushAt: 0,
      };
    if (dataOverride) buf.latestData = dataOverride;
    if (buf.timer) return;
    buf.timer = setTimeout(() => {
      void flushPersistBuffer(matchId, "timer");
    }, flushIntervalMs);
    persistBuffers.set(matchId, buf);
    try {
      metricsInc("persist.flush.scheduled", 1);
    } catch {}
  }

  async function flushPersistBuffer(matchId: string, reason = "manual") {
    const buf = persistBuffers.get(matchId);
    if (!buf || !buf.latestData) return;
    if (buf.timer) {
      try {
        clearTimeout(buf.timer);
      } catch {}
      buf.timer = null;
    }
    const data = buf.latestData;
    const actions = buf.actions.splice(0, actionBatchSize);
    persistBuffers.set(matchId, buf);
    try {
      const t0 = Date.now();
      try {
        metricsInc("persist.flush.attempt", 1);
      } catch {}
      await prisma.onlineMatchSession.upsert({
        where: { id: matchId },
        create: { id: matchId, ...data },
        update: data,
      });

      if (actions.length > 0) {
        const rows = actions.map((a) => ({
          matchId,
          playerId: a.playerId || "system",
          timestamp: BigInt(Number(a.timestamp || Date.now())),
          patch: a.patch,
        }));
        try {
          await prisma.onlineMatchAction.createMany({ data: rows });
          try {
            metricsInc("persist.actions.createMany.ok", rows.length);
          } catch {}
        } catch (e) {
          for (const r of rows) {
            try {
              await prisma.onlineMatchAction.create({ data: r });
            } catch {}
          }
          try {
            metricsInc("persist.actions.createMany.fallback", rows.length);
          } catch {}
        }
      }
      try {
        metricsInc("persist.flush.success", 1);
        metricsObserveMs("persist.flush.ms", Date.now() - t0);
      } catch {}
    } catch (e) {
      try {
        console.warn(`[persist] flush failed for ${matchId} (${reason}):`, safeErrorMessage(e));
      } catch {}
      try {
        metricsInc("persist.flush.failure", 1);
      } catch {}
    } finally {
      buf.lastFlushAt = Date.now();
      if (buf.actions.length > 0) {
        schedulePersistFlush(matchId);
      }
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async function persistMatchCreated(match: Record<string, any>) {
    try {
      const data = matchToSessionUpsertData(match);
      await cacheSessionToRedis({ ...data, id: match.id });
      try {
        metricsInc("persist.created", 1);
      } catch {}
      if (isWriteBehind) {
        try {
          schedulePersistFlush(match.id, data);
        } catch {}
      } else {
        const createData = { id: match.id, ...data };
        const updateData = { ...data };
        await prisma.onlineMatchSession.upsert({
          where: { id: match.id },
          update: updateData,
          create: createData,
        });
      }
    } catch (e) {
      try {
        console.warn(`[persist] create session failed for ${match.id}:`, safeErrorMessage(e));
      } catch {}
    }
  }

  async function persistMatchUpdate(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    match: Record<string, any>,
    patch: Record<string, unknown> | null,
    playerId: string | null,
    ts: number
  ) {
    try {
      const data = matchToSessionUpsertData(match);
      await cacheSessionToRedis({ ...data, id: match.id });
      try {
        metricsInc("persist.update", 1);
        if (patch) metricsInc("persist.update.withPatch", 1);
      } catch {}

      const isTournament = Boolean(match.tournamentId);
      const forceImmediate = isTournament;

      if (isWriteBehind && !forceImmediate) {
        bufferPersistUpdate(
          match.id,
          data,
          patch
            ? {
                playerId: playerId || "system",
                timestamp: Number(ts || Date.now()),
                patch,
              }
            : null
        );
      } else {
        await prisma.$transaction(
          [
            prisma.onlineMatchSession.upsert({
              where: { id: match.id },
              create: { id: match.id, ...data },
              update: data,
            }),
            ...(patch
              ? [
                  prisma.onlineMatchAction.create({
                    data: {
                      matchId: match.id,
                      playerId: playerId || "system",
                      timestamp: BigInt(Number(ts || Date.now())),
                      patch,
                    },
                  }),
                ]
              : []),
          ],
          { maxWait: maxWaitMs, timeout: timeoutMs }
        );
      }
    } catch (e) {
      try {
        console.warn(`[persist] update session failed for ${match.id}:`, safeErrorMessage(e));
      } catch {}
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async function persistMatchEnded(match: Record<string, any>) {
    try {
      const endData = {
        status: "ended",
        winnerId: match.winnerId || null,
        lastTs: BigInt(Number(match.lastTs || Date.now())),
      };
      try {
        metricsInc("persist.ended", 1);
      } catch {}
      if (isWriteBehind) {
        try {
          await flushPersistBuffer(match.id, "match_end");
        } catch {}
        await prisma.onlineMatchSession.upsert({
          where: { id: match.id },
          create: { id: match.id, ...matchToSessionUpsertData(match), ...endData },
          update: endData,
        });
      } else {
        await prisma.onlineMatchSession.upsert({
          where: { id: match.id },
          create: { id: match.id, ...matchToSessionUpsertData(match), ...endData },
          update: endData,
        });
      }
    } catch (e) {
      try {
        console.warn(`[persist] end session failed for ${match.id}:`, safeErrorMessage(e));
      } catch {}
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function rehydrateMatch(row: Record<string, any>) {
    try {
      const m = {
        id: row.id,
        lobbyId: row.lobbyId || null,
        lobbyName: row.lobbyName || null,
        playerIds: Array.isArray(row.playerIds) ? row.playerIds : [],
        status: row.status,
        seed: row.seed,
        turn: row.turn || null,
        winnerId: row.winnerId || null,
        matchType: row.matchType || "constructed",
        sealedConfig: row.sealedConfig || null,
        draftConfig: row.draftConfig || null,
        playerDecks: row.playerDecks ? new Map(Object.entries(row.playerDecks)) : null,
        sealedPacks: row.sealedPacks || null,
        draftState: row.draftState || null,
        game: row.game || {},
        lastTs: Number(row.lastTs || 0) || 0,
      };
      return m;
    } catch (e) {
      try {
        console.warn(
          `[persist] rehydrate failed for ${row && row.id ? row.id : "unknown"}:`,
          safeErrorMessage(e)
        );
      } catch {}
      return null;
    }
  }

  async function recoverActiveMatches() {
    try {
      const rows = await prisma.onlineMatchSession.findMany({
        where: { status: { in: ["waiting", "deck_construction", "in_progress"] } },
        orderBy: { updatedAt: "desc" },
        take: 50,
      });
      let count = 0;
      for (const r of rows) {
        if (matches.has(r.id)) continue;
        const m = rehydrateMatch(r);
        if (m) {
          try {
            await hydrateMatchFromDatabase(m.id, m);
          } catch {}
          matches.set(m.id, m);
          count++;
        }
      }
      try {
        console.log(`[persist] recovered ${count} active match(es) from DB`);
      } catch {}
    } catch (e) {
      try {
        console.warn(`[persist] recover active matches failed:`, safeErrorMessage(e));
      } catch {}
    }
  }

  async function findActiveMatchForPlayer(playerId: string) {
    try {
      const r = await prisma.onlineMatchSession.findFirst({
        where: {
          status: { in: ["waiting", "deck_construction", "in_progress"] },
          playerIds: { has: playerId },
        },
        orderBy: { updatedAt: "desc" },
      });
      if (!r) return null;
      if (matches.has(r.id)) return matches.get(r.id);
      const m = rehydrateMatch(r);
      if (m) {
        try {
          await hydrateMatchFromDatabase(m.id, m);
        } catch {}
        matches.set(m.id, m);
      }
      return m;
    } catch {
      return null;
    }
  }

  function getBufferedActionsCount(): number {
    try {
      let total = 0;
      for (const buf of persistBuffers.values()) {
        if (buf && Array.isArray(buf.actions)) total += buf.actions.length;
      }
      return total;
    } catch {
      return 0;
    }
  }

  async function flushAll(reason = "manual") {
    if (!isWriteBehind || persistBuffers.size === 0) return;
    const ids = Array.from(persistBuffers.keys());
    for (const matchId of ids) {
      try {
        await flushPersistBuffer(matchId, reason);
      } catch {}
    }
  }

  const getBufferStats = () => ({
    bufferedActions: getBufferedActionsCount(),
    bufferCount: persistBuffers.size,
  });

  return {
    persistMatchCreated,
    persistMatchUpdate,
    persistMatchEnded,
    recoverActiveMatches,
    findActiveMatchForPlayer,
    rehydrateMatch,
    getBufferStats,
    flushAll,
  };
};

module.exports = { createPersistenceLayer: createPersistenceLayerInternal };
