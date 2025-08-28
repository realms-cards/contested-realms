// Simple Socket.IO server for Sorcery online MVP
// Run with: node server/index.js

const http = require("http");
const { Server } = require("socket.io");

const PORT = process.env.PORT ? Number(process.env.PORT) : 3001;

const server = http.createServer();
const io = new Server(server, {
  cors: {
    origin: [
      "http://localhost:3000",
      "http://127.0.0.1:3000",
      "http://localhost:3002",
      "http://127.0.0.1:3002",
      "http://localhost:3009",
      "http://127.0.0.1:3009",
      "http://localhost:3010",
      "http://127.0.0.1:3010",
      "http://localhost:3011",
      "http://127.0.0.1:3011",
    ],
    credentials: true,
  },
});

// In-memory state
// Players keyed by stable playerId (not socket id)
/** @type {Map<string, { id: string, displayName: string, socketId: string|null, lobbyId?: string|null, matchId?: string|null }>} */
const players = new Map();
/** @type {Map<string, string>} socket.id -> playerId */
const playerIdBySocket = new Map();
/** @type {Map<string, { id: string, hostId: string, playerIds: Set<string>, status: 'open'|'started'|'closed', maxPlayers: number, ready: Set<string>, visibility: 'open'|'private' }>} */
const lobbies = new Map();
/** @type {Map<string, { id: string, lobbyId?: string|null, playerIds: string[], status: 'waiting'|'in_progress'|'ended', seed: string, turn?: string, winnerId?: string|null }>} */
const matches = new Map();
/** @type {Map<string, Set<string>>} lobbyId -> set of invited playerIds */
const lobbyInvites = new Map();

