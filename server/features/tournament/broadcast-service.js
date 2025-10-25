"use strict";

// Shared tournament broadcast helpers used by socket feature & HTTP bridge
// (migrated from server/modules/tournament/broadcast.js)

let prismaClient = null;

function setPrismaClient(prisma) {
  prismaClient = prisma;
  try {
    console.log("[Broadcast] Audit logging enabled");
  } catch {}
}

const recentEvents = new Map();

function cleanupRecentEvents() {
  const now = Date.now();
  for (const [eventId, timestamp] of recentEvents.entries()) {
    if (timestamp < now - 5000) {
      recentEvents.delete(eventId);
    }
  }
}

setInterval(cleanupRecentEvents, 10000).unref?.();

// Convert arbitrary data into a JSON-serializable structure, removing
// circular references and dropping non-serializable/socket fields.
function toJsonSafe(value, maxDepth = 6) {
  const seen = new WeakSet();
  function helper(v, depth) {
    if (v === null || v === undefined) return v;
    const t = typeof v;
    if (t === "string" || t === "number" || t === "boolean") return v;
    if (t === "bigint") return String(v);
    if (t === "function") return undefined;
    if (t !== "object") return undefined;
    if (seen.has(v)) return "[Circular]";
    if (depth <= 0) return "[Truncated]";
    seen.add(v);
    // Drop obvious Socket.IO / server references
    if (v && (v.server || v.sockets || v.adapter || v.nsp)) return "[Socket]";
    // Handle Arrays
    if (Array.isArray(v)) return v.map((x) => helper(x, depth - 1));
    // Handle Map/Set
    if (v instanceof Map) return Array.from(v.entries()).map(([k, val]) => [k, helper(val, depth - 1)]);
    if (v instanceof Set) return Array.from(v.values()).map((x) => helper(x, depth - 1));
    // Handle Date
    if (v instanceof Date) return v.toISOString();
    // Plain objects
    const out = {};
    for (const [k, val] of Object.entries(v)) {
      if (k === "io" || k === "socket" || k === "server" || k === "sockets" || k === "adapter" || k === "nsp") continue;
      const res = helper(val, depth - 1);
      if (res !== undefined) out[k] = res;
    }
    return out;
  }
  try {
    return helper(value, maxDepth);
  } catch {
    try {
      return JSON.parse(JSON.stringify(value));
    } catch {
      return {};
    }
  }
}

function shouldEmit(tournamentId, eventType, payload) {
  const eventId = `${tournamentId}:${eventType}:${JSON.stringify(payload)}`;
  const now = Date.now();
  const lastEmitted = recentEvents.get(eventId);
  if (lastEmitted && now - lastEmitted < 5000) {
    try {
      console.warn("[Broadcast] Duplicate event prevented:", eventId);
    } catch {}
    return false;
  }
  recentEvents.set(eventId, now);
  return true;
}

async function logBroadcastEvent(tournamentId, eventType, payload, roomTarget) {
  if (!prismaClient) return;
  try {
    await prismaClient.tournamentBroadcastEvent.create({
      data: {
        tournamentId,
        eventType,
        payload: toJsonSafe(payload),
        timestamp: new Date(),
        emittedBy: process.env.SERVER_ID || "socket-server",
        roomTarget,
      },
    });
  } catch (err) {
    try {
      console.warn("[Broadcast] Failed to log audit event:", err?.message || err);
    } catch {}
  }
}

function emitPhaseChanged(io, tournamentId, newPhase, additionalData = {}) {
  const raw = {
    tournamentId,
    newPhase,
    newStatus: newPhase,
    timestamp: new Date().toISOString(),
    ...additionalData,
  };
  const payload = toJsonSafe(raw);
  if (!shouldEmit(tournamentId, "PHASE_CHANGED", payload)) return;
  const room = `tournament:${tournamentId}`;
  try {
    io.to(room).emit("PHASE_CHANGED", payload);
  } catch (e) {
    try { console.warn("[Broadcast] Socket emit failed (PHASE_CHANGED):", e?.message || e); } catch {}
  }
  try {
    console.log("[Broadcast] PHASE_CHANGED to room:", room, "phase:", newPhase);
  } catch {}
  logBroadcastEvent(tournamentId, "PHASE_CHANGED", payload, room).catch(() => {});
}

