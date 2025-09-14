// Simple Socket.IO server for Sorcery online MVP
// Run with: node server/index.js

const http = require("http");
const { Server } = require("socket.io");
const {
  createRngFromString,
  generateBoosterDeterministic,
} = require("./booster");
const { BotManager } = require("./botManager");
const { applyTurnStart, validateAction, ensureCosts } = require("./rules");
const { applyGenesis, applyKeywordAnnotations } = require("./rules/triggers");

const PORT = process.env.PORT ? Number(process.env.PORT) : 3010;
// Rules enforcement modes:
//  - off: helpers only, no strict gating
//  - bot_only: enforce for CPU bots only
//  - all: enforce for all players
const RULES_ENFORCE_MODE = (process.env.RULES_ENFORCE_MODE || 'off').toLowerCase();
const RULES_HELPERS_ENABLED = !(
  process.env.RULES_HELPERS_ENABLED === '0' ||
  (process.env.RULES_HELPERS_ENABLED || '').toLowerCase() === 'false'
);

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
/** @type {Map<string, { id: string, name: string|null, hostId: string, playerIds: Set<string>, status: 'open'|'started'|'closed', maxPlayers: number, ready: Set<string>, visibility: 'open'|'private', plannedMatchType?: 'constructed'|'sealed'|'draft' }>} */
const lobbies = new Map();
/** @type {Map<string, { id: string, lobbyId?: string|null, playerIds: string[], status: 'waiting'|'deck_construction'|'in_progress'|'ended', seed: string, turn?: string, winnerId?: string|null, matchType?: 'constructed'|'sealed', sealedConfig?: { packCount: number, setMix: string[], timeLimit: number, constructionStartTime?: number, packCounts?: Record<string, number>, replaceAvatars?: boolean }, playerDecks?: Map<string, any>, sealedPacks?: Record<string, Array<{ id: string, set: string, cards: Array<{ id: string, name: string, set: string, slug: string, type?: string|null, cost?: number|null, rarity: string }> }>> }>} */
const matches = new Map();
/** @type {Map<string, { matchId: string, playerNames: string[], startTime: number, endTime?: number, initialState?: any, actions: Array<{ patch: any, timestamp: number, playerId: string }> }>} */
const matchRecordings = new Map();
/** @type {Map<string, Set<string>>} lobbyId -> set of invited playerIds */
const lobbyInvites = new Map();
/** @type {Map<string, Set<string>>} matchId -> set of playerIds participating in WebRTC */
const rtcParticipants = new Map();
/** @type {Map<string, { id: string, displayName: string, matchId: string, joinedAt: number }>} playerId -> participant details */
const participantDetails = new Map();

// Bot manager for headless CPU clients
// Initialized after helper functions are hoisted

// Global feature flag for CPU bots (default: disabled)
const CPU_BOTS_ENABLED =
  process.env.CPU_BOTS_ENABLED === "1" ||
  process.env.CPU_BOTS_ENABLED === "true";

// Lazy loader: only require the headless BotClient when feature is enabled
function loadBotClientCtor() {
  if (!CPU_BOTS_ENABLED) return null;
  try {
    const mod = require("../bots/headless-bot-client");
    return mod && mod.BotClient ? mod.BotClient : null;
  } catch (e) {
    try { console.warn("[Bot] BotClient module unavailable:", e?.message || e); } catch {}
    return null;
  }
}

// Instantiate bot manager (functions are hoisted, safe to pass)
const botManager = new BotManager(io, players, lobbies, matches, getLobbyInfo, getMatchInfo, isCpuPlayerId);

// -----------------------------
// Helpers: CPU detection & cleanup
// -----------------------------
function isCpuPlayerId(id) {
  return typeof id === 'string' && id.startsWith('cpu_');
}

// Returns true if there is at least one non-CPU (human) player in the lobby
function lobbyHasHumanPlayers(lobby) {
  if (!lobby || !lobby.playerIds || lobby.playerIds.size === 0) return false;
  for (const pid of lobby.playerIds) {
    if (!isCpuPlayerId(pid)) return true;
  }
  return false;
}

// Bot lifecycle helpers moved into BotManager

// -----------------------------
// Helpers: deck normalization & validation
// -----------------------------
function normalizeDeckPayload(deckPayload) {
  if (!deckPayload) return [];
  if (Array.isArray(deckPayload)) return deckPayload;
  if (deckPayload.main && Array.isArray(deckPayload.main)) return deckPayload.main;
  if (deckPayload.mainboard && Array.isArray(deckPayload.mainboard)) return deckPayload.mainboard;
  // Accept direct object with cards
  return [];
}

function isSiteType(t) {
  return typeof t === 'string' && t.toLowerCase().includes('site');
}
function isAvatarType(t) {
  return typeof t === 'string' && t.toLowerCase().includes('avatar');
}

