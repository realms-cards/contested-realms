// Simple Socket.IO server for Sorcery online MVP
// Run with: node server/index.js

const http = require("http");
const { Server } = require("socket.io");
const {
  createRngFromString,
  generateBoosterDeterministic,
} = require("./booster");

const PORT = process.env.PORT ? Number(process.env.PORT) : 3010;

const server = http.createServer();
const io = new Server(server, {
  cors: {
    origin: ["http://localhost:3000"],
    credentials: true,
  },
});

// In-memory state
// Players keyed by stable playerId (not socket id)
/** @type {Map<string, { id: string, displayName: string, socketId: string|null, lobbyId?: string|null, matchId?: string|null }>} */
const players = new Map();
/** @type {Map<string, string>} socket.id -> playerId */
const playerIdBySocket = new Map();
/** @type {Map<string, { id: string, name: string|null, hostId: string, playerIds: Set<string>, status: 'open'|'started'|'closed', maxPlayers: number, ready: Set<string>, visibility: 'open'|'private' }>} */
const lobbies = new Map();
/** @type {Map<string, { id: string, lobbyId?: string|null, playerIds: string[], status: 'waiting'|'deck_construction'|'in_progress'|'ended', seed: string, turn?: string, winnerId?: string|null, matchType?: 'constructed'|'sealed', sealedConfig?: { packCount: number, setMix: string[], timeLimit: number, constructionStartTime?: number, packCounts?: Record<string, number>, replaceAvatars?: boolean }, playerDecks?: Map<string, any>, sealedPacks?: Record<string, Array<{ id: string, set: string, cards: Array<{ id: string, name: string, set: string, slug: string, type?: string|null, cost?: number|null, rarity: string }> }>> }>} */
const matches = new Map();
/** @type {Map<string, { matchId: string, playerNames: string[], startTime: number, endTime?: number, initialState?: any, actions: Array<{ patch: any, timestamp: number, playerId: string }> }>} */
const matchRecordings = new Map();
/** @type {Map<string, Set<string>>} lobbyId -> set of invited playerIds */
const lobbyInvites = new Map();

function rid(prefix) {
  return `${prefix}_${Math.random().toString(36).slice(2, 8)}${Date.now()
    .toString(36)
    .slice(-4)}`;
}

function getPlayerInfo(playerId) {
  const p = players.get(playerId);
  if (!p) return null;
  return { id: p.id, displayName: p.displayName };
}

function getPlayerBySocket(socket) {
  const pid = playerIdBySocket.get(socket.id);
  if (!pid) return null;
  return players.get(pid) || null;
}

function isPlayerConnected(playerId) {
  const p = players.get(playerId);
  if (!p || !p.socketId) return false;
  return !!io.sockets.sockets.get(p.socketId);
}

function getLobbyInfo(lobby) {
  return {
    id: lobby.id,
    name: lobby.name,
    hostId: lobby.hostId,
    players: Array.from(lobby.playerIds).map(getPlayerInfo).filter(Boolean),
    status: lobby.status,
    maxPlayers: lobby.maxPlayers,
    visibility: lobby.visibility,
    // Include readiness state for clients
    readyPlayerIds: Array.from(lobby.ready),
  };
}

function getMatchInfo(match) {
  return {
    id: match.id,
    lobbyId: match.lobbyId || undefined,
    players: match.playerIds.map(getPlayerInfo).filter(Boolean),
    status: match.status,
    seed: match.seed,
    turn: match.turn,
    winnerId: match.winnerId ?? null,
    matchType: match.matchType || "constructed",
    sealedConfig: match.sealedConfig,
    draftConfig: match.draftConfig,
    deckSubmissions: match.playerDecks
      ? Array.from(match.playerDecks.keys())
      : [],
    playerDecks: match.playerDecks
      ? Object.fromEntries(match.playerDecks)
      : undefined,
    sealedPacks: match.sealedPacks || undefined,
    draftState: match.draftState || undefined,
  };
}

// Deep merge that replaces arrays and merges plain objects.
// Primitives and nulls overwrite. Undefined in patch leaves value as-is.
function deepMergeReplaceArrays(base, patch) {
  if (patch === undefined) return base;
  if (patch === null) return null;
  if (Array.isArray(patch)) return patch; // replace arrays fully
  if (typeof patch !== "object") return patch; // primitives overwrite

  const baseObj =
    base && typeof base === "object" && !Array.isArray(base) ? base : {};
  const out = { ...baseObj };
  for (const [k, v] of Object.entries(patch)) {
    const cur = out[k];
    out[k] = deepMergeReplaceArrays(cur, v);
  }
  return out;
}

// Cap for multiplayer console events to avoid unbounded growth
const MAX_EVENTS = 200;
// Merge console events by stable key and chronological order, trimming to MAX_EVENTS.
function mergeEvents(prev, add) {
  const m = new Map();
  if (Array.isArray(prev)) {
    for (const e of prev) {
      if (!e) continue;
      m.set(`${e.id}|${e.ts}|${e.text}`, e);
    }
  }
  if (Array.isArray(add)) {
    for (const e of add) {
      if (!e) continue;
      m.set(`${e.id}|${e.ts}|${e.text}`, e);
    }
  }
  const merged = Array.from(m.values()).sort(
    (a, b) => a.ts - b.ts || a.id - b.id
  );
  return merged.length > MAX_EVENTS ? merged.slice(-MAX_EVENTS) : merged;
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
  const name = opts.name && typeof opts.name === "string" ? opts.name.trim().slice(0, 50) : null;
  const lobby = {
    id: rid("lobby"),
    name,
    hostId,
    playerIds: new Set(),
    status: "open",
    maxPlayers,
    ready: new Set(),
    visibility: vis,
    lastActive: Date.now(),
  };
  lobbies.set(lobby.id, lobby);
  return lobby;
}

