"use strict";

/**
 * Build recording summaries from finished MatchResult rows and fallback OnlineMatchSession rows.
 * Returns: Array<{ matchId, playerNames, startTime, endTime?, duration?, actionCount, matchType, playerIds }>
 */
async function listRecordings(prisma, opts = {}) {
  const limit = Number(opts.limit) || 200;

  // Finished matches first (prefer authoritative summary)
  const results = await prisma.matchResult.findMany({
    orderBy: { completedAt: "desc" },
    take: limit,
  });
  const finishedIds = results.map((r) => r.matchId);

  // Fetch sessions for these matchIds (for createdAt/matchType fallback)
  const sessionsForResults = finishedIds.length
    ? await prisma.onlineMatchSession.findMany({
        where: { id: { in: finishedIds } },
      })
    : [];
  const sessionById = new Map(sessionsForResults.map((s) => [s.id, s]));

  // Count actions per finished match with a single groupBy
  let finishedCountsById = new Map();
  if (finishedIds.length) {
    const grouped = await prisma.onlineMatchAction.groupBy({
      by: ["matchId"],
      where: { matchId: { in: finishedIds } },
      _count: { _all: true },
    });
    finishedCountsById = new Map(
      grouped.map((g) => [g.matchId, g._count._all])
    );
  }

  const finishedSummaries = results.map((mr, i) => {
    const session = sessionById.get(mr.matchId);
    const playerNames = Array.isArray(mr.players)
      ? mr.players.map((p) =>
          p && typeof p === "object" ? p.displayName || p.id : "Player"
        )
      : [];
    const playerIds = Array.isArray(mr.players)
      ? mr.players
          .map((p) => (p && typeof p === "object" ? p.id : null))
          .filter(Boolean)
      : Array.isArray(session?.playerIds)
      ? session.playerIds
      : [];
    const endTime = mr.completedAt
      ? new Date(mr.completedAt).getTime()
      : undefined;
    let startTime;
    if (mr.completedAt && mr.duration != null) {
      startTime = endTime - Number(mr.duration) * 1000;
    } else if (session && session.createdAt) {
      startTime = new Date(session.createdAt).getTime();
    } else {
      startTime = endTime || Date.now();
    }
    const matchType = mr.format || session?.matchType || "constructed";
    return {
      matchId: mr.matchId,
      playerNames,
      startTime,
      endTime,
      duration: endTime && startTime ? endTime - startTime : undefined,
      actionCount: Number(finishedCountsById.get(mr.matchId) || 0),
      matchType,
      playerIds,
    };
  });

  // Fallback: sessions that are in progress or ended, without a MatchResult row
  const fallbackSessions = await prisma.onlineMatchSession.findMany({
    where: {
      status: { in: ["in_progress", "ended"] },
      id: { notIn: finishedIds },
    },
    orderBy: { updatedAt: "desc" },
    take: limit,
  });

  // Resolve display names for fallback sessions in a single query
  const allIds = Array.from(
    new Set(
      fallbackSessions.flatMap((s) =>
        Array.isArray(s.playerIds) ? s.playerIds : []
      )
    )
  );
  const users = allIds.length
    ? await prisma.user.findMany({
        where: { id: { in: allIds } },
        select: { id: true, name: true },
      })
    : [];
  const nameById = new Map(users.map((u) => [u.id, u.name || u.id]));

  let fallbackCountsById = new Map();
  if (fallbackSessions.length) {
    const ids = fallbackSessions.map((s) => s.id);
    const grouped = await prisma.onlineMatchAction.groupBy({
      by: ["matchId"],
      where: { matchId: { in: ids } },
      _count: { _all: true },
    });
    fallbackCountsById = new Map(
      grouped.map((g) => [g.matchId, g._count._all])
    );
  }

  const fallbackSummaries = fallbackSessions.map((s, i) => {
    const playerIds = Array.isArray(s.playerIds) ? s.playerIds : [];
    const playerNames = playerIds.map((pid) => nameById.get(pid) || pid);
    const endTime = s.updatedAt ? new Date(s.updatedAt).getTime() : undefined;
    const startTime = s.createdAt
      ? new Date(s.createdAt).getTime()
      : endTime || Date.now();
    const matchType = s.matchType || "constructed";
    return {
      matchId: s.id,
      playerNames,
      startTime,
      endTime,
      duration: endTime && startTime ? endTime - startTime : undefined,
      actionCount: Number(fallbackCountsById.get(s.id) || 0),
      matchType,
      playerIds,
    };
  });

  const combined = [...finishedSummaries, ...fallbackSummaries];

  // Filter out recordings with no actions (no replay data to show)
  const withActions = combined.filter((r) => r.actionCount > 0);

  withActions.sort((a, b) => {
    const at = a.endTime || a.startTime || 0;
    const bt = b.endTime || b.startTime || 0;
    return bt - at;
  });

  return withActions;
}

