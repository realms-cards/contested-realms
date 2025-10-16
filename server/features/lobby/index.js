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
 */
function createLobbyFeature(deps) {
  const io = deps.io;
  const storeRedis = deps.storeRedis || null;
  const INSTANCE_ID = deps.instanceId;
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
  const hydrateMatchFromDatabase = deps.hydrateMatchFromDatabase;
  const LOBBY_CONTROL_CHANNEL = deps.lobbyControlChannel;
  const LOBBY_STATE_CHANNEL = deps.lobbyStateChannel;
  const CPU_BOTS_ENABLED = !!deps.cpuBotsEnabled;
  const loadBotClientCtor = deps.loadBotClientCtor;
  const PORT = deps.port;
  const isCpuPlayerId = deps.isCpuPlayerId;

  /** @type {Map<string, { id: string, name: string|null, hostId: string|null, playerIds: Set<string>, status: string, maxPlayers: number, ready: Set<string>, visibility: 'open'|'private', plannedMatchType?: string|null, lastActive: number }>} */
  const lobbies = new Map();
  /** @type {Map<string, Set<string>>} lobbyId -> invited playerIds */
  const lobbyInvites = new Map();

  /** @type {import('../../botManager').BotManager|null} */
  let botManager = null;

  function setBotManager(manager) {
    botManager = manager || null;
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
      lastActive: lobby.lastActive,
      playerIds: Array.from(lobby.playerIds || []),
      ready: Array.from(lobby.ready || []),
    };
  }

  function upsertLobbyFromSerialized(obj) {
    const lb =
      lobbies.get(obj.id) ||
      {
        id: obj.id,
        name: null,
        hostId: null,
        playerIds: new Set(),
        status: "open",
        maxPlayers: 2,
        ready: new Set(),
        visibility: "open",
        plannedMatchType: "constructed",
        lastActive: Date.now(),
      };
    lb.name = obj.name;
    lb.hostId = obj.hostId;
    lb.status = obj.status;
    lb.maxPlayers = obj.maxPlayers;
    lb.visibility = obj.visibility;
    lb.plannedMatchType = obj.plannedMatchType;
    lb.lastActive = obj.lastActive || Date.now();
    lb.playerIds = new Set(Array.isArray(obj.playerIds) ? obj.playerIds : []);
    lb.ready = new Set(Array.isArray(obj.ready) ? obj.ready : []);
    lobbies.set(lb.id, lb);
  }

  async function publishLobbyState(lobby) {
    try {
      if (storeRedis)
        await storeRedis.publish(
          LOBBY_STATE_CHANNEL,
          JSON.stringify({ type: "upsert", lobby: serializeLobby(lobby) })
        );
    } catch {}
  }

  async function publishLobbyDelete(lobbyId) {
    try {
      if (storeRedis)
        await storeRedis.publish(
          LOBBY_STATE_CHANNEL,
          JSON.stringify({ type: "delete", id: lobbyId })
        );
    } catch {}
  }

  function getLobbyInfo(lobby) {
    return {
      id: lobby.id,
      name: lobby.name,
      hostId: lobby.hostId,
      players: Array.from(lobby.playerIds)
        .map(getPlayerInfo)
        .filter(Boolean),
      status: lobby.status,
      maxPlayers: lobby.maxPlayers,
      visibility: lobby.visibility,
      readyPlayerIds: Array.from(lobby.ready),
      plannedMatchType: lobby.plannedMatchType,
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
    return {
      packCount: Math.max(1, Number(config.packCount) || 3),
      pickCount:
        Number.isFinite(config.pickCount) && config.pickCount > 0
          ? Number(config.pickCount)
          : 15,
      timer: Math.max(10, Number(config.timer) || 75),
      format:
        typeof config.format === "string" ? config.format : "standard_2player",
      cardSource: Array.isArray(config.cardSource)
        ? config.cardSource.slice(0, 8)
        : [],
    };
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
    const vis = opts.visibility === "private" ? "private" : "open";
    const maxPlayers = Number.isInteger(opts.maxPlayers)
      ? Math.max(2, Math.min(8, opts.maxPlayers))
      : 2;
    const name =
      opts.name && typeof opts.name === "string"
        ? opts.name.trim().slice(0, 50)
        : null;
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
      lastActive: Date.now(),
    };
    lobbies.set(lobby.id, lobby);
    return lobby;
  }

  function markLobbyActive(lobby) {
    lobby.lastActive = Date.now();
  }

  function joinLobby(socket, player, suppliedLobbyId) {
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
    if (suppliedLobbyId && lobby.visibility === "private") {
      const allowed =
        lobby.hostId === player.id ||
        (lobbyInvites.get(lobby.id)?.has(player.id) ?? false);
      if (!allowed) {
        socket.emit("error", {
          message: "Lobby is private. You need an invite.",
          code: "private_lobby",
        });
        try {
          console.info(
            `[invite] denied (not_invited) inviter=${String(
              lobby.hostId
            ).slice(-6)} target=${String(player.id).slice(-6)} lobby=${
              lobby.id
            }`
          );
        } catch {}
        return;
      }
    }

    lobby.playerIds.add(player.id);
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
    draftConfig = null
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
    } catch {}
    io.to(`lobby:${lobby.id}`).emit("lobbyUpdated", { lobby: getLobbyInfo(lobby) });
    broadcastLobbies();

    if (matchType === "sealed" && match.sealedConfig) {
      try {
        const sealedPacks = {};
        for (const pid of match.playerIds) {
          const rng = createRngFromString(`${match.seed}|${pid}|sealed`);
          const sc = match.sealedConfig || {};
          const packCount = Math.max(1, Number(sc.packCount) || 6);
          const setMix =
            Array.isArray(sc.setMix) && sc.setMix.length > 0
              ? sc.setMix
              : ["Alpha"];
          const packCounts =
            sc.packCounts && typeof sc.packCounts === "object"
              ? sc.packCounts
              : null;
          const replaceAvatars = !!sc.replaceAvatars;

          let sets = [];
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
              replaceAvatars
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
            packs.push({ id: `pack_${pid.slice(-4)}_${i}`, set: setName, cards });
          }
          sealedPacks[pid] = packs;
        }
        match.sealedPacks = sealedPacks;
        console.log(
          `[Sealed] Completed pack generation for match ${match.id}`
        );
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

  function lobbiesArray() {
    const arr = [];
    for (const lobby of lobbies.values()) {
      if (lobby.status !== "closed") arr.push(getLobbyInfo(lobby));
    }
    return arr;
  }

  function playersArray() {
    const arr = [];
    for (const p of players.values()) {
      if (!p.displayName.startsWith("Replay_")) {
        arr.push(getPlayerInfo(p.id));
      }
    }
    return arr;
  }

  function broadcastLobbies() {
    (async () => {
      try {
        const leader = await getOrClaimLobbyLeader();
        if (leader === INSTANCE_ID)
          io.emit("lobbiesUpdated", { lobbies: lobbiesArray() });
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
      const vis =
        options && options.visibility === "private" ? "private" : "open";
      const maxPlayers =
        Number.isInteger(options && options.maxPlayers)
          ? Math.max(2, Math.min(8, options.maxPlayers))
          : 2;
      const name =
        options && options.name ? String(options.name).trim().slice(0, 50) : null;
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
        lastActive: Date.now(),
      };
      lobbies.set(lobby.id, lobby);
      if (socketId) {
        try {
          await io.in(socketId).socketsJoin(`lobby:${lobby.id}`);
        } catch {}
      }
      lobby.playerIds.add(hostId);
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
      lobby.visibility = visibility === "private" ? "private" : "open";
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
        plannedMatchType !== "draft"
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
      const { playerId, matchType, sealedConfig, draftConfig } = msg;
      const p = await ensurePlayerCached(playerId);
      let lobby = findLobbyForPlayer(playerId, p.lobbyId);
      if (!lobby) return;
      try {
        p.lobbyId = lobby.id;
      } catch {}
      const res = await startMatchFromLobby(
        p,
        matchType || "constructed",
        sealedConfig || null,
        draftConfig || null
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

    socket.on("inviteToLobby", (payload = {}) => {
      if (!isAuthed()) return;
      const inviter = getPlayerBySocket(socket);
      if (!inviter) return;
      const targetId =
        payload && payload.targetPlayerId ? String(payload.targetPlayerId) : null;
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
            `[invite] denied (not_host) inviter=${String(inviter.id).slice(-6)} target=${String(targetId).slice(-6)} lobby=${lobbyId}`
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
              `[invite] sent inviter=${String(inviter.id).slice(-6)} target=${String(targetId).slice(-6)} lobby=${lobbyId} visibility=${lobby.visibility}`
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
      const displayName = (nameBase.trim() || `CPU Bot ${botId.slice(-4)}`).slice(
        0,
        40
      );
      const serverUrl = `http://localhost:${PORT}`;

      try {
        const bot = new BotClient({
          serverUrl,
          displayName,
          playerId: botId,
          lobbyId: lobby.id,
        });
        botManager.registerBot(botId, bot);
        bot.start().catch((err) => {
          console.error(`[Bot] Failed to start bot ${botId}:`, err);
          botManager.stopAndRemoveBot(botId, "start_failed");
        });
        console.log(
          `[Bot] Spawned CPU bot ${displayName} (${botId}) for lobby ${lobby.id}`
        );
      } catch (err) {
        console.error(`[Bot] Error creating bot:`, err);
        socket.emit("error", { message: "Failed to spawn CPU bot" });
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
      if (requestedId && lobby.playerIds.has(requestedId) && isCpuPlayerId(requestedId)) {
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

    socket.on("requestLobbies", () => {
      if (!isAuthed()) return;
      socket.emit("lobbiesUpdated", { lobbies: lobbiesArray() });
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

  return {
    lobbies,
    lobbyInvites,
    getLobbyInfo,
    normalizeSealedConfig,
    normalizeDraftConfig,
    markLobbyActive,
    broadcastLobbies,
    lobbiesArray,
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
  };
}

module.exports = { createLobbyFeature };