function markLobbyActive(lobby) {
  lobby.lastActive = Date.now();
}

function joinLobby(socket, player, suppliedLobbyId) {
  // Leave previous lobby if any
  if (player.lobbyId) leaveLobby(socket, player);

  let lobby = null;
  if (suppliedLobbyId && lobbies.has(suppliedLobbyId)) {
    lobby = lobbies.get(suppliedLobbyId);
  } else {
    lobby = findOpenLobby() || createLobby(player.id);
  }
  if (!lobby) lobby = createLobby(player.id);

  // Validate lobby state and permissions
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
      return;
    }
  }

  lobby.playerIds.add(player.id);
  player.lobbyId = lobby.id;
  socket.join(`lobby:${lobby.id}`);

  markLobbyActive(lobby);

  // If lobby has no host (edge), set host
  if (!lobby.hostId) lobby.hostId = player.id;

  const info = getLobbyInfo(lobby);
  socket.emit("joinedLobby", { lobby: info });
  io.to(`lobby:${lobby.id}`).emit("lobbyUpdated", { lobby: info });
  broadcastLobbies();
  // Consume invite if present
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

  // Reassign or close lobby if empty or host left
  if (lobby.playerIds.size === 0) {
    lobby.status = "closed";
    lobbies.delete(lobbyId);
  } else if (lobby.hostId === player.id) {
    // Reassign host to first remaining
    lobby.hostId = Array.from(lobby.playerIds)[0];
    // Reset all ready states when host changes
    lobby.ready.clear();
  }

  if (lobbies.has(lobbyId)) {
    io.to(`lobby:${lobbyId}`).emit("lobbyUpdated", {
      lobby: getLobbyInfo(lobby),
    });
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
  // All players must be ready
  for (const pid of lobby.playerIds) {
    if (!lobby.ready.has(pid))
      return { ok: false, error: "All players must be ready" };
  }

  const match = {
    id: rid("match"),
    lobbyId: lobby.id,
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
    draftState: null, // Will be initialized after match creation
    // Server-side aggregated game snapshot and timestamp
    game: {},
    lastTs: 0,
  };
  // Initialize draft state for draft matches
  if (matchType === "draft") {
    match.draftState = {
      phase: "waiting",
      packIndex: 0,
      pickNumber: 1,
      currentPacks: null,
      picks: match.playerIds.map(() => []),
      // Track readiness per player key (p1/p2) for the waiting lobby phase
      playerReady: { p1: false, p2: false },
      packDirection: "left",
      packChoice: match.playerIds.map(() => null),
      waitingFor: [],
    };
  }

  matches.set(match.id, match);

  // Start recording immediately when match is created
  startMatchRecording(match);

  // Join all sockets to match room
  for (const pid of match.playerIds) {
    const p = players.get(pid);
    if (!p) continue;
    const s = io.sockets.sockets.get(p.socketId);
    if (s) s.join(`match:${match.id}`);
    p.matchId = match.id;
    // For sealed/draft matches, keep lobby association during deck construction/draft
    // For constructed matches, clear lobby association immediately
    if (matchType === "constructed") {
      p.lobbyId = null;
    }
  }

  // For sealed/draft matches, keep lobby active during deck construction/draft
  // For constructed matches, close lobby immediately
  if (matchType === "constructed") {
    lobby.status = "closed";
    lobbies.delete(lobby.id);
    broadcastLobbies();
  }

  // Deterministic sealed pack generation per player
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

        /** @type {string[]} */
        let sets = [];
        if (packCounts) {
          for (const [setName, cnt] of Object.entries(packCounts)) {
            const c = Math.max(0, Number(cnt) || 0);
            for (let i = 0; i < c; i++) sets.push(setName);
          }
          // Deterministic shuffle of sets using rng for variety
          for (let i = sets.length - 1; i > 0; i--) {
            const j = Math.floor(rng() * (i + 1));
            [sets[i], sets[j]] = [sets[j], sets[i]];
          }
        } else {
          // Error: packCounts must be provided for sealed
          console.error(
            `[Sealed] packCounts not provided for player ${pid} in match ${match.id}`
          );
          // Skip this player's pack generation
          continue;
        }

        console.log(
          `[Sealed] Generating ${
            sets.length
          } packs for player ${pid} in match ${match.id}. Sets: ${sets.join(
            ", "
          )}`
        );
        /** @type {Array<{ id: string, set: string, cards: Array<{ id: string, name: string, set: string, slug: string, type?: string|null, cost?: number|null, rarity: string }> }>} */
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
          }));
          packs.push({ id: `pack_${pid.slice(-4)}_${i}`, set: setName, cards });
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
    // Filter out replay viewers from the player list
    if (!p.displayName.startsWith("Replay_")) {
      arr.push(getPlayerInfo(p.id));
    }
  }
  return arr;
}

function broadcastLobbies() {
  io.emit("lobbiesUpdated", { lobbies: lobbiesArray() });
}

function broadcastPlayers() {
  io.emit("playerList", { players: playersArray() });
}

