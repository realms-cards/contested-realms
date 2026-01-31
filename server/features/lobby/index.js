// Lobby feature module: encapsulates lobby state, helpers, and socket handlers.

/**
 * @param {object} deps
 * @param {import('socket.io').Server} deps.io
 * @param {import('ioredis')} [deps.storeRedis]
 * @param {string} deps.instanceId
 * @param {(prefix: string) => string} deps.rid
 * @param {(playerId: string) => Promise<any>} deps.ensurePlayerCached
 * @param {Map<string, any>} deps.players
 * @param {Map<string, any>} deps.matches
 * @param {(playerId: string) => { id: string, displayName: string } | null} deps.getPlayerInfo
 * @param {(match: any) => any} deps.getMatchInfo
 * @param {(lobby: any) => boolean} deps.lobbyHasHumanPlayers
 * @param {Function} deps.createRngFromString
 * @param {Function} deps.generateBoosterDeterministic
 * @param {(match: any) => void} deps.startMatchRecording
 * @param {(match: any) => Promise<void>} deps.persistMatchCreated
 * @param {(matchId: string, match: any) => Promise<void>} deps.hydrateMatchFromDatabase
 * @param {string} deps.lobbyControlChannel
 * @param {string} deps.lobbyStateChannel
 * @param {boolean} deps.cpuBotsEnabled
 * @param {() => any} deps.loadBotClientCtor
 * @param {number} deps.port
 * @param {(id: string) => boolean} deps.isCpuPlayerId
 * @param {import('../../core/redis-state').RedisStateManager} [deps.redisState] - Redis state manager for horizontal scaling
 * @param {{ migrateToMatch: (lobbyId: string, matchId: string, playerIds: string[]) => void }} [deps.rtcMigration] - RTC migration helper for voice persistence
 */