function emitTournamentUpdate(io, tournamentId, data) {
  const room = `tournament:${tournamentId}`;
  const payload = toJsonSafe(data);
  try {
    io.to(room).emit("TOURNAMENT_UPDATED", payload);
  } catch (e) {
    try { console.warn("[Broadcast] Socket emit failed (TOURNAMENT_UPDATED):", e?.message || e); } catch {}
  }
  try {
    console.log("[Broadcast] TOURNAMENT_UPDATED to room:", room);
  } catch {}
}

function emitRoundStarted(io, tournamentId, roundNumber, matches) {
  const room = `tournament:${tournamentId}`;
  const payload = toJsonSafe({ tournamentId, roundNumber, matches });
  try {
    io.to(room).emit("ROUND_STARTED", payload);
  } catch (e) {
    try { console.warn("[Broadcast] Socket emit failed (ROUND_STARTED):", e?.message || e); } catch {}
  }
  try {
    console.log("[Broadcast] ROUND_STARTED to room:", room, "round:", roundNumber);
  } catch {}
}

function emitMatchesReady(io, tournamentId, matches) {
  const room = `tournament:${tournamentId}`;
  const payload = toJsonSafe({ tournamentId, matches });
  try {
    io.to(room).emit("MATCHES_READY", payload);
  } catch (e) {
    try { console.warn("[Broadcast] Socket emit failed (MATCHES_READY):", e?.message || e); } catch {}
  }
  try {
    console.log("[Broadcast] MATCHES_READY to room:", room);
  } catch {}
}

function emitDraftReady(io, tournamentId, payload) {
  const message = toJsonSafe({ tournamentId, ...payload });
  const room = `tournament:${tournamentId}`;
  try {
    io.to(room).emit("DRAFT_READY", message);
  } catch (e) {
    try { console.warn("[Broadcast] Socket emit failed (DRAFT_READY):", e?.message || e); } catch {}
  }
  try {
    console.log("[Broadcast] DRAFT_READY to room:", room);
  } catch {}
}

function emitPlayerJoined(io, tournamentId, playerId, playerName, currentPlayerCount) {
  const payload = toJsonSafe({ tournamentId, playerId, playerName, currentPlayerCount });
  const room = `tournament:${tournamentId}`;
  try {
    io.to(room).emit("PLAYER_JOINED", payload);
  } catch (e) {
    try { console.warn("[Broadcast] Socket emit failed (PLAYER_JOINED):", e?.message || e); } catch {}
  }
  try {
    console.log("[Broadcast] PLAYER_JOINED to room:", room);
  } catch {}
}

function emitPlayerLeft(io, tournamentId, playerId, playerName, currentPlayerCount) {
  const payload = toJsonSafe({ tournamentId, playerId, playerName, currentPlayerCount });
  const room = `tournament:${tournamentId}`;
  try {
    io.to(room).emit("PLAYER_LEFT", payload);
  } catch (e) {
    try { console.warn("[Broadcast] Socket emit failed (PLAYER_LEFT):", e?.message || e); } catch {}
  }
  try {
    console.log("[Broadcast] PLAYER_LEFT to room:", room);
  } catch {}
}

function emitPreparationUpdate(
  io,
  tournamentId,
  playerId,
  preparationStatus,
  readyPlayerCount,
  totalPlayerCount,
  deckSubmitted = false
) {
  const payload = toJsonSafe({
    tournamentId,
    playerId,
    preparationStatus,
    readyPlayerCount,
    totalPlayerCount,
    deckSubmitted,
  });
  const room = `tournament:${tournamentId}`;
  try {
    io.to(room).emit("UPDATE_PREPARATION", payload);
  } catch (e) {
    try { console.warn("[Broadcast] Socket emit failed (UPDATE_PREPARATION):", e?.message || e); } catch {}
  }
  try {
    console.log("[Broadcast] UPDATE_PREPARATION to room:", room);
  } catch {}
}

function emitStatisticsUpdate(io, tournamentId, statistics) {
  const payload = toJsonSafe({ tournamentId, ...statistics });
  const room = `tournament:${tournamentId}`;
  try {
    io.to(room).emit("STATISTICS_UPDATED", payload);
  } catch (e) {
    try { console.warn("[Broadcast] Socket emit failed (STATISTICS_UPDATED):", e?.message || e); } catch {}
  }
  try {
    console.log("[Broadcast] STATISTICS_UPDATED to room:", room);
  } catch {}
}

module.exports = {
  setPrismaClient,
  emitPhaseChanged,
  emitTournamentUpdate,
  emitRoundStarted,
  emitMatchesReady,
  emitDraftReady,
  emitPlayerJoined,
  emitPlayerLeft,
  emitPreparationUpdate,
  emitStatisticsUpdate,
};