function validateDeckCards(cards) {
  const errors = [];
  if (!Array.isArray(cards) || cards.length === 0) {
    errors.push('Deck is empty or invalid');
  }
  // Count
  let avatarCount = 0;
  let siteCount = 0;
  let spellCount = 0;
  for (const c of cards) {
    const t = c?.type || '';
    if (isAvatarType(t)) avatarCount++;
    else if (isSiteType(t) || (typeof c?.name === 'string' && ['Spire','Stream','Valley','Wasteland'].includes(c.name))) siteCount++;
    else spellCount++;
  }
  if (avatarCount !== 1) {
    errors.push(avatarCount === 0 ? 'Deck requires exactly 1 Avatar' : 'Deck has multiple Avatars');
  }
  if (siteCount < 12) errors.push('Atlas needs at least 12 sites');
  if (spellCount < 24) errors.push('Spellbook needs at least 24 cards (excluding Avatar)');
  return { isValid: errors.length === 0, errors, counts: { avatarCount, siteCount, spellCount } };
}

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
    plannedMatchType: lobby.plannedMatchType,
  };
}

function getMatchInfo(match) {
  return {
    id: match.id,
    lobbyId: match.lobbyId || undefined,
    lobbyName: match.lobbyName || undefined,
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
    plannedMatchType: 'constructed',
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
    // Clean up any idle CPU bots from this lobby before deletion
    try { botManager.cleanupBotsForLobby(lobbyId); } catch {}
    lobbies.delete(lobbyId);
  } else if (!lobbyHasHumanPlayers(lobby)) {
    // If only CPUs remain, close the lobby and cleanup bots instead of promoting a CPU to host
    lobby.status = "closed";
    try { botManager.cleanupBotsForLobby(lobbyId); } catch {}
    lobbies.delete(lobbyId);
    broadcastLobbies();
  } else if (lobby.hostId === player.id) {
    // Reassign host to a remaining human if possible, otherwise first remaining
    const remaining = Array.from(lobby.playerIds);
    const humanNext = remaining.find((pid) => !isCpuPlayerId(pid)) || remaining[0];
    lobby.hostId = humanNext;
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

  // Notify lobby participants immediately that a match has started so UI can show join controls
  try {
    const basicInfo = getMatchInfo(match);
    io.to(`lobby:${lobby.id}`).emit("matchStarted", { match: basicInfo });
  } catch {}

  // For sealed/draft matches, keep lobby active during deck construction/draft
  // For constructed matches, close lobby immediately
  if (matchType === "constructed") {
    // Update plannedMatchType to reflect the started match
    try { const lb = lobbies.get(lobby.id); if (lb) lb.plannedMatchType = matchType; } catch {}
    lobby.status = "closed";
    // Clean up bots associated with this lobby
    try { botManager.cleanupBotsForLobby(lobby.id); } catch {}
    lobbies.delete(lobby.id);
    broadcastLobbies();
  }
  else {
    // Keep lobby open during setup phases; also update plannedMatchType
    try { const lb = lobbies.get(lobby.id); if (lb) lb.plannedMatchType = matchType; } catch {}
    io.to(`lobby:${lobby.id}`).emit("lobbyUpdated", { lobby: getLobbyInfo(lobby) });
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
  // Also echo to lobby room if still open (sealed/draft) to keep UI in sync
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

    try {
      const doneCount = match.mulliganDone.size;
      const total = Array.isArray(match.playerIds) ? match.playerIds.length : 0;
      const waitingFor = Array.isArray(match.playerIds)
        ? match.playerIds.filter((pid) => !match.mulliganDone.has(pid))
        : [];
      const names = waitingFor.map((pid) => players.get(pid)?.displayName || pid);
      console.log(`[Setup] mulliganDone from ${player.displayName} (${player.id}). ${doneCount}/${total} complete. Waiting for: ${names.join(", ") || "none"}`);
    } catch {}

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
      // If currentPlayer isn't set yet (e.g., human winner hasn't chosen), set a sensible default:
      // prefer setupWinner to go first, otherwise P1.
      let cp = (match.game && typeof match.game.currentPlayer === 'number') ? match.game.currentPlayer : null;
      if (cp !== 1 && cp !== 2) {
        const sw = match.game ? match.game.setupWinner : null;
        cp = sw === 'p2' ? 2 : 1; // default to P1 if undefined
      }
      const mainPatch = { phase: "Main", currentPlayer: cp };
      // Update server-side aggregated snapshot
      match.game = deepMergeReplaceArrays(match.game || {}, mainPatch);
      match.lastTs = now;
      io.to(room).emit("statePatch", { patch: mainPatch, t: now });
      try {
        console.log(`[Setup] All mulligans complete for match ${match.id}. Starting game.`);
      } catch {}
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

  // Host sets planned match type for lobby (visible to all clients)
  socket.on("setLobbyPlan", (payload = {}) => {
    if (!authed) return;
    const player = getPlayerBySocket(socket);
    if (!player || !player.lobbyId) return;
    const lobby = lobbies.get(player.lobbyId);
    if (!lobby) return;
    if (lobby.hostId !== player.id) {
      socket.emit("error", {
        message: "Only host can set planned match",
        code: "not_host",
      });
      return;
    }
    const t = payload && typeof payload.plannedMatchType === 'string' ? payload.plannedMatchType : null;
    if (t !== 'constructed' && t !== 'sealed' && t !== 'draft') return;
    lobby.plannedMatchType = t;
    markLobbyActive(lobby);
    io.to(`lobby:${lobby.id}`).emit("lobbyUpdated", { lobby: getLobbyInfo(lobby) });
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

  // Host-only: add a CPU bot to the current lobby
  socket.on("addCpuBot", (payload = {}) => {
    if (!authed) return;
    if (!CPU_BOTS_ENABLED) {
      socket.emit("error", { message: "CPU bots are disabled", code: "feature_disabled" });
      return;
    }
    const BotClient = loadBotClientCtor();
    if (!BotClient) {
      socket.emit("error", { message: "CPU bot component not available", code: "bot_unavailable" });
      return;
    }
    const host = getPlayerBySocket(socket);
    if (!host || !host.lobbyId) return;
    const lobby = lobbies.get(host.lobbyId);
    if (!lobby) return;
    if (lobby.hostId !== host.id) {
      socket.emit("error", { message: "Only host can add CPU bot", code: "not_host" });
      return;
    }
    if (lobby.playerIds.size >= lobby.maxPlayers) {
      socket.emit("error", { message: "Lobby is full", code: "lobby_full" });
      return;
    }

    const botId = rid("cpu");
    // Pre-authorize bot for private lobbies via invite
    if (lobby.visibility === "private") {
      if (!lobbyInvites.has(lobby.id)) lobbyInvites.set(lobby.id, new Set());
      lobbyInvites.get(lobby.id).add(botId);
    }

    const nameBase = (payload && typeof payload.displayName === "string" ? payload.displayName : "").trim();
    const displayName = (nameBase || `CPU Bot ${botId.slice(-4)}`).slice(0, 40);
    const serverUrl = `http://localhost:${PORT}`;

    try {
      const bot = new BotClient({ serverUrl, displayName, playerId: botId, lobbyId: lobby.id });
      botManager.registerBot(botId, bot);
      bot.start().catch((err) => {
        console.error(`[Bot] Failed to start bot ${botId}:`, err);
        botManager.stopAndRemoveBot(botId, 'start_failed');
      });
      console.log(`[Bot] Spawned CPU bot ${displayName} (${botId}) for lobby ${lobby.id}`);
    } catch (err) {
      console.error(`[Bot] Error creating bot:`, err);
      socket.emit("error", { message: "Failed to spawn CPU bot" });
    }
  });

  // Host-only: remove a CPU bot from the current lobby
  // Payload: { playerId?: string }
  socket.on("removeCpuBot", (payload = {}) => {
    if (!authed) return;
    if (!CPU_BOTS_ENABLED) {
      socket.emit("error", { message: "CPU bots are disabled", code: "feature_disabled" });
      return;
    }
    const host = getPlayerBySocket(socket);
    if (!host || !host.lobbyId) return;
    const lobby = lobbies.get(host.lobbyId);
    if (!lobby) return;
    if (lobby.hostId !== host.id) {
      socket.emit("error", { message: "Only host can remove CPU bot", code: "not_host" });
      return;
    }

    // Determine target CPU player in this lobby
    const requestedId = payload && typeof payload.playerId === 'string' ? payload.playerId : null;
    let targetId = null;
    if (requestedId && lobby.playerIds.has(requestedId) && isCpuPlayerId(requestedId)) {
      targetId = requestedId;
    } else {
      // Fallback: pick any CPU in the lobby
      for (const pid of lobby.playerIds) {
        if (isCpuPlayerId(pid)) { targetId = pid; break; }
      }
    }
    if (!targetId) {
      socket.emit("error", { message: "No CPU bot found in this lobby", code: "no_cpu_in_lobby" });
      return;
    }

    botManager.stopAndRemoveBot(targetId, 'removed_by_host');
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

  // Create or ensure a tournament match exists by a known matchId with given players
  // Payload: { matchId: string, playerIds: string[], matchType?: 'constructed'|'sealed'|'draft', lobbyName?: string, sealedConfig?: any, draftConfig?: any }
  socket.on("startTournamentMatch", (payload = {}) => {
    if (!authed) return;
    const matchId = payload && typeof payload.matchId === 'string' ? payload.matchId : null;
    const playerIds = Array.isArray(payload && payload.playerIds) ? payload.playerIds.filter(Boolean).map(String) : [];
    const matchType = (payload && payload.matchType) || 'constructed';
    const lobbyName = (payload && payload.lobbyName) || null;
    const sealedConfig = payload && payload.sealedConfig ? payload.sealedConfig : null;
    const draftConfig = payload && payload.draftConfig ? payload.draftConfig : null;
    if (!matchId || playerIds.length < 1) return;

    let match = matches.get(matchId);
    if (!match) {
      // Initialize a new match with provided id and roster
      match = {
        id: matchId,
        lobbyId: null,
        lobbyName,
        playerIds: [...new Set(playerIds)],
        status:
          matchType === 'sealed' ? 'deck_construction' :
          matchType === 'draft' ? 'waiting' : 'waiting',
        seed: `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
        turn: playerIds[0] || null,
        winnerId: null,
        matchType,
        sealedConfig: matchType === 'sealed' ? { ...sealedConfig, constructionStartTime: Date.now() } : null,
        draftConfig: matchType === 'draft' ? draftConfig : null,
        playerDecks: matchType === 'sealed' || matchType === 'draft' ? new Map() : null,
        draftState: matchType === 'draft' ? {
          phase: 'waiting', packIndex: 0, pickNumber: 1,
          currentPacks: null, picks: playerIds.map(() => []),
          playerReady: { p1: false, p2: false }, packDirection: 'left', packChoice: playerIds.map(() => null), waitingFor: []
        } : null,
        game: {},
        lastTs: 0,
      };
      matches.set(matchId, match);
      // Begin recording
      startMatchRecording(match);
    } else {
      // Ensure provided players are present
      for (const pid of playerIds) {
        if (!match.playerIds.includes(pid)) match.playerIds.push(pid);
      }
    }

    // Join all currently connected sockets for provided players
    const room = `match:${match.id}`;
    for (const pid of playerIds) {
      const p = players.get(pid);
      if (!p) continue;
      p.matchId = match.id;
      const s = io.sockets.sockets.get(p.socketId);
      if (s) s.join(room);
    }

    // If sealed, generate packs deterministically (same logic as startMatchFromLobby)
    if (match.matchType === 'sealed' && match.sealedConfig) {
      (async () => {
        try {
          const sealedPacks = {};
          for (const pid of match.playerIds) {
            const rng = createRngFromString(`${match.seed}|${pid}|sealed`);
            const sc = match.sealedConfig || {};
            const packCounts = sc.packCounts && typeof sc.packCounts === 'object' ? sc.packCounts : null;
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
              console.error(`[Sealed] packCounts not provided for player ${pid} in match ${match.id}`);
              continue;
            }

            /** @type {Array<{ id: string, set: string, cards: Array<{ id: string, name: string, set: string, slug: string, type?: string|null, cost?: number|null, rarity: string }> }>} */
            const packs = [];
            for (let i = 0; i < sets.length; i++) {
              const setName = sets[i];
              const picks = await generateBoosterDeterministic(setName, rng, replaceAvatars);
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
          io.to(room).emit("matchStarted", { match: getMatchInfo(match) });
        } catch (err) {
          console.error(`[Sealed] Error generating sealed packs for match ${match.id}:`, err);
          io.to(room).emit("matchStarted", { match: getMatchInfo(match) });
        }
      })();
      return; // will emit after packs are generated
    }

    // Broadcast updated match info to room (and initiator)
    io.to(room).emit("matchStarted", { match: getMatchInfo(match) });
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

        // Special-case: merge d20Rolls objects so clients get a complete view
        if (patch && typeof patch === 'object' && patch.d20Rolls) {
          const prev = (match.game && match.game.d20Rolls) || { p1: null, p2: null };
          const inc = patch.d20Rolls || {};
          const mergedD20 = {
            p1: (inc.p1 !== undefined ? inc.p1 : (prev.p1 ?? null)),
            p2: (inc.p2 !== undefined ? inc.p2 : (prev.p2 ?? null)),
          };
          // Determine tie/reset or winner if both present
          if (mergedD20.p1 != null && mergedD20.p2 != null) {
            if (Number(mergedD20.p1) === Number(mergedD20.p2)) {
              // Tie -> reset both to null
              patchToApply = { ...patchToApply, d20Rolls: { p1: null, p2: null }, setupWinner: null };
              // Cancel any pending auto-seat timer on tie
              try { if (match._autoSeatTimer) { clearTimeout(match._autoSeatTimer); match._autoSeatTimer = null; } } catch {}
              try { match._autoSeatApplied = false; } catch {}
            } else {
              const winner = Number(mergedD20.p1) > Number(mergedD20.p2) ? 'p1' : 'p2';
              patchToApply = { ...patchToApply, d20Rolls: mergedD20 };
              if (patchToApply.setupWinner === undefined) patchToApply.setupWinner = winner;
              // If both rolls are present and we have a winner, include Start transition directly in this merged patch
              // BUT only auto-seat if the winner is a CPU. Human winners must choose manually.
              try {
                const g = match.game || {};
                const phaseNow = g.phase;
                const winnerIdx = winner === 'p1' ? 0 : 1;
                const winnerId = Array.isArray(match.playerIds) ? match.playerIds[winnerIdx] : null;
                const winnerIsCpu = winnerId ? isCpuPlayerId(winnerId) : false;
                if (winnerIsCpu && !match._autoSeatApplied && match.status === 'waiting' && phaseNow !== 'Start' && phaseNow !== 'Main') {
                  const firstPlayer = winner === 'p1' ? 1 : 2;
                  patchToApply = { ...patchToApply, phase: 'Start', currentPlayer: firstPlayer };
                  match._autoSeatApplied = true;
                  try { console.log(`[Setup] Inline auto-seat (CPU winner) for match ${match.id}. winner=${winner} -> firstPlayer=P${firstPlayer}`); } catch {}
                }
              } catch {}
            }
          } else {
            // Partial update, still send merged so clients don't lose the other value
            patchToApply = { ...patchToApply, d20Rolls: mergedD20 };
          }
        }

        // If client explicitly chose Start or Main, clear any pending auto-seat timer
        if (patchToApply && typeof patchToApply === 'object' && (patchToApply.phase === 'Start' || patchToApply.phase === 'Main')) {
          try { if (match._autoSeatTimer) { clearTimeout(match._autoSeatTimer); match._autoSeatTimer = null; } } catch {}
        }

        // Turn start effects: apply via rules layer
        try {
          const prevCP = match.game && typeof match.game.currentPlayer === 'number' ? match.game.currentPlayer : null;
          const nextCP = (patchToApply && typeof patchToApply.currentPlayer === 'number') ? patchToApply.currentPlayer : null;
          const phaseIsMain = patchToApply && patchToApply.phase === 'Main';
          if ((nextCP === 1 || nextCP === 2) && (nextCP !== prevCP || phaseIsMain)) {
            const tsPatch = applyTurnStart({ ...(match.game || {}), currentPlayer: nextCP });
            if (tsPatch && typeof tsPatch === 'object') {
              // Shallow merge is fine as tsPatch defines full nested objects for board/permanents/avatars
              patchToApply = { ...patchToApply, ...tsPatch };
            }
          }
        } catch {}

        // Determine enforcement for this actor
        const actorIsCpu = isCpuPlayerId(player.id);
        const enforce = RULES_ENFORCE_MODE === 'all' || (RULES_ENFORCE_MODE === 'bot_only' && actorIsCpu);

        // Enforce costs (helpers can still adjust spend even when not enforcing)
        try {
          const costRes = ensureCosts(match.game || {}, patchToApply, player.id, { match });
          if (costRes && costRes.autoPatch && RULES_HELPERS_ENABLED) {
            // Merge auto-tapping into outgoing patch
            patchToApply = deepMergeReplaceArrays(patchToApply || {}, costRes.autoPatch);
          }
          if (costRes && costRes.ok === false) {
            if (enforce) {
              socket.emit('error', { message: costRes.error || 'Insufficient resources', code: 'cost_unpaid' });
              return;
            } else {
              // Emit human-visible warning event in GameEvent shape
              const warn = [{ id: 0, ts: Date.now(), text: `[Warning] ${costRes.error || 'Insufficient resources'}` }];
              const existing = Array.isArray(patchToApply && patchToApply.events) ? patchToApply.events : [];
              patchToApply = { ...patchToApply, events: [...existing, ...warn] };
            }
          }
        } catch {}

        // Validate action against minimal rules
        try {
          const v = validateAction(match.game || {}, patchToApply, player.id, { match });
          if (!v.ok && enforce) {
            socket.emit('error', { message: v.error || 'Rules violation', code: 'rules_violation' });
            return;
          }
          // When not enforcing (humans), append a warning event but allow the action
          if (!v.ok && !enforce) {
            // Use GameEvent format expected by UI console
            const warnEvent = [{ id: 0, ts: Date.now(), text: `[Warning] ${v.error || 'Potential rules issue'}` }];
            const existing = Array.isArray(patchToApply && patchToApply.events) ? patchToApply.events : [];
            patchToApply = { ...patchToApply, events: [...existing, ...warnEvent] };
          }
        } catch {}

        // Apply trigger skeletons (e.g., Genesis) based on the action
        try {
          const trig = applyGenesis(match.game || {}, patchToApply, player.id, { match });
          if (trig && typeof trig === 'object') {
            patchToApply = deepMergeReplaceArrays(patchToApply || {}, trig);
          }
        } catch {}

        // Attach keyword metadata events for UI (no-op validations)
        try {
          const kw = applyKeywordAnnotations(match.game || {}, patchToApply, player.id, { match });
          if (kw && typeof kw === 'object') {
            patchToApply = deepMergeReplaceArrays(patchToApply || {}, kw);
          }
        } catch {}

        // Special-case: merge console events (include both client-provided and server-added)
        const eventsAdded = [];
        if (Array.isArray(patch.events)) eventsAdded.push(...patch.events);
        if (Array.isArray(patchToApply && patchToApply.events)) eventsAdded.push(...patchToApply.events);
        if (eventsAdded.length > 0) {
          const prev = Array.isArray(match.game && match.game.events) ? match.game.events : [];
          const mergedEvents = mergeEvents(prev, eventsAdded);
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

  // --- Enhanced WebRTC signaling with participant tracking ---------------
  // Manages WebRTC participant state and scoped message delivery.
  // Only participants who have joined WebRTC receive signals.
  socket.on("rtc:join", () => {
    if (!authed) return;
    const player = getPlayerBySocket(socket);
    if (!player || !player.matchId) return;
    
    const matchId = player.matchId;
    const playerId = player.id;
    
    // Initialize match participants set if needed
    if (!rtcParticipants.has(matchId)) {
      rtcParticipants.set(matchId, new Set());
    }
    
    // Add participant to tracking
    const matchParticipants = rtcParticipants.get(matchId);
    matchParticipants.add(playerId);
    
    // Store participant details
    participantDetails.set(playerId, {
      id: playerId,
      displayName: player.displayName,
      matchId: matchId,
      joinedAt: Date.now()
    });
    
    // Get current participant list for enhanced peer discovery
    const participants = Array.from(matchParticipants).map(pid => {
      const details = participantDetails.get(pid);
      return details ? {
        id: details.id,
        displayName: details.displayName,
        matchId: details.matchId,
        joinedAt: details.joinedAt
      } : null;
    }).filter(Boolean);
    
    // Notify existing WebRTC participants about new joiner
    matchParticipants.forEach(pid => {
      if (pid !== playerId) {
        const participantPlayer = Array.from(players.values()).find(p => p.id === pid);
        if (participantPlayer && participantPlayer.socketId) {
          io.to(participantPlayer.socketId).emit("rtc:peer-joined", {
            from: getPlayerInfo(playerId),
            participants: participants
          });
        }
      }
    });
    
    // Send current participants list to newly joined participant
    socket.emit("rtc:participants", { participants });
  });

  socket.on("rtc:signal", (payload = {}) => {
    if (!authed) return;
    const player = getPlayerBySocket(socket);
    if (!player || !player.matchId) return;
    
    const matchId = player.matchId;
    const playerId = player.id;
    const data = payload && typeof payload === "object" ? payload.data : null;
    if (!data) return;
    
    // Only send signals to WebRTC participants (not entire match room)
    const matchParticipants = rtcParticipants.get(matchId);
    if (!matchParticipants || !matchParticipants.has(playerId)) return;
    
    // Send signal to other WebRTC participants only
    matchParticipants.forEach(pid => {
      if (pid !== playerId) {
        const participantPlayer = Array.from(players.values()).find(p => p.id === pid);
        if (participantPlayer && participantPlayer.socketId) {
          io.to(participantPlayer.socketId).emit("rtc:signal", { 
            from: playerId, 
            data: data 
          });
        }
      }
    });
  });

  socket.on("rtc:leave", () => {
    if (!authed) return;
    const player = getPlayerBySocket(socket);
    if (!player || !player.matchId) return;
    
    const matchId = player.matchId;
    const playerId = player.id;
    
    // Remove from WebRTC participants
    const matchParticipants = rtcParticipants.get(matchId);
    if (matchParticipants) {
      matchParticipants.delete(playerId);
      
      // Clean up empty match participant sets
      if (matchParticipants.size === 0) {
        rtcParticipants.delete(matchId);
      }
      
      // Notify remaining WebRTC participants
      const remainingParticipants = Array.from(matchParticipants).map(pid => {
        const details = participantDetails.get(pid);
        return details ? {
          id: details.id,
          displayName: details.displayName,
          matchId: details.matchId,
          joinedAt: details.joinedAt
        } : null;
      }).filter(Boolean);
      
      matchParticipants.forEach(pid => {
        const participantPlayer = Array.from(players.values()).find(p => p.id === pid);
        if (participantPlayer && participantPlayer.socketId) {
          io.to(participantPlayer.socketId).emit("rtc:peer-left", {
            from: playerId,
            participants: remainingParticipants
          });
        }
      });
    }
    
    // Remove participant details
    participantDetails.delete(playerId);
  });

  // WebRTC connection failure reporting
  socket.on("rtc:connection-failed", (payload = {}) => {
    if (!authed) return;
    const player = getPlayerBySocket(socket);
    if (!player || !player.matchId) return;
    
    const matchId = player.matchId;
    const playerId = player.id;
    const reason = payload.reason || "unknown";
    const code = payload.code || "CONNECTION_ERROR";
    
    console.warn(`WebRTC connection failed for player ${playerId} in match ${matchId}: ${reason} (${code})`);
    
    // Notify other WebRTC participants about the connection failure
    const matchParticipants = rtcParticipants.get(matchId);
    if (matchParticipants && matchParticipants.has(playerId)) {
      matchParticipants.forEach(pid => {
        if (pid !== playerId) {
          const participantPlayer = Array.from(players.values()).find(p => p.id === pid);
          if (participantPlayer && participantPlayer.socketId) {
            io.to(participantPlayer.socketId).emit("rtc:peer-connection-failed", {
              from: playerId,
              reason: reason,
              code: code,
              timestamp: Date.now()
            });
          }
        }
      });
    }
    
    // Send acknowledgment back to the failing client
    socket.emit("rtc:connection-failed-ack", {
      playerId: playerId,
      matchId: matchId,
      timestamp: Date.now()
    });
  });

  // Submit sealed deck during deck construction phase (with validation)
  socket.on("submitDeck", (payload) => {
    if (!authed) return;
    const player = getPlayerBySocket(socket);
    if (!player || !player.matchId) return;
    const match = matches.get(player.matchId);
    if (!match || match.status !== "deck_construction") return;
    if (match.matchType !== 'sealed') return;

    // Idempotency: if this player already submitted, ignore duplicates
    if (match.playerDecks && match.playerDecks.has(player.id)) {
      return;
    }

    const deckRaw = payload && payload.deck;
    if (!deckRaw) return;
    const cards = normalizeDeckPayload(deckRaw);
    const val = validateDeckCards(cards);
    if (!val.isValid) {
      socket.emit("error", { message: `Deck invalid: ${val.errors.join(", ")}` });
      return;
    }

    // Store the player's deck
    match.playerDecks.set(player.id, cards);

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
        try { botManager.cleanupBotsForLobby(lobby.id); } catch {}
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
      match.draftState.phase = "pack_selection"; // Wait for pack choices before distributing
      match.draftState.allGeneratedPacks = currentPacks; // Store all generated packs
      match.draftState.currentPacks = []; // Don't distribute packs yet
      match.draftState.waitingFor = [...match.playerIds]; // Wait for pack choices

      // Fallback: if not all players choose within 2s, auto-assign first pack for those who didn't
      setTimeout(() => {
        try {
          const m = matches.get(match.id);
          if (!m || m.matchType !== "draft" || !m.draftState) return;
          const ds = m.draftState;
          if (ds.phase !== "pack_selection") return; // choices already resolved
          const pendingIdx = ds.packChoice.findIndex((c) => c === null);
          if (pendingIdx === -1) return; // all chosen
          // Auto-choose for remaining players based on their first generated pack's set
          ds.packChoice = ds.packChoice.map((c, idx) => {
            if (c !== null) return c;
            const packs = Array.isArray(ds.allGeneratedPacks?.[idx]) ? ds.allGeneratedPacks[idx] : [];
            const first = Array.isArray(packs) && packs[0] && packs[0][0] ? packs[0][0] : null;
            return (first && (first.setName || first.set)) || "Beta";
          });
          ds.currentPacks = ds.allGeneratedPacks.map((packs, playerIdx) => {
            const choice = ds.packChoice[playerIdx];
            for (let i = 0; i < packs.length; i++) {
              const pack = packs[i];
              if (pack && pack.length > 0 && pack[0].setName === choice) return pack;
            }
            return packs[0] || [];
          });
          ds.phase = "picking";
          ds.waitingFor = [...m.playerIds];
          io.to(`match:${m.id}`).emit("draftUpdate", ds);
        } catch (e) {
          console.warn(`[Draft] auto-pack assignment failed for match ${match.id}:`, e);
        }
      }, 2000);

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
            // Use player's pack choice to determine which pack to give them
            draftState.currentPacks = draftState.allGeneratedPacks.map((packs, playerIdx) => {
              const playerChoice = draftState.packChoice[playerIdx];
              
              // If player made a choice, find the pack that matches their choice
              if (playerChoice && packs.length > draftState.packIndex) {
                // Find the first pack that matches the player's choice
                for (let i = 0; i < packs.length; i++) {
                  const pack = packs[i];
                  if (pack && pack.length > 0 && pack[0].setName === playerChoice) {
                    console.log(`[Draft] Player ${playerIdx} chose ${playerChoice}, using pack ${i} (was pack ${draftState.packIndex})`);
                    return pack;
                  }
                }
                console.log(`[Draft] Player ${playerIdx} chose ${playerChoice}, but no matching pack found, using default pack ${draftState.packIndex}`);
              }
              
              // Fallback to default behavior
              return packs[draftState.packIndex] || [];
            });
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

    const { setChoice, packIndex } = payload || {};
    const playerIndex = match.playerIds.indexOf(player.id);
    if (playerIndex === -1) return;

    // Guard: accept only during pack_selection and only once per player
    if (match.draftState.phase !== "pack_selection") return;
    if (match.draftState.packChoice[playerIndex] !== null) return;

    // Store pack choice
    match.draftState.packChoice[playerIndex] = setChoice;
    console.log(
      `[Draft] chooseDraftPack by ${player.displayName} (${player.id}): packIndex=${packIndex} choice=${setChoice}`
    );
    const choices = match.draftState.packChoice.map((x) => x || "-").join(",");
    console.log(`[Draft] Current pack choices: ${choices}`);

    // If all players chose, distribute and transition to picking
    const allChoicesMade = match.draftState.packChoice.every((choice) => choice !== null);
    if (allChoicesMade && match.draftState.phase === "pack_selection") {
      match.draftState.currentPacks = match.draftState.allGeneratedPacks.map(
        (packs, idx) => {
          const choice = match.draftState.packChoice[idx];
          for (let i = 0; i < packs.length; i++) {
            const pack = packs[i];
            if (pack && pack.length > 0 && pack[0].setName === choice) return pack;
          }
          return packs[0] || [];
        }
      );
      match.draftState.phase = "picking";
      match.draftState.waitingFor = [...match.playerIds];
      console.log(`[Draft] Pack selection complete, transitioning to picking phase`);
    }

    // Broadcast updated draft state
    io.to(`match:${match.id}`).emit("draftUpdate", match.draftState);
  });

  // Submit draft deck during deck construction phase (with validation)
  socket.on("submitDeck", (payload) => {
    if (!authed) return;
    const player = getPlayerBySocket(socket);
    if (!player || !player.matchId) return;

    const match = matches.get(player.matchId);
    if (!match || !match.playerDecks) return;
    if (match.matchType !== 'draft') return;

    // Idempotency: ignore duplicate submissions by the same player
    if (match.playerDecks.has(player.id)) return;

    // Validate and store the submitted deck cards
    const deckRaw = payload && payload.deck ? payload.deck : payload;
    const cards = normalizeDeckPayload(deckRaw);
    const val = validateDeckCards(cards);
    if (!val.isValid) {
      socket.emit("error", { message: `Deck invalid: ${val.errors.join(", ")}` });
      return;
    }
    match.playerDecks.set(player.id, cards);

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
      // Initialize game phase to Main immediately for draft flow
      try {
        const now = Date.now();
        match.game = deepMergeReplaceArrays(match.game || {}, { phase: "Main" });
        match.lastTs = now;
        io.to(`match:${match.id}`).emit("statePatch", { patch: { phase: "Main" }, t: now });
      } catch {}

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
          try { botManager.cleanupBotsForLobby(lobby.id); } catch {}
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

  // Explicit end match (optional). Allows cleanup and status update.
  socket.on("endMatch", (payload = {}) => {
    if (!authed) return;
    const player = getPlayerBySocket(socket);
    if (!player || !player.matchId) return;
    const match = matches.get(player.matchId);
    if (!match) return;
    match.status = 'ended';
    match.winnerId = payload && typeof payload.winnerId === 'string' ? payload.winnerId : match.winnerId || null;
    io.to(`match:${match.id}`).emit("matchStarted", { match: getMatchInfo(match) });
    try { botManager.cleanupBotsAfterMatch(match); } catch {}
  });

  socket.on("disconnect", () => {
    const pid = playerIdBySocket.get(socket.id);
    if (!pid) return;
    const player = players.get(pid);
    playerIdBySocket.delete(socket.id);
    
    // Clean up WebRTC participant state on disconnect
    if (player && player.matchId) {
      const matchParticipants = rtcParticipants.get(player.matchId);
      if (matchParticipants && matchParticipants.has(pid)) {
        matchParticipants.delete(pid);
        
        // Clean up empty match participant sets
        if (matchParticipants.size === 0) {
          rtcParticipants.delete(player.matchId);
        }
        
        // Notify remaining WebRTC participants about disconnection
        const remainingParticipants = Array.from(matchParticipants).map(participantId => {
          const details = participantDetails.get(participantId);
          return details ? {
            id: details.id,
            displayName: details.displayName,
            matchId: details.matchId,
            joinedAt: details.joinedAt
          } : null;
        }).filter(Boolean);
        
        matchParticipants.forEach(participantId => {
          const participantPlayer = Array.from(players.values()).find(p => p.id === participantId);
          if (participantPlayer && participantPlayer.socketId) {
            io.to(participantPlayer.socketId).emit("rtc:peer-left", {
              from: pid,
              participants: remainingParticipants
            });
          }
        });
        
        // Remove participant details
        participantDetails.delete(pid);
      }
    }
    
    if (player) {
      // If the player was in a lobby, remove them immediately to prevent ghost lobbies
      if (player.lobbyId && lobbies.has(player.lobbyId)) {
        const lobby = lobbies.get(player.lobbyId);
        lobby.playerIds.delete(player.id);
        lobby.ready.delete(player.id);
        // If now empty or CPU-only, close and cleanup bots; otherwise if host left, reassign preferring humans
        if (lobby.playerIds.size === 0 || !lobbyHasHumanPlayers(lobby)) {
          lobby.status = "closed";
          try { botManager.cleanupBotsForLobby(lobby.id); } catch {}
          lobbies.delete(lobby.id);
          broadcastLobbies();
        } else if (lobby.hostId === player.id) {
          const remaining = Array.from(lobby.playerIds);
          const humanNext = remaining.find((id) => !isCpuPlayerId(id)) || remaining[0];
          lobby.hostId = humanNext;
          lobby.ready.clear();
          io.to(`lobby:${lobby.id}`).emit("lobbyUpdated", { lobby: getLobbyInfo(lobby) });
          broadcastLobbies();
        } else {
          io.to(`lobby:${lobby.id}`).emit("lobbyUpdated", { lobby: getLobbyInfo(lobby) });
          broadcastLobbies();
        }
        // Clear association last so future logic sees player out of lobby
        player.lobbyId = null;
      }
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
    // Close CPU-only lobbies immediately
    if (!lobbyHasHumanPlayers(lobby)) {
      lobby.status = "closed";
      try { botManager.cleanupBotsForLobby(lobby.id); } catch {}
      lobbies.delete(lobby.id);
      broadcastLobbies();
      continue;
    }
    const connectedCount = Array.from(lobby.playerIds).reduce(
      (acc, pid) => acc + (isPlayerConnected(pid) ? 1 : 0),
      0
    );
    if (
      connectedCount === 0 &&
      now - (lobby.lastActive || now) > 3 * 60 * 1000
    ) {
      lobby.status = "closed";
      try { botManager.cleanupBotsForLobby(lobby.id); } catch {}
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
