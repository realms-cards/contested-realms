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
  hydrateMatchFromDatabase: (
    matchId: string,
    match: Record<string, unknown>
  ) => Promise<void>;
  /** Start recording for a recovered match so actions can be tracked */
  startMatchRecording?: (match: Record<string, unknown>) => void;
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
  startMatchRecording,
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
    if (!playerDecks || !(playerDecks instanceof Map))
      return playerDecks || null;
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
      // Map "precon" to "constructed" for DB (GameFormat enum only has constructed/sealed/draft)
      matchType:
        match.matchType === "precon"
          ? "constructed"
          : match.matchType || "constructed",
      sealedConfig: match.sealedConfig || null,
      draftConfig: match.draftConfig || null,
      draftState: match.draftState || null,
      playerDecks: match.playerDecks
        ? toPlainPlayerDecks(match.playerDecks)
        : null,
      sealedPacks: match.sealedPacks || null,
      game: match.game || null,
      lastTs: BigInt(Number(match.lastTs || Date.now())),
    };
  }

  async function cacheSessionToRedis(
    sessionData: Record<string, unknown> & { id: string }
  ) {
    try {
      const client = storeRedis || pubClient;
      if (!client) return;
      const key = `match:session:${sessionData.id}`;
      await client.set(
        key,
        JSON.stringify(sessionData, (_k, v) =>
          typeof v === "bigint" ? Number(v) : v
        ),
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
    const buf: PersistBuffer = persistBuffers.get(matchId) ?? {
      latestData: null,
      actions: [],
      timer: null,
      lastFlushAt: 0,
    };
    buf.latestData = data;
    if (action) {
      buf.actions.push(action);
      // FIX: Instead of silently truncating old actions, trigger an immediate flush
      // when buffer gets too large. This prevents data loss.
      if (buf.actions.length > actionBatchSize * 2) {
        console.warn(
          `[persist] action buffer overflow for ${matchId}: ${buf.actions.length} actions, forcing immediate flush`
        );
        try {
          metricsInc("persist.buffer.overflow", 1);
        } catch {}
        // Clear any pending timer and flush immediately
        if (buf.timer) {
          try {
            clearTimeout(buf.timer);
          } catch {}
          buf.timer = null;
        }
        persistBuffers.set(matchId, buf);
        void flushPersistBuffer(matchId, "overflow");
        return;
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

  function schedulePersistFlush(
    matchId: string,
    dataOverride: Record<string, unknown> | null = null
  ) {
    if (!isWriteBehind) return;
    const buf: PersistBuffer = persistBuffers.get(matchId) ?? {
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
    // Take a snapshot of actions to persist, but DON'T remove them yet
    const actionsToFlush = buf.actions.slice(0, actionBatchSize);
    persistBuffers.set(matchId, buf);

    const t0 = Date.now();
    let actionsSuccess = false;
    let persistedActionCount = 0;

    try {
      try {
        metricsInc("persist.flush.attempt", 1);
      } catch {}

      await prisma.onlineMatchSession.upsert({
        where: { id: matchId },
        create: { id: matchId, ...data },
        update: data,
      });

      if (actionsToFlush.length > 0) {
        const rows = actionsToFlush.map((a) => ({
          matchId,
          playerId: a.playerId || "system",
          timestamp: BigInt(Number(a.timestamp || Date.now())),
          patch: a.patch,
        }));
        try {
          await prisma.onlineMatchAction.createMany({ data: rows });
          actionsSuccess = true;
          persistedActionCount = rows.length;
          try {
            metricsInc("persist.actions.createMany.ok", rows.length);
          } catch {}
        } catch (batchErr) {
          // createMany failed, try individual inserts
          console.warn(
            `[persist] createMany failed for ${matchId} (${reason}), trying individual inserts:`,
            safeErrorMessage(batchErr)
          );
          let individualSuccessCount = 0;
          for (const r of rows) {
            try {
              await prisma.onlineMatchAction.create({ data: r });
              individualSuccessCount++;
            } catch (individualErr) {
              console.error(
                `[persist] individual action create failed for ${matchId}:`,
                safeErrorMessage(individualErr)
              );
            }
          }
          persistedActionCount = individualSuccessCount;
          actionsSuccess = individualSuccessCount === rows.length;
          try {
            metricsInc(
              "persist.actions.createMany.fallback",
              individualSuccessCount
            );
            if (individualSuccessCount < rows.length) {
              metricsInc(
                "persist.actions.lost",
                rows.length - individualSuccessCount
              );
            }
          } catch {}
        }
      } else {
        actionsSuccess = true; // No actions to persist
      }

      // Only NOW remove successfully persisted actions from the buffer
      if (actionsSuccess && persistedActionCount > 0) {
        buf.actions.splice(0, persistedActionCount);
      } else if (!actionsSuccess && persistedActionCount > 0) {
        // Partial success - only remove the ones that succeeded
        buf.actions.splice(0, persistedActionCount);
        console.warn(
          `[persist] partial action flush for ${matchId}: ${persistedActionCount}/${actionsToFlush.length} actions persisted`
        );
      }

      try {
        metricsInc("persist.flush.success", 1);
        metricsObserveMs("persist.flush.ms", Date.now() - t0);
      } catch {}
    } catch (e) {
      // Session upsert failed - actions stay in buffer for retry
      console.error(
        `[persist] flush failed for ${matchId} (${reason}), ${actionsToFlush.length} actions will retry:`,
        safeErrorMessage(e)
      );
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
        console.warn(
          `[persist] create session failed for ${match.id}:`,
          safeErrorMessage(e)
        );
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
        console.warn(
          `[persist] update session failed for ${match.id}:`,
          safeErrorMessage(e)
        );
      } catch {}
    }
  }

  /**
   * Flush buffer with retry logic for critical match-end scenarios.
   * Uses exponential backoff to handle transient DB issues.
   */
  async function flushWithRetry(
    matchId: string,
    reason: string,
    maxRetries = 3
  ): Promise<boolean> {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        await flushPersistBuffer(matchId, reason);
        return true;
      } catch (err) {
        if (attempt === maxRetries - 1) {
          console.error(
            `[persist] flush failed after ${maxRetries} attempts for ${matchId}:`,
            safeErrorMessage(err)
          );
          return false;
        }
        // Exponential backoff: 100ms, 200ms, 400ms
        const delayMs = 100 * Math.pow(2, attempt);
        console.warn(
          `[persist] flush attempt ${
            attempt + 1
          } failed for ${matchId}, retrying in ${delayMs}ms:`,
          safeErrorMessage(err)
        );
        await new Promise((r) => setTimeout(r, delayMs));
      }
    }
    return false;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async function persistMatchEnded(match: Record<string, any>) {
    const matchId = match.id;
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
        const buf = persistBuffers.get(matchId);
        if (buf && !buf.latestData) {
          buf.latestData = matchToSessionUpsertData(match);
          persistBuffers.set(matchId, buf);
        } else if (!buf) {
          const newBuf: PersistBuffer = {
            latestData: matchToSessionUpsertData(match),
            actions: [],
            timer: null,
            lastFlushAt: 0,
          };
          persistBuffers.set(matchId, newBuf);
        }

        // FIX: Use retry logic for critical match-end flush
        const flushSuccess = await flushWithRetry(matchId, "match_end", 3);
        if (!flushSuccess) {
          // Log remaining actions that couldn't be persisted
          const remainingBuf = persistBuffers.get(matchId);
          if (remainingBuf && remainingBuf.actions.length > 0) {
            console.error(
              `[persist] CRITICAL: ${remainingBuf.actions.length} actions lost for match ${matchId} due to flush failure`
            );
            try {
              metricsInc("persist.actions.lost", remainingBuf.actions.length);
            } catch {}
          }
        }

        await prisma.onlineMatchSession.upsert({
          where: { id: matchId },
          create: {
            id: matchId,
            ...matchToSessionUpsertData(match),
            ...endData,
          },
          update: endData,
        });

        // FIX: Clean up buffer after match end to prevent memory leaks
        const finalBuf = persistBuffers.get(matchId);
        if (finalBuf) {
          if (finalBuf.timer) {
            try {
              clearTimeout(finalBuf.timer);
            } catch {}
          }
          persistBuffers.delete(matchId);
          try {
            metricsInc("persist.buffer.cleanup", 1);
          } catch {}
        }
      } else {
        await prisma.onlineMatchSession.upsert({
          where: { id: matchId },
          create: {
            id: matchId,
            ...matchToSessionUpsertData(match),
            ...endData,
          },
          update: endData,
        });
      }
    } catch (e) {
      try {
        console.warn(
          `[persist] end session failed for ${matchId}:`,
          safeErrorMessage(e)
        );
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
        playerDecks: row.playerDecks
          ? new Map(Object.entries(row.playerDecks))
          : null,
        sealedPacks: row.sealedPacks || null,
        draftState: row.draftState || null,
        game: row.game || {},
        lastTs: Number(row.lastTs || 0) || 0,
      };
      return m;
    } catch (e) {
      try {
        console.warn(
          `[persist] rehydrate failed for ${
            row && row.id ? row.id : "unknown"
          }:`,
          safeErrorMessage(e)
        );
      } catch {}
      return null;
    }
  }

  async function recoverActiveMatches() {
    try {
      const rows = await prisma.onlineMatchSession.findMany({
        where: {
          status: { in: ["waiting", "deck_construction", "in_progress"] },
        },
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
          // Start recording for recovered match so subsequent actions can be tracked
          try {
            if (startMatchRecording) startMatchRecording(m);
          } catch {}
          count++;
        }
      }
      try {
        console.log(`[persist] recovered ${count} active match(es) from DB`);
      } catch {}
    } catch (e) {
      try {
        console.warn(
          `[persist] recover active matches failed:`,
          safeErrorMessage(e)
        );
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
        // Start recording for recovered match so subsequent actions can be tracked
        try {
          if (startMatchRecording) startMatchRecording(m);
        } catch {}
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
    let totalFlushed = 0;
    let totalFailed = 0;
    for (const matchId of ids) {
      try {
        const buf = persistBuffers.get(matchId);
        const actionsBefore = buf?.actions.length ?? 0;
        await flushPersistBuffer(matchId, reason);
        const bufAfter = persistBuffers.get(matchId);
        const actionsAfter = bufAfter?.actions.length ?? 0;
        totalFlushed += actionsBefore - actionsAfter;
      } catch (err) {
        totalFailed++;
        console.error(
          `[persist] flushAll failed for ${matchId}:`,
          safeErrorMessage(err)
        );
      }
    }
    if (reason === "shutdown") {
      console.log(
        `[persist] shutdown flush complete: ${totalFlushed} actions flushed, ${totalFailed} matches failed`
      );
    }
  }

  const getBufferStats = () => ({
    bufferedActions: getBufferedActionsCount(),
    bufferCount: persistBuffers.size,
  });

  /**
   * Truncate persisted actions after a given timestamp for a match.
   * Called when a snapshot is restored to invalidate the undone timeline.
   * Also truncates any buffered (not yet persisted) actions.
   * Returns the total number of actions removed.
   */
  async function truncateActionsAfter(
    matchId: string,
    afterTimestamp: number
  ): Promise<number> {
    let totalRemoved = 0;

    // 1. Truncate buffered actions (not yet persisted)
    const buf = persistBuffers.get(matchId);
    if (buf && Array.isArray(buf.actions)) {
      const originalLength = buf.actions.length;
      buf.actions = buf.actions.filter(
        (action) => Number(action.timestamp || 0) <= afterTimestamp
      );
      const bufferedRemoved = originalLength - buf.actions.length;
      totalRemoved += bufferedRemoved;
      if (bufferedRemoved > 0) {
        try {
          console.log(
            `[persist] Truncated ${bufferedRemoved} buffered actions after timestamp ${afterTimestamp} for match ${matchId}`
          );
        } catch {}
      }
    }

    // 2. Delete persisted actions from database
    try {
      const deleteResult = await prisma.onlineMatchAction.deleteMany({
        where: {
          matchId,
          timestamp: { gt: BigInt(afterTimestamp) },
        },
      });
      const dbRemoved = deleteResult.count;
      totalRemoved += dbRemoved;
      if (dbRemoved > 0) {
        try {
          console.log(
            `[persist] Deleted ${dbRemoved} persisted actions after timestamp ${afterTimestamp} for match ${matchId}`
          );
          metricsInc("persist.actions.truncated", dbRemoved);
        } catch {}
      }
    } catch (err) {
      console.error(
        `[persist] Failed to truncate persisted actions for ${matchId}:`,
        safeErrorMessage(err)
      );
    }

    return totalRemoved;
  }

  return {
    persistMatchCreated,
    persistMatchUpdate,
    persistMatchEnded,
    recoverActiveMatches,
    findActiveMatchForPlayer,
    rehydrateMatch,
    getBufferStats,
    flushAll,
    truncateActionsAfter,
  };
};

export const createPersistenceLayer = createPersistenceLayerInternal;