/**
 * Load a full recording for a matchId from DB.
 * Returns: { matchId, playerNames, startTime, endTime?, initialState: { playerIds, seed, matchType, playerDecks? }, actions: [{patch,timestamp,playerId}] }
 * Applies a cut to start from the first setup roll/winner patch when available.
 */
async function loadRecording(prisma, matchId) {
  const session = await prisma.onlineMatchSession.findUnique({
    where: { id: matchId },
  });
  const actionsRows = await prisma.onlineMatchAction.findMany({
    where: { matchId },
    orderBy: { timestamp: "asc" },
  });

  const actions = actionsRows.map((a) => ({
    patch: a.patch,
    timestamp: Number(a.timestamp || 0),
    playerId: a.playerId || "system",
  }));

  const initialState = {
    playerIds: Array.isArray(session?.playerIds) ? session.playerIds : [],
    seed: session?.seed || "",
    matchType: session?.matchType || "constructed",
    playerDecks: session?.playerDecks || null,
  };

  // Prefer player names from MatchResult, fallback to User names
  const mr = await prisma.matchResult.findFirst({ where: { matchId } });
  let playerNames = [];
  if (mr && Array.isArray(mr.players)) {
    playerNames = mr.players.map((p) =>
      p && typeof p === "object" ? p.displayName || p.id : "Player"
    );
    if (!initialState.playerIds || initialState.playerIds.length === 0) {
      const ids = mr.players
        .map((p) => (p && typeof p === "object" ? p.id : null))
        .filter(Boolean);
      initialState.playerIds = ids;
    }
  } else if (initialState.playerIds && initialState.playerIds.length > 0) {
    const users = await prisma.user.findMany({
      where: { id: { in: initialState.playerIds } },
      select: { id: true, name: true },
    });
    const nameById = new Map(users.map((u) => [u.id, u.name || u.id]));
    playerNames = initialState.playerIds.map((pid) => nameById.get(pid) || pid);
  }

  const endTime = mr?.completedAt
    ? new Date(mr.completedAt).getTime()
    : session?.updatedAt
    ? new Date(session.updatedAt).getTime()
    : undefined;
  let startTime;
  if (mr?.completedAt && mr.duration != null) {
    startTime = endTime - Number(mr.duration) * 1000;
  } else if (session?.createdAt) {
    startTime = new Date(session.createdAt).getTime();
  } else if (actions.length > 0) {
    startTime = actions[0].timestamp;
  } else {
    startTime = Date.now();
  }

  // Cut beginning: start at the first setup d20 resolution or setupWinner patch
  const cutIdx = findSetupStartIndex(actions);
  if (cutIdx > 0 && cutIdx < actions.length) {
    const t0 = actions[cutIdx].timestamp;
    actions.splice(0, cutIdx);
    startTime = t0;
  }

  return {
    matchId,
    playerNames,
    startTime,
    endTime,
    initialState,
    actions,
  };
}

function findSetupStartIndex(actions) {
  for (let i = 0; i < actions.length; i++) {
    const p = actions[i] && actions[i].patch ? actions[i].patch : null;
    if (!p || typeof p !== "object") continue;
    if (p.setupWinner === "p1" || p.setupWinner === "p2") return i;
    const dr = p.d20Rolls;
    if (
      dr &&
      ((dr.p1 !== null && dr.p1 !== undefined) ||
        (dr.p2 !== null && dr.p2 !== undefined))
    ) {
      return i;
    }
  }
  return -1;
}

module.exports = { listRecordings, loadRecording };

// ---------------- Retention policy (optional enhancement) -----------------

function setupReplayRetentionPruner(prisma, options = {}) {
  const days = Number(process.env.REPLAY_RETENTION_DAYS || options.days || 14);
  if (!Number.isFinite(days) || days <= 0) return;
  const intervalMs = 24 * 60 * 60 * 1000; // daily

  async function pruneOnce() {
    try {
      const thresholdDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
      // Find completed matches older than threshold
      const oldResults = await prisma.matchResult.findMany({
        where: { completedAt: { lt: thresholdDate } },
        select: { matchId: true },
      });
      const ids = oldResults.map((r) => r.matchId);
      if (!ids.length) return;

      // Delete actions for those matchIds
      await prisma.onlineMatchAction.deleteMany({
        where: { matchId: { in: ids } },
      });
      // Optionally delete session rows that are stale
      await prisma.onlineMatchSession.deleteMany({
        where: { id: { in: ids }, updatedAt: { lt: thresholdDate } },
      });
    } catch (e) {
      try {
        console.warn("[replay] retention prune failed:", e?.message || e);
      } catch {}
    }
  }

  // Initial delayed run to avoid startup thundering herd
  setTimeout(pruneOnce, 10_000);
  // Schedule daily
  setInterval(pruneOnce, intervalMs).unref?.();
}

module.exports.setupReplayRetentionPruner = setupReplayRetentionPruner;
