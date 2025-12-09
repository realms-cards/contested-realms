// Matchmaking feature module: queue-based player matching for quick play

/**
 * @param {object} deps
 * @param {import('socket.io').Server} deps.io
 * @param {import('ioredis')} [deps.storeRedis]
 * @param {string} deps.instanceId
 * @param {(prefix: string) => string} deps.rid
 * @param {() => Promise<string>} deps.getOrClaimLobbyLeader
 * @param {(msg: object) => Promise<void>} deps.handleLobbyControlAsLeader
 * @param {(playerId: string) => Promise<any>} deps.ensurePlayerCached
 * @param {string} deps.matchmakingChannel
 * @param {Map} deps.lobbies - Lobby map from lobby feature
 */
function createMatchmakingFeature(deps) {
  const io = deps.io;
  const storeRedis = deps.storeRedis || null;
  const INSTANCE_ID = deps.instanceId;
  // rid is available but currently unused (kept for potential future use)
  const getOrClaimLobbyLeader = deps.getOrClaimLobbyLeader;
  const handleLobbyControlAsLeader = deps.handleLobbyControlAsLeader;
  const ensurePlayerCached = deps.ensurePlayerCached;
  const MATCHMAKING_CHANNEL = deps.matchmakingChannel || "matchmaking:control";
  const lobbies = deps.lobbies; // Reference to lobby feature's lobbies Map

  // In-memory queue for this instance (authoritative when leader)
  // Each entry: { playerId, socketId, matchTypes: string[], joinedAt: number }
  /** @type {Map<string, { playerId: string, socketId: string, matchTypes: string[], joinedAt: number }>} */
  const queue = new Map();

  // Match attempt interval (check for matches every N ms)
  const MATCH_CHECK_INTERVAL = 2000;
  let matchCheckTimer = null;

  /**
   * Serialize queue entry for Redis pub/sub
   */
  function serializeEntry(entry) {
    return {
      playerId: entry.playerId,
      socketId: entry.socketId,
      matchTypes: entry.matchTypes,
      joinedAt: entry.joinedAt,
    };
  }

  /**
   * Add player to matchmaking queue
   */
  async function joinQueue(playerId, socketId, matchTypes) {
    const existing = queue.get(playerId);
    if (existing) {
      // Update preferences if already in queue
      existing.matchTypes = matchTypes;
      existing.socketId = socketId;
    } else {
      queue.set(playerId, {
        playerId,
        socketId,
        matchTypes,
        joinedAt: Date.now(),
      });
    }

    // Publish to other instances if we have Redis
    if (storeRedis) {
      try {
        await storeRedis.publish(
          MATCHMAKING_CHANNEL,
          JSON.stringify({
            type: "join",
            instanceId: INSTANCE_ID,
            entry: serializeEntry(queue.get(playerId)),
          })
        );
      } catch {}
    }

    // Send status update to player
    sendStatusUpdate(playerId, socketId, "searching", matchTypes);

    // Broadcast updated queue size to all players in queue
    broadcastQueueSize();

    // Trigger immediate match check
    checkForMatches();

    console.log(
      `[Matchmaking] ${playerId.slice(
        -6
      )} joined queue with types: ${matchTypes.join(", ")}`
    );
  }

  /**
   * Remove player from matchmaking queue
   */
  async function leaveQueue(playerId, reason = "user_left") {
    const entry = queue.get(playerId);
    if (!entry) return;

    queue.delete(playerId);

    // Publish to other instances
    if (storeRedis) {
      try {
        await storeRedis.publish(
          MATCHMAKING_CHANNEL,
          JSON.stringify({
            type: "leave",
            instanceId: INSTANCE_ID,
            playerId,
            reason,
          })
        );
      } catch {}
    }

    // Send idle status if player socket is still connected
    const socketId = entry.socketId;
    sendStatusUpdate(playerId, socketId, "idle", null);

    // Broadcast updated queue size to remaining players
    broadcastQueueSize();

    console.log(`[Matchmaking] ${playerId.slice(-6)} left queue (${reason})`);
  }

  /**
   * Send matchmaking status update to a player
   */
  function sendStatusUpdate(
    playerId,
    socketId,
    status,
    matchTypes,
    extra = {}
  ) {
    const payload = {
      status,
      preferences: matchTypes ? { matchTypes } : null,
      queueSize: queue.size, // Always include total queue size
      ...extra,
    };

    // Calculate queue position if searching
    if (status === "searching") {
      let position = 0;
      for (const [pid] of queue) {
        if (pid === playerId) break;
        position++;
      }
      payload.queuePosition = position;
      // Rough estimate: 30 seconds per position
      payload.estimatedWait = Math.max(10, position * 30);
    }

    try {
      io.to(socketId).emit("matchmakingUpdate", payload);
    } catch {}
  }

  /**
   * Broadcast queue size update to all players in the queue
   */
  function broadcastQueueSize() {
    for (const [playerId, entry] of queue) {
      sendStatusUpdate(playerId, entry.socketId, "searching", entry.matchTypes);
    }
  }

  /**
   * Find compatible match types between two players
   */
  function findCompatibleType(types1, types2) {
    // Priority order: precon/constructed (fastest auto-start), then sealed, then draft
    const priority = ["precon", "constructed", "sealed", "draft"];
    for (const type of priority) {
      if (types1.includes(type) && types2.includes(type)) {
        return type;
      }
    }
    return null;
  }

  /**
   * Find a matching public lobby for a queued player
   */
  function findMatchingLobby(playerEntry) {
    if (!lobbies) return null;

    for (const lobby of lobbies.values()) {
      // Skip non-public, full, or matchmaking-created lobbies
      if (lobby.visibility !== "open") continue;
      if (lobby.playerIds.size >= lobby.maxPlayers) continue;
      if (lobby.isMatchmakingLobby) continue;
      if (lobby.status !== "open") continue;

      // Check if lobby's planned match type matches player preferences
      const lobbyType = lobby.plannedMatchType || "constructed";
      if (playerEntry.matchTypes.includes(lobbyType)) {
        return { lobby, matchType: lobbyType };
      }
    }
    return null;
  }

  /**
   * Check for potential matches in the queue
   */
  async function checkForMatches() {
    const leader = await getOrClaimLobbyLeader();
    if (leader !== INSTANCE_ID) {
      // Only the lobby leader handles match creation
      return;
    }

    const entries = Array.from(queue.values());

    // First, try to match queued players with existing public lobbies
    for (const entry of entries) {
      const match = findMatchingLobby(entry);
      if (match) {
        console.log(
          `[Matchmaking] Joining ${entry.playerId.slice(
            -6
          )} to existing lobby ${match.lobby.id}`
        );
        await joinExistingLobby(entry, match.lobby, match.matchType);
        return; // Only one action per check cycle
      }
    }

    // If no lobbies match, try to pair two queued players
    if (queue.size < 2) return;

    // Simple FIFO matching: try to match the oldest player first
    for (let i = 0; i < entries.length; i++) {
      const player1 = entries[i];

      for (let j = i + 1; j < entries.length; j++) {
        const player2 = entries[j];

        const compatibleType = findCompatibleType(
          player1.matchTypes,
          player2.matchTypes
        );

        if (compatibleType) {
          // Found a match! player1 is earlier in queue, so they become host
          await createMatch(player1, player2, compatibleType);
          return; // Only create one match per check cycle
        }
      }
    }
  }

  /**
   * Join a queued player to an existing public lobby
   */
  async function joinExistingLobby(entry, lobby, matchType) {
    console.log(
      `[Matchmaking] ${entry.playerId.slice(-6)} joining lobby ${
        lobby.id
      } (${matchType})`
    );

    // Remove from queue
    queue.delete(entry.playerId);

    // Notify player
    sendStatusUpdate(entry.playerId, entry.socketId, "found", null, {
      lobbyId: lobby.id,
      matchType,
    });

    try {
      // Join the existing lobby
      await handleLobbyControlAsLeader({
        type: "join",
        playerId: entry.playerId,
        socketId: entry.socketId,
        lobbyId: lobby.id,
      });

      console.log(
        `[Matchmaking] ${entry.playerId.slice(-6)} successfully joined lobby ${
          lobby.id
        }`
      );
    } catch (err) {
      console.error("[Matchmaking] Error joining existing lobby:", err);
      // Re-queue on failure
      await joinQueue(entry.playerId, entry.socketId, entry.matchTypes);
    }
  }

  /**
   * Create a match between two players
   * entry1 is the earlier joiner (lower queue position) and becomes the host
   */
  async function createMatch(entry1, entry2, matchType) {
    // entry1 is earlier in queue, so they become host
    const host = entry1;
    const guest = entry2;

    console.log(
      `[Matchmaking] Creating ${matchType} match: ${host.playerId.slice(
        -6
      )} (host) vs ${guest.playerId.slice(-6)}`
    );

    // Remove both from queue first
    queue.delete(host.playerId);
    queue.delete(guest.playerId);

    // Notify both players that a match was found
    sendStatusUpdate(host.playerId, host.socketId, "found", null, {
      matchedPlayerId: guest.playerId,
      matchType,
      isHost: true,
    });
    sendStatusUpdate(guest.playerId, guest.socketId, "found", null, {
      matchedPlayerId: host.playerId,
      matchType,
      isHost: false,
    });

    try {
      // Create a private lobby for the match
      const lobbyName = `Quick ${
        matchType.charAt(0).toUpperCase() + matchType.slice(1)
      }`;

      // Use handleLobbyControlAsLeader to create the lobby properly
      // Host creates the lobby
      await handleLobbyControlAsLeader({
        type: "create",
        hostId: host.playerId,
        socketId: host.socketId,
        options: {
          name: lobbyName,
          visibility: "private",
          maxPlayers: 2,
        },
      });

      // Get the host's cached data to find their lobby
      const hostPlayer = await ensurePlayerCached(host.playerId);
      if (!hostPlayer || !hostPlayer.lobbyId) {
        console.error("[Matchmaking] Failed to create lobby for host");
        // Re-queue both players
        await joinQueue(host.playerId, host.socketId, host.matchTypes);
        await joinQueue(guest.playerId, guest.socketId, guest.matchTypes);
        return;
      }

      const createdLobbyId = hostPlayer.lobbyId;

      // Mark the lobby as a matchmaking lobby with the planned type
      if (lobbies && lobbies.has(createdLobbyId)) {
        const lobby = lobbies.get(createdLobbyId);
        lobby.isMatchmakingLobby = true;
        lobby.plannedMatchType = matchType;
      }

      // Guest joins the lobby
      await handleLobbyControlAsLeader({
        type: "join",
        playerId: guest.playerId,
        socketId: guest.socketId,
        lobbyId: createdLobbyId,
      });

      // For constructed/precon: auto-start immediately (no configuration needed)
      // For sealed/draft: host needs to configure, so just ready both players
      if (matchType === "constructed" || matchType === "precon") {
        // Both are auto-ready, start the match
        await handleLobbyControlAsLeader({
          type: "startMatch",
          playerId: host.playerId,
          matchType,
          sealedConfig: null,
          draftConfig: null,
        });
        console.log(
          `[Matchmaking] Constructed match started for lobby ${createdLobbyId}`
        );
      } else {
        // Sealed/Draft: just set both players as ready, host will configure
        console.log(
          `[Matchmaking] ${matchType} lobby created: ${createdLobbyId} - host will configure`
        );
      }
    } catch (err) {
      console.error("[Matchmaking] Error creating match:", err);
      // Re-queue both players on failure
      await joinQueue(host.playerId, host.socketId, host.matchTypes);
      await joinQueue(guest.playerId, guest.socketId, guest.matchTypes);
    }
  }

  /**
   * Handle matchmaking control messages from other instances
   */
  async function handleMatchmakingControl(msg) {
    if (msg.instanceId === INSTANCE_ID) return; // Ignore our own messages

    if (msg.type === "join" && msg.entry) {
      // Another instance added a player to the queue
      const entry = msg.entry;
      queue.set(entry.playerId, {
        playerId: entry.playerId,
        socketId: entry.socketId,
        matchTypes: entry.matchTypes,
        joinedAt: entry.joinedAt,
      });
    }

    if (msg.type === "leave" && msg.playerId) {
      queue.delete(msg.playerId);
    }

    // Trigger match check in case we're the leader now
    checkForMatches();
  }

  /**
   * Start periodic match checking
   */
  function startMatchChecking() {
    if (matchCheckTimer) return;
    matchCheckTimer = setInterval(() => {
      checkForMatches().catch(() => {});
    }, MATCH_CHECK_INTERVAL);
  }

  /**
   * Stop periodic match checking
   */
  function stopMatchChecking() {
    if (matchCheckTimer) {
      clearInterval(matchCheckTimer);
      matchCheckTimer = null;
    }
  }

  /**
   * Clean up player from queue on disconnect
   */
  function handleDisconnect(playerId) {
    if (queue.has(playerId)) {
      leaveQueue(playerId, "disconnected");
    }
  }

  /**
   * Get queue stats for monitoring
   */
  function getQueueStats() {
    const stats = {
      totalInQueue: queue.size,
      byType: {
        constructed: 0,
        sealed: 0,
        draft: 0,
      },
    };

    for (const entry of queue.values()) {
      for (const type of entry.matchTypes) {
        if (stats.byType[type] !== undefined) {
          stats.byType[type]++;
        }
      }
    }

    return stats;
  }

  /**
   * Register socket handlers for matchmaking
   */
  function registerSocketHandlers({ socket, isAuthed, getPlayerBySocket }) {
    socket.on("joinMatchmaking", async (payload = {}) => {
      if (!isAuthed()) return;
      const player = getPlayerBySocket(socket);
      if (!player) return;

      // Validate preferences
      const matchTypes = payload?.preferences?.matchTypes;
      if (
        !Array.isArray(matchTypes) ||
        matchTypes.length === 0 ||
        matchTypes.length > 3
      ) {
        socket.emit("error", {
          message: "Invalid matchmaking preferences",
          code: "invalid_preferences",
        });
        return;
      }

      const validTypes = ["constructed", "sealed", "draft", "precon"];
      const filtered = matchTypes.filter((t) => validTypes.includes(t));
      if (filtered.length === 0) {
        socket.emit("error", {
          message: "Must select at least one valid match type",
          code: "invalid_preferences",
        });
        return;
      }

      // Cannot join matchmaking while in a lobby or match
      if (player.lobbyId || player.matchId) {
        socket.emit("error", {
          message:
            "Cannot search for match while in a lobby or match. Leave first.",
          code: "already_in_game",
        });
        return;
      }

      await joinQueue(player.id, socket.id, filtered);
    });

    socket.on("leaveMatchmaking", async () => {
      if (!isAuthed()) return;
      const player = getPlayerBySocket(socket);
      if (!player) return;

      await leaveQueue(player.id, "user_cancelled");
    });
  }

  // Start match checking on module load
  startMatchChecking();

  return {
    queue,
    joinQueue,
    leaveQueue,
    checkForMatches,
    handleMatchmakingControl,
    handleDisconnect,
    getQueueStats,
    registerSocketHandlers,
    startMatchChecking,
    stopMatchChecking,
  };
}

module.exports = { createMatchmakingFeature };
