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
/** @type {Map<string, { id: string, displayName: string, socketId: string, lobbyId?: string|null, matchId?: string|null }>} */
const players = new Map();
/** @type {Map<string, { id: string, hostId: string, playerIds: Set<string>, status: 'open'|'started'|'closed', maxPlayers: number, ready: Set<string> }>} */
const lobbies = new Map();
/** @type {Map<string, { id: string, lobbyId?: string|null, playerIds: string[], status: 'waiting'|'in_progress'|'ended', seed: string, turn?: string, winnerId?: string|null }>} */
const matches = new Map();

function rid(prefix) {
  return `${prefix}_${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-4)}`;
}

function getPlayerInfo(playerId) {
  const p = players.get(playerId);
  if (!p) return null;
  return { id: p.id, displayName: p.displayName };
}

function getLobbyInfo(lobby) {
  return {
    id: lobby.id,
    hostId: lobby.hostId,
    players: Array.from(lobby.playerIds).map(getPlayerInfo).filter(Boolean),
    status: lobby.status,
    maxPlayers: lobby.maxPlayers,
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
    if (lobby.status === "open" && lobby.playerIds.size < lobby.maxPlayers) return lobby;
  }
  return null;
}

function createLobby(hostId) {
  const lobby = {
    id: rid("lobby"),
    hostId,
    playerIds: new Set(),
    status: "open",
    maxPlayers: 2,
    ready: new Set(),
  };
  lobbies.set(lobby.id, lobby);
  return lobby;
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

  lobby.playerIds.add(player.id);
  player.lobbyId = lobby.id;
  socket.join(`lobby:${lobby.id}`);

  // If lobby has no host (edge), set host
  if (!lobby.hostId) lobby.hostId = player.id;

  const info = getLobbyInfo(lobby);
  socket.emit("joinedLobby", { lobby: info });
  io.to(`lobby:${lobby.id}`).emit("lobbyUpdated", { lobby: info });
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

  lobby.status = "started";
  const matchInfo = getMatchInfo(match);
  io.to(`match:${match.id}`).emit("matchStarted", { match: matchInfo });
  // Update old lobby viewers if any
  io.to(`lobby:${lobby.id}`).emit("lobbyUpdated", { lobby: getLobbyInfo(lobby) });

  return { ok: true, matchId: match.id };
}

io.on("connection", (socket) => {
  let authed = false;

  socket.on("hello", (payload) => {
    const displayName = (payload && payload.displayName ? String(payload.displayName) : "Player")
      .slice(0, 40) || "Player";
    const player = { id: socket.id, displayName, socketId: socket.id, lobbyId: null, matchId: null };
    players.set(socket.id, player);
    authed = true;
    socket.emit("welcome", { you: { id: player.id, displayName: player.displayName } });
  });

  socket.on("createLobby", () => {
    if (!authed) return;
    const player = players.get(socket.id);
    const lobby = createLobby(player.id);
    joinLobby(socket, player, lobby.id);
  });

  socket.on("joinLobby", (payload = {}) => {
    if (!authed) return;
    const player = players.get(socket.id);
    const lobbyId = payload.lobbyId || undefined;
    joinLobby(socket, player, lobbyId);
  });

  socket.on("leaveLobby", () => {
    if (!authed) return;
    const player = players.get(socket.id);
    leaveLobby(socket, player);
  });

  socket.on("ready", (payload) => {
    if (!authed) return;
    const player = players.get(socket.id);
    if (!player.lobbyId) return;
    const lobby = lobbies.get(player.lobbyId);
    if (!lobby) return;
    if (payload && payload.ready) lobby.ready.add(player.id);
    else lobby.ready.delete(player.id);
    io.to(`lobby:${lobby.id}`).emit("lobbyUpdated", { lobby: getLobbyInfo(lobby) });
  });

  socket.on("startMatch", () => {
    if (!authed) return;
    const player = players.get(socket.id);
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
    const player = players.get(socket.id);
    if (!player) return;
    player.matchId = match.id;
    socket.join(`match:${match.id}`);
    socket.emit("matchStarted", { match: getMatchInfo(match) });
  });

  socket.on("action", (payload) => {
    if (!authed) return;
    const player = players.get(socket.id);
    if (!player || !player.matchId) return;
    const matchRoom = `match:${player.matchId}`;
    // MVP: relay as a statePatch for clients to handle deterministically
    io.to(matchRoom).emit("statePatch", { patch: payload ? payload.action : null, t: Date.now() });
  });

  socket.on("chat", (payload) => {
    if (!authed) return;
    const player = players.get(socket.id);
    if (!player) return;
    const content = String(payload && payload.content ? payload.content : "").slice(0, 500);
    if (!content) return;
    /** @type {'lobby'|'match'} */
    let scope = "lobby";
    let room = null;
    if (player.matchId) {
      scope = "match";
      room = `match:${player.matchId}`;
    } else if (player.lobbyId) {
      scope = "lobby";
      room = `lobby:${player.lobbyId}`;
    }
    const from = getPlayerInfo(player.id);
    if (room) io.to(room).emit("chat", { from, content, scope });
    else socket.emit("chat", { from: null, content, scope });
  });

  socket.on("resyncRequest", () => {
    if (!authed) return;
    const player = players.get(socket.id);
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
    const player = players.get(socket.id);
    if (!player) return;
    
    // Remove from lobby when disconnecting
    if (player.lobbyId) {
      leaveLobby(socket, player);
    }
    
    // Remove player from lookup
    players.delete(socket.id);
  });
});

server.listen(PORT, () => {
  console.log(`[sorcery] Socket.IO server listening on http://localhost:${PORT}`);
});