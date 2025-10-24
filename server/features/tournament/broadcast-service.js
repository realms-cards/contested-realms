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
        payload,
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
  const payload = {
    tournamentId,
    newPhase,
    newStatus: newPhase,
    timestamp: new Date().toISOString(),
    ...additionalData,
  };
  if (!shouldEmit(tournamentId, "PHASE_CHANGED", payload)) return;
  const room = `tournament:${tournamentId}`;
  io.to(room).emit("PHASE_CHANGED", payload);
  try {
    console.log("[Broadcast] PHASE_CHANGED to room:", room, "phase:", newPhase);
  } catch {}
  logBroadcastEvent(tournamentId, "PHASE_CHANGED", payload, room).catch(() => {});
}

function emitTournamentUpdate(io, tournamentId, data) {
  const room = `tournament:${tournamentId}`;
  io.to(room).emit("TOURNAMENT_UPDATED", data);
  try {
    console.log("[Broadcast] TOURNAMENT_UPDATED to room:", room);
  } catch {}
}

function emitRoundStarted(io, tournamentId, roundNumber, matches) {
  const room = `tournament:${tournamentId}`;
  io.to(room).emit("ROUND_STARTED", { tournamentId, roundNumber, matches });
  try {
    console.log("[Broadcast] ROUND_STARTED to room:", room, "round:", roundNumber);
  } catch {}
}

function emitMatchesReady(io, tournamentId, matches) {
  const room = `tournament:${tournamentId}`;
  io.to(room).emit("MATCHES_READY", { tournamentId, matches });
  try {
    console.log("[Broadcast] MATCHES_READY to room:", room);
  } catch {}
}

function emitDraftReady(io, tournamentId, payload) {
  const message = { tournamentId, ...payload };
  const room = `tournament:${tournamentId}`;
  io.to(room).emit("DRAFT_READY", message);
  try {
    console.log("[Broadcast] DRAFT_READY to room:", room);
  } catch {}
}

function emitPlayerJoined(io, tournamentId, playerId, playerName, currentPlayerCount) {
  const payload = { tournamentId, playerId, playerName, currentPlayerCount };
  const room = `tournament:${tournamentId}`;
  io.to(room).emit("PLAYER_JOINED", payload);
  try {
    console.log("[Broadcast] PLAYER_JOINED to room:", room);
  } catch {}
}

function emitPlayerLeft(io, tournamentId, playerId, playerName, currentPlayerCount) {
  const payload = { tournamentId, playerId, playerName, currentPlayerCount };
  const room = `tournament:${tournamentId}`;
  io.to(room).emit("PLAYER_LEFT", payload);
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
  const payload = {
    tournamentId,
    playerId,
    preparationStatus,
    readyPlayerCount,
    totalPlayerCount,
    deckSubmitted,
  };
  const room = `tournament:${tournamentId}`;
  io.to(room).emit("UPDATE_PREPARATION", payload);
  try {
    console.log("[Broadcast] UPDATE_PREPARATION to room:", room);
  } catch {}
}

function emitStatisticsUpdate(io, tournamentId, statistics) {
  const payload = { tournamentId, ...statistics };
  const room = `tournament:${tournamentId}`;
  io.to(room).emit("STATISTICS_UPDATED", payload);
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