function startMatchRecording(match) {
  const playerNames = match.playerIds.map((pid) => {
    const p = players.get(pid);
    return p ? p.displayName : `Player ${pid}`;
  });

  const recording = {
    matchId: match.id,
    playerNames,
    startTime: Date.now(),
    endTime: null,
    initialState: {
      playerIds: match.playerIds,
      seed: match.seed,
      matchType: match.matchType,
      playerDecks: match.playerDecks
        ? Object.fromEntries(match.playerDecks)
        : null,
    },
    actions: [],
  };

  matchRecordings.set(match.id, recording);
  console.log(
    `[Recording] Started recording match ${
      match.id
    } with players: ${playerNames.join(", ")}`
  );
}

function recordMatchAction(matchId, patch, playerId) {
  const recording = matchRecordings.get(matchId);
  if (!recording) {
    console.log(`[Recording] No recording found for match ${matchId}`);
    return;
  }

  recording.actions.push({
    patch,
    timestamp: Date.now(),
    playerId,
  });
  console.log(
    `[Recording] Recorded action ${recording.actions.length} for match ${matchId} by player ${playerId}`
  );
}

function finishMatchRecording(matchId) {
  const recording = matchRecordings.get(matchId);
  if (!recording) return;

  recording.endTime = Date.now();
  console.log(
    `[Recording] Finished recording match ${matchId}, total actions: ${recording.actions.length}`
  );
}