function createLobbyFeature(deps) {
  const io = deps.io;
  const storeRedis = deps.storeRedis || null;
  const INSTANCE_ID = deps.instanceId;
  const redisState = deps.redisState || null;
  const rid = deps.rid;
  const ensurePlayerCached = deps.ensurePlayerCached;
  const players = deps.players;
  const matches = deps.matches;
  const getPlayerInfo = deps.getPlayerInfo;
  const getMatchInfo = deps.getMatchInfo;
  const lobbyHasHumanPlayers = deps.lobbyHasHumanPlayers;
  const createRngFromString = deps.createRngFromString;
  const generateBoosterDeterministic = deps.generateBoosterDeterministic;
  const startMatchRecording = deps.startMatchRecording;
  const persistMatchCreated = deps.persistMatchCreated;
  const _hydrateMatchFromDatabase = deps.hydrateMatchFromDatabase;
  const LOBBY_CONTROL_CHANNEL = deps.lobbyControlChannel;
  const LOBBY_STATE_CHANNEL = deps.lobbyStateChannel;
  const CPU_BOTS_ENABLED = !!deps.cpuBotsEnabled;
  const loadBotClientCtor = deps.loadBotClientCtor;
  const loadBotCardIdMapFn = deps.loadBotCardIdMapFn || null;
  const prisma = deps.prisma || null;
  const PORT = deps.port;
  const isCpuPlayerId = deps.isCpuPlayerId;
  const rtcMigration = deps.rtcMigration || null;

  // Cache: card ID map loaded once for all bots
  let _botCardIdMapLoaded = false;

  /** @type {Map<string, { id: string, name: string|null, hostId: string|null, playerIds: Set<string>, status: string, maxPlayers: number, ready: Set<string>, visibility: 'open'|'private', plannedMatchType?: string|null, lastActive: number }>} */
  const lobbies = new Map();
  /** @type {Map<string, Set<string>>} lobbyId -> invited playerIds */
  const lobbyInvites = new Map();

  /** @type {import('../../botManager').BotManager|null} */
  let botManager = null;

  function setBotManager(manager) {
    botManager = manager || null;
  }

  /**
   * Persist full lobby state to Redis for cross-instance visibility
   * @param {object} lobby - The lobby object to persist
   */
  async function persistLobbyToRedis(lobby) {
    if (!redisState || !redisState.isEnabled()) return;
    try {
      await redisState.setFullLobbyState(lobby.id, {
        id: lobby.id,
        name: lobby.name ?? null,
        hostId: lobby.hostId ?? null,
        status: lobby.status,
        maxPlayers: lobby.maxPlayers,
        visibility: lobby.visibility ?? "open",
        plannedMatchType: lobby.plannedMatchType ?? null,
        isMatchmakingLobby: lobby.isMatchmakingLobby || false,
        soatcLeagueMatch: lobby.soatcLeagueMatch ?? null,
        matchId: lobby.matchId ?? null,
        lastActive: lobby.lastActive || Date.now(),
        createdAt: lobby.createdAt || lobby.lastActive || Date.now(),
        allowSpectators: lobby.allowSpectators || false,
        hostReady: lobby.hostReady !== false,
        playerIds: Array.from(lobby.playerIds || []),
        ready: Array.from(lobby.ready || []),
      });
    } catch (err) {
      console.error(
        `[lobby] Failed to persist lobby ${lobby.id} to Redis:`,
        err
      );
    }
  }

  /**
   * Delete lobby state from Redis
   * @param {string} lobbyId - The lobby ID to delete
   */
  async function deleteLobbyFromRedis(lobbyId) {
    if (!redisState || !redisState.isEnabled()) return;
    try {
      await redisState.deleteLobbyState(lobbyId);
    } catch (err) {
      console.error(
        `[lobby] Failed to delete lobby ${lobbyId} from Redis:`,
        err
      );
    }
  }

  async function getOrClaimLobbyLeader() {
    try {
      if (!storeRedis) return INSTANCE_ID;
      const key = "lobby:leader";
      const current = await storeRedis.get(key);
      if (current) {
        if (current === INSTANCE_ID) {
          try {
            await storeRedis.expire(key, 30);
          } catch {}
        }
        return current;
      }
      const setRes = await storeRedis.set(key, INSTANCE_ID, "NX", "EX", 30);
      if (setRes) return INSTANCE_ID;
      return await storeRedis.get(key);
    } catch {
      return INSTANCE_ID;
    }
  }

  function serializeLobby(lobby) {
    return {
      id: lobby.id,
      name: lobby.name,
      hostId: lobby.hostId,
      status: lobby.status,
      maxPlayers: lobby.maxPlayers,
      visibility: lobby.visibility,
      plannedMatchType: lobby.plannedMatchType,
      isMatchmakingLobby: lobby.isMatchmakingLobby || false,
      soatcLeagueMatch: lobby.soatcLeagueMatch || null,
      lastActive: lobby.lastActive,
      playerIds: Array.from(lobby.playerIds || []),
      ready: Array.from(lobby.ready || []),
    };
  }

  function upsertLobbyFromSerialized(obj) {
    const lb = lobbies.get(obj.id) || {
      id: obj.id,
      name: null,
      soatcLeagueMatch: null,
      hostId: null,
      playerIds: new Set(),
      status: "open",
      maxPlayers: 2,
      ready: new Set(),
      visibility: "open",
      plannedMatchType: "constructed",
      isMatchmakingLobby: false,
      lastActive: Date.now(),
    };
    lb.name = obj.name;
    lb.hostId = obj.hostId;
    lb.status = obj.status;
    lb.maxPlayers = obj.maxPlayers;
    lb.visibility = obj.visibility;
    lb.plannedMatchType = obj.plannedMatchType;
    lb.isMatchmakingLobby = obj.isMatchmakingLobby || false;
    lb.soatcLeagueMatch = obj.soatcLeagueMatch || null;
    lb.lastActive = obj.lastActive || Date.now();
    lb.playerIds = new Set(Array.isArray(obj.playerIds) ? obj.playerIds : []);
    lb.ready = new Set(Array.isArray(obj.ready) ? obj.ready : []);
    lobbies.set(lb.id, lb);
  }

  async function publishLobbyState(lobby) {
    try {
      // Persist to Redis for cross-instance state
      await persistLobbyToRedis(lobby);
      // Also publish for real-time sync
      if (storeRedis)
        await storeRedis.publish(
          LOBBY_STATE_CHANNEL,
          JSON.stringify({ type: "upsert", lobby: serializeLobby(lobby) })
        );
    } catch {}
  }

  async function publishLobbyDelete(lobbyId) {
    try {
      // Delete from Redis state
      await deleteLobbyFromRedis(lobbyId);
      // Also publish for real-time sync
      if (storeRedis)
        await storeRedis.publish(
          LOBBY_STATE_CHANNEL,
          JSON.stringify({ type: "delete", id: lobbyId })
        );
    } catch {}
  }

  function getLobbyInfo(lobby) {
    // Look up match status if match exists
    let matchStatus = null;
    if (lobby.matchId) {
      const match = matches.get(lobby.matchId);
      if (match && typeof match.status === "string") {
        matchStatus = match.status;
      }
    }
    return {
      id: lobby.id,
      name: lobby.name,
      hostId: lobby.hostId,
      players: Array.from(lobby.playerIds).map(getPlayerInfo).filter(Boolean),
      status: lobby.status,
      maxPlayers: lobby.maxPlayers,
      visibility: lobby.visibility,
      readyPlayerIds: Array.from(lobby.ready),
      plannedMatchType: lobby.plannedMatchType,
      matchId: lobby.matchId || null,
      matchStatus, // 'waiting' | 'in_progress' | 'ended' | null
      startedAt: lobby.createdAt || lobby.lastActive || null,
      soatcLeagueMatch: lobby.soatcLeagueMatch || null,
      allowSpectators: lobby.allowSpectators || false,
      hostReady: lobby.hostReady !== false, // Default to true for backward compatibility
    };
  }

  function normalizeSealedConfig(config) {
    if (!config || typeof config !== "object") return null;
    return {
      packCount: Math.max(1, Number(config.packCount) || 6),
      setMix:
        Array.isArray(config.setMix) && config.setMix.length > 0
          ? config.setMix
          : null,
      timeLimit: Math.max(10, Number(config.timeLimit) || 40),
      packCounts:
        config.packCounts && typeof config.packCounts === "object"
          ? config.packCounts
          : null,
      replaceAvatars: !!config.replaceAvatars,
    };
  }

  function normalizeDraftConfig(config) {
    if (!config || typeof config !== "object") return null;
    const asObj = config;
    const packConfiguration = Array.isArray(asObj.packConfiguration)
      ? asObj.packConfiguration
          .map((entry) => {
            if (!entry || typeof entry !== "object") return null;
            const setId =
              typeof entry.setId === "string"
                ? entry.setId
                : String(entry.setId || "").trim();
            const packCount = Number(entry.packCount);
            if (!setId) return null;
            return {
              setId,
              packCount:
                Number.isFinite(packCount) && packCount > 0
                  ? Math.floor(packCount)
                  : 0,
            };
          })
          .filter((entry) => entry !== null)
      : null;

    const packCounts = {};
    if (packConfiguration && packConfiguration.length > 0) {
      for (const entry of packConfiguration) {
        if (!entry) continue;
        packCounts[entry.setId] =
          (packCounts[entry.setId] || 0) + entry.packCount;
      }
    }
    if (asObj.packCounts && typeof asObj.packCounts === "object") {
      for (const [setIdRaw, countRaw] of Object.entries(asObj.packCounts)) {
        const setId = String(setIdRaw || "").trim();
        const count = Number(countRaw);
        if (!setId) continue;
        packCounts[setId] =
          (packCounts[setId] || 0) +
          (Number.isFinite(count) && count > 0 ? Math.floor(count) : 0);
      }
    }

    let setMix = Array.isArray(asObj.setMix)
      ? asObj.setMix.map((setId) => String(setId || "").trim()).filter(Boolean)
      : [];
    if (setMix.length === 0) {
      setMix = Object.keys(packCounts);
    }
    if (setMix.length === 0 && packConfiguration && packConfiguration.length) {
      setMix = packConfiguration.map((entry) => entry.setId).filter(Boolean);
    }
    if (setMix.length === 0) {
      setMix = ["Beta"];
    }

    const packCountSum = Object.values(packCounts).reduce(
      (sum, value) => sum + (Number.isFinite(value) ? Number(value) : 0),
      0
    );
    const packCount =
      packCountSum > 0
        ? packCountSum
        : Number.isFinite(Number(asObj.packCount)) &&
          Number(asObj.packCount) > 0
        ? Math.floor(Number(asObj.packCount))
        : setMix.length;

    const packSize =
      Number.isFinite(Number(asObj.packSize)) && Number(asObj.packSize) > 0
        ? Math.floor(Number(asObj.packSize))
        : 15;

    // Preserve cube metadata when present so clients can detect cube drafts
    // correctly even after reload.
    const cubeId =
      typeof asObj.cubeId === "string" && asObj.cubeId
        ? String(asObj.cubeId)
        : null;
    const cubeName =
      typeof asObj.cubeName === "string" && asObj.cubeName
        ? String(asObj.cubeName)
        : null;

    const normalized = {
      setMix,
      packCount,
      packSize,
    };

    if (cubeId) normalized.cubeId = cubeId;
    if (cubeName) normalized.cubeName = cubeName;
    if (asObj.includeCubeSideboardInStandard === true) {
      normalized.includeCubeSideboardInStandard = true;
    }

    if (Object.keys(packCounts).length > 0) {
      normalized.packCounts = packCounts;
    }
    if (packConfiguration && packConfiguration.length > 0) {
      normalized.packConfiguration = packConfiguration;
    }

    if (Number.isFinite(Number(asObj.timePerPick))) {
      normalized.timePerPick = Number(asObj.timePerPick);
    }
    if (Number.isFinite(Number(asObj.deckBuildingTime))) {
      normalized.deckBuildingTime = Number(asObj.deckBuildingTime);
    }

    const pickCount =
      Number.isFinite(Number(asObj.pickCount)) && Number(asObj.pickCount) > 0
        ? Math.floor(Number(asObj.pickCount))
        : 15;
    normalized.pickCount = pickCount;

    normalized.timer = Math.max(10, Number(asObj.timer) || 75);
    normalized.format =
      typeof asObj.format === "string" ? asObj.format : "standard_2player";
    normalized.cardSource = Array.isArray(asObj.cardSource)
      ? asObj.cardSource.slice(0, 8)
      : [];

    return normalized;
  }

  function findOpenLobby() {
    for (const lobby of lobbies.values()) {
      if (
        lobby.status === "open" &&
        lobby.visibility === "open" &&
        lobby.playerIds.size < lobby.maxPlayers
      )
        return lobby;
    }
    return null;
  }

  function createLobby(hostId, opts = {}) {
    const vis = ["private", "tournament"].includes(opts.visibility)
      ? opts.visibility
      : "open";
    const maxPlayers = Number.isInteger(opts.maxPlayers)
      ? Math.max(2, Math.min(8, opts.maxPlayers))
      : 2;
    const name =
      opts.name && typeof opts.name === "string"
        ? opts.name.trim().slice(0, 50)
        : null;
    const now = Date.now();
    const lobby = {
      id: rid("lobby"),
      name,
      hostId,
      playerIds: new Set(),
      status: "open",
      maxPlayers,
      ready: new Set(),
      visibility: vis,
      plannedMatchType: "constructed",
      createdAt: now,
      lastActive: now,
      allowSpectators: vis === "tournament" || opts.allowSpectators === true,
      // All lobbies start in setup mode - host must "open" before others can join
      hostReady: false,
    };
    lobbies.set(lobby.id, lobby);
    // Persist to Redis for cross-instance visibility (fire and forget)
    persistLobbyToRedis(lobby).catch(() => {});
    return lobby;
  }

  function markLobbyActive(lobby) {
    lobby.lastActive = Date.now();
    // Update Redis activity timestamp (fire and forget)
    if (redisState && redisState.isEnabled()) {
      redisState.updateLobbyActivity(lobby.id).catch(() => {});
    }
  }

  function _joinLobby(socket, player, suppliedLobbyId) {
    if (player.lobbyId) leaveLobby(socket, player);

    let lobby = null;
    if (suppliedLobbyId && lobbies.has(suppliedLobbyId)) {
      lobby = lobbies.get(suppliedLobbyId);
    } else {
      lobby = findOpenLobby() || createLobby(player.id);
    }
    if (!lobby) lobby = createLobby(player.id);

    if (lobby.status !== "open") {
      socket.emit("error", {
        message: "Lobby is not open",
        code: "lobby_not_open",
      });
      return;
    }
    if (lobby.playerIds.size >= lobby.maxPlayers) {
      socket.emit("error", { message: "Lobby is full", code: "lobby_full" });
      return;
    }
    // Private and tournament lobbies require explicit invite link (not matchmaking)
    if (
      (lobby.visibility === "private" || lobby.visibility === "tournament") &&
      !suppliedLobbyId
    ) {
      socket.emit("error", {
        message:
          lobby.visibility === "tournament"
            ? "Tournament lobbies require an invite link."
            : "Private lobbies require an invite link.",
        code:
          lobby.visibility === "tournament"
            ? "tournament_invite_required"
            : "private_invite_required",
      });
      return;
    }
    // Tournament lobbies: non-host players can only join after host has opened the lobby
    if (
      lobby.visibility === "tournament" &&
      lobby.hostId !== player.id &&
      !lobby.hostReady
    ) {
      socket.emit("error", {
        message: "The host is still setting up the match. Please wait.",
        code: "host_not_ready",
      });
      return;
    }
    if (
      suppliedLobbyId &&
      (lobby.visibility === "private" || lobby.visibility === "tournament")
    ) {
      const allowed =
        lobby.hostId === player.id ||
        (lobbyInvites.get(lobby.id)?.has(player.id) ?? false);
      if (!allowed) {
        socket.emit("error", {
          message:
            lobby.visibility === "tournament"
              ? "This is a tournament match. You need an invite link."
              : "Lobby is private. You need an invite.",
          code:
            lobby.visibility === "tournament"
              ? "tournament_lobby"
              : "private_lobby",
        });
        try {
          console.info(
            `[invite] denied (not_invited) inviter=${String(lobby.hostId).slice(
              -6
            )} target=${String(player.id).slice(-6)} lobby=${lobby.id}`
          );
        } catch {}
        return;
      }
    }

    lobby.playerIds.add(player.id);
    lobby.ready.add(player.id);
    player.lobbyId = lobby.id;
    socket.join(`lobby:${lobby.id}`);

    markLobbyActive(lobby);

    if (!lobby.hostId) lobby.hostId = player.id;

    const info = getLobbyInfo(lobby);
    socket.emit("joinedLobby", { lobby: info });
    io.to(`lobby:${lobby.id}`).emit("lobbyUpdated", { lobby: info });
    broadcastLobbies();
    const inv = lobbyInvites.get(lobby.id);
    if (inv) inv.delete(player.id);
  }

  function leaveLobby(socket, player) {
    const lobbyId = player.lobbyId;
    if (!lobbyId) return;
    const lobby = lobbies.get(lobbyId);
    if (!lobby) return;

    lobby.playerIds.delete(player.id);
    lobby.ready.delete(player.id);
    socket.leave(`lobby:${lobbyId}`);
    player.lobbyId = null;

    markLobbyActive(lobby);

    if (lobby.playerIds.size === 0) {
      lobby.status = "closed";
      if (botManager) {
        try {
          botManager.cleanupBotsForLobby(lobbyId);
        } catch {}
      }
      lobbies.delete(lobbyId);
      try {
        publishLobbyDelete(lobbyId);
      } catch {}
    } else if (!lobbyHasHumanPlayers(lobby)) {
      lobby.status = "closed";
      if (botManager) {
        try {
          botManager.cleanupBotsForLobby(lobbyId);
        } catch {}
      }
      lobbies.delete(lobbyId);
      try {
        publishLobbyDelete(lobbyId);
      } catch {}
      broadcastLobbies();
    } else if (lobby.hostId === player.id) {
      lobby.status = "closed";
      if (botManager) {
        try {
          botManager.cleanupBotsForLobby(lobbyId);
        } catch {}
      }
      lobbies.delete(lobbyId);
      try {
        publishLobbyDelete(lobbyId);
      } catch {}
      broadcastLobbies();
      return;
    }

    if (lobbies.has(lobbyId)) {
      io.to(`lobby:${lobbyId}`).emit("lobbyUpdated", {
        lobby: getLobbyInfo(lobby),
      });
      try {
        publishLobbyState(lobby);
      } catch {}
    }
    broadcastLobbies();
  }

  async function startMatchFromLobby(
    requestingPlayer,
    matchType = "constructed",
    sealedConfig = null,
    draftConfig = null,
    soatcLeagueMatch = null
  ) {
    console.log(
      `[Match] Starting match requested by ${requestingPlayer?.displayName}, type: ${matchType}`
    );
    const lobbyId = requestingPlayer.lobbyId;
    if (!lobbyId) return { ok: false, error: "Not in a lobby" };
    const lobby = lobbies.get(lobbyId);
    if (!lobby) return { ok: false, error: "Lobby not found" };
    if (lobby.hostId !== requestingPlayer.id)
      return { ok: false, error: "Only host can start" };
    if (lobby.playerIds.size < 2)
      return { ok: false, error: "Need at least 2 players" };
    for (const pid of lobby.playerIds) {
      if (!lobby.ready.has(pid))
        return { ok: false, error: "All players must be ready" };
    }

    const match = {
      id: rid("match"),
      lobbyId: lobby.id,
      lobbyName: lobby.name || null,
      playerIds: Array.from(lobby.playerIds),
      status:
        matchType === "sealed"
          ? "deck_construction"
          : matchType === "draft"
          ? "waiting"
          : "waiting",
      seed: `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
      turn: Array.from(lobby.playerIds)[0],
      winnerId: null,
      matchType,
      sealedConfig:
        matchType === "sealed"
          ? {
              ...sealedConfig,
              constructionStartTime: Date.now(),
            }
          : null,
      draftConfig: matchType === "draft" ? draftConfig : null,
      soatcLeagueMatch: soatcLeagueMatch || null,
      playerDecks:
        matchType === "sealed" || matchType === "draft" ? new Map() : null,
      draftState: null,
      game: {
        phase: "Setup",
        mulligans: { p1: 1, p2: 1 },
        d20Rolls: { p1: null, p2: null },
        setupWinner: null,
      },
      lastTs: 0,
      interactionRequests: new Map(),
      interactionGrants: new Map(),
    };
    if (matchType === "draft") {
      match.draftState = {
        phase: "waiting",
        packIndex: 0,
        pickNumber: 1,
        currentPacks: null,
        picks: match.playerIds.map(() => []),
        playerReady: { p1: false, p2: false },
        packDirection: "left",
        packChoice: match.playerIds.map(() => null),
        waitingFor: [],
      };
    }

    matches.set(match.id, match);
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

    startMatchRecording(match);

    for (const pid of match.playerIds) {
      const p = players.get(pid);
      if (!p) continue;
      const room = `match:${match.id}`;
      const sid = p.socketId || null;
      if (sid) {
        try {
          await io.in(sid).socketsJoin(room);
        } catch {}
      }
      p.matchId = match.id;
    }

    // NOTE: For lobby-based matches, we do NOT migrate RTC participants.
    // The client's voice scope stays as lobby.id (since lobby is still set),
    // so voice continues working in the lobby room throughout draft/construction/match.
    // RTC migration is only needed for matches created without a lobby (e.g., tournaments).

    try {
      const basicInfo = getMatchInfo(match);
      io.to(`lobby:${lobby.id}`).emit("matchStarted", { match: basicInfo });
    } catch {}

    try {
      const lb = lobbies.get(lobby.id);
      if (lb) lb.plannedMatchType = matchType;
    } catch {}
    try {
      lobby.status = "started";
      lobby.matchId = match.id;
    } catch {}
    io.to(`lobby:${lobby.id}`).emit("lobbyUpdated", {
      lobby: getLobbyInfo(lobby),
    });
    broadcastLobbies();

    if (matchType === "sealed" && match.sealedConfig) {
      try {
        const sealedPacks = {};
        for (const pid of match.playerIds) {
          const rng = createRngFromString(`${match.seed}|${pid}|sealed`);
          const sc = match.sealedConfig || {};
          const _packCount = Math.max(1, Number(sc.packCount) || 6);
          const _setMix =
            Array.isArray(sc.setMix) && sc.setMix.length > 0
              ? sc.setMix
              : ["Alpha"];
          const packCounts =
            sc.packCounts && typeof sc.packCounts === "object"
              ? sc.packCounts
              : null;
          const replaceAvatars = !!sc.replaceAvatars;
          const freeAvatars = !!sc.freeAvatars;

          const sets = [];
          if (packCounts) {
            for (const [setName, cnt] of Object.entries(packCounts)) {
              const c = Math.max(0, Number(cnt) || 0);
              for (let i = 0; i < c; i++) sets.push(setName);
            }
            for (let i = sets.length - 1; i > 0; i--) {
              const j = Math.floor(rng() * (i + 1));
              [sets[i], sets[j]] = [sets[j], sets[i]];
            }
          } else {
            console.error(
              `[Sealed] packCounts not provided for player ${pid} in match ${match.id}`
            );
            continue;
          }

          const packs = [];
          for (let i = 0; i < sets.length; i++) {
            const setName = sets[i];
            const picks = await generateBoosterDeterministic(
              setName,
              rng,
              replaceAvatars,
              freeAvatars
            );
            const cards = picks.map((p, idx) => ({
              id: `${String(p.variantId)}_${i}_${idx}_${pid.slice(-4)}`,
              name: p.cardName || "",
              set: setName,
              slug: String(p.slug || ""),
              type: p.type ?? null,
              cost: p.cost ?? null,
              rarity: String(p.rarity || "Ordinary"),
              cardId: typeof p.cardId === "number" ? p.cardId : undefined,
              variantId:
                typeof p.variantId === "number" ? p.variantId : undefined,
              finish: typeof p.finish === "string" ? p.finish : undefined,
              product: typeof p.product === "string" ? p.product : undefined,
            }));
            packs.push({
              id: `pack_${pid.slice(-4)}_${i}`,
              set: setName,
              cards,
            });
          }
          sealedPacks[pid] = packs;
        }
        match.sealedPacks = sealedPacks;
        console.log(`[Sealed] Completed pack generation for match ${match.id}`);
      } catch (err) {
        console.error(
          `[Sealed] Error generating sealed packs for match ${match.id}:`,
          err
        );
      }
    }

    const matchInfo = getMatchInfo(match);
    io.to(`match:${match.id}`).emit("matchStarted", { match: matchInfo });
    if (lobbies.has(lobby.id)) {
      io.to(`lobby:${lobby.id}`).emit("matchStarted", { match: matchInfo });
    }

    return { ok: true, matchId: match.id };
  }

  // Hide started matches that have been inactive for more than 1 hour
  const STALE_MATCH_DISPLAY_MS = 60 * 60 * 1000; // 1 hour

  /**
   * Convert Redis lobby format to internal format with Sets
   */
  function redisLobbyToInternal(redisLobby) {
    return {
      id: redisLobby.id,
      name: redisLobby.name,
      hostId: redisLobby.hostId,
      playerIds: new Set(redisLobby.playerIds || []),
      status: redisLobby.status,
      maxPlayers: redisLobby.maxPlayers,
      ready: new Set(redisLobby.ready || []),
      visibility: redisLobby.visibility,
      plannedMatchType: redisLobby.plannedMatchType,
      isMatchmakingLobby: redisLobby.isMatchmakingLobby,
      soatcLeagueMatch: redisLobby.soatcLeagueMatch,
      matchId: redisLobby.matchId,
      lastActive: redisLobby.lastActive,
      createdAt: redisLobby.createdAt,
      allowSpectators: redisLobby.allowSpectators,
      hostReady: redisLobby.hostReady,
    };
  }

  /**
   * Get lobby list - uses Redis for cross-instance visibility when enabled
   * @returns {Promise<Array>} Array of lobby info objects
   */
  async function lobbiesArrayAsync() {
    let allLobbies = [];
    const now = Date.now();

    // If Redis is enabled, fetch from Redis (includes all instances)
    if (redisState && redisState.isEnabled()) {
      try {
        const redisLobbies = await redisState.getActiveLobbies(
          STALE_MATCH_DISPLAY_MS
        );
        for (const redisLobby of redisLobbies) {
          const lobby = redisLobbyToInternal(redisLobby);
          // Update local cache
          lobbies.set(lobby.id, lobby);
          allLobbies.push(lobby);
        }
      } catch (err) {
        console.error(
          "[lobby] Failed to fetch lobbies from Redis, using local:",
          err
        );
        // Fall back to local
        allLobbies = Array.from(lobbies.values());
      }
    } else {
      // No Redis, use local only
      allLobbies = Array.from(lobbies.values());
    }

    const arr = [];
    for (const lobby of allLobbies) {
      if (lobby.status === "closed") continue;
      // Hide stale started matches from the lobby list (but don't delete them)
      if (lobby.status === "started") {
        // Check both lobby.lastActive and match.lastTs for activity
        let lastActivity = lobby.lastActive || 0;
        if (lobby.matchId) {
          const match = matches.get(lobby.matchId);
          // Hide lobbies whose match has ended
          if (match && (match.status === "ended" || match.status === "completed" || match._finalized)) {
            continue;
          }
          if (match && typeof match.lastTs === "number") {
            lastActivity = Math.max(lastActivity, match.lastTs);
          }
        }
        const inactiveMs = now - lastActivity;
        if (inactiveMs > STALE_MATCH_DISPLAY_MS) continue;
      }
      const info = getLobbyInfo(lobby);
      info._sortTs = lobby.lastActive || lobby.createdAt || 0;
      arr.push(info);
    }
    // Sort by newest first (most recent activity)
    arr.sort((a, b) => (b._sortTs || 0) - (a._sortTs || 0));
    // Remove internal sort field before returning
    for (const item of arr) delete item._sortTs;
    return arr;
  }

  /**
   * Synchronous version for backward compatibility
   * Uses local cache only (won't show cross-instance lobbies)
   * @deprecated Use lobbiesArrayAsync() for cross-instance visibility
   */
  function lobbiesArray() {
    const arr = [];
    const now = Date.now();
    for (const lobby of lobbies.values()) {
      if (lobby.status === "closed") continue;
      // Hide stale started matches from the lobby list (but don't delete them)
      if (lobby.status === "started") {
        // Check both lobby.lastActive and match.lastTs for activity
        let lastActivity = lobby.lastActive || 0;
        if (lobby.matchId) {
          const match = matches.get(lobby.matchId);
          // Hide lobbies whose match has ended
          if (match && (match.status === "ended" || match.status === "completed" || match._finalized)) {
            continue;
          }
          if (match && typeof match.lastTs === "number") {
            lastActivity = Math.max(lastActivity, match.lastTs);
          }
        }
        const inactiveMs = now - lastActivity;
        if (inactiveMs > STALE_MATCH_DISPLAY_MS) continue;
      }
      const info = getLobbyInfo(lobby);
      info._sortTs = lobby.lastActive || lobby.createdAt || 0;
      arr.push(info);
    }
    // Sort by newest first (most recent activity)
    arr.sort((a, b) => (b._sortTs || 0) - (a._sortTs || 0));
    // Remove internal sort field before returning
    for (const item of arr) delete item._sortTs;
    return arr;
  }

  function playersArray() {
    const arr = [];
    for (const p of players.values()) {
      // Only include players with an active socket connection (not disconnected)
      if (p.socketId && !p.displayName.startsWith("Replay_")) {
        arr.push(getPlayerInfo(p.id));
      }
    }
    return arr;
  }

  function broadcastLobbies() {
    (async () => {
      try {
        const leader = await getOrClaimLobbyLeader();
        if (leader === INSTANCE_ID) {
          // Use async version for cross-instance visibility
          const lobbyList = await lobbiesArrayAsync();
          io.emit("lobbiesUpdated", { lobbies: lobbyList });
        }
      } catch {}
    })();
  }

  async function handleLobbyControlAsLeader(msg) {
    function findLobbyForPlayer(pid, explicitLobbyId) {
      if (explicitLobbyId && lobbies.has(explicitLobbyId))
        return lobbies.get(explicitLobbyId);
      for (const lb of lobbies.values()) {
        if (lb && lb.status === "open" && lb.playerIds && lb.playerIds.has(pid))
          return lb;
      }
      return null;
    }
    if (msg.type === "create") {
      const { hostId, socketId, options } = msg;
      const vis = ["private", "tournament"].includes(options?.visibility)
        ? options.visibility
        : "open";
      const maxPlayers = Number.isInteger(options && options.maxPlayers)
        ? Math.max(2, Math.min(8, options.maxPlayers))
        : 2;
      const name =
        options && options.name
          ? String(options.name).trim().slice(0, 50)
          : null;
      const now = Date.now();
      const lobby = {
        id: rid("lobby"),
        name,
        hostId,
        playerIds: new Set(),
        status: "open",
        maxPlayers,
        ready: new Set(),
        visibility: vis,
        plannedMatchType: "constructed",
        createdAt: now,
        lastActive: now,
      };
      lobbies.set(lobby.id, lobby);
      if (socketId) {
        try {
          await io.in(socketId).socketsJoin(`lobby:${lobby.id}`);
        } catch {}
      }
      lobby.playerIds.add(hostId);
      lobby.ready.add(hostId);
      const p = await ensurePlayerCached(hostId);
      try {
        p.lobbyId = lobby.id;
      } catch {}
      const info = getLobbyInfo(lobby);
      if (socketId)
        try {
          io.to(socketId).emit("joinedLobby", { lobby: info });
        } catch {}
      try {
        io.to(`lobby:${lobby.id}`).emit("lobbyUpdated", { lobby: info });
      } catch {}
      await publishLobbyState(lobby);
      await (async () => {
        const leader = await getOrClaimLobbyLeader();
        if (leader === INSTANCE_ID)
          io.emit("lobbiesUpdated", { lobbies: lobbiesArray() });
      })();
      return;
    }
    if (msg.type === "join") {
      const { playerId, socketId, lobbyId } = msg;
      let lobby = null;
      if (lobbyId && lobbies.has(lobbyId)) lobby = lobbies.get(lobbyId);
      else lobby = findOpenLobby() || createLobby(playerId);
      if (!lobby) lobby = createLobby(playerId);
      if (lobby.status !== "open") {
        if (socketId)
          io.to(socketId).emit("error", {
            message: "Lobby is not open",
            code: "lobby_not_open",
          });
        return;
      }
      if (lobby.playerIds.size >= lobby.maxPlayers) {
        if (socketId)
          io.to(socketId).emit("error", {
            message: "Lobby is full",
            code: "lobby_full",
          });
        return;
      }
      lobby.playerIds.add(playerId);
      lobby.ready.add(playerId);
      const p = await ensurePlayerCached(playerId);
      try {
        p.lobbyId = lobby.id;
      } catch {}
      if (socketId) {
        try {
          await io.in(socketId).socketsJoin(`lobby:${lobby.id}`);
        } catch {}
      }
      markLobbyActive(lobby);
      if (!lobby.hostId) lobby.hostId = playerId;
      const info = getLobbyInfo(lobby);
      if (socketId)
        try {
          io.to(socketId).emit("joinedLobby", { lobby: info });
        } catch {}
      try {
        io.to(`lobby:${lobby.id}`).emit("lobbyUpdated", { lobby: info });
      } catch {}
      await publishLobbyState(lobby);
      await (async () => {
        const leader = await getOrClaimLobbyLeader();
        if (leader === INSTANCE_ID)
          io.emit("lobbiesUpdated", { lobbies: lobbiesArray() });
      })();
      return;
    }
    if (msg.type === "leave") {
      const { playerId, socketId } = msg;
      const p = await ensurePlayerCached(playerId);
      const lobby = findLobbyForPlayer(playerId, p.lobbyId);
      const lobbyId = lobby?.id;
      if (!lobby || !lobbyId) {
        if (socketId)
          try {
            await io.in(socketId).socketsLeave(`lobby:${lobbyId}`);
          } catch {}
        return;
      }
      lobby.playerIds.delete(playerId);
      lobby.ready.delete(playerId);
      if (socketId) {
        try {
          await io.in(socketId).socketsLeave(`lobby:${lobbyId}`);
        } catch {}
      }
      try {
        p.lobbyId = null;
      } catch {}
      markLobbyActive(lobby);
      if (lobby.playerIds.size === 0) {
        lobby.status = "closed";
        if (botManager) {
          try {
            botManager.cleanupBotsForLobby(lobbyId);
          } catch {}
        }
        lobbies.delete(lobbyId);
        await publishLobbyDelete(lobbyId);
        await (async () => {
          const leader = await getOrClaimLobbyLeader();
          if (leader === INSTANCE_ID)
            io.emit("lobbiesUpdated", { lobbies: lobbiesArray() });
        })();
        return;
      } else if (!lobbyHasHumanPlayers(lobby)) {
        lobby.status = "closed";
        if (botManager) {
          try {
            botManager.cleanupBotsForLobby(lobbyId);
          } catch {}
        }
        lobbies.delete(lobbyId);
        await publishLobbyDelete(lobbyId);
        await (async () => {
          const leader = await getOrClaimLobbyLeader();
          if (leader === INSTANCE_ID)
            io.emit("lobbiesUpdated", { lobbies: lobbiesArray() });
        })();
        return;
      } else if (lobby.hostId === playerId) {
        try {
          const remaining = Array.from(lobby.playerIds);
          for (const pid of remaining) {
            const pl = await ensurePlayerCached(pid);
            if (pl?.socketId) {
              try {
                await io.in(pl.socketId).socketsLeave(`lobby:${lobbyId}`);
              } catch {}
            }
            try {
              pl.lobbyId = null;
            } catch {}
          }
        } catch {}
        lobby.status = "closed";
        if (botManager) {
          try {
            botManager.cleanupBotsForLobby(lobbyId);
          } catch {}
        }
        lobbies.delete(lobbyId);
        await publishLobbyDelete(lobbyId);
        await (async () => {
          const leader = await getOrClaimLobbyLeader();
          if (leader === INSTANCE_ID)
            io.emit("lobbiesUpdated", { lobbies: lobbiesArray() });
        })();
        return;
      }
      if (lobbies.has(lobbyId)) {
        io.to(`lobby:${lobbyId}`).emit("lobbyUpdated", {
          lobby: getLobbyInfo(lobby),
        });
      }
      await publishLobbyState(lobby);
      await (async () => {
        const leader = await getOrClaimLobbyLeader();
        if (leader === INSTANCE_ID)
          io.emit("lobbiesUpdated", { lobbies: lobbiesArray() });
      })();
      return;
    }
    if (msg.type === "visibility") {
      const { playerId, lobbyId, visibility } = msg;
      const lobby = findLobbyForPlayer(playerId, lobbyId);
      if (!lobby) return;
      if (lobby.hostId !== playerId) return;
      // Support open, private, and tournament visibility
      const validVisibilities = ["open", "private", "tournament"];
      const newVisibility = validVisibilities.includes(visibility)
        ? visibility
        : "open";
      lobby.visibility = newVisibility;
      // hostReady is managed separately via openLobby - don't reset on visibility change
      markLobbyActive(lobby);
      io.to(`lobby:${lobby.id}`).emit("lobbyUpdated", {
        lobby: getLobbyInfo(lobby),
      });
      await publishLobbyState(lobby);
      await (async () => {
        const leader = await getOrClaimLobbyLeader();
        if (leader === INSTANCE_ID)
          io.emit("lobbiesUpdated", { lobbies: lobbiesArray() });
      })();
      return;
    }
    if (msg.type === "plan") {
      const { playerId, lobbyId, plannedMatchType } = msg;
      const lobby = findLobbyForPlayer(playerId, lobbyId);
      if (!lobby) return;
      if (lobby.hostId !== playerId) return;
      if (
        plannedMatchType !== "constructed" &&
        plannedMatchType !== "sealed" &&
        plannedMatchType !== "draft" &&
        plannedMatchType !== "precon"
      )
        return;
      lobby.plannedMatchType = plannedMatchType;
      markLobbyActive(lobby);
      io.to(`lobby:${lobby.id}`).emit("lobbyUpdated", {
        lobby: getLobbyInfo(lobby),
      });
      await publishLobbyState(lobby);
      await (async () => {
        const leader = await getOrClaimLobbyLeader();
        if (leader === INSTANCE_ID)
          io.emit("lobbiesUpdated", { lobbies: lobbiesArray() });
      })();
      return;
    }
    if (msg.type === "ready") {
      const { playerId, lobbyId, ready } = msg;
      const lobby = findLobbyForPlayer(playerId, lobbyId);
      if (!lobby) return;
      if (!ready) {
        return;
      }
      lobby.ready.add(playerId);
      markLobbyActive(lobby);
      io.to(`lobby:${lobby.id}`).emit("lobbyUpdated", {
        lobby: getLobbyInfo(lobby),
      });
      await publishLobbyState(lobby);
      await (async () => {
        const leader = await getOrClaimLobbyLeader();
        if (leader === INSTANCE_ID)
          io.emit("lobbiesUpdated", { lobbies: lobbiesArray() });
      })();
      return;
    }
    if (msg.type === "startMatch") {
      const {
        playerId,
        matchType,
        sealedConfig,
        draftConfig,
        soatcLeagueMatch,
      } = msg;
      const p = await ensurePlayerCached(playerId);
      const lobby = findLobbyForPlayer(playerId, p.lobbyId);
      if (!lobby) return;
      try {
        p.lobbyId = lobby.id;
      } catch {}
      const res = await startMatchFromLobby(
        p,
        matchType || "constructed",
        sealedConfig || null,
        draftConfig || null,
        soatcLeagueMatch || null
      );
      if (lobby && lobbies.has(lobby.id)) {
        await publishLobbyState(lobbies.get(lobby.id));
      } else if (res && res.ok && res.matchId) {
        try {
          await publishLobbyDelete(lobby?.id);
        } catch {}
      }
      return;
    }
  }

  function registerSocketHandlers({ socket, isAuthed, getPlayerBySocket }) {
    socket.on("createLobby", async (payload = {}) => {
      if (!isAuthed()) return;
      const player = getPlayerBySocket(socket);
      if (!player) return;
      try {
        const leader = await getOrClaimLobbyLeader();
        const msg = {
          type: "create",
          hostId: player.id,
          socketId: socket.id,
          options: {
            name: payload?.name || null,
            visibility: payload?.visibility || "open",
            maxPlayers: payload?.maxPlayers,
          },
        };
        if (leader && leader !== INSTANCE_ID) {
          if (storeRedis)
            await storeRedis.publish(
              LOBBY_CONTROL_CHANNEL,
              JSON.stringify(msg)
            );
          return;
        }
        await handleLobbyControlAsLeader(msg);
      } catch {}
    });

    socket.on("joinLobby", async (payload = {}) => {
      if (!isAuthed()) return;
      const player = getPlayerBySocket(socket);
      if (!player) return;
      const lobbyId = payload.lobbyId || undefined;
      try {
        const leader = await getOrClaimLobbyLeader();
        const msg = {
          type: "join",
          playerId: player.id,
          socketId: socket.id,
          lobbyId,
        };
        if (leader && leader !== INSTANCE_ID) {
          if (storeRedis)
            await storeRedis.publish(
              LOBBY_CONTROL_CHANNEL,
              JSON.stringify(msg)
            );
          return;
        }
        await handleLobbyControlAsLeader(msg);
      } catch {}
    });

    socket.on("leaveLobby", async () => {
      if (!isAuthed()) return;
      const player = getPlayerBySocket(socket);
      if (!player) return;
      try {
        const leader = await getOrClaimLobbyLeader();
        const msg = { type: "leave", playerId: player.id, socketId: socket.id };
        if (leader && leader !== INSTANCE_ID) {
          if (storeRedis)
            await storeRedis.publish(
              LOBBY_CONTROL_CHANNEL,
              JSON.stringify(msg)
            );
          return;
        }
        await handleLobbyControlAsLeader(msg);
      } catch {}
    });

    socket.on("setLobbyVisibility", async (payload = {}) => {
      if (!isAuthed()) return;
      const player = getPlayerBySocket(socket);
      if (!player) return;
      try {
        const leader = await getOrClaimLobbyLeader();
        const msg = {
          type: "visibility",
          playerId: player.id,
          lobbyId: player.lobbyId || null,
          visibility: payload?.visibility,
        };
        if (leader && leader !== INSTANCE_ID) {
          if (storeRedis)
            await storeRedis.publish(
              LOBBY_CONTROL_CHANNEL,
              JSON.stringify(msg)
            );
          return;
        }
        await handleLobbyControlAsLeader(msg);
      } catch {}
    });

    socket.on("setLobbyPlan", async (payload = {}) => {
      if (!isAuthed()) return;
      const player = getPlayerBySocket(socket);
      if (!player) return;
      try {
        const leader = await getOrClaimLobbyLeader();
        const msg = {
          type: "plan",
          playerId: player.id,
          lobbyId: player.lobbyId || null,
          plannedMatchType: payload?.plannedMatchType,
        };
        if (leader && leader !== INSTANCE_ID) {
          if (storeRedis)
            await storeRedis.publish(
              LOBBY_CONTROL_CHANNEL,
              JSON.stringify(msg)
            );
          return;
        }
        await handleLobbyControlAsLeader(msg);
      } catch {}
    });

    // Set SOATC league match flag on lobby
    socket.on("setSoatcLeagueMatch", async (payload = {}) => {
      if (!isAuthed()) return;
      const player = getPlayerBySocket(socket);
      if (!player || !player.lobbyId) return;
      const lobby = lobbies.get(player.lobbyId);
      if (!lobby) return;

      // Update the lobby's SOATC league match status
      lobby.soatcLeagueMatch = payload?.soatcLeagueMatch || null;
      markLobbyActive(lobby);

      const info = getLobbyInfo(lobby);
      io.to(`lobby:${lobby.id}`).emit("lobbyUpdated", { lobby: info });
      broadcastLobbies();

      try {
        await publishLobbyState(lobby);
      } catch {}
    });

    // Host opens the lobby for other players to join (tournament lobbies)
    socket.on("openLobby", async () => {
      if (!isAuthed()) return;
      const player = getPlayerBySocket(socket);
      if (!player || !player.lobbyId) return;
      const lobby = lobbies.get(player.lobbyId);
      if (!lobby) return;

      // Only host can open the lobby
      if (lobby.hostId !== player.id) {
        socket.emit("error", {
          message: "Only the host can open the lobby",
          code: "not_host",
        });
        return;
      }

      lobby.hostReady = true;
      markLobbyActive(lobby);

      const info = getLobbyInfo(lobby);
      io.to(`lobby:${lobby.id}`).emit("lobbyUpdated", { lobby: info });
      broadcastLobbies();

      try {
        await publishLobbyState(lobby);
      } catch {}
    });

    // Set player location for presence tracking
    socket.on("setLocation", (payload = {}) => {
      if (!isAuthed()) return;
      const player = getPlayerBySocket(socket);
      if (!player) return;
      const validLocations = [
        "lobby",
        "match",
        "collection",
        "decks",
        "browsing",
        "offline",
      ];
      const location =
        payload && validLocations.includes(payload.location)
          ? payload.location
          : "browsing";
      player.location = location;
      try {
        console.info(
          `[presence] ${player.displayName} (${player.id.slice(
            -6
          )}) → ${location}`
        );
      } catch {}
      // Broadcast updated player list
      io.emit("playerList", { players: playersArray() });
    });

    socket.on("inviteToLobby", (payload = {}) => {
      if (!isAuthed()) return;
      const inviter = getPlayerBySocket(socket);
      if (!inviter) return;
      const targetId =
        payload && payload.targetPlayerId
          ? String(payload.targetPlayerId)
          : null;
      const lobbyId = (payload && payload.lobbyId) || inviter.lobbyId;
      if (!targetId || !lobbyId) return;
      const lobby = lobbies.get(lobbyId);
      if (!lobby) return;
      if (lobby.hostId !== inviter.id) {
        socket.emit("error", {
          message: "Only host can invite",
          code: "not_host",
        });
        try {
          console.info(
            `[invite] denied (not_host) inviter=${String(inviter.id).slice(
              -6
            )} target=${String(targetId).slice(-6)} lobby=${lobbyId}`
          );
        } catch {}
        return;
      }
      if (!lobbyInvites.has(lobbyId)) lobbyInvites.set(lobbyId, new Set());
      lobbyInvites.get(lobbyId).add(targetId);
      markLobbyActive(lobby);
      const target = players.get(targetId);
      if (target) {
        const tSocket = io.sockets.sockets.get(target.socketId);
        if (tSocket) {
          tSocket.emit("lobbyInvite", {
            lobbyId,
            from: getPlayerInfo(inviter.id),
            visibility: lobby.visibility,
          });
          try {
            console.info(
              `[invite] sent inviter=${String(inviter.id).slice(
                -6
              )} target=${String(targetId).slice(
                -6
              )} lobby=${lobbyId} visibility=${lobby.visibility}`
            );
          } catch {}
        }
      }
    });

    // Handle invite responses (decline, postpone)
    socket.on("inviteResponse", (payload = {}) => {
      if (!isAuthed()) return;
      const player = getPlayerBySocket(socket);
      if (!player) return;

      const lobbyId = payload?.lobbyId;
      const response = payload?.response; // 'declined' | 'postponed'

      if (!lobbyId || !response) return;

      const lobby = lobbies.get(lobbyId);
      if (!lobby || !lobby.hostId) return;

      // Find host socket and notify them
      const host = players.get(lobby.hostId);
      if (host && host.socketId) {
        const hostSocket = io.sockets.sockets.get(host.socketId);
        if (hostSocket) {
          hostSocket.emit("inviteResponseReceived", {
            from: getPlayerInfo(player.id),
            lobbyId,
            response,
            message:
              response === "declined"
                ? `${player.displayName} declined your invite`
                : `${player.displayName} needs a few minutes`,
          });
          try {
            console.info(
              `[invite] response=${response} from=${player.id.slice(
                -6
              )} lobby=${lobbyId}`
            );
          } catch {}
        }
      }

      // Remove invite if declined
      if (response === "declined") {
        const inv = lobbyInvites.get(lobbyId);
        if (inv) inv.delete(player.id);
      }
    });

    // Handle tournament invites (sent from REST API handler)
    socket.on("sendTournamentInvite", (payload = {}) => {
      if (!isAuthed()) return;
      const inviter = getPlayerBySocket(socket);
      if (!inviter) return;

      const { targetPlayerId, tournamentId, tournamentName } = payload;
      if (!targetPlayerId || !tournamentId) return;

      const target = players.get(targetPlayerId);
      if (target && target.socketId) {
        const tSocket = io.sockets.sockets.get(target.socketId);
        if (tSocket) {
          tSocket.emit("tournamentInvite", {
            tournamentId,
            tournamentName: tournamentName || "Tournament",
            from: getPlayerInfo(inviter.id),
          });
          try {
            console.info(
              `[tournament-invite] sent from=${String(inviter.id).slice(
                -6
              )} to=${String(targetPlayerId).slice(
                -6
              )} tournament=${tournamentId}`
            );
          } catch {}
        }
      }
    });

    socket.on("addCpuBot", (payload = {}) => {
      if (!isAuthed()) return;
      if (!CPU_BOTS_ENABLED) {
        socket.emit("error", {
          message: "CPU bots are disabled",
          code: "feature_disabled",
        });
        return;
      }
      const BotClient = loadBotClientCtor();
      if (!BotClient) {
        socket.emit("error", {
          message: "CPU bot component not available",
          code: "bot_unavailable",
        });
        return;
      }
      if (!botManager) {
        socket.emit("error", {
          message: "Bot manager unavailable",
          code: "bot_manager_unavailable",
        });
        return;
      }
      const host = getPlayerBySocket(socket);
      if (!host || !host.lobbyId) return;
      const lobby = lobbies.get(host.lobbyId);
      if (!lobby) return;
      if (lobby.hostId !== host.id) {
        socket.emit("error", {
          message: "Only host can add CPU bot",
          code: "not_host",
        });
        return;
      }
      if (lobby.playerIds.size >= lobby.maxPlayers) {
        socket.emit("error", { message: "Lobby is full", code: "lobby_full" });
        return;
      }

      const botId = rid("cpu");
      if (lobby.visibility === "private") {
        if (!lobbyInvites.has(lobby.id)) lobbyInvites.set(lobby.id, new Set());
        lobbyInvites.get(lobby.id).add(botId);
      }

      const nameBase =
        payload && typeof payload.displayName === "string"
          ? payload.displayName
          : "";
      const displayName = (
        nameBase.trim() || `CPU Bot ${botId.slice(-4)}`
      ).slice(0, 40);
      const serverUrl = `http://localhost:${PORT}`;

      try {
        // Ensure card ID map is loaded (once) so bot zone writes include cardId
        (async () => {
          try {
            if (!_botCardIdMapLoaded && prisma && loadBotCardIdMapFn) {
              const fn = loadBotCardIdMapFn();
              if (typeof fn === "function") {
                await fn(prisma);
                _botCardIdMapLoaded = true;
              }
            }
          } catch (e) {
            try { console.warn("[Bot] Failed to load card ID map:", e?.message || e); } catch {}
          }

          // Pick a random precon deck for the bot
          let constructedDeck = null;
          try {
            if (prisma) {
              const decks = await prisma.deck.findMany({
                where: { isPublic: true, format: "Constructed", name: { startsWith: "Beta Precon" } },
                include: { cards: { include: { card: true } } },
              });
              const configs = decks
                .map((deck) => {
                  try {
                    const spellAgg = new Map();
                    const atlasAgg = new Map();
                    for (const dc of deck.cards || []) {
                      const name = dc.card?.name || "";
                      const count = Number(dc.count || 1);
                      if (!name || count <= 0) continue;
                      const map = dc.zone === "Atlas" ? atlasAgg : dc.zone === "Sideboard" ? null : spellAgg;
                      if (!map) continue;
                      map.set(name, (map.get(name) || 0) + count);
                    }
                    const toArr = (m) => Array.from(m.entries()).map(([name, count]) => ({ name, count }));
                    const cfg = { spellbook: toArr(spellAgg), atlas: toArr(atlasAgg) };
                    return cfg.spellbook.length && cfg.atlas.length ? cfg : null;
                  } catch { return null; }
                })
                .filter(Boolean);
              if (configs.length > 0) {
                constructedDeck = configs[Math.floor(Math.random() * configs.length)];
                console.log(`[Bot] Assigned precon deck to ${displayName}: ${constructedDeck.spellbook.length} spells, ${constructedDeck.atlas.length} sites`);
              }
            }
          } catch (e) {
            try { console.warn("[Bot] Failed to load precon for bot:", e?.message || e); } catch {}
          }

          const bot = new BotClient({
            serverUrl,
            displayName,
            playerId: botId,
            lobbyId: lobby.id,
            constructedDeck: constructedDeck || undefined,
          });
          botManager.registerBot(botId, bot);
          bot.start().catch((err) => {
            console.error(`[Bot] Failed to start bot ${botId}:`, err);
            botManager.stopAndRemoveBot(botId, "start_failed");
          });
          console.log(
            `[Bot] Spawned CPU bot ${displayName} (${botId}) for lobby ${lobby.id}`
          );
        })();
      } catch (err) {
        console.error(`[Bot] Error creating bot:`, err);
        socket.emit("error", { message: "Failed to spawn CPU bot" });
      }
    });

    // ---------- Solo vs CPU: atomic lobby + bot + match creation ----------
    socket.on("startCpuMatch", async () => {
      if (!isAuthed()) return;
      if (!CPU_BOTS_ENABLED) {
        socket.emit("cpuMatchError", { message: "CPU bots are disabled", code: "feature_disabled" });
        return;
      }
      const BotClient = loadBotClientCtor();
      if (!BotClient) {
        socket.emit("cpuMatchError", { message: "CPU bot component not available", code: "bot_unavailable" });
        return;
      }
      if (!botManager) {
        socket.emit("cpuMatchError", { message: "Bot manager unavailable", code: "bot_manager_unavailable" });
        return;
      }
      const host = getPlayerBySocket(socket);
      if (!host) return;

      try {
        // 1. Create a private lobby for the human player
        const lobby = createLobby(host.id, { visibility: "private", maxPlayers: 2 });
        lobby.plannedMatchType = "constructed";
        host.lobbyId = lobby.id;
        lobby.playerIds.add(host.id);
        lobby.ready.add(host.id);
        try { await io.in(socket.id).socketsJoin(`lobby:${lobby.id}`); } catch {}

        // 2. Create invite for the bot
        const botId = rid("cpu");
        if (!lobbyInvites.has(lobby.id)) lobbyInvites.set(lobby.id, new Set());
        lobbyInvites.get(lobby.id).add(botId);

        const displayName = `CPU Bot ${botId.slice(-4)}`;
        const serverUrl = `http://localhost:${PORT}`;

        // 3. Load card ID map (once) so bot zone writes include cardId
        try {
          if (!_botCardIdMapLoaded && prisma && loadBotCardIdMapFn) {
            const fn = loadBotCardIdMapFn();
            if (typeof fn === "function") {
              await fn(prisma);
              _botCardIdMapLoaded = true;
            }
          }
        } catch (e) {
          try { console.warn("[CpuMatch] Failed to load card ID map:", e?.message || e); } catch {}
        }

        // 4. Pick a random precon deck for the bot
        let constructedDeck = null;
        try {
          if (prisma) {
            const decks = await prisma.deck.findMany({
              where: { isPublic: true, format: "Constructed", name: { startsWith: "Beta Precon" } },
              include: { cards: { include: { card: true } } },
            });
            const configs = decks
              .map((deck) => {
                try {
                  const spellAgg = new Map();
                  const atlasAgg = new Map();
                  for (const dc of deck.cards || []) {
                    const name = dc.card?.name || "";
                    const count = Number(dc.count || 1);
                    if (!name || count <= 0) continue;
                    const map = dc.zone === "Atlas" ? atlasAgg : dc.zone === "Sideboard" ? null : spellAgg;
                    if (!map) continue;
                    map.set(name, (map.get(name) || 0) + count);
                  }
                  const toArr = (m) => Array.from(m.entries()).map(([name, count]) => ({ name, count }));
                  const cfg = { spellbook: toArr(spellAgg), atlas: toArr(atlasAgg) };
                  return cfg.spellbook.length && cfg.atlas.length ? cfg : null;
                } catch { return null; }
              })
              .filter(Boolean);
            if (configs.length > 0) {
              constructedDeck = configs[Math.floor(Math.random() * configs.length)];
            }
          }
        } catch (e) {
          try { console.warn("[CpuMatch] Failed to load precon for bot:", e?.message || e); } catch {}
        }

        // 5. Spawn the bot
        const bot = new BotClient({
          serverUrl,
          displayName,
          playerId: botId,
          lobbyId: lobby.id,
          constructedDeck: constructedDeck || undefined,
        });
        botManager.registerBot(botId, bot);
        bot.start().catch((err) => {
          console.error(`[CpuMatch] Failed to start bot ${botId}:`, err);
          botManager.stopAndRemoveBot(botId, "start_failed");
        });
        console.log(`[CpuMatch] Spawned CPU bot ${displayName} (${botId}) for lobby ${lobby.id}`);

        // 6. Wait for bot to join the lobby (poll every 200ms, timeout 8s)
        const maxWait = 8000;
        const pollInterval = 200;
        let waited = 0;
        while (waited < maxWait) {
          if (lobby.playerIds.has(botId)) break;
          await new Promise((r) => setTimeout(r, pollInterval));
          waited += pollInterval;
        }
        if (!lobby.playerIds.has(botId)) {
          socket.emit("cpuMatchError", { message: "Bot failed to join lobby in time", code: "bot_timeout" });
          try { botManager.stopAndRemoveBot(botId, "timeout"); } catch {}
          return;
        }

        // 7. Mark bot as ready and start the match
        lobby.ready.add(botId);
        const res = await startMatchFromLobby(host, "constructed");
        if (!res || !res.ok) {
          socket.emit("cpuMatchError", { message: res?.error || "Failed to start match", code: "match_start_failed" });
          return;
        }

        // 8. Emit match ready to the requesting socket
        console.log(`[CpuMatch] Match ${res.matchId} started for lobby ${lobby.id}`);
        socket.emit("cpuMatchReady", { matchId: res.matchId });
      } catch (err) {
        console.error("[CpuMatch] Error creating CPU match:", err);
        socket.emit("cpuMatchError", { message: "Failed to create CPU match", code: "internal_error" });
      }
    });

    socket.on("removeCpuBot", (payload = {}) => {
      if (!isAuthed()) return;
      if (!CPU_BOTS_ENABLED) {
        socket.emit("error", {
          message: "CPU bots are disabled",
          code: "feature_disabled",
        });
        return;
      }
      if (!botManager) {
        socket.emit("error", {
          message: "Bot manager unavailable",
          code: "bot_manager_unavailable",
        });
        return;
      }
      const host = getPlayerBySocket(socket);
      if (!host || !host.lobbyId) return;
      const lobby = lobbies.get(host.lobbyId);
      if (!lobby) return;
      if (lobby.hostId !== host.id) {
        socket.emit("error", {
          message: "Only host can remove CPU bot",
          code: "not_host",
        });
        return;
      }

      const requestedId =
        payload && typeof payload.playerId === "string"
          ? payload.playerId
          : null;
      let targetId = null;
      if (
        requestedId &&
        lobby.playerIds.has(requestedId) &&
        isCpuPlayerId(requestedId)
      ) {
        targetId = requestedId;
      } else {
        for (const pid of lobby.playerIds) {
          if (isCpuPlayerId(pid)) {
            targetId = pid;
            break;
          }
        }
      }
      if (!targetId) {
        socket.emit("error", {
          message: "No CPU bot found in this lobby",
          code: "no_cpu_in_lobby",
        });
        return;
      }

      botManager.stopAndRemoveBot(targetId, "removed_by_host");
    });

    socket.on("requestLobbies", async () => {
      if (!isAuthed()) return;
      // Use async version for cross-instance visibility
      const lobbyList = await lobbiesArrayAsync();
      socket.emit("lobbiesUpdated", { lobbies: lobbyList });
    });

    socket.on("requestPlayers", () => {
      if (!isAuthed()) return;
      socket.emit("playerList", { players: playersArray() });
    });

    socket.on("ready", async (payload) => {
      if (!isAuthed()) return;
      const player = getPlayerBySocket(socket);
      if (!player) return;
      try {
        const leader = await getOrClaimLobbyLeader();
        const msg = {
          type: "ready",
          playerId: player.id,
          lobbyId: player.lobbyId || null,
          ready: !!(payload && payload.ready),
        };
        if (leader && leader !== INSTANCE_ID) {
          if (storeRedis)
            await storeRedis.publish(
              LOBBY_CONTROL_CHANNEL,
              JSON.stringify(msg)
            );
          return;
        }
        await handleLobbyControlAsLeader(msg);
      } catch {}
    });

    socket.on("startMatch", async (payload = {}) => {
      if (!isAuthed()) return;
      const player = getPlayerBySocket(socket);
      if (!player) return;
      const msg = {
        type: "startMatch",
        playerId: player.id,
        matchType: payload?.matchType || "constructed",
        sealedConfig: payload?.sealedConfig || null,
        draftConfig: payload?.draftConfig || null,
        soatcLeagueMatch: payload?.soatcLeagueMatch || null,
      };
      try {
        const leader = await getOrClaimLobbyLeader();
        if (leader && leader !== INSTANCE_ID) {
          if (storeRedis)
            await storeRedis.publish(
              LOBBY_CONTROL_CHANNEL,
              JSON.stringify(msg)
            );
          return;
        }
        await handleLobbyControlAsLeader(msg);
      } catch {}
    });
  }

  /**
   * Reconstruct lobbies from recovered matches after server restart.
   * This ensures "Active Games" shows ongoing matches even after a deploy.
   * Only reconstructs matches that have been active within STALE_MATCH_DISPLAY_MS.
   * @param {Map<string, any>} recoveredMatches - Map of matchId -> match objects
   */
  function reconstructLobbiesFromMatches(recoveredMatches) {
    if (!recoveredMatches || recoveredMatches.size === 0) return;
    const now = Date.now();
    let count = 0;
    let skippedStale = 0;
    for (const match of recoveredMatches.values()) {
      if (!match || !match.id) continue;
      // Skip ended matches
      if (match.status === "ended" || match.status === "completed") continue;

      // Use actual match timestamp to determine if it's stale
      const matchLastActivity = match.lastTs || match.updatedAt || 0;
      const inactiveMs = now - matchLastActivity;
      if (inactiveMs > STALE_MATCH_DISPLAY_MS) {
        skippedStale++;
        continue; // Don't reconstruct stale matches
      }

      // Use lobbyId if available, otherwise use matchId as lobby identifier
      const lobbyId = match.lobbyId || match.id;
      // Skip if lobby already exists
      if (lobbies.has(lobbyId)) continue;

      const lobby = {
        id: lobbyId,
        name: match.lobbyName || null,
        hostId: match.playerIds?.[0] || null,
        playerIds: new Set(match.playerIds || []),
        status: "started",
        maxPlayers: match.maxPlayers || 2,
        ready: new Set(match.playerIds || []),
        visibility: "private", // Recovered lobbies are private by default
        plannedMatchType: match.matchType || "constructed",
        matchId: match.id,
        createdAt: matchLastActivity || now,
        lastActive: matchLastActivity || now, // Use actual match timestamp
      };
      lobbies.set(lobbyId, lobby);
      count++;
    }
    try {
      console.log(
        `[lobby] reconstructed ${count} lobby(ies) from recovered matches (skipped ${skippedStale} stale)`
      );
    } catch {}
    if (count > 0) {
      // Broadcast updated lobbies list
      broadcastLobbies();
    }
  }

  return {
    lobbies,
    lobbyInvites,
    getLobbyInfo,
    normalizeSealedConfig,
    normalizeDraftConfig,
    markLobbyActive,
    broadcastLobbies,
    lobbiesArray,
    lobbiesArrayAsync,
    playersArray,
    publishLobbyState,
    publishLobbyDelete,
    getOrClaimLobbyLeader,
    handleLobbyControlAsLeader,
    startMatchFromLobby,
    registerSocketHandlers,
    setBotManager,
    serializeLobby,
    upsertLobbyFromSerialized,
    createLobby,
    findOpenLobby,
    reconstructLobbiesFromMatches,
  };
}

module.exports = { createLobbyFeature };
