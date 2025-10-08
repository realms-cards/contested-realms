/**
 * Tournament Broadcast Module
 *
 * Handles Socket.IO event broadcasting for tournaments.
 * All events are broadcast to tournament room only (not globally).
 *
 * Extracted from server/index.js as part of T018 (module refactoring).
 * T030: Enhanced with audit logging to TournamentBroadcastEvent table.
 */

// T030: Optional audit logging (requires Prisma client from server)
let prismaClient = null;

/**
 * Set Prisma client for audit logging (optional)
 * @param {object} prisma - Prisma client instance
 */
function setPrismaClient(prisma) {
  prismaClient = prisma;
  console.log('[Broadcast] Audit logging enabled');
}

/**
 * Event deduplication map
 * Tracks recent events to prevent duplicate emissions within 5-second window
 */
const recentEvents = new Map(); // eventId → timestamp

/**
 * Clean up old events from deduplication map
 */
function cleanupRecentEvents() {
  const now = Date.now();
  const fiveSecondsAgo = now - 5000;

  for (const [eventId, timestamp] of recentEvents.entries()) {
    if (timestamp < fiveSecondsAgo) {
      recentEvents.delete(eventId);
    }
  }
}

// Clean up every 10 seconds
setInterval(cleanupRecentEvents, 10000);

/**
 * Check if event should be emitted (deduplication)
 */
function shouldEmit(tournamentId, eventType, payload) {
  const eventId = `${tournamentId}:${eventType}:${JSON.stringify(payload)}`;
  const now = Date.now();
  const lastEmitted = recentEvents.get(eventId);

  if (lastEmitted && (now - lastEmitted) < 5000) {
    console.warn('[Broadcast] Duplicate event prevented:', eventId);
    return false;
  }

  recentEvents.set(eventId, now);
  return true;
}

/**
 * T030: Log broadcast event to audit table
 * Non-blocking - failures are logged but don't prevent broadcast
 */
async function logBroadcastEvent(tournamentId, eventType, payload, roomTarget) {
  if (!prismaClient) return; // Audit logging not enabled

  try {
    await prismaClient.tournamentBroadcastEvent.create({
      data: {
        tournamentId,
        eventType,
        payload,
        timestamp: new Date(),
        emittedBy: process.env.SERVER_ID || 'socket-server',
        roomTarget,
      },
    });
  } catch (err) {
    // Don't block broadcast on audit logging failure
    console.warn('[Broadcast] Failed to log audit event:', err?.message || err);
  }
}

/**
 * Emit phase change event to tournament participants
 *
 * @param {object} io - Socket.IO server instance
 * @param {string} tournamentId - Tournament ID
 * @param {string} newPhase - New phase name
 * @param {object} additionalData - Additional event data
 */
function emitPhaseChanged(io, tournamentId, newPhase, additionalData = {}) {
  const payload = {
    tournamentId,
    newPhase,
    newStatus: newPhase,
    timestamp: new Date().toISOString(),
    ...additionalData
  };

  if (!shouldEmit(tournamentId, 'PHASE_CHANGED', payload)) {
    return; // Duplicate event, skip
  }

  const roomTarget = `tournament:${tournamentId}`;
  io.to(roomTarget).emit('PHASE_CHANGED', payload);
  console.log('[Broadcast] PHASE_CHANGED to room:', roomTarget, 'phase:', newPhase);

  // T030: Audit log (non-blocking)
  logBroadcastEvent(tournamentId, 'PHASE_CHANGED', payload, roomTarget).catch(() => {});
}

/**
 * Emit tournament update event to participants
 *
 * @param {object} io - Socket.IO server instance
 * @param {string} tournamentId - Tournament ID
 * @param {object} data - Tournament data
 */
function emitTournamentUpdate(io, tournamentId, data) {
  io.to(`tournament:${tournamentId}`).emit('TOURNAMENT_UPDATED', data);
  console.log('[Broadcast] TOURNAMENT_UPDATED to room:', `tournament:${tournamentId}`);
}

/**
 * Emit round started event to participants
 *
 * @param {object} io - Socket.IO server instance
 * @param {string} tournamentId - Tournament ID
 * @param {number} roundNumber - Round number
 * @param {array} matches - Match data for this round
 */