io.on("connection", (socket) => {
  let authed = false;

  socket.on("hello", (payload) => {
    const rawName = payload && typeof payload.displayName === "string" ? payload.displayName : "";
    const displayName = (rawName.trim() || "Player").slice(0, 40);
    const providedId = payload && payload.playerId ? String(payload.playerId) : null;
    const playerId = providedId || rid("p");

    let player = players.get(playerId);
    if (!player) {
      player = {
        id: playerId,
        displayName,
        socketId: socket.id,
        lobbyId: null,
        matchId: null,
      };
      players.set(playerId, player);
    } else {
      player.displayName = displayName;
      player.socketId = socket.id;
    }
    playerIdBySocket.set(socket.id, playerId);
    authed = true;

    console.log(
      `[auth] hello <= name="${displayName}" id=${playerId} providedId=${!!providedId} socket=${socket.id}`
    );

    socket.emit("welcome", {
      you: { id: player.id, displayName: player.displayName },
    });
    broadcastPlayers();

    // Rejoin previous rooms if any
    if (player.matchId && matches.has(player.matchId)) {
      socket.join(`match:${player.matchId}`);
      const m = matches.get(player.matchId);
      socket.emit("matchStarted", { match: getMatchInfo(m) });
      
      // If rejoining during an active draft, send current draft state
      if (m.matchType === "draft" && m.draftState && m.draftState.phase !== "waiting") {
        console.log(`[Draft] Player ${player.displayName} (${player.id}) rejoining active draft - sending current draft state`);
        socket.emit("draftUpdate", m.draftState);
      }
    } else if (player.lobbyId && lobbies.has(player.lobbyId)) {
      socket.join(`lobby:${player.lobbyId}`);
      const l = lobbies.get(player.lobbyId);
      socket.emit("joinedLobby", { lobby: getLobbyInfo(l) });
    }
  });

  // Per-player mulligan completion. When all players are done, advance to Main.
  socket.on("mulliganDone", () => {
    if (!authed) return;
    const player = getPlayerBySocket(socket);
    if (!player || !player.matchId) return;
    const match = matches.get(player.matchId);
    if (!match) return;
    if (match.status !== "waiting") return; // Only relevant during setup

    // Track per-player mulligan completion for this match
    if (!match.mulliganDone || !(match.mulliganDone instanceof Set)) {
      match.mulliganDone = new Set();
    }
    match.mulliganDone.add(player.id);

    // If all current players have finished mulligans, start the game
    const allDone =
      Array.isArray(match.playerIds) &&
      match.playerIds.every((pid) => match.mulliganDone.has(pid));
    if (allDone) {
      const room = `match:${match.id}`;
      // Flip match status and broadcast updated match info for strict sync
      match.status = "in_progress";
      io.to(room).emit("matchStarted", { match: getMatchInfo(match) });
      // Broadcast a deterministic patch to set phase to Main
      const now = Date.now();
      // Update server-side aggregated snapshot
      match.game = deepMergeReplaceArrays(match.game || {}, { phase: "Main" });
      match.lastTs = now;
      io.to(room).emit("statePatch", { patch: { phase: "Main" }, t: now });
    }
  });

  socket.on("createLobby", (payload = {}) => {
    if (!authed) return;
    const player = getPlayerBySocket(socket);
    const visibility =
      payload && payload.visibility === "private" ? "private" : "open";
    const maxPlayers = Number.isInteger(payload && payload.maxPlayers)
      ? Math.max(2, Math.min(8, payload.maxPlayers))
      : 2;
    const name = payload && payload.name ? String(payload.name) : null;
    const lobby = createLobby(player.id, { name, visibility, maxPlayers });
    joinLobby(socket, player, lobby.id);
  });

  socket.on("joinLobby", (payload = {}) => {
    if (!authed) return;
    const player = getPlayerBySocket(socket);
    const lobbyId = payload.lobbyId || undefined;
    joinLobby(socket, player, lobbyId);
  });

  socket.on("leaveLobby", () => {
    if (!authed) return;
    const player = getPlayerBySocket(socket);
    leaveLobby(socket, player);
  });

  socket.on("setLobbyVisibility", (payload = {}) => {
    if (!authed) return;
    const player = getPlayerBySocket(socket);
    if (!player || !player.lobbyId) return;
    const lobby = lobbies.get(player.lobbyId);
    if (!lobby) return;
    if (lobby.hostId !== player.id) {
      socket.emit("error", {
        message: "Only host can change visibility",
        code: "not_host",
      });
      return;
    }
    const vis = payload.visibility === "private" ? "private" : "open";
    lobby.visibility = vis;
    markLobbyActive(lobby);
    io.to(`lobby:${lobby.id}`).emit("lobbyUpdated", {
      lobby: getLobbyInfo(lobby),
    });
    broadcastLobbies();
  });

  socket.on("inviteToLobby", (payload = {}) => {
    if (!authed) return;
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
      }
    }
  });

  socket.on("requestLobbies", () => {
    if (!authed) return;
    socket.emit("lobbiesUpdated", { lobbies: lobbiesArray() });
  });

  socket.on("requestPlayers", () => {
    if (!authed) return;
    socket.emit("playerList", { players: playersArray() });
  });

  socket.on("ready", (payload) => {
    if (!authed) return;
    const player = getPlayerBySocket(socket);
    if (!player.lobbyId) return;
    const lobby = lobbies.get(player.lobbyId);
    if (!lobby) return;
    if (payload && payload.ready) lobby.ready.add(player.id);
    else lobby.ready.delete(player.id);
    markLobbyActive(lobby);
    io.to(`lobby:${lobby.id}`).emit("lobbyUpdated", {
      lobby: getLobbyInfo(lobby),
    });
  });

  socket.on("startMatch", async (payload = {}) => {
    if (!authed) return;
    const player = getPlayerBySocket(socket);
    const matchType = payload.matchType || "constructed";
    const sealedConfig = payload.sealedConfig || null;

    // Debug logging
    console.log(
      `[DEBUG] startMatch request from player ${player?.id}, lobbyId: ${player?.lobbyId}, matchType: ${matchType}`
    );
    if (player?.lobbyId) {
      const lobby = lobbies.get(player.lobbyId);
      console.log(
        `[DEBUG] lobby found: ${!!lobby}, lobby status: ${
          lobby?.status
        }, players in lobby: ${lobby?.playerIds?.size}`
      );
    }

    const draftConfig = payload.draftConfig || null;
    const res = await startMatchFromLobby(
      player,
      matchType,
      sealedConfig,
      draftConfig
    );
    if (!res.ok) {
      console.log(`[DEBUG] startMatchFromLobby failed: ${res.error}`);
      socket.emit("error", { message: res.error || "Unable to start match" });
    }
  });

  socket.on("joinMatch", (payload) => {
    if (!authed) return;
    const matchId = payload && payload.matchId;
    const match = matches.get(matchId);
    if (!match) return;
    const player = getPlayerBySocket(socket);
    if (!player) return;
    player.matchId = match.id;
    // Ensure roster contains the player exactly once
    if (!match.playerIds.includes(player.id)) {
      match.playerIds.push(player.id);
    }
    const room = `match:${match.id}`;
    socket.join(room);
    // Broadcast updated match info to everyone in the match (including this socket)
    io.to(room).emit("matchStarted", { match: getMatchInfo(match) });
  });

  socket.on("leaveMatch", () => {
    if (!authed) return;
    const player = getPlayerBySocket(socket);
    if (!player || !player.matchId) return;
    const matchId = player.matchId;
    const match = matches.get(matchId);
    // Clear player association first
    player.matchId = null;
    // Leave the match room
    socket.leave(`match:${matchId}`);
    // Remove from match roster and broadcast updated info
    if (match) {
      match.playerIds = match.playerIds.filter((pid) => pid !== player.id);
      io.to(`match:${matchId}`).emit("matchStarted", {
        match: getMatchInfo(match),
      });
    }
  });

  socket.on("action", (payload) => {
    if (!authed) return;
    const player = getPlayerBySocket(socket);
    if (!player || !player.matchId) return;
    const matchRoom = `match:${player.matchId}`;
    // If this is the first transition to main phase, mark match as in_progress and broadcast updated match info
    try {
      const match = matches.get(player.matchId);
      const patch = payload ? payload.action : null;
      const now = Date.now();
      if (
        match &&
        match.status === "waiting" &&
        patch &&
        typeof patch === "object" &&
        patch.phase === "Main"
      ) {
        match.status = "in_progress";
        // Recording was already started when match was created, so just update status
        io.to(matchRoom).emit("matchStarted", { match: getMatchInfo(match) });
      }
      // Update server-side aggregated snapshot
      if (match && patch && typeof patch === "object") {
        let patchToApply = patch;
        // Special-case: merge events arrays to prevent overwriting on concurrent logs
        if (Array.isArray(patch.events)) {
          const prev = Array.isArray(match.game && match.game.events)
            ? match.game.events
            : [];
          const mergedEvents = mergeEvents(prev, patch.events);
          const mergedMaxId = mergedEvents.reduce(
            (mx, e) => Math.max(mx, Number(e.id) || 0),
            0
          );
          const seq = Math.max(mergedMaxId, Number(patch.eventSeq || 0) || 0);
          patchToApply = {
            ...patchToApply,
            events: mergedEvents,
            eventSeq: seq,
          };
        }
        match.game = deepMergeReplaceArrays(match.game || {}, patchToApply);
        match.lastTs = now;
        // Record the action for replay
        recordMatchAction(player.matchId, patchToApply, player.id);
        // Relay the merged action to all clients
        io.to(matchRoom).emit("statePatch", { patch: patchToApply, t: now });
      } else {
        // Relay the action as-is if not mergeable
        io.to(matchRoom).emit("statePatch", { patch, t: now });
      }
    } catch {
      // Fallback relay if any unexpected error occurs
      io.to(matchRoom).emit("statePatch", {
        patch: payload ? payload.action : null,
        t: Date.now(),
      });
    }
  });

  socket.on("chat", (payload = {}) => {
    if (!authed) return;
    const player = getPlayerBySocket(socket);
    if (!player) return;
    const content = String(
      payload && payload.content ? payload.content : ""
    ).slice(0, 500);
    if (!content) return;
    const requestedScope =
      payload && typeof payload.scope === "string" ? payload.scope : null;

    const from = getPlayerInfo(player.id);

    // Global chat: broadcast to all connected clients
    if (requestedScope === "global") {
      io.emit("chat", { from, content, scope: "global" });
      return;
    }

    // Room-scoped chat (lobby or match). Prefer requested scope if valid and the player is in that context; otherwise infer from player state.
    /** @type {'lobby'|'match'} */
    let scope = "lobby";
    let room = null;

    if (requestedScope === "match" && player.matchId) {
      scope = "match";
      room = `match:${player.matchId}`;
    } else if (requestedScope === "lobby" && player.lobbyId) {
      scope = "lobby";
      room = `lobby:${player.lobbyId}`;
    } else if (player.matchId) {
      scope = "match";
      room = `match:${player.matchId}`;
    } else if (player.lobbyId) {
      scope = "lobby";
      room = `lobby:${player.lobbyId}`;
    }

    if (room) io.to(room).emit("chat", { from, content, scope });
    else socket.emit("chat", { from: null, content, scope });
  });

  // Generic lightweight message channel
  socket.on("message", (payload = {}) => {
    if (!authed) return;
    const player = getPlayerBySocket(socket);
    if (!player || !player.matchId) return;
    const match = matches.get(player.matchId);
    if (!match || match.matchType !== "draft") return;

    const room = `match:${match.id}`;
    const type = payload && typeof payload.type === "string" ? payload.type : null;

    if (type === "playerReady") {
      const ready = !!(payload && payload.ready);
      // Determine sender's player key by roster index; ignore spoofed playerKey in payload
      const idx = match.playerIds.indexOf(player.id);
      if (idx === -1) return;
      const playerKey = idx === 1 ? "p2" : "p1";

      // Persist readiness in draftState for resync/debug visibility
      if (match.draftState) {
        if (!match.draftState.playerReady || typeof match.draftState.playerReady !== "object") {
          match.draftState.playerReady = { p1: false, p2: false };
        }
        match.draftState.playerReady[playerKey] = ready;
        const pr = match.draftState.playerReady;
        // If both players are ready and we're still in lobby/waiting phase, auto-start the draft
        if (
          match.draftState.phase === "waiting" &&
          pr && pr.p1 === true && pr.p2 === true
        ) {
          console.log(`[Draft] Both players ready in match ${match.id}. Auto-starting draft.`);
          // Fire and forget; handler above will emit draftUpdate or error
          startDraftForMatch(match).catch((err) =>
            console.error(`[Draft] Auto-start error: ${err && err.message ? err.message : String(err)}`)
          );
        }
      }

      // Broadcast canonical message to all clients in the match room
      io.to(room).emit("message", { type: "playerReady", playerKey, ready });
    }
  });

  socket.on("resyncRequest", () => {
    if (!authed) return;
    const player = getPlayerBySocket(socket);
    if (player && player.matchId && matches.has(player.matchId)) {
      const match = matches.get(player.matchId);
      const snap = { match: getMatchInfo(match) };
      if (match && match.game) {
        snap.game = match.game;
        snap.t = typeof match.lastTs === "number" ? match.lastTs : Date.now();
      }
      socket.emit("resyncResponse", { snapshot: snap });
    } else if (player && player.lobbyId && lobbies.has(player.lobbyId)) {
      const lobby = lobbies.get(player.lobbyId);
      socket.emit("resyncResponse", {
        snapshot: { lobby: getLobbyInfo(lobby) },
      });
    } else {
      socket.emit("resyncResponse", { snapshot: {} });
    }
  });

  // --- WebRTC signaling relay (prototype) ---------------------------------
  // These lightweight endpoints relay SDP/ICE between peers in the same match room.
  // No media flows through the server; it only brokers messages.
  socket.on("rtc:join", () => {
    if (!authed) return;
    const player = getPlayerBySocket(socket);
    if (!player || !player.matchId) return;
    const room = `match:${player.matchId}`;
    // Notify other peers that this player is ready for RTC negotiation
    socket.to(room).emit("rtc:peer-joined", { from: getPlayerInfo(player.id) });
  });

  socket.on("rtc:signal", (payload = {}) => {
    if (!authed) return;
    const player = getPlayerBySocket(socket);
    if (!player || !player.matchId) return;
    const room = `match:${player.matchId}`;
    const data = payload && typeof payload === "object" ? payload.data : null;
    if (!data) return;
    // Broadcast signal to all other peers in the match room
    socket.to(room).emit("rtc:signal", { from: player.id, data });
  });

  socket.on("rtc:leave", () => {
    if (!authed) return;
    const player = getPlayerBySocket(socket);
    if (!player || !player.matchId) return;
    const room = `match:${player.matchId}`;
    socket.to(room).emit("rtc:peer-left", { from: player.id });
  });

  // Submit sealed deck during deck construction phase
  socket.on("submitDeck", (payload) => {
    if (!authed) return;
    const player = getPlayerBySocket(socket);
    if (!player || !player.matchId) return;
    const match = matches.get(player.matchId);
    if (!match || match.status !== "deck_construction") return;

    const deck = payload && payload.deck;
    if (!deck) return;

    // Store the player's deck
    match.playerDecks.set(player.id, deck);

    // Check if all players have submitted decks
    const allSubmitted = match.playerIds.every((pid) =>
      match.playerDecks.has(pid)
    );

    // Broadcast deck submission update
    const room = `match:${match.id}`;
    io.to(room).emit("matchStarted", { match: getMatchInfo(match) });

    if (allSubmitted) {
      // All decks submitted, transition to waiting phase for game start
      match.status = "waiting";

      // Clear lobby associations for all players in this sealed match
      for (const pid of match.playerIds) {
        const p = players.get(pid);
        if (p) {
          p.lobbyId = null;
        }
      }

      // Now that sealed deck construction is complete, close the lobby
      const lobby = lobbies.get(match.lobbyId);
      if (lobby) {
        lobby.status = "closed";
        lobbies.delete(lobby.id);
        broadcastLobbies();
      }

      io.to(room).emit("matchStarted", { match: getMatchInfo(match) });
    }
  });

  socket.on("ping", (payload) => {
    const t = payload && typeof payload.t === "number" ? payload.t : Date.now();
    socket.emit("pong", { t });
  });

  // Match recording endpoints
  socket.on("getMatchRecordings", () => {
    if (!authed) return;
    const player = getPlayerBySocket(socket);
    console.log(
      `[Recording] Request for recordings from ${
        player?.displayName || "unknown"
      }, found ${matchRecordings.size} recordings`
    );
    const recordings = Array.from(matchRecordings.values()).map((r) => ({
      matchId: r.matchId,
      playerNames: r.playerNames,
      startTime: r.startTime,
      endTime: r.endTime,
      duration: r.endTime ? r.endTime - r.startTime : null,
      actionCount: r.actions.length,
      matchType: r.initialState?.matchType || "constructed",
      playerIds: r.initialState?.playerIds || [],
    }));
    socket.emit("matchRecordingsResponse", { recordings });
  });

  socket.on("getMatchRecording", (payload) => {
    if (!authed) return;
    const matchId = payload?.matchId;
    if (!matchId) return;
    const recording = matchRecordings.get(matchId);
    if (!recording) {
      socket.emit("matchRecordingResponse", { error: "Recording not found" });
      return;
    }
    socket.emit("matchRecordingResponse", { recording });
  });

  // Helper: start a draft for a match if in waiting phase
  async function startDraftForMatch(match, requestingPlayer = null) {
    if (!match || match.matchType !== "draft" || !match.draftState) return;
    if (match.draftState.phase !== "waiting") return;
    if (match.draftState.__startingDraft) {
      console.warn(`[Draft] startDraft already in progress for match ${match.id}.`);
      return;
    }
    match.draftState.__startingDraft = true;
    const room = `match:${match.id}`;
    const dc = match.draftConfig || { setMix: ["Beta"], packCount: 3, packSize: 15 };
    const { setMix, packCount, packSize } = dc;
    console.log(
      `[Draft] startDraft ${
        requestingPlayer
          ? `requested by ${requestingPlayer.displayName} (${requestingPlayer.id})`
          : "(auto)"
      } in match ${match.id}. phase=${match.draftState?.phase}, config=${JSON.stringify(dc)}`
    );
    try {
      // Build set sequence per pack index: ALWAYS use exact counts
      /** @type {string[]} */
      let setSequence = [];
      if (dc.packCounts && typeof dc.packCounts === 'object') {
        for (const [name, cnt] of Object.entries(dc.packCounts)) {
          const c = Math.max(0, Number(cnt) || 0);
          for (let i = 0; i < c; i++) setSequence.push(name);
        }
      }
      if (setSequence.length !== packCount) {
        // Error: packCounts must match packCount exactly
        console.error(`[Draft] packCounts sum (${setSequence.length}) does not match packCount (${packCount})`);
        const s = requestingPlayer
          ? io.sockets.sockets.get(players.get(requestingPlayer.id)?.socketId)
          : null;
        if (s) s.emit("error", { message: `Draft configuration error: pack counts must sum to ${packCount}` });
        return;
      }

      console.log(
        `[Draft] Generating packs: players=${match.playerIds.length}, packCount=${packCount}, packSize=${packSize}, setSeq=${setSequence.join(',')}`
      );
      const currentPacks = [];
      for (let playerIdx = 0; playerIdx < match.playerIds.length; playerIdx++) {
        const playerPacks = [];
        for (let packIdx = 0; packIdx < packCount; packIdx++) {
          const setName = setSequence[packIdx] || (Array.isArray(setMix) && setMix.length > 0 ? setMix[0] : 'Beta');
          const rng = createRngFromString(
            `${match.seed}|${match.playerIds[playerIdx]}|draft|${packIdx}`
          );
          const picks = await generateBoosterDeterministic(setName, rng, false);
          const cards = picks.slice(0, packSize).map((p, cardIdx) => ({
            id: `${String(p.variantId)}_${packIdx}_${cardIdx}_${match.playerIds[
              playerIdx
            ].slice(-4)}`,
            name: p.cardName || "",
            slug: String(p.slug || ""),
            type: p.type || null,
            cost: String(p.cost || ""),
            rarity: p.rarity || "common",
            element: p.element || [],
            setName: setName, // Include set information for proper card resolution
          }));
          playerPacks.push(cards);
        }
        currentPacks.push(playerPacks);
      }

      // Update draft state
      match.draftState.phase = "picking";
      match.draftState.allGeneratedPacks = currentPacks; // Store all generated packs
      match.draftState.currentPacks = currentPacks.map((packs) => packs[0]); // Start with first pack
      match.draftState.waitingFor = [...match.playerIds];

      const packSizes = match.draftState.currentPacks
        .map((p) => (Array.isArray(p) ? p.length : 0))
        .join(",");
      console.log(
        `[Draft] Draft started for match ${match.id}. phase=${
          match.draftState.phase
        } packIndex=${match.draftState.packIndex} pickNumber=${
          match.draftState.pickNumber
        } packSizes=${packSizes} waitingFor=${match.draftState.waitingFor.join(
          "|"
        )}`
      );
      // Broadcast draft state update
      io.to(room).emit("draftUpdate", match.draftState);
    } catch (error) {
      console.error(`[Draft] Error starting draft: ${error.message}`);
      const s = requestingPlayer
        ? io.sockets.sockets.get(players.get(requestingPlayer.id)?.socketId)
        : null;
      if (s) s.emit("error", { message: "Failed to start draft" });
    } finally {
      match.draftState.__startingDraft = false;
    }
  }

  // Draft-specific handlers
  socket.on("startDraft", async (payload) => {
    if (!authed) return;
    const player = getPlayerBySocket(socket);
    if (!player || !player.matchId) return;

    const match = matches.get(player.matchId);
    if (!match || match.matchType !== "draft" || !match.draftState) return;
    await startDraftForMatch(match, player);
  });

  socket.on("makeDraftPick", (payload) => {
    if (!authed) return;
    const player = getPlayerBySocket(socket);
    if (!player || !player.matchId) return;

    const match = matches.get(player.matchId);
    if (!match || match.matchType !== "draft" || !match.draftState) return;

    const { cardId, packIndex, pickNumber } = payload;
    const draftState = match.draftState;

    console.log(
      `[Draft] makeDraftPick <- ${player.displayName} (${player.id}): cardId=${cardId}, packIndex=${packIndex}, pickNumber=${pickNumber}`
    );
    // Validate pick
    if (draftState.phase !== "picking") {
      console.warn(`[Draft] Reject pick: wrong phase ${draftState.phase}`);
      return;
    }
    if (
      draftState.packIndex !== packIndex ||
      draftState.pickNumber !== pickNumber
    ) {
      console.warn(
        `[Draft] Reject pick: client at pack=${packIndex}/pick=${pickNumber} but server at pack=${draftState.packIndex}/pick=${draftState.pickNumber}`
      );
      return;
    }
    if (!draftState.waitingFor.includes(player.id)) {
      console.warn(`[Draft] Reject pick: not waiting for player ${player.id}`);
      return;
    }

    const playerIndex = match.playerIds.indexOf(player.id);
    if (playerIndex === -1) {
      console.warn(
        `[Draft] Reject pick: player ${player.id} not in match roster`
      );
      return;
    }

    const currentPack = draftState.currentPacks[playerIndex];
    if (!currentPack) {
      console.warn(
        `[Draft] Reject pick: current pack missing for playerIndex=${playerIndex}`
      );
      return;
    }

    const cardIndex = currentPack.findIndex((card) => card.id === cardId);
    if (cardIndex === -1) {
      console.warn(
        `[Draft] Reject pick: cardId ${cardId} not found in current pack for player ${player.id}`
      );
      return;
    }

    // Make the pick
    const pickedCard = currentPack.splice(cardIndex, 1)[0];
    draftState.picks[playerIndex].push(pickedCard);
    draftState.waitingFor = draftState.waitingFor.filter(
      (id) => id !== player.id
    );
    console.log(
      `[Draft] Pick accepted: ${player.id} -> ${
        pickedCard.slug || pickedCard.name
      } (${pickedCard.id}). Pack now has ${
        currentPack.length
      } cards. Picks count=${draftState.picks[playerIndex]?.length}`
    );

    // Check if all players have picked
    if (draftState.waitingFor.length === 0) {
      console.log(
        `[Draft] All picks received for pack=${draftState.packIndex}, pick=${pickNumber}`
      );
      // Advance pick number or pack
      if (draftState.pickNumber >= 15 || currentPack.length === 0) {
        // Move to next pack
        draftState.packIndex++;
        draftState.pickNumber = 1;

        if (draftState.packIndex >= 3) {
          // Draft complete
          draftState.phase = "complete";
          match.status = "deck_construction";
          const totals = draftState.picks
            .map((p) => (Array.isArray(p) ? p.length : 0))
            .join(",");
          console.log(
            `[Draft] Draft complete for match ${match.id}. Picks per player: ${totals}`
          );
        } else {
          // Start next pack
          draftState.pickNumber = 1;
          draftState.packDirection =
            draftState.packDirection === "left" ? "right" : "left";
          draftState.waitingFor = [...match.playerIds];
          
          // Load new packs from stored generated packs
          if (draftState.allGeneratedPacks && draftState.packIndex < 3) {
            draftState.currentPacks = draftState.allGeneratedPacks.map((packs) => 
              packs[draftState.packIndex] || []
            );
            console.log(
              `[Draft] Moving to next pack. packIndex=${
                draftState.packIndex
              }, direction=${
                draftState.packDirection
              }. Loaded new packs with sizes: ${draftState.currentPacks.map(p => p.length).join(",")}. waitingFor reset for players: ${draftState.waitingFor.join("|")}`
            );
          } else {
            console.log(
              `[Draft] Moving to next pack. packIndex=${
                draftState.packIndex
              }, direction=${
                draftState.packDirection
              }. waitingFor reset for players: ${draftState.waitingFor.join("|")}`
            );
          }
        }
      } else {
        // Pass packs and continue picking
        draftState.pickNumber++;
        draftState.phase = "passing";

        // Pass packs (rotate current packs)
        const temp = [...draftState.currentPacks];
        if (draftState.packDirection === "left") {
          for (let i = 0; i < temp.length; i++) {
            draftState.currentPacks[(i + 1) % temp.length] = temp[i];
          }
        } else {
          for (let i = 0; i < temp.length; i++) {
            draftState.currentPacks[i] = temp[(i + 1) % temp.length];
          }
        }

        draftState.phase = "picking";
        draftState.waitingFor = [...match.playerIds];
        const sizes = draftState.currentPacks
          .map((p) => (Array.isArray(p) ? p.length : 0))
          .join(",");
        console.log(
          `[Draft] Passing packs ${draftState.packDirection}. Next pick=${
            draftState.pickNumber
          }. packSizes=${sizes}. waitingFor=${draftState.waitingFor.join("|")}`
        );
      }
    }

    // Broadcast updated draft state
    console.log(
      `[Draft] Emitting draftUpdate: phase=${draftState.phase}, packIndex=${draftState.packIndex}, pickNumber=${draftState.pickNumber}, waitingFor=${draftState.waitingFor.length}`
    );
    io.to(`match:${match.id}`).emit("draftUpdate", draftState);
  });

  socket.on("chooseDraftPack", (payload) => {
    if (!authed) return;
    const player = getPlayerBySocket(socket);
    if (!player || !player.matchId) return;

    const match = matches.get(player.matchId);
    if (!match || match.matchType !== "draft" || !match.draftState) return;

    const { setChoice, packIndex } = payload;
    const playerIndex = match.playerIds.indexOf(player.id);
    if (playerIndex === -1) return;

    // Store pack choice
    match.draftState.packChoice[playerIndex] = setChoice;
    console.log(
      `[Draft] chooseDraftPack by ${player.displayName} (${player.id}): packIndex=${packIndex} choice=${setChoice}`
    );
    const choices = match.draftState.packChoice.map((x) => x || "-").join(",");
    console.log(`[Draft] Current pack choices: ${choices}`);

    // Broadcast updated draft state
    io.to(`match:${match.id}`).emit("draftUpdate", match.draftState);
  });

  socket.on("submitDeck", (payload) => {
    if (!authed) return;
    const player = getPlayerBySocket(socket);
    if (!player || !player.matchId) return;

    const match = matches.get(player.matchId);
    if (!match || !match.playerDecks) return;

    // Store the submitted deck
    match.playerDecks.set(player.id, payload.deck || payload);

    console.log(
      `[Match] Deck submitted by ${player.displayName} for match ${match.id}`
    );

    // Check if all players have submitted decks
    const allSubmitted = match.playerIds.every((pid) =>
      match.playerDecks.has(pid)
    );
    if (allSubmitted && match.status === "deck_construction") {
      console.log(
        `[Match] All decks submitted for match ${match.id}, transitioning to in_progress`
      );
      match.status = "in_progress";

      // Clear lobby associations since match is starting
      for (const pid of match.playerIds) {
        const p = players.get(pid);
        if (p) p.lobbyId = null;
      }

      // Close associated lobby
      if (match.lobbyId) {
        const lobby = lobbies.get(match.lobbyId);
        if (lobby) {
          lobby.status = "closed";
          lobbies.delete(match.lobbyId);
          broadcastLobbies();
        }
      }
    }

    // Broadcast updated match info
    io.to(`match:${match.id}`).emit("matchStarted", {
      match: getMatchInfo(match),
    });
  });

  socket.on("disconnect", () => {
    const pid = playerIdBySocket.get(socket.id);
    if (!pid) return;
    const player = players.get(pid);
    playerIdBySocket.delete(socket.id);
    if (player) {
      // Keep player record for potential rejoin, just clear socket association
      player.socketId = null;
    }
    broadcastPlayers();
  });
});

// Periodic cleanup: close idle open lobbies with no connected players after 3 minutes
setInterval(() => {
  const now = Date.now();
  for (const lobby of lobbies.values()) {
    if (lobby.status !== "open") continue;
    const connectedCount = Array.from(lobby.playerIds).reduce(
      (acc, pid) => acc + (isPlayerConnected(pid) ? 1 : 0),
      0
    );
    if (
      connectedCount === 0 &&
      now - (lobby.lastActive || now) > 3 * 60 * 1000
    ) {
      lobby.status = "closed";
      lobbies.delete(lobby.id);
      broadcastLobbies();
    }
  }
}, 30 * 1000);

server.listen(PORT, () => {
  console.log(
    `[sorcery] Socket.IO server listening on http://localhost:${PORT}`
  );
});
