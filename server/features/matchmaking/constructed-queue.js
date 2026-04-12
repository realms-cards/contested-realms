// Matchmaking feature module: canonical server-owned constructed queue

/**
 * @param {object} deps
 * @param {import('socket.io').Server} deps.io
 * @param {import('ioredis')} [deps.storeRedis]
 * @param {string} deps.instanceId
 * @param {() => Promise<string>} deps.getOrClaimLobbyLeader
 * @param {(msg: object) => Promise<void>} deps.handleLobbyControlAsLeader
 * @param {(playerId: string) => Promise<any>} deps.ensurePlayerCached
 * @param {string} deps.matchmakingChannel
 * @param {Map} deps.lobbies
 * @param {(hostId: string, opts?: object) => any} deps.reservePrivateLobby
 * @param {(lobbyId: string, playerId: string) => boolean} deps.addLobbyInvite
 */
function createMatchmakingFeature(deps) {
  const io = deps.io;
  const storeRedis = deps.storeRedis || null;
  const INSTANCE_ID = deps.instanceId;
  const getOrClaimLobbyLeader = deps.getOrClaimLobbyLeader;
  const handleLobbyControlAsLeader = deps.handleLobbyControlAsLeader;
  const ensurePlayerCached = deps.ensurePlayerCached;
  const MATCHMAKING_CHANNEL = deps.matchmakingChannel || "matchmaking:control";
  const lobbies = deps.lobbies;
  const reservePrivateLobby = deps.reservePrivateLobby;
  const setMatchmakingLobbyConfirmationRequired =
    deps.setMatchmakingLobbyConfirmationRequired;
  const cancelReservedLobby = deps.cancelReservedLobby;
  const addLobbyInvite = deps.addLobbyInvite;

  /** @type {Map<string, { playerId: string, socketId: string | null, joinedAt: number, source: "web" | "discord", discordId: string | null, guildId: string | null, channelId: string | null }>} */
  const queue = new Map();
  /** @type {Map<string, { lobbyId: string, opponentPlayerId: string, opponentPlayerName: string | null, matchType: "constructed", isHost: boolean, createdAt: number, status: "confirming" | "ready", confirmExpiresAt: number | null, youAccepted: boolean }>} */
  const pendingMatches = new Map();
  /** @type {Map<string, { lobbyId: string, hostPlayerId: string, guestPlayerId: string, hostEntry: { playerId: string, socketId: string | null, joinedAt: number, source: "web" | "discord", discordId: string | null, guildId: string | null, channelId: string | null }, guestEntry: { playerId: string, socketId: string | null, joinedAt: number, source: "web" | "discord", discordId: string | null, guildId: string | null, channelId: string | null }, createdAt: number, expiresAt: number | null, acceptedPlayerIds: Set<string>, status: "confirming" | "ready", matchType: "constructed" }>} */
  const reservations = new Map();

  const MATCH_CHECK_INTERVAL = 2000;
  const MATCH_CONFIRM_WINDOW_MS = 30000;
  const LOBBY_SETTINGS_GRACE_PERIOD = 15000;
  let matchCheckTimer = null;

  function sortedQueueEntries() {
    return Array.from(queue.values()).sort((a, b) => a.joinedAt - b.joinedAt);
  }

  function serializeEntry(entry) {
    return {
      playerId: entry.playerId,
      socketId: entry.socketId,
      joinedAt: entry.joinedAt,
      source: entry.source,
      discordId: entry.discordId,
      guildId: entry.guildId,
      channelId: entry.channelId,
    };
  }

  function serializePendingMatch(match) {
    return {
      lobbyId: match.lobbyId,
      opponentPlayerId: match.opponentPlayerId,
      opponentPlayerName: match.opponentPlayerName ?? null,
      matchType: "constructed",
      isHost: !!match.isHost,
      createdAt: match.createdAt,
      status: match.status === "ready" ? "ready" : "confirming",
      confirmExpiresAt: match.confirmExpiresAt ?? null,
      youAccepted: match.youAccepted === true,
    };
  }

  function serializeReservation(reservation) {
    return {
      lobbyId: reservation.lobbyId,
      hostPlayerId: reservation.hostPlayerId,
      guestPlayerId: reservation.guestPlayerId,
      hostEntry: serializeEntry(reservation.hostEntry),
      guestEntry: serializeEntry(reservation.guestEntry),
      createdAt: reservation.createdAt,
      expiresAt: reservation.expiresAt ?? null,
      acceptedPlayerIds: Array.from(reservation.acceptedPlayerIds || []),
      status: reservation.status === "ready" ? "ready" : "confirming",
      matchType: "constructed",
    };
  }

  function upsertReservation(reservation) {
    if (!reservation?.lobbyId) return null;
    const next = {
      lobbyId: reservation.lobbyId,
      hostPlayerId: reservation.hostPlayerId,
      guestPlayerId: reservation.guestPlayerId,
      hostEntry: reservation.hostEntry,
      guestEntry: reservation.guestEntry,
      createdAt: reservation.createdAt || Date.now(),
      expiresAt:
        typeof reservation.expiresAt === "number"
          ? reservation.expiresAt
          : null,
      acceptedPlayerIds: new Set(
        Array.isArray(reservation.acceptedPlayerIds)
          ? reservation.acceptedPlayerIds
          : Array.from(reservation.acceptedPlayerIds || []),
      ),
      status: reservation.status === "ready" ? "ready" : "confirming",
      matchType: "constructed",
    };
    reservations.set(next.lobbyId, next);
    return next;
  }

  async function publishControlMessage(msg) {
    if (!storeRedis) return;
    try {
      await storeRedis.publish(MATCHMAKING_CHANNEL, JSON.stringify(msg));
    } catch {}
  }

  function getQueuePosition(playerId) {
    const entries = sortedQueueEntries();
    for (let i = 0; i < entries.length; i++) {
      if (entries[i].playerId === playerId) {
        return i + 1;
      }
    }
    return null;
  }

  function getGuildQueueSize(guildId) {
    if (!guildId) return 0;
    return sortedQueueEntries().filter((entry) => entry.guildId === guildId)
      .length;
  }

  function getQueueBySource() {
    let web = 0;
    let discord = 0;
    for (const entry of queue.values()) {
      if (entry.source === "discord") discord += 1;
      else web += 1;
    }
    return { web, discord };
  }

  function getPendingMatch(playerId) {
    const pending = pendingMatches.get(playerId) || null;
    if (!pending) return null;
    const lobby = lobbies?.get(pending.lobbyId);
    if (!lobby || lobby.matchId || lobby.status !== "open") {
      pendingMatches.delete(playerId);
      return null;
    }
    return pending;
  }

  function setPendingMatch(playerId, match) {
    pendingMatches.set(playerId, {
      lobbyId: match.lobbyId,
      opponentPlayerId: match.opponentPlayerId,
      opponentPlayerName: match.opponentPlayerName ?? null,
      matchType: "constructed",
      isHost: !!match.isHost,
      createdAt: match.createdAt || Date.now(),
      status: match.status === "ready" ? "ready" : "confirming",
      confirmExpiresAt:
        typeof match.confirmExpiresAt === "number"
          ? match.confirmExpiresAt
          : null,
      youAccepted: match.youAccepted === true,
    });
  }

  function clearPendingMatch(playerId) {
    pendingMatches.delete(playerId);
  }

  function sendStatusUpdate(playerId, socketId, status, extra = {}) {
    if (!socketId) return;
    const payload = {
      status,
      preferences:
        status === "searching" ? { matchTypes: ["constructed"] } : null,
      queueSize: queue.size,
      queueBySource: getQueueBySource(),
      ...extra,
    };

    if (status === "searching") {
      const position = Math.max(0, (getQueuePosition(playerId) || 1) - 1);
      payload.queuePosition = position;
      payload.estimatedWait = Math.max(10, position * 30);
    }

    try {
      io.to(socketId).emit("matchmakingUpdate", payload);
    } catch {}
  }

  function sendPendingStatusToSocket(playerId, socketId, pending) {
    if (!socketId || !pending) return;
    sendStatusUpdate(
      playerId,
      socketId,
      pending.status === "ready" ? "found" : "confirming",
      {
        matchedPlayerId: pending.opponentPlayerId,
        matchedPlayerName: pending.opponentPlayerName ?? undefined,
        matchType: "constructed",
        isHost: !!pending.isHost,
        lobbyId: pending.lobbyId,
        confirmExpiresAt: pending.confirmExpiresAt ?? undefined,
        youAccepted: pending.youAccepted === true,
      },
    );
  }

  function sendQueueStatsToSocket(socketId) {
    if (!socketId) return;
    try {
      io.to(socketId).emit("matchmakingUpdate", {
        status: "idle",
        preferences: null,
        queueSize: queue.size,
        queueBySource: getQueueBySource(),
      });
    } catch {}
  }

  async function emitPendingStatus(playerId) {
    const pending = getPendingMatch(playerId);
    if (!pending) return;
    const player = await ensurePlayerCached(playerId);
    const socketId = player?.socketId || null;
    if (!socketId) return;
    sendPendingStatusToSocket(playerId, socketId, pending);
  }

  function broadcastQueueSize() {
    const excludedSocketIds = new Set();
    for (const entry of queue.values()) {
      if (!entry.socketId) continue;
      excludedSocketIds.add(entry.socketId);
      sendStatusUpdate(entry.playerId, entry.socketId, "searching");
    }

    for (const reservation of reservations.values()) {
      if (reservation.hostEntry?.socketId) {
        excludedSocketIds.add(reservation.hostEntry.socketId);
      }
      if (reservation.guestEntry?.socketId) {
        excludedSocketIds.add(reservation.guestEntry.socketId);
      }
    }

    try {
      for (const socketId of io.sockets.sockets.keys()) {
        if (excludedSocketIds.has(socketId)) continue;
        sendQueueStatsToSocket(socketId);
      }
    } catch {}
  }

  function updateReservationSocket(playerId, socketId) {
    for (const reservation of reservations.values()) {
      if (reservation.hostPlayerId === playerId) {
        reservation.hostEntry.socketId = socketId;
        return reservation;
      }
      if (reservation.guestPlayerId === playerId) {
        reservation.guestEntry.socketId = socketId;
        return reservation;
      }
    }
    return null;
  }

  async function removeQueueEntry(
    playerId,
    reason = "user_left",
    notifyIdle = true,
  ) {
    const entry = queue.get(playerId);
    if (!entry) return null;
    queue.delete(playerId);
    await publishControlMessage({
      type: "leave",
      instanceId: INSTANCE_ID,
      playerId,
      reason,
    });
    if (notifyIdle && entry.socketId) {
      sendStatusUpdate(playerId, entry.socketId, "idle");
    }
    return entry;
  }

  async function rejoinReservationPlayer(reservation, playerId) {
    const sourceEntry =
      reservation.hostPlayerId === playerId
        ? reservation.hostEntry
        : reservation.guestEntry;
    const player = await ensurePlayerCached(playerId);
    await joinQueue(
      playerId,
      player?.socketId || sourceEntry?.socketId || null,
      {
        source: sourceEntry?.source === "discord" ? "discord" : "web",
        discordId: sourceEntry?.discordId ?? null,
        guildId: sourceEntry?.guildId ?? null,
        channelId: sourceEntry?.channelId ?? null,
      },
    );
  }

  async function joinReadyMatchmakingLobby(playerId, socketId, pending) {
    if (!socketId || !pending) return false;
    try {
      await handleLobbyControlAsLeader({
        type: "join",
        playerId,
        socketId,
        lobbyId: pending.lobbyId,
      });
      return true;
    } catch (err) {
      console.error("[Matchmaking] Error joining confirmed lobby:", err);
      return false;
    }
  }

  async function joinQueue(playerId, socketId, options = {}) {
    const existing = queue.get(playerId);
    if (existing) {
      existing.socketId = socketId ?? existing.socketId;
      existing.source = options.source || existing.source;
      existing.discordId = options.discordId ?? existing.discordId;
      existing.guildId = options.guildId ?? existing.guildId;
      existing.channelId = options.channelId ?? existing.channelId;
    } else {
      queue.set(playerId, {
        playerId,
        socketId: socketId ?? null,
        joinedAt: Date.now(),
        source: options.source === "discord" ? "discord" : "web",
        discordId: options.discordId ?? null,
        guildId: options.guildId ?? null,
        channelId: options.channelId ?? null,
      });
    }

    clearPendingMatch(playerId);

    await publishControlMessage({
      type: "join",
      instanceId: INSTANCE_ID,
      entry: serializeEntry(queue.get(playerId)),
    });

    if (socketId) {
      sendStatusUpdate(playerId, socketId, "searching");
    }

    broadcastQueueSize();
    await checkForMatches();

    console.log(`[Matchmaking] ${playerId.slice(-6)} joined constructed queue`);
  }

  async function leaveQueue(playerId, reason = "user_left") {
    const removed = await removeQueueEntry(playerId, reason, true);
    clearPendingMatch(playerId);
    if (!removed) return false;
    broadcastQueueSize();
    console.log(`[Matchmaking] ${playerId.slice(-6)} left queue (${reason})`);
    return true;
  }

  function findMatchingLobby() {
    if (!lobbies) return null;
    const now = Date.now();
    for (const lobby of lobbies.values()) {
      if (lobby.visibility !== "open") continue;
      if (lobby.playerIds.size >= lobby.maxPlayers) continue;
      if (lobby.isMatchmakingLobby) continue;
      if (lobby.status !== "open") continue;
      const lobbyAge = now - (lobby.createdAt || lobby.lastActive || 0);
      if (lobbyAge < LOBBY_SETTINGS_GRACE_PERIOD) continue;
      const lobbyType = lobby.plannedMatchType || "constructed";
      if (lobbyType === "constructed") {
        return lobby;
      }
    }
    return null;
  }

  async function joinExistingLobby(entry, lobby) {
    await removeQueueEntry(entry.playerId, "matched", false);
    broadcastQueueSize();

    if (entry.socketId) {
      sendStatusUpdate(entry.playerId, entry.socketId, "found", {
        lobbyId: lobby.id,
        matchType: "constructed",
      });
      try {
        await handleLobbyControlAsLeader({
          type: "join",
          playerId: entry.playerId,
          socketId: entry.socketId,
          lobbyId: lobby.id,
        });
      } catch (err) {
        console.error("[Matchmaking] Error joining existing lobby:", err);
        await joinQueue(entry.playerId, entry.socketId, entry);
        return;
      }
      return;
    }

    setPendingMatch(entry.playerId, {
      lobbyId: lobby.id,
      opponentPlayerId: lobby.hostId || "",
      opponentPlayerName: null,
      matchType: "constructed",
      isHost: false,
      status: "ready",
      confirmExpiresAt: null,
      youAccepted: true,
    });

    await publishControlMessage({
      type: "matched",
      instanceId: INSTANCE_ID,
      matches: [
        {
          playerId: entry.playerId,
          ...serializePendingMatch(getPendingMatch(entry.playerId)),
        },
      ],
    });
  }

  async function cancelReservationAsLeader(
    lobbyId,
    { reason = "cancelled", actorPlayerId = null } = {},
  ) {
    const reservation = reservations.get(lobbyId);
    if (!reservation) return false;
    const leader = await getOrClaimLobbyLeader();
    if (leader !== INSTANCE_ID) {
      return false;
    }

    const playerIds = [reservation.hostPlayerId, reservation.guestPlayerId];
    const requeuePlayerIds = new Set();

    if (reason === "declined" && actorPlayerId) {
      for (const pid of playerIds) {
        if (pid !== actorPlayerId) requeuePlayerIds.add(pid);
      }
    } else if (reason === "timeout") {
      for (const pid of reservation.acceptedPlayerIds) {
        requeuePlayerIds.add(pid);
      }
    }

    reservations.delete(lobbyId);
    for (const pid of playerIds) {
      clearPendingMatch(pid);
    }

    await publishControlMessage({
      type: "reservation_cancelled",
      instanceId: INSTANCE_ID,
      lobbyId,
      playerIds,
      requeuePlayerIds: Array.from(requeuePlayerIds),
      reason,
    });

    await cancelReservedLobby(lobbyId);

    for (const pid of playerIds) {
      if (requeuePlayerIds.has(pid)) continue;
      const player = await ensurePlayerCached(pid);
      const socketId = player?.socketId || null;
      if (socketId) {
        sendStatusUpdate(pid, socketId, "idle");
      }
    }

    for (const pid of requeuePlayerIds) {
      await rejoinReservationPlayer(reservation, pid);
    }

    console.log(`[Matchmaking] Cancelled reservation ${lobbyId} (${reason})`);
    return true;
  }

  async function maybeFinalizeReservation(lobbyId) {
    const reservation = reservations.get(lobbyId);
    if (!reservation || reservation.status !== "confirming") return false;
    if (reservation.acceptedPlayerIds.size < 2) return false;

    const leader = await getOrClaimLobbyLeader();
    if (leader !== INSTANCE_ID) {
      return false;
    }

    reservation.status = "ready";
    await setMatchmakingLobbyConfirmationRequired(lobbyId, false);

    for (const pid of [reservation.hostPlayerId, reservation.guestPlayerId]) {
      const pending = getPendingMatch(pid);
      if (!pending) continue;
      setPendingMatch(pid, {
        ...pending,
        status: "ready",
        confirmExpiresAt: null,
        youAccepted: true,
      });
    }

    reservations.delete(lobbyId);

    const hostPending = getPendingMatch(reservation.hostPlayerId);
    const guestPending = getPendingMatch(reservation.guestPlayerId);

    await publishControlMessage({
      type: "reservation_ready",
      instanceId: INSTANCE_ID,
      lobbyId,
      matches: [
        hostPending
          ? {
              playerId: reservation.hostPlayerId,
              ...serializePendingMatch(hostPending),
            }
          : null,
        guestPending
          ? {
              playerId: reservation.guestPlayerId,
              ...serializePendingMatch(guestPending),
            }
          : null,
      ].filter(Boolean),
    });

    for (const pid of [reservation.hostPlayerId, reservation.guestPlayerId]) {
      const pending = getPendingMatch(pid);
      const player = await ensurePlayerCached(pid);
      const socketId =
        pid === reservation.hostPlayerId
          ? reservation.hostEntry?.socketId || player?.socketId || null
          : reservation.guestEntry?.socketId || player?.socketId || null;
      if (!pending || !socketId) continue;
      sendPendingStatusToSocket(pid, socketId, pending);
      if (!player?.lobbyId && !player?.matchId) {
        await joinReadyMatchmakingLobby(pid, socketId, pending);
      }
    }

    console.log(`[Matchmaking] Confirmed reservation ${lobbyId}`);
    return true;
  }

  async function expireReservations() {
    const leader = await getOrClaimLobbyLeader();
    if (leader !== INSTANCE_ID) {
      return;
    }

    const now = Date.now();
    for (const reservation of reservations.values()) {
      if (reservation.status !== "confirming") continue;
      if (!reservation.expiresAt || reservation.expiresAt > now) continue;
      await cancelReservationAsLeader(reservation.lobbyId, {
        reason: "timeout",
      });
    }
  }

  async function respondToMatchmaking(playerId, decision) {
    const pending = getPendingMatch(playerId);
    if (!pending) {
      return { ok: false, code: "no_pending_match" };
    }

    if (pending.status === "ready") {
      return { ok: true, status: "ready", lobbyId: pending.lobbyId };
    }

    const reservation = reservations.get(pending.lobbyId);
    if (!reservation) {
      clearPendingMatch(playerId);
      return { ok: false, code: "reservation_missing" };
    }

    if (decision === "decline") {
      const player = await ensurePlayerCached(playerId);
      const socketId = player?.socketId || null;
      if (socketId) {
        sendStatusUpdate(playerId, socketId, "idle");
      }
      await publishControlMessage({
        type: "reservation_cancel_request",
        instanceId: INSTANCE_ID,
        lobbyId: pending.lobbyId,
        playerId,
        reason: "declined",
      });
      await cancelReservationAsLeader(pending.lobbyId, {
        reason: "declined",
        actorPlayerId: playerId,
      });
      return { ok: true, status: "declined" };
    }

    reservation.acceptedPlayerIds.add(playerId);
    setPendingMatch(playerId, {
      ...pending,
      status: "confirming",
      confirmExpiresAt: reservation.expiresAt,
      youAccepted: true,
    });
    await emitPendingStatus(playerId);

    await publishControlMessage({
      type: "reservation_accepted",
      instanceId: INSTANCE_ID,
      lobbyId: pending.lobbyId,
      playerId,
    });
    await maybeFinalizeReservation(pending.lobbyId);
    return { ok: true, status: "accepted" };
  }

  async function createReservedMatch(entry1, entry2) {
    const host = entry1;
    const guest = entry2;

    await removeQueueEntry(host.playerId, "matched", false);
    await removeQueueEntry(guest.playerId, "matched", false);
    broadcastQueueSize();

    const lobby = reservePrivateLobby(host.playerId, {
      name: "Quick Constructed",
      plannedMatchType: "constructed",
      matchmakingRequiresAcceptance: true,
    });

    addLobbyInvite(lobby.id, host.playerId);
    addLobbyInvite(lobby.id, guest.playerId);

    const hostPlayer = await ensurePlayerCached(host.playerId);
    const guestPlayer = await ensurePlayerCached(guest.playerId);
    const confirmExpiresAt = Date.now() + MATCH_CONFIRM_WINDOW_MS;

    upsertReservation({
      lobbyId: lobby.id,
      hostPlayerId: host.playerId,
      guestPlayerId: guest.playerId,
      hostEntry: serializeEntry(host),
      guestEntry: serializeEntry(guest),
      createdAt: Date.now(),
      expiresAt: confirmExpiresAt,
      acceptedPlayerIds: [],
      status: "confirming",
    });

    setPendingMatch(host.playerId, {
      lobbyId: lobby.id,
      opponentPlayerId: guest.playerId,
      opponentPlayerName: guestPlayer?.displayName || null,
      matchType: "constructed",
      isHost: true,
      status: "confirming",
      confirmExpiresAt,
      youAccepted: false,
    });
    setPendingMatch(guest.playerId, {
      lobbyId: lobby.id,
      opponentPlayerId: host.playerId,
      opponentPlayerName: hostPlayer?.displayName || null,
      matchType: "constructed",
      isHost: false,
      status: "confirming",
      confirmExpiresAt,
      youAccepted: false,
    });

    await publishControlMessage({
      type: "reservation_created",
      instanceId: INSTANCE_ID,
      reservation: serializeReservation(reservations.get(lobby.id)),
      matches: [
        {
          playerId: host.playerId,
          ...serializePendingMatch(getPendingMatch(host.playerId)),
        },
        {
          playerId: guest.playerId,
          ...serializePendingMatch(getPendingMatch(guest.playerId)),
        },
      ],
    });

    if (host.socketId) {
      sendStatusUpdate(host.playerId, host.socketId, "confirming", {
        matchedPlayerId: guest.playerId,
        matchedPlayerName: guestPlayer?.displayName || undefined,
        matchType: "constructed",
        isHost: true,
        lobbyId: lobby.id,
        confirmExpiresAt,
        youAccepted: false,
      });
    }

    if (guest.socketId) {
      sendStatusUpdate(guest.playerId, guest.socketId, "confirming", {
        matchedPlayerId: host.playerId,
        matchedPlayerName: hostPlayer?.displayName || undefined,
        matchType: "constructed",
        isHost: false,
        lobbyId: lobby.id,
        confirmExpiresAt,
        youAccepted: false,
      });
    }

    console.log(
      `[Matchmaking] Reserved constructed match ${lobby.id}: ${host.playerId.slice(-6)} vs ${guest.playerId.slice(-6)}`,
    );
  }

  async function checkForMatches() {
    const leader = await getOrClaimLobbyLeader();
    if (leader !== INSTANCE_ID) {
      return;
    }

    await expireReservations();

    const entries = sortedQueueEntries();

    for (const entry of entries) {
      const lobby = findMatchingLobby();
      if (lobby) {
        await joinExistingLobby(entry, lobby);
        return;
      }
    }

    if (entries.length < 2) return;
    await createReservedMatch(entries[0], entries[1]);
  }

  async function joinExternalQueue(playerId, options = {}) {
    const existingPending = getPendingMatch(playerId);
    if (existingPending) {
      return {
        status: "matched",
        queueSize: queue.size,
        pendingMatch: existingPending,
      };
    }

    const existingPosition = getQueuePosition(playerId);
    if (existingPosition !== null) {
      return {
        status: "already_in_queue",
        position: existingPosition,
        queueSize: queue.size,
        pendingMatch: getPendingMatch(playerId),
      };
    }

    const wasEmpty = queue.size === 0;
    await joinQueue(playerId, null, {
      source: "discord",
      discordId: options.discordId ?? null,
      guildId: options.guildId ?? null,
      channelId: options.channelId ?? null,
    });

    const pendingMatch = getPendingMatch(playerId);
    if (pendingMatch) {
      return {
        status: "matched",
        queueSize: queue.size,
        pendingMatch,
      };
    }

    return {
      status: "queued",
      position: getQueuePosition(playerId) || 1,
      queueSize: queue.size,
      wasEmpty,
      pendingMatch: null,
    };
  }

  function getStatus(playerId, guildId) {
    const normalizedGuildId = typeof guildId === "string" ? guildId : null;
    return {
      queueSize: queue.size,
      guildQueueSize: normalizedGuildId
        ? getGuildQueueSize(normalizedGuildId)
        : 0,
      queueBySource: getQueueBySource(),
      position: getQueuePosition(playerId),
      pendingMatch: getPendingMatch(playerId),
    };
  }

  async function handleMatchmakingControl(msg) {
    if (msg.instanceId === INSTANCE_ID) return;

    if (msg.type === "join" && msg.entry) {
      const entry = msg.entry;
      queue.set(entry.playerId, {
        playerId: entry.playerId,
        socketId: typeof entry.socketId === "string" ? entry.socketId : null,
        joinedAt: entry.joinedAt,
        source: entry.source === "discord" ? "discord" : "web",
        discordId: entry.discordId ?? null,
        guildId: entry.guildId ?? null,
        channelId: entry.channelId ?? null,
      });
    }

    if (msg.type === "leave" && msg.playerId) {
      queue.delete(msg.playerId);
      pendingMatches.delete(msg.playerId);
    }

    if (msg.type === "matched" && Array.isArray(msg.matches)) {
      for (const match of msg.matches) {
        if (!match?.playerId) continue;
        queue.delete(match.playerId);
        setPendingMatch(match.playerId, {
          lobbyId: match.lobbyId,
          opponentPlayerId: match.opponentPlayerId,
          opponentPlayerName: match.opponentPlayerName ?? null,
          matchType: "constructed",
          isHost: !!match.isHost,
          createdAt: match.createdAt || Date.now(),
          status: match.status === "ready" ? "ready" : "confirming",
          confirmExpiresAt: match.confirmExpiresAt ?? null,
          youAccepted: match.youAccepted === true,
        });
      }
    }

    if (msg.type === "reservation_created" && msg.reservation) {
      upsertReservation(msg.reservation);
      if (Array.isArray(msg.matches)) {
        for (const match of msg.matches) {
          if (!match?.playerId) continue;
          queue.delete(match.playerId);
          setPendingMatch(match.playerId, {
            lobbyId: match.lobbyId,
            opponentPlayerId: match.opponentPlayerId,
            opponentPlayerName: match.opponentPlayerName ?? null,
            matchType: "constructed",
            isHost: !!match.isHost,
            createdAt: match.createdAt || Date.now(),
            status: match.status === "ready" ? "ready" : "confirming",
            confirmExpiresAt: match.confirmExpiresAt ?? null,
            youAccepted: match.youAccepted === true,
          });
        }
      }
    }

    if (msg.type === "reservation_accepted" && msg.lobbyId && msg.playerId) {
      const reservation = reservations.get(msg.lobbyId);
      if (reservation) {
        reservation.acceptedPlayerIds.add(msg.playerId);
      }
      const pending = getPendingMatch(msg.playerId);
      if (pending) {
        setPendingMatch(msg.playerId, {
          ...pending,
          youAccepted: true,
          status: "confirming",
          confirmExpiresAt: reservation?.expiresAt ?? pending.confirmExpiresAt,
        });
      }
      await maybeFinalizeReservation(msg.lobbyId);
    }

    if (
      msg.type === "reservation_cancel_request" &&
      msg.lobbyId &&
      msg.playerId
    ) {
      await cancelReservationAsLeader(msg.lobbyId, {
        reason: msg.reason === "declined" ? "declined" : "cancelled",
        actorPlayerId: msg.playerId,
      });
    }

    if (
      msg.type === "reservation_ready" &&
      msg.lobbyId &&
      Array.isArray(msg.matches)
    ) {
      reservations.delete(msg.lobbyId);
      for (const match of msg.matches) {
        if (!match?.playerId) continue;
        setPendingMatch(match.playerId, {
          lobbyId: match.lobbyId,
          opponentPlayerId: match.opponentPlayerId,
          opponentPlayerName: match.opponentPlayerName ?? null,
          matchType: "constructed",
          isHost: !!match.isHost,
          createdAt: match.createdAt || Date.now(),
          status: "ready",
          confirmExpiresAt: null,
          youAccepted: true,
        });
        const player = await ensurePlayerCached(match.playerId);
        const socketId = player?.socketId || null;
        if (!socketId) continue;
        sendPendingStatusToSocket(
          match.playerId,
          socketId,
          getPendingMatch(match.playerId),
        );
        if (!player?.lobbyId && !player?.matchId) {
          await joinReadyMatchmakingLobby(
            match.playerId,
            socketId,
            getPendingMatch(match.playerId),
          );
        }
      }
    }

    if (msg.type === "reservation_cancelled" && Array.isArray(msg.playerIds)) {
      reservations.delete(msg.lobbyId);
      const requeuePlayerIds = new Set(
        Array.isArray(msg.requeuePlayerIds) ? msg.requeuePlayerIds : [],
      );
      for (const playerId of msg.playerIds) {
        clearPendingMatch(playerId);
        if (requeuePlayerIds.has(playerId)) continue;
        const player = await ensurePlayerCached(playerId);
        const socketId = player?.socketId || null;
        if (socketId) {
          sendStatusUpdate(playerId, socketId, "idle");
        }
      }
    }

    if (msg.type === "player_socket" && msg.playerId) {
      const nextSocketId =
        typeof msg.socketId === "string" && msg.socketId ? msg.socketId : null;
      const queued = queue.get(msg.playerId);
      if (queued) {
        queued.socketId = nextSocketId;
      }
      const player = await ensurePlayerCached(msg.playerId);
      if (player) {
        player.socketId = nextSocketId;
      }
      updateReservationSocket(msg.playerId, nextSocketId);
    }

    broadcastQueueSize();
    checkForMatches().catch(() => {});
  }

  function handleDisconnect(playerId) {
    if (queue.has(playerId)) {
      leaveQueue(playerId, "disconnected").catch(() => {});
    }
  }

  async function handlePlayerHello(playerId, socketId) {
    const queued = queue.get(playerId);
    if (queued) {
      queued.socketId = socketId;
      await publishControlMessage({
        type: "player_socket",
        instanceId: INSTANCE_ID,
        playerId,
        socketId,
      });
      sendStatusUpdate(playerId, socketId, "searching");
      return;
    }

    const pending = getPendingMatch(playerId);
    if (!pending) return;

    const player = await ensurePlayerCached(playerId);
    if (player) {
      player.socketId = socketId;
    }
    updateReservationSocket(playerId, socketId);
    await publishControlMessage({
      type: "player_socket",
      instanceId: INSTANCE_ID,
      playerId,
      socketId,
    });
    sendPendingStatusToSocket(playerId, socketId, pending);
    if (pending.status === "ready" && !player?.lobbyId && !player?.matchId) {
      await joinReadyMatchmakingLobby(playerId, socketId, pending);
    }
  }

  function getQueueStats() {
    const queueBySource = getQueueBySource();
    return {
      totalInQueue: queue.size,
      byType: {
        constructed: queue.size,
      },
      bySource: queueBySource,
    };
  }

  function registerSocketHandlers({ socket, isAuthed, getPlayerBySocket }) {
    socket.on("joinMatchmaking", async (payload = {}) => {
      if (!isAuthed()) return;
      const player = getPlayerBySocket(socket);
      if (!player) return;

      const requested = payload?.preferences?.matchTypes;
      const requestedConstructed =
        Array.isArray(requested) && requested.includes("constructed");
      if (!requestedConstructed) {
        socket.emit("error", {
          message: "Only constructed matchmaking is currently supported",
          code: "invalid_preferences",
        });
        return;
      }

      if (player.lobbyId || player.matchId) {
        socket.emit("error", {
          message:
            "Cannot search for match while in a lobby or match. Leave first.",
          code: "already_in_game",
        });
        return;
      }

      const pending = getPendingMatch(player.id);
      if (pending) {
        await emitPendingStatus(player.id);
        return;
      }

      await joinQueue(player.id, socket.id, { source: "web" });
    });

    socket.on("leaveMatchmaking", async () => {
      if (!isAuthed()) return;
      const player = getPlayerBySocket(socket);
      if (!player) return;
      const pending = getPendingMatch(player.id);
      if (pending && pending.status === "confirming") {
        await respondToMatchmaking(player.id, "decline");
        return;
      }
      await leaveQueue(player.id, "user_cancelled");
    });

    socket.on("respondMatchmaking", async (payload = {}) => {
      if (!isAuthed()) return;
      const player = getPlayerBySocket(socket);
      if (!player) return;
      const decision = payload?.decision === "decline" ? "decline" : "accept";
      await respondToMatchmaking(player.id, decision);
    });
  }

  function startMatchChecking() {
    if (matchCheckTimer) return;
    matchCheckTimer = setInterval(() => {
      checkForMatches().catch(() => {});
    }, MATCH_CHECK_INTERVAL);
  }

  function stopMatchChecking() {
    if (!matchCheckTimer) return;
    clearInterval(matchCheckTimer);
    matchCheckTimer = null;
  }

  startMatchChecking();

  return {
    queue,
    pendingMatches,
    reservations,
    joinQueue,
    joinExternalQueue,
    leaveQueue,
    respondToMatchmaking,
    getStatus,
    getGuildQueueSize,
    getPlayerPosition: getQueuePosition,
    getPendingMatch,
    checkForMatches,
    handleMatchmakingControl,
    handlePlayerHello,
    handleDisconnect,
    getQueueStats,
    registerSocketHandlers,
    startMatchChecking,
    stopMatchChecking,
  };
}

module.exports = { createMatchmakingFeature };