function emitRoundStarted(io, tournamentId, roundNumber, matches) {
  io.to(`tournament:${tournamentId}`).emit('ROUND_STARTED', {
    tournamentId,
    roundNumber,
    matches
  });
  console.log('[Broadcast] ROUND_STARTED to room:', `tournament:${tournamentId}`, 'round:', roundNumber);
}

/**
 * Emit matches ready event to participants
 *
 * @param {object} io - Socket.IO server instance
 * @param {string} tournamentId - Tournament ID
 * @param {array} matches - Match data
 */
function emitMatchesReady(io, tournamentId, matches) {
  io.to(`tournament:${tournamentId}`).emit('MATCHES_READY', {
    tournamentId,
    matches
  });
  console.log('[Broadcast] MATCHES_READY to room:', `tournament:${tournamentId}`);
}

/**
 * Emit draft ready event to participants
 *
 * @param {object} io - Socket.IO server instance
 * @param {string} tournamentId - Tournament ID
 * @param {object} payload - Draft session data
 */
function emitDraftReady(io, tournamentId, payload) {
  const message = {
    tournamentId,
    ...payload,
  };

  io.to(`tournament:${tournamentId}`).emit('DRAFT_READY', message);
  console.log('[Broadcast] DRAFT_READY to room:', `tournament:${tournamentId}`);
}

/**
 * Emit player joined event to participants
 *
 * @param {object} io - Socket.IO server instance
 * @param {string} tournamentId - Tournament ID
 * @param {string} playerId - Player ID
 * @param {string} playerName - Player display name
 * @param {number} currentPlayerCount - Current number of players
 */
function emitPlayerJoined(io, tournamentId, playerId, playerName, currentPlayerCount) {
  const payload = {
    tournamentId,
    playerId,
    playerName,
    currentPlayerCount
  };

  io.to(`tournament:${tournamentId}`).emit('PLAYER_JOINED', payload);
  console.log('[Broadcast] PLAYER_JOINED to room:', `tournament:${tournamentId}`);
}

/**
 * Emit player left event to participants
 *
 * @param {object} io - Socket.IO server instance
 * @param {string} tournamentId - Tournament ID
 * @param {string} playerId - Player ID
 * @param {string} playerName - Player display name
 * @param {number} currentPlayerCount - Current number of players
 */
function emitPlayerLeft(io, tournamentId, playerId, playerName, currentPlayerCount) {
  const payload = {
    tournamentId,
    playerId,
    playerName,
    currentPlayerCount
  };

  io.to(`tournament:${tournamentId}`).emit('PLAYER_LEFT', payload);
  console.log('[Broadcast] PLAYER_LEFT to room:', `tournament:${tournamentId}`);
}

/**
 * Emit preparation update event to participants
 *
 * @param {object} io - Socket.IO server instance
 * @param {string} tournamentId - Tournament ID
 * @param {string} playerId - Player ID
 * @param {string} preparationStatus - Preparation status
 * @param {number} readyPlayerCount - Number of ready players
 * @param {number} totalPlayerCount - Total number of players
 * @param {boolean} deckSubmitted - Whether deck was submitted
 */
function emitPreparationUpdate(io, tournamentId, playerId, preparationStatus, readyPlayerCount, totalPlayerCount, deckSubmitted = false) {
  const payload = {
    tournamentId,
    playerId,
    preparationStatus,
    readyPlayerCount,
    totalPlayerCount,
    deckSubmitted
  };

  io.to(`tournament:${tournamentId}`).emit('UPDATE_PREPARATION', payload);
  console.log('[Broadcast] UPDATE_PREPARATION to room:', `tournament:${tournamentId}`);
}

/**
 * Emit statistics update event to participants
 *
 * @param {object} io - Socket.IO server instance
 * @param {string} tournamentId - Tournament ID
 * @param {object} statistics - Tournament statistics
 */
function emitStatisticsUpdate(io, tournamentId, statistics) {
  io.to(`tournament:${tournamentId}`).emit('STATISTICS_UPDATED', {
    tournamentId,
    ...statistics
  });
  console.log('[Broadcast] STATISTICS_UPDATED to room:', `tournament:${tournamentId}`);
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