function rid(prefix) {
  return `${prefix}_${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-4)}`;
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
    hostId: lobby.hostId,
    players: Array.from(lobby.playerIds).map(getPlayerInfo).filter(Boolean),
    status: lobby.status,
    maxPlayers: lobby.maxPlayers,
    visibility: lobby.visibility,
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
  const lobby = {
    id: rid("lobby"),
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
    socket.emit("error", { message: "Lobby is not open", code: "lobby_not_open" });
    return;
  }
  if (lobby.playerIds.size >= lobby.maxPlayers) {
    socket.emit("error", { message: "Lobby is full", code: "lobby_full" });
    return;
  }
  if (suppliedLobbyId && lobby.visibility === "private") {
    const allowed = lobby.hostId === player.id || (lobbyInvites.get(lobby.id)?.has(player.id) ?? false);
    if (!allowed) {
      socket.emit("error", { message: "Lobby is private. You need an invite.", code: "private_lobby" });
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
  }

  if (lobbies.has(lobbyId)) {
    io.to(`lobby:${lobbyId}`).emit("lobbyUpdated", { lobby: getLobbyInfo(lobby) });
  }
  broadcastLobbies();
}

function startMatchFromLobby(requestingPlayer) {
  const lobbyId = requestingPlayer.lobbyId;
  if (!lobbyId) return { ok: false, error: "Not in a lobby" };
  const lobby = lobbies.get(lobbyId);
  if (!lobby) return { ok: false, error: "Lobby not found" };
  if (lobby.hostId !== requestingPlayer.id) return { ok: false, error: "Only host can start" };
  if (lobby.playerIds.size < 2) return { ok: false, error: "Need at least 2 players" };
  // All players must be ready
  for (const pid of lobby.playerIds) {
    if (!lobby.ready.has(pid)) return { ok: false, error: "All players must be ready" };
  }

  const match = {
    id: rid("match"),
    lobbyId: lobby.id,
    playerIds: Array.from(lobby.playerIds),
    status: "waiting",
    seed: `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
    turn: Array.from(lobby.playerIds)[0],
    winnerId: null,
  };
  matches.set(match.id, match);

  // Join all sockets to match room
  for (const pid of match.playerIds) {
    const p = players.get(pid);
    if (!p) continue;
    const s = io.sockets.sockets.get(p.socketId);
    if (s) s.join(`match:${match.id}`);
    p.matchId = match.id;
    p.lobbyId = null;
  }

  // Close and remove the lobby immediately once a match starts
  lobby.status = "closed";
  lobbies.delete(lobby.id);
  const matchInfo = getMatchInfo(match);
  io.to(`match:${match.id}`).emit("matchStarted", { match: matchInfo });
  broadcastLobbies();

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
  for (const p of players.values()) arr.push(getPlayerInfo(p.id));
  return arr;
}

function broadcastLobbies() {
  io.emit("lobbiesUpdated", { lobbies: lobbiesArray() });
}

function broadcastPlayers() {
  io.emit("playerList", { players: playersArray() });
}

io.on("connection", (socket) => {
  let authed = false;

  socket.on("hello", (payload) => {
    const displayName = (payload && payload.displayName ? String(payload.displayName) : "Player").slice(0, 40) || "Player";
    const providedId = payload && payload.playerId ? String(payload.playerId) : null;
    const playerId = providedId || rid("p");

    let player = players.get(playerId);
    if (!player) {
      player = { id: playerId, displayName, socketId: socket.id, lobbyId: null, matchId: null };
      players.set(playerId, player);
    } else {
      player.displayName = displayName;
      player.socketId = socket.id;
    }
    playerIdBySocket.set(socket.id, playerId);
    authed = true;

    socket.emit("welcome", { you: { id: player.id, displayName: player.displayName } });
    broadcastPlayers();

    // Rejoin previous rooms if any
    if (player.matchId && matches.has(player.matchId)) {
      socket.join(`match:${player.matchId}`);
      const m = matches.get(player.matchId);
      socket.emit("matchStarted", { match: getMatchInfo(m) });
    } else if (player.lobbyId && lobbies.has(player.lobbyId)) {
      socket.join(`lobby:${player.lobbyId}`);
      const l = lobbies.get(player.lobbyId);
      socket.emit("joinedLobby", { lobby: getLobbyInfo(l) });
    }
  });

  socket.on("createLobby", (payload = {}) => {
    if (!authed) return;
    const player = getPlayerBySocket(socket);
    const visibility = payload && payload.visibility === "private" ? "private" : "open";
    const maxPlayers = Number.isInteger(payload && payload.maxPlayers)
      ? Math.max(2, Math.min(8, payload.maxPlayers))
      : 2;
    const lobby = createLobby(player.id, { visibility, maxPlayers });
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
      socket.emit("error", { message: "Only host can change visibility", code: "not_host" });
      return;
    }
    const vis = payload.visibility === "private" ? "private" : "open";
    lobby.visibility = vis;
    markLobbyActive(lobby);
    io.to(`lobby:${lobby.id}`).emit("lobbyUpdated", { lobby: getLobbyInfo(lobby) });
    broadcastLobbies();
  });

  socket.on("inviteToLobby", (payload = {}) => {
    if (!authed) return;
    const inviter = getPlayerBySocket(socket);
    if (!inviter) return;
    const targetId = payload && payload.targetPlayerId ? String(payload.targetPlayerId) : null;
    const lobbyId = (payload && payload.lobbyId) || inviter.lobbyId;
    if (!targetId || !lobbyId) return;
    const lobby = lobbies.get(lobbyId);
    if (!lobby) return;
    if (lobby.hostId !== inviter.id) {
      socket.emit("error", { message: "Only host can invite", code: "not_host" });
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
    io.to(`lobby:${lobby.id}`).emit("lobbyUpdated", { lobby: getLobbyInfo(lobby) });
  });

  socket.on("startMatch", () => {
    if (!authed) return;
    const player = getPlayerBySocket(socket);
    const res = startMatchFromLobby(player);
    if (!res.ok) {
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
    socket.join(`match:${match.id}`);
    socket.emit("matchStarted", { match: getMatchInfo(match) });
  });

  socket.on("action", (payload) => {
    if (!authed) return;
    const player = getPlayerBySocket(socket);
    if (!player || !player.matchId) return;
    const matchRoom = `match:${player.matchId}`;
    // MVP: relay as a statePatch for clients to handle deterministically
    io.to(matchRoom).emit("statePatch", { patch: payload ? payload.action : null, t: Date.now() });
  });

  socket.on("chat", (payload = {}) => {
    if (!authed) return;
    const player = getPlayerBySocket(socket);
    if (!player) return;
    const content = String(payload && payload.content ? payload.content : "").slice(0, 500);
    if (!content) return;
    const requestedScope = payload && typeof payload.scope === 'string' ? payload.scope : null;

    const from = getPlayerInfo(player.id);

    // Global chat: broadcast to all connected clients
    if (requestedScope === 'global') {
      io.emit("chat", { from, content, scope: 'global' });
      return;
    }

    // Room-scoped chat (lobby or match). Prefer requested scope if valid and the player is in that context; otherwise infer from player state.
    /** @type {'lobby'|'match'} */
    let scope = 'lobby';
    let room = null;

    if (requestedScope === 'match' && player.matchId) {
      scope = 'match';
      room = `match:${player.matchId}`;
    } else if (requestedScope === 'lobby' && player.lobbyId) {
      scope = 'lobby';
      room = `lobby:${player.lobbyId}`;
    } else if (player.matchId) {
      scope = 'match';
      room = `match:${player.matchId}`;
    } else if (player.lobbyId) {
      scope = 'lobby';
      room = `lobby:${player.lobbyId}`;
    }

    if (room) io.to(room).emit("chat", { from, content, scope });
    else socket.emit("chat", { from: null, content, scope });
  });

  socket.on("resyncRequest", () => {
    if (!authed) return;
    const player = getPlayerBySocket(socket);
    if (player && player.matchId && matches.has(player.matchId)) {
      const match = matches.get(player.matchId);
      socket.emit("resyncResponse", { snapshot: { match: getMatchInfo(match) } });
    } else if (player && player.lobbyId && lobbies.has(player.lobbyId)) {
      const lobby = lobbies.get(player.lobbyId);
      socket.emit("resyncResponse", { snapshot: { lobby: getLobbyInfo(lobby) } });
    } else {
      socket.emit("resyncResponse", { snapshot: {} });
    }
  });

  socket.on("ping", (payload) => {
    const t = payload && typeof payload.t === "number" ? payload.t : Date.now();
    socket.emit("pong", { t });
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
    if (lobby.status !== 'open') continue;
    const connectedCount = Array.from(lobby.playerIds).reduce((acc, pid) => acc + (isPlayerConnected(pid) ? 1 : 0), 0);
    if (connectedCount === 0 && now - (lobby.lastActive || now) > 3 * 60 * 1000) {
      lobby.status = 'closed';
      lobbies.delete(lobby.id);
      broadcastLobbies();
    }
  }
}, 30 * 1000);

server.listen(PORT, () => {
  console.log(`[sorcery] Socket.IO server listening on http://localhost:${PORT}`);
});