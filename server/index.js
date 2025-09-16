// Simple Socket.IO server for Sorcery online MVP
// Run with: node server/index.js

// Load environment variables (.env, .env.local) for standalone server runs
try { require('dotenv').config(); } catch {}

// -----------------------------
// Leader-aware Draft helpers (match-level)
// -----------------------------
async function leaderDraftPlayerReady(matchId, playerId, ready) {
  const match = await getOrLoadMatch(matchId);
  if (!match || match.matchType !== 'draft' || !match.draftState) return;
  const room = `match:${matchId}`;
  const idx = Array.isArray(match.playerIds) ? match.playerIds.indexOf(playerId) : -1;
  if (idx === -1) return;
  const playerKey = idx === 1 ? 'p2' : 'p1';
  if (!match.draftState.playerReady || typeof match.draftState.playerReady !== 'object') {
    match.draftState.playerReady = { p1: false, p2: false };
  }
  match.draftState.playerReady[playerKey] = !!ready;
  io.to(room).emit('message', { type: 'playerReady', playerKey, ready: !!ready });
  // Auto-start if both ready and still in waiting
  const pr = match.draftState.playerReady;
  if (match.draftState.phase === 'waiting' && pr && pr.p1 === true && pr.p2 === true) {
    try { await leaderStartDraft(matchId, playerId); } catch (e) { try { console.warn('[Draft] auto-start failed:', e?.message || e); } catch {} }
  }
  try { await persistMatchUpdate(match, null, playerId, Date.now()); } catch {}
}

async function leaderStartDraft(matchId, requestingPlayerId = null, overrideDraftConfig = null, requestingSocketId = null) {
  const match = await getOrLoadMatch(matchId);
  if (!match || match.matchType !== 'draft' || !match.draftState) return;
  if (match.draftState.phase !== 'waiting') return;
  if (match.draftState.__startingDraft) return;
  match.draftState.__startingDraft = true;
  const room = `match:${match.id}`;
  // Start with match config; allow client override from leader-approved request
  let dc = match.draftConfig || { setMix: ['Beta'], packCount: 3, packSize: 15 };
  if (overrideDraftConfig && typeof overrideDraftConfig === 'object') {
    try {
      // Merge and normalize: prefer explicit override fields
      dc = {
        ...dc,
        ...overrideDraftConfig,
      };
    } catch {}
  }
  // Normalize setMix
  const setMix = Array.isArray(dc.setMix) && dc.setMix.length > 0 ? dc.setMix : ['Beta'];
  // Normalize packCount/packSize
  const packCount = Math.max(1, Number(dc.packCount) || 3);
  const packSize = Math.max(8, Number(dc.packSize) || 15);
  // Normalize packCounts: ensure it sums exactly to packCount; if not, generate even distribution across setMix
  let packCounts = dc && typeof dc.packCounts === 'object' ? { ...dc.packCounts } : undefined;
  const sumPackCounts = (obj) =>
    obj ? Object.values(obj).reduce((a, b) => a + (Math.max(0, Number(b) || 0)), 0) : 0;
  if (!packCounts || sumPackCounts(packCounts) !== packCount) {
    const counts = {};
    const n = setMix.length;
    for (const s of setMix) counts[s] = 0;
    const base = Math.floor(packCount / n);
    const rem = packCount % n;
    setMix.forEach((s, i) => {
      counts[s] = base + (i < rem ? 1 : 0);
    });
    packCounts = counts;
  }
  // Persist normalized config back to match (so followers/clients see canonical config)
  match.draftConfig = { setMix, packCount, packSize, packCounts };
  try {
    // Build set sequence from exact packCounts
    let setSequence = [];
    if (packCounts && typeof packCounts === 'object') {
      for (const [name, cnt] of Object.entries(packCounts)) {
        const c = Math.max(0, Number(cnt) || 0);
        for (let i = 0; i < c; i++) setSequence.push(name);
      }
    }
    if (setSequence.length !== packCount) {
      console.error(`[Draft] packCounts sum (${setSequence.length}) does not match packCount (${packCount})`);
      // Notify requester if available
      try {
        if (requestingSocketId) io.to(requestingSocketId).emit('error', { message: `Draft configuration error: pack counts must sum to ${packCount}` });
      } catch {}
      return;
    }
    const currentPacks = [];
    for (let playerIdx = 0; playerIdx < match.playerIds.length; playerIdx++) {
      const playerPacks = [];
      for (let packIdx = 0; packIdx < packCount; packIdx++) {
        const setName = setSequence[packIdx] || (Array.isArray(setMix) && setMix.length > 0 ? setMix[0] : 'Beta');
        const rng = createRngFromString(`${match.seed}|${match.playerIds[playerIdx]}|draft|${packIdx}`);
        const picks = await generateBoosterDeterministic(setName, rng, false);
        const cards = picks.slice(0, packSize).map((p, cardIdx) => ({
          id: `${String(p.variantId)}_${packIdx}_${cardIdx}_${match.playerIds[playerIdx].slice(-4)}`,
          name: p.cardName || '',
          slug: String(p.slug || ''),
          type: p.type || null,
          cost: String(p.cost || ''),
          rarity: p.rarity || 'common',
          element: p.element || [],
          setName,
        }));
        playerPacks.push(cards);
      }
      currentPacks.push(playerPacks);
    }
    // Prepare draft phases
    // Ensure draft state arrays are shaped properly
    if (!Array.isArray(match.draftState.packChoice) || match.draftState.packChoice.length !== match.playerIds.length) {
      match.draftState.packChoice = Array.from({ length: match.playerIds.length }, () => null);
    }
    if (!Array.isArray(match.draftState.picks) || match.draftState.picks.length !== match.playerIds.length) {
      match.draftState.picks = Array.from({ length: match.playerIds.length }, () => []);
    }
    match.draftState.phase = 'pack_selection';
    match.draftState.allGeneratedPacks = currentPacks;
    match.draftState.currentPacks = [];
    match.draftState.waitingFor = [...match.playerIds];
    // Auto-assign fallback after 12s if someone doesn't choose (give humans time)
    setTimeout(() => {
      try {
        const m = matches.get(matchId);
        if (!m || m.matchType !== 'draft' || !m.draftState) return;
        const ds = m.draftState;
        if (ds.phase !== 'pack_selection') return;
        const pendingIdx = ds.packChoice.findIndex((c) => c === null);
        if (pendingIdx === -1) return;
        ds.packChoice = ds.packChoice.map((c, idx) => {
          if (c !== null) return c;
          const packs = Array.isArray(ds.allGeneratedPacks?.[idx]) ? ds.allGeneratedPacks[idx] : [];
          const first = Array.isArray(packs) && packs[0] && packs[0][0] ? packs[0][0] : null;
          return (first && (first.setName || first.set)) || 'Beta';
        });
        ds.currentPacks = ds.allGeneratedPacks.map((packs, playerIdx) => {
          const choice = ds.packChoice[playerIdx];
          for (let i = 0; i < packs.length; i++) {
            const pack = packs[i];
            if (pack && pack.length > 0 && pack[0].setName === choice) return pack;
          }
          return packs[0] || [];
        });
        ds.phase = 'picking';
        ds.waitingFor = [...m.playerIds];
        io.to(`match:${m.id}`).emit('draftUpdate', ds);
      } catch {}
    }, 12000);
    io.to(room).emit('draftUpdate', match.draftState);
    try { await persistMatchUpdate(match, null, requestingPlayerId || 'system', Date.now()); } catch {}
  } catch (e) {
    console.error(`[Draft] Error starting draft: ${e && e.message ? e.message : String(e)}`);
    try {
      if (requestingSocketId) io.to(requestingSocketId).emit('error', { message: 'Failed to start draft' });
    } catch {}
  } finally {
    match.draftState.__startingDraft = false;
  }
}

async function leaderMakeDraftPick(matchId, playerId, { cardId, packIndex, pickNumber }) {
  const match = await getOrLoadMatch(matchId);
  if (!match || match.matchType !== 'draft' || !match.draftState) return;
  const draftState = match.draftState;
  if (draftState.phase !== 'picking') return;
  if (draftState.packIndex !== packIndex || draftState.pickNumber !== pickNumber) return;
  if (!draftState.waitingFor.includes(playerId)) return;
  const playerIndex = match.playerIds.indexOf(playerId);
  if (playerIndex === -1) return;
  const currentPack = draftState.currentPacks[playerIndex];
  if (!currentPack) return;
  const cardIndex = currentPack.findIndex((card) => card.id === cardId);
  if (cardIndex === -1) return;
  const pickedCard = currentPack.splice(cardIndex, 1)[0];
  draftState.picks[playerIndex].push(pickedCard);
  draftState.waitingFor = draftState.waitingFor.filter((id) => id !== playerId);
  if (draftState.waitingFor.length === 0) {
    if (draftState.pickNumber >= 15 || currentPack.length === 0) {
      draftState.packIndex++;
      draftState.pickNumber = 1;
      if (draftState.packIndex >= 3) {
        draftState.phase = 'complete';
        match.status = 'deck_construction';
      } else {
        draftState.pickNumber = 1;
        draftState.packDirection = draftState.packDirection === 'left' ? 'right' : 'left';
        draftState.waitingFor = [...match.playerIds];
        if (draftState.allGeneratedPacks && draftState.packIndex < 3) {
          draftState.currentPacks = draftState.allGeneratedPacks.map((packs, playerIdx) => {
            const playerChoice = draftState.packChoice[playerIdx];
            if (playerChoice && packs.length > draftState.packIndex) {
              for (let i = 0; i < packs.length; i++) {
                const pack = packs[i];
                if (pack && pack.length > 0 && pack[0].setName === playerChoice) return pack;
              }
            }
            return packs[draftState.packIndex] || [];
          });
        }
      }
    } else {
      // Pass packs
      draftState.pickNumber++;
      draftState.phase = 'passing';
      const temp = [...draftState.currentPacks];
      if (draftState.packDirection === 'left') {
        for (let i = 0; i < temp.length; i++) {
          draftState.currentPacks[(i + 1) % temp.length] = temp[i];
        }
      } else {
        for (let i = 0; i < temp.length; i++) {
          draftState.currentPacks[i] = temp[(i + 1) % temp.length];
        }
      }
      draftState.phase = 'picking';
      draftState.waitingFor = [...match.playerIds];
    }
  }
  io.to(`match:${match.id}`).emit('draftUpdate', draftState);
  try { await persistMatchUpdate(match, null, playerId, Date.now()); } catch {}
}

async function leaderChooseDraftPack(matchId, playerId, { setChoice, packIndex }) {
  const match = await getOrLoadMatch(matchId);
  if (!match || match.matchType !== 'draft' || !match.draftState) return;
  const draftState = match.draftState;
  const playerIndex = match.playerIds.indexOf(playerId);
  if (playerIndex === -1) return;
  if (draftState.phase !== 'pack_selection') return;
  if (draftState.packChoice[playerIndex] !== null) return;
  draftState.packChoice[playerIndex] = setChoice;
  const allChoicesMade = draftState.packChoice.every((choice) => choice !== null);
  if (allChoicesMade && draftState.phase === 'pack_selection') {
    draftState.currentPacks = draftState.allGeneratedPacks.map((packs, idx) => {
      const choice = draftState.packChoice[idx];
      for (let i = 0; i < packs.length; i++) {
        const pack = packs[i];
        if (pack && pack.length > 0 && pack[0].setName === choice) return pack;
      }
      return packs[0] || [];
    });
    draftState.phase = 'picking';
    draftState.waitingFor = [...match.playerIds];
  }
  io.to(`match:${match.id}`).emit('draftUpdate', draftState);
  try { await persistMatchUpdate(match, null, playerId, Date.now()); } catch {}
}

// -----------------------------
// Lobby coordination helpers (leader + state replication)
// -----------------------------
async function getOrClaimLobbyLeader() {
  try {
    if (!storeRedis) return INSTANCE_ID;
    const key = 'lobby:leader';
    const current = await storeRedis.get(key);
    if (current) {
      if (current === INSTANCE_ID) { try { await storeRedis.expire(key, 30); } catch {} }
      return current;
    }
    const setRes = await storeRedis.set(key, INSTANCE_ID, 'NX', 'EX', 30);
    if (setRes) return INSTANCE_ID;
    return await storeRedis.get(key);
  } catch { return INSTANCE_ID; }
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
  const lb = lobbies.get(obj.id) || { id: obj.id, name: null, hostId: null, playerIds: new Set(), status: 'open', maxPlayers: 2, ready: new Set(), visibility: 'open', plannedMatchType: 'constructed', lastActive: Date.now() };
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
  try { if (storeRedis) await storeRedis.publish(LOBBY_STATE_CHANNEL, JSON.stringify({ type: 'upsert', lobby: serializeLobby(lobby) })); } catch {}
}

async function publishLobbyDelete(lobbyId) {
  try { if (storeRedis) await storeRedis.publish(LOBBY_STATE_CHANNEL, JSON.stringify({ type: 'delete', id: lobbyId })); } catch {}
}

async function handleLobbyControlAsLeader(msg) {
  // msg.type: 'create' | 'join' | 'leave' | 'visibility' | 'plan' | 'ready'
  function findLobbyForPlayer(pid, explicitLobbyId) {
    if (explicitLobbyId && lobbies.has(explicitLobbyId)) return lobbies.get(explicitLobbyId);
    for (const lb of lobbies.values()) {
      if (lb && lb.status === 'open' && lb.playerIds && lb.playerIds.has(pid)) return lb;
    }
    return null;
  }
  if (msg.type === 'create') {
    const { hostId, socketId, options } = msg;
    const vis = options && options.visibility === 'private' ? 'private' : 'open';
    const maxPlayers = Number.isInteger(options && options.maxPlayers) ? Math.max(2, Math.min(8, options.maxPlayers)) : 2;
    const name = options && options.name ? String(options.name).trim().slice(0, 50) : null;
    const lobby = { id: rid('lobby'), name, hostId, playerIds: new Set(), status: 'open', maxPlayers, ready: new Set(), visibility: vis, plannedMatchType: 'constructed', lastActive: Date.now() };
    lobbies.set(lobby.id, lobby);
    // Join host
    if (socketId) { try { await io.in(socketId).socketsJoin(`lobby:${lobby.id}`); } catch {} }
    lobby.playerIds.add(hostId);
    const p = await ensurePlayerCached(hostId);
    try { p.lobbyId = lobby.id; } catch {}
    // Emit to room and global lists
    const info = getLobbyInfo(lobby);
    if (socketId) try { io.to(socketId).emit('joinedLobby', { lobby: info }); } catch {}
    try { io.to(`lobby:${lobby.id}`).emit('lobbyUpdated', { lobby: info }); } catch {}
    await publishLobbyState(lobby);
    await (async () => { const leader = await getOrClaimLobbyLeader(); if (leader === INSTANCE_ID) io.emit('lobbiesUpdated', { lobbies: lobbiesArray() }); })();
    return;
  }
  if (msg.type === 'join') {
    const { playerId, socketId, lobbyId } = msg;
    // Decide target lobby
    let lobby = null;
    if (lobbyId && lobbies.has(lobbyId)) lobby = lobbies.get(lobbyId);
    else lobby = findOpenLobby() || createLobby(playerId);
    if (!lobby) lobby = createLobby(playerId);
    // Validate
    if (lobby.status !== 'open') { if (socketId) io.to(socketId).emit('error', { message: 'Lobby is not open', code: 'lobby_not_open' }); return; }
    if (lobby.playerIds.size >= lobby.maxPlayers) { if (socketId) io.to(socketId).emit('error', { message: 'Lobby is full', code: 'lobby_full' }); return; }
    // Join
    lobby.playerIds.add(playerId);
    const p = await ensurePlayerCached(playerId);
    try { p.lobbyId = lobby.id; } catch {}
    if (socketId) { try { await io.in(socketId).socketsJoin(`lobby:${lobby.id}`); } catch {} }
    markLobbyActive(lobby);
    if (!lobby.hostId) lobby.hostId = playerId;
    const info = getLobbyInfo(lobby);
    if (socketId) try { io.to(socketId).emit('joinedLobby', { lobby: info }); } catch {}
    try { io.to(`lobby:${lobby.id}`).emit('lobbyUpdated', { lobby: info }); } catch {}
    await publishLobbyState(lobby);
    await (async () => { const leader = await getOrClaimLobbyLeader(); if (leader === INSTANCE_ID) io.emit('lobbiesUpdated', { lobbies: lobbiesArray() }); })();
    return;
  }
  if (msg.type === 'leave') {
    const { playerId, socketId } = msg;
    const p = await ensurePlayerCached(playerId);
    const lobby = findLobbyForPlayer(playerId, p.lobbyId);
    const lobbyId = lobby?.id;
    if (!lobby || !lobbyId) { if (socketId) try { await io.in(socketId).socketsLeave(`lobby:${lobbyId}`); } catch {} return; }
    lobby.playerIds.delete(playerId);
    lobby.ready.delete(playerId);
    if (socketId) { try { await io.in(socketId).socketsLeave(`lobby:${lobbyId}`); } catch {} }
    try { p.lobbyId = null; } catch {}
    markLobbyActive(lobby);
    if (lobby.playerIds.size === 0) {
      lobby.status = 'closed';
      try { botManager.cleanupBotsForLobby(lobbyId); } catch {}
      lobbies.delete(lobbyId);
      await publishLobbyDelete(lobbyId);
      return;
    } else if (!lobbyHasHumanPlayers(lobby)) {
      lobby.status = 'closed';
      try { botManager.cleanupBotsForLobby(lobbyId); } catch {}
      lobbies.delete(lobbyId);
      await publishLobbyDelete(lobbyId);
      return;
    } else if (lobby.hostId === playerId) {
      const remaining = Array.from(lobby.playerIds);
      const humanNext = remaining.find((pid) => !isCpuPlayerId(pid)) || remaining[0];
      lobby.hostId = humanNext;
      lobby.ready.clear();
    }
    if (lobbies.has(lobbyId)) {
      io.to(`lobby:${lobbyId}`).emit('lobbyUpdated', { lobby: getLobbyInfo(lobby) });
    }
    await publishLobbyState(lobby);
    await (async () => { const leader = await getOrClaimLobbyLeader(); if (leader === INSTANCE_ID) io.emit('lobbiesUpdated', { lobbies: lobbiesArray() }); })();
    return;
  }
  if (msg.type === 'visibility') {
    const { playerId, lobbyId, visibility } = msg;
    const lobby = findLobbyForPlayer(playerId, lobbyId);
    if (!lobby) return;
    if (lobby.hostId !== playerId) return;
    lobby.visibility = visibility === 'private' ? 'private' : 'open';
    markLobbyActive(lobby);
    io.to(`lobby:${lobby.id}`).emit('lobbyUpdated', { lobby: getLobbyInfo(lobby) });
    await publishLobbyState(lobby);
    await (async () => { const leader = await getOrClaimLobbyLeader(); if (leader === INSTANCE_ID) io.emit('lobbiesUpdated', { lobbies: lobbiesArray() }); })();
    return;
  }
  if (msg.type === 'plan') {
    const { playerId, lobbyId, plannedMatchType } = msg;
    const lobby = findLobbyForPlayer(playerId, lobbyId);
    if (!lobby) return;
    if (lobby.hostId !== playerId) return;
    if (plannedMatchType !== 'constructed' && plannedMatchType !== 'sealed' && plannedMatchType !== 'draft') return;
    lobby.plannedMatchType = plannedMatchType;
    markLobbyActive(lobby);
    io.to(`lobby:${lobby.id}`).emit('lobbyUpdated', { lobby: getLobbyInfo(lobby) });
    await publishLobbyState(lobby);
    await (async () => { const leader = await getOrClaimLobbyLeader(); if (leader === INSTANCE_ID) io.emit('lobbiesUpdated', { lobbies: lobbiesArray() }); })();
    return;
  }
  if (msg.type === 'ready') {
    const { playerId, lobbyId, ready } = msg;
    const lobby = findLobbyForPlayer(playerId, lobbyId);
    if (!lobby) return;
    if (ready) lobby.ready.add(playerId); else lobby.ready.delete(playerId);
    markLobbyActive(lobby);
    io.to(`lobby:${lobby.id}`).emit('lobbyUpdated', { lobby: getLobbyInfo(lobby) });
    await publishLobbyState(lobby);
    return;
  }
  if (msg.type === 'startMatch') {
    const { playerId, matchType, sealedConfig, draftConfig } = msg;
    const p = await ensurePlayerCached(playerId);
    // Ensure we know which lobby the player belongs to on this leader
    let lobby = findLobbyForPlayer(playerId, p.lobbyId);
    if (!lobby) return;
    try { p.lobbyId = lobby.id; } catch {}
    const res = await startMatchFromLobby(p, matchType || 'constructed', sealedConfig || null, draftConfig || null);
    // Publish lobby state or deletion depending on result
    if (lobby && lobbies.has(lobby.id)) {
      await publishLobbyState(lobbies.get(lobby.id));
    } else if (res && res.ok && res.matchId) {
      // Lobby likely closed for constructed; publish delete for followers
      try { await publishLobbyDelete(lobby?.id); } catch {}
    }
    return;
  }
}

const http = require("http");
const { Server } = require("socket.io");
const { PrismaClient } = require("@prisma/client");
const jwt = require("jsonwebtoken");
const { createAdapter } = require("@socket.io/redis-adapter");
const Redis = require("ioredis");
const {
  createRngFromString,
  generateBoosterDeterministic,
} = require("./booster");
const { BotManager } = require("./botManager");
const { applyTurnStart, validateAction, ensureCosts } = require("./rules");
const { applyGenesis, applyKeywordAnnotations } = require("./rules/triggers");

const PORT = process.env.PORT ? Number(process.env.PORT) : 3010;
const prisma = new PrismaClient();
const REDIS_URL = process.env.REDIS_URL || process.env.SOCKET_REDIS_URL || "redis://localhost:6379";
const ENABLE_REDIS_ADAPTER = !(
  process.env.SOCKET_REDIS_DISABLED === '1' ||
  (process.env.SOCKET_REDIS_DISABLED || '').toLowerCase() === 'true'
);
let isReady = false; // readiness flips true once DB connected and recovery done
let isShuttingDown = false;
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
// Allow multiple origins via env to support localhost and LAN IPs in dev
const CORS_ORIGINS = (process.env.SOCKET_CORS_ORIGIN || "http://localhost:3000")
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const io = new Server(server, {
  cors: {
    origin: CORS_ORIGINS,
    credentials: true,
  },
});

// Socket.IO Redis adapter (horizontal scaling)
let pubClient = null;
let subClient = null;
try {
  if (ENABLE_REDIS_ADAPTER) {
    pubClient = new Redis(REDIS_URL);
    subClient = pubClient.duplicate();
    io.adapter(createAdapter(pubClient, subClient));
    try { console.log(`[socket.io] Redis adapter enabled -> ${REDIS_URL}`); } catch {}
  } else {
    try { console.log("[socket.io] Redis adapter disabled by config"); } catch {}
  }
} catch (e) {
  try { console.warn("[socket.io] Redis adapter initialization failed:", e?.message || e); } catch {}
}

// Dedicated Redis clients for shared state and control plane
const INSTANCE_ID = process.env.INSTANCE_ID || `srv-${Math.random().toString(36).slice(2, 7)}`;
let storeRedis = null;
let storeSub = null;
try {
  storeRedis = new Redis(REDIS_URL);
  storeSub = storeRedis.duplicate();
  try { console.log(`[store] Redis state connected -> ${REDIS_URL} (instance=${INSTANCE_ID})`); } catch {}
} catch (e) {
  try { console.warn(`[store] Redis state init failed:`, e?.message || e); } catch {}
}

// Match control pub/sub channel
const MATCH_CONTROL_CHANNEL = 'match:control';
const LOBBY_CONTROL_CHANNEL = 'lobby:control';
const LOBBY_STATE_CHANNEL = 'lobby:state';
let clusterStateReady = false; // flip after maps are initialized
if (storeSub) {
  try {
    storeSub.subscribe(MATCH_CONTROL_CHANNEL, (err) => {
      if (err) try { console.warn(`[store] subscribe ${MATCH_CONTROL_CHANNEL} failed:`, err?.message || err); } catch {}
    });
    storeSub.subscribe(LOBBY_CONTROL_CHANNEL, (err) => {
      if (err) try { console.warn(`[store] subscribe ${LOBBY_CONTROL_CHANNEL} failed:`, err?.message || err); } catch {}
    });
    storeSub.subscribe(LOBBY_STATE_CHANNEL, (err) => {
      if (err) try { console.warn(`[store] subscribe ${LOBBY_STATE_CHANNEL} failed:`, err?.message || err); } catch {}
    });
    storeSub.on('message', async (channel, message) => {
      if (!clusterStateReady) return;
      let msg = null;
      try { msg = JSON.parse(message); } catch { return; }
      if (channel === MATCH_CONTROL_CHANNEL) {
        if (!msg || !msg.type) return;
        const { matchId } = msg;
        if (!matchId) return;
        try {
          const leader = await getOrClaimMatchLeader(matchId);
          if (leader !== INSTANCE_ID) return;
        } catch { return; }
        try {
          if (msg.type === 'join' && msg.playerId && msg.socketId) {
            await ensurePlayerCached(msg.playerId);
            await leaderJoinMatch(matchId, msg.playerId, msg.socketId);
          } else if (msg.type === 'action' && msg.playerId) {
            await leaderApplyAction(matchId, msg.playerId, msg.patch || null, msg.socketId || null);
          } else if (msg.type === 'draft:playerReady' && typeof msg.ready === 'boolean' && msg.playerId) {
            await leaderDraftPlayerReady(matchId, msg.playerId, !!msg.ready);
          } else if (msg.type === 'draft:start' && msg.playerId) {
            await leaderStartDraft(matchId, msg.playerId, msg.draftConfig || null, msg.socketId || null);
          } else if (msg.type === 'draft:pick' && msg.playerId && msg.cardId) {
            await leaderMakeDraftPick(matchId, msg.playerId, { cardId: msg.cardId, packIndex: Number(msg.packIndex || 0), pickNumber: Number(msg.pickNumber || 1) });
          } else if (msg.type === 'draft:choosePack' && msg.playerId && msg.setChoice) {
            await leaderChooseDraftPack(matchId, msg.playerId, { setChoice: msg.setChoice, packIndex: Number(msg.packIndex || 0) });
          }
        } catch (e) {
          try { console.warn('[match:control] handler error:', e?.message || e); } catch {}
        }
        return;
      }
      if (channel === LOBBY_CONTROL_CHANNEL) {
        if (!msg || !msg.type) return;
        try {
          const leader = await getOrClaimLobbyLeader();
          if (leader !== INSTANCE_ID) return;
        } catch { return; }
        try {
          await handleLobbyControlAsLeader(msg);
        } catch (e) {
          try { console.warn('[lobby:control] handler error:', e?.message || e); } catch {}
        }
        return;
      }
      if (channel === LOBBY_STATE_CHANNEL) {
        if (!msg) return;
        if (msg.type === 'upsert' && msg.lobby && msg.lobby.id) {
          try { upsertLobbyFromSerialized(msg.lobby); } catch {}
        } else if (msg.type === 'delete' && msg.id) {
          try { lobbies.delete(msg.id); } catch {}
        }
        return;
      }
    });
  } catch {}
}

// Basic health endpoints (liveness/readiness)
server.on("request", async (req, res) => {
  const url = (req && req.url) || "/";
  if (url === "/healthz" || url === "/readyz" || url === "/status") {
    const dbOk = !!isReady;
    const redisOk = pubClient ? (pubClient.status === "ready" || pubClient.status === "connect") : false;
    const storeOk = storeRedis ? (storeRedis.status === 'ready' || storeRedis.status === 'connect') : false;
    const body = JSON.stringify({ ok: true, db: dbOk, redis: redisOk, store: storeOk, shuttingDown: isShuttingDown, matches: typeof matches !== 'undefined' && matches ? matches.size : 0, uptimeSec: Math.floor(process.uptime()) });
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    res.end(body);
    return;
  }
  // For all other paths, do nothing here; allow Socket.IO and other handlers to respond.
  return;
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
clusterStateReady = true;

// -----------------------------
// Persistence helpers (PostgreSQL via Prisma) and Redis cache
// -----------------------------
function toPlainPlayerDecks(playerDecks) {
  if (!playerDecks || !(playerDecks instanceof Map)) return playerDecks || null;
  return Object.fromEntries(playerDecks);
}

function matchToSessionUpsertData(match) {
  return {
    lobbyId: match.lobbyId || null,
    lobbyName: match.lobbyName || null,
    playerIds: Array.isArray(match.playerIds) ? match.playerIds : [],
    status: match.status,
    seed: match.seed,
    turn: match.turn || null,
    winnerId: match.winnerId || null,
    matchType: (match.matchType || "constructed"),
    sealedConfig: match.sealedConfig || null,
    draftConfig: match.draftConfig || null,
    draftState: match.draftState || null,
    playerDecks: match.playerDecks ? toPlainPlayerDecks(match.playerDecks) : null,
    sealedPacks: match.sealedPacks || null,
    game: match.game || null,
    lastTs: BigInt(Number(match.lastTs || Date.now())),
  };
}

async function cacheSessionToRedis(sessionData) {
  try {
    if (!pubClient) return;
    const key = `match:session:${sessionData.id}`;
    await pubClient.set(
      key,
      JSON.stringify(sessionData, (_k, v) => (typeof v === 'bigint' ? Number(v) : v)),
      'EX',
      60 * 60 * 24
    );
  } catch {}
}

async function persistMatchCreated(match) {
  try {
    const data = matchToSessionUpsertData(match);
    const createData = { id: match.id, ...data };
    const updateData = { ...data };
    await prisma.onlineMatchSession.upsert({
      where: { id: match.id },
      update: updateData,
      create: createData,
    });
    await cacheSessionToRedis({ ...data, id: match.id });
  } catch (e) {
    try { console.warn(`[persist] create session failed for ${match.id}:`, e?.message || e); } catch {}
  }
}

async function persistMatchUpdate(match, patch, playerId, ts) {
  try {
    const data = matchToSessionUpsertData(match);
    await prisma.$transaction([
      prisma.onlineMatchSession.update({ where: { id: match.id }, data }),
      ...(patch ? [prisma.onlineMatchAction.create({ data: { matchId: match.id, playerId: playerId || 'system', timestamp: BigInt(Number(ts || Date.now())), patch } })] : []),
    ]);
    await cacheSessionToRedis({ ...data, id: match.id });
  } catch (e) {
    try { console.warn(`[persist] update session failed for ${match.id}:`, e?.message || e); } catch {}
  }
}

async function persistMatchEnded(match) {
  try {
    await prisma.onlineMatchSession.update({
      where: { id: match.id },
      data: { status: 'ended', winnerId: match.winnerId || null, lastTs: BigInt(Number(match.lastTs || Date.now())) },
    });
  } catch (e) {
    try { console.warn(`[persist] end session failed for ${match.id}:`, e?.message || e); } catch {}
  }
}

function rehydrateMatch(row) {
  try {
    const m = {
      id: row.id,
      lobbyId: row.lobbyId || null,
      lobbyName: row.lobbyName || null,
      playerIds: Array.isArray(row.playerIds) ? row.playerIds : [],
      status: row.status,
      seed: row.seed,
      turn: row.turn || null,
      winnerId: row.winnerId || null,
      matchType: row.matchType || 'constructed',
      sealedConfig: row.sealedConfig || null,
      draftConfig: row.draftConfig || null,
      playerDecks: row.playerDecks ? new Map(Object.entries(row.playerDecks)) : null,
      sealedPacks: row.sealedPacks || null,
      draftState: row.draftState || null,
      game: row.game || {},
      lastTs: Number(row.lastTs || 0) || 0,
    };
    return m;
  } catch (e) {
    try { console.warn(`[persist] rehydrate failed for ${row && row.id ? row.id : 'unknown'}:`, e?.message || e); } catch {}
    return null;
  }
}

async function recoverActiveMatches() {
  try {
    const rows = await prisma.onlineMatchSession.findMany({
      where: { status: { in: ['waiting', 'deck_construction', 'in_progress'] } },
      orderBy: { updatedAt: 'desc' },
      take: 50,
    });
    let count = 0;
    for (const r of rows) {
      if (matches.has(r.id)) continue;
      const m = rehydrateMatch(r);
      if (m) { matches.set(m.id, m); count++; }
    }
    try { console.log(`[persist] recovered ${count} active match(es) from DB`); } catch {}
  } catch (e) {
    try { console.warn(`[persist] recovery error:`, e?.message || e); } catch {}
  }
}

async function findActiveMatchForPlayer(playerId) {
  try {
    const r = await prisma.onlineMatchSession.findFirst({
      where: {
        status: { in: ['waiting', 'deck_construction', 'in_progress'] },
        playerIds: { has: playerId },
      },
      orderBy: { updatedAt: 'desc' },
    });
    if (!r) return null;
    if (matches.has(r.id)) return matches.get(r.id);
    const m = rehydrateMatch(r);
    if (m) { matches.set(m.id, m); }
    return m;
  } catch {
    return null;
  }
}

// Bot manager for headless CPU clients
// Initialized after helper functions are hoisted

// Global feature flag for CPU bots (default: disabled)
const CPU_BOTS_ENABLED =
  process.env.NEXT_PUBLIC_CPU_BOTS_ENABLED === "1" ||
  process.env.NEXT_PUBLIC_CPU_BOTS_ENABLED === "true";

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

// Ensure basic player profile is cached locally; fetch displayName from Redis if needed
async function ensurePlayerCached(playerId) {
  if (players.has(playerId)) return players.get(playerId);
  try {
    const dn = storeRedis ? await storeRedis.hget(`player:${playerId}`, 'displayName') : null;
    const p = { id: playerId, displayName: dn || `Player ${String(playerId).slice(-4)}`, socketId: null, lobbyId: null, matchId: null };
    players.set(playerId, p);
    return p;
  } catch {
    const p = { id: playerId, displayName: `Player ${String(playerId).slice(-4)}`, socketId: null, lobbyId: null, matchId: null };
    players.set(playerId, p);
    return p;
  }
}

function isPlayerConnected(playerId) {
  const p = players.get(playerId);
  if (!p || !p.socketId) return false;
  return !!io.sockets.sockets.get(p.socketId);
}

// -----------------------------
// Distributed match coordination helpers (Redis)
// -----------------------------
async function getOrClaimMatchLeader(matchId) {
  try {
    if (!storeRedis) return INSTANCE_ID; // single-instance fallback
    const key = `match:leader:${matchId}`;
    const current = await storeRedis.get(key);
    if (current) {
      if (current === INSTANCE_ID) {
        try { await storeRedis.expire(key, 60); } catch {}
      }
      return current;
    }
    // Try to claim leadership
    const setRes = await storeRedis.set(key, INSTANCE_ID, 'NX', 'EX', 60);
    if (setRes) return INSTANCE_ID;
    // Someone else won
    return await storeRedis.get(key);
  } catch {
    return INSTANCE_ID;
  }
}

async function getOrLoadMatch(matchId) {
  if (matches.has(matchId)) return matches.get(matchId);
  // Try Redis cache first
  try {
    if (storeRedis) {
      const raw = await storeRedis.get(`match:session:${matchId}`);
      if (raw) {
        try {
          const cached = JSON.parse(raw);
          if (cached && cached.id === matchId) {
            const m = rehydrateMatch(cached);
            if (m) { matches.set(matchId, m); return m; }
          }
        } catch {}
      }
    }
  } catch {}
  // Fallback to DB
  try {
    const row = await prisma.onlineMatchSession.findUnique({ where: { id: matchId } });
    if (row) {
      const m = rehydrateMatch(row);
      if (m) { matches.set(matchId, m); return m; }
    }
  } catch {}
  return null;
}

async function leaderJoinMatch(matchId, playerId, socketId) {
  const match = await getOrLoadMatch(matchId);
  if (!match) return;
  // Update roster
  if (!Array.isArray(match.playerIds)) match.playerIds = [];
  if (!match.playerIds.includes(playerId)) match.playerIds.push(playerId);
  // Update player mapping in local cache
  const p = await ensurePlayerCached(playerId);
  try { p.matchId = matchId; } catch {}
  // Join the socket (works cluster-wide with Redis adapter)
  const room = `match:${matchId}`;
  try { await io.in(socketId).socketsJoin(room); } catch {}
  // Broadcast match info
  try { io.to(room).emit('matchStarted', { match: getMatchInfo(match) }); } catch {}
  // Persist roster change and refresh cache
  try { await persistMatchUpdate(match, null, playerId, Date.now()); } catch {}
  // Keep our leadership fresh
  try { if (storeRedis) await storeRedis.expire(`match:leader:${matchId}`, 60); } catch {}
}

async function leaderApplyAction(matchId, playerId, incomingPatch, actorSocketId) {
  const match = await getOrLoadMatch(matchId);
  if (!match) return;
  const matchRoom = `match:${matchId}`;
  const now = Date.now();
  try {
    const patch = incomingPatch;
    if (
      match &&
      match.status === 'waiting' &&
      patch && typeof patch === 'object' && patch.phase === 'Main'
    ) {
      match.status = 'in_progress';
      io.to(matchRoom).emit('matchStarted', { match: getMatchInfo(match) });
    }
    if (match && patch && typeof patch === 'object') {
      let patchToApply = patch;
      if (patch && typeof patch === 'object' && patch.d20Rolls) {
        const prev = (match.game && match.game.d20Rolls) || { p1: null, p2: null };
        const inc = patch.d20Rolls || {};
        const mergedD20 = {
          p1: (inc.p1 !== undefined ? inc.p1 : (prev.p1 ?? null)),
          p2: (inc.p2 !== undefined ? inc.p2 : (prev.p2 ?? null)),
        };
        if (mergedD20.p1 != null && mergedD20.p2 != null) {
          if (Number(mergedD20.p1) === Number(mergedD20.p2)) {
            patchToApply = { ...patchToApply, d20Rolls: { p1: null, p2: null }, setupWinner: null };
            try { if (match._autoSeatTimer) { clearTimeout(match._autoSeatTimer); match._autoSeatTimer = null; } } catch {}
            try { match._autoSeatApplied = false; } catch {}
          } else {
            const winner = Number(mergedD20.p1) > Number(mergedD20.p2) ? 'p1' : 'p2';
            patchToApply = { ...patchToApply, d20Rolls: mergedD20 };
            if (patchToApply.setupWinner === undefined) patchToApply.setupWinner = winner;
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
              }
            } catch {}
          }
        } else {
          patchToApply = { ...patchToApply, d20Rolls: mergedD20 };
        }
      }
      if (patchToApply && typeof patchToApply === 'object' && (patchToApply.phase === 'Start' || patchToApply.phase === 'Main')) {
        try { if (match._autoSeatTimer) { clearTimeout(match._autoSeatTimer); match._autoSeatTimer = null; } } catch {}
      }
      try {
        const prevCP = match.game && typeof match.game.currentPlayer === 'number' ? match.game.currentPlayer : null;
        const nextCP = (patchToApply && typeof patchToApply.currentPlayer === 'number') ? patchToApply.currentPlayer : null;
        const phaseIsMain = patchToApply && patchToApply.phase === 'Main';
        if ((nextCP === 1 || nextCP === 2) && (nextCP !== prevCP || phaseIsMain)) {
          const tsPatch = applyTurnStart({ ...(match.game || {}), currentPlayer: nextCP });
          if (tsPatch && typeof tsPatch === 'object') {
            patchToApply = { ...patchToApply, ...tsPatch };
          }
        }
      } catch {}
      const actorIsCpu = isCpuPlayerId(playerId);
      const enforce = RULES_ENFORCE_MODE === 'all' || (RULES_ENFORCE_MODE === 'bot_only' && actorIsCpu);
      try {
        const costRes = ensureCosts(match.game || {}, patchToApply, playerId, { match });
        if (costRes && costRes.autoPatch && RULES_HELPERS_ENABLED) {
          patchToApply = deepMergeReplaceArrays(patchToApply || {}, costRes.autoPatch);
        }
        if (costRes && costRes.ok === false) {
          if (enforce) {
            if (actorSocketId) io.to(actorSocketId).emit('error', { message: costRes.error || 'Insufficient resources', code: 'cost_unpaid' });
            return;
          } else {
            const warn = [{ id: 0, ts: Date.now(), text: `[Warning] ${costRes.error || 'Insufficient resources'}` }];
            const existing = Array.isArray(patchToApply && patchToApply.events) ? patchToApply.events : [];
            patchToApply = { ...patchToApply, events: [...existing, ...warn] };
          }
        }
      } catch {}
      try {
        const v = validateAction(match.game || {}, patchToApply, playerId, { match });
        if (!v.ok && enforce) {
          if (actorSocketId) io.to(actorSocketId).emit('error', { message: v.error || 'Rules violation', code: 'rules_violation' });
          return;
        }
        if (!v.ok && !enforce) {
          const warnEvent = [{ id: 0, ts: Date.now(), text: `[Warning] ${v.error || 'Potential rules issue'}` }];
          const existing = Array.isArray(patchToApply && patchToApply.events) ? patchToApply.events : [];
          patchToApply = { ...patchToApply, events: [...existing, ...warnEvent] };
        }
      } catch {}
      try {
        const trig = applyGenesis(match.game || {}, patchToApply, playerId, { match });
        if (trig && typeof trig === 'object') {
          patchToApply = deepMergeReplaceArrays(patchToApply || {}, trig);
        }
      } catch {}
      try {
        const kw = applyKeywordAnnotations(match.game || {}, patchToApply, playerId, { match });
        if (kw && typeof kw === 'object') {
          patchToApply = deepMergeReplaceArrays(patchToApply || {}, kw);
        }
      } catch {}
      const eventsAdded = [];
      if (Array.isArray(patch && patch.events)) eventsAdded.push(...patch.events);
      if (Array.isArray(patchToApply && patchToApply.events)) eventsAdded.push(...patchToApply.events);
      if (eventsAdded.length > 0) {
        const prev = Array.isArray(match.game && match.game.events) ? match.game.events : [];
        const mergedEvents = mergeEvents(prev, eventsAdded);
        const mergedMaxId = mergedEvents.reduce((mx, e) => Math.max(mx, Number(e.id) || 0), 0);
        const seq = Math.max(mergedMaxId, Number(patch && patch.eventSeq || 0) || 0);
        patchToApply = { ...patchToApply, events: mergedEvents, eventSeq: seq };
      }
      match.game = deepMergeReplaceArrays(match.game || {}, patchToApply);
      match.lastTs = now;
      recordMatchAction(matchId, patchToApply, playerId);
      io.to(matchRoom).emit('statePatch', { patch: patchToApply, t: now });
      try { await persistMatchUpdate(match, patchToApply, playerId, now); } catch {}
    } else {
      io.to(matchRoom).emit('statePatch', { patch, t: now });
      try { await persistMatchUpdate(match, patch || null, playerId, now); } catch {}
    }
  } catch {
    io.to(matchRoom).emit('statePatch', { patch: incomingPatch || null, t: Date.now() });
  }
  try { if (storeRedis) await storeRedis.expire(`match:leader:${matchId}`, 60); } catch {}
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
  // Elect this instance as initial match leader
  try { if (storeRedis) await storeRedis.set(`match:leader:${match.id}`, INSTANCE_ID, 'NX', 'EX', 60); } catch {}

  // Persist newly created match session
  try { await persistMatchCreated(match); } catch {}

  // Start recording immediately when match is created
  startMatchRecording(match);

  // Join all sockets to match room
  for (const pid of match.playerIds) {
    const p = players.get(pid);
    if (!p) continue;
    const s = io.sockets.sockets.get(p.socketId);
    if (s) s.join(`match:${match.id}`);
    p.matchId = match.id;
    // Keep lobby association during all match types so the lobby remains visible
  }

  // Notify lobby participants immediately that a match has started so UI can show join controls
  try {
    const basicInfo = getMatchInfo(match);
    io.to(`lobby:${lobby.id}`).emit("matchStarted", { match: basicInfo });
  } catch {}

  // Keep lobby visible during matches; mark as 'started' instead of closing
  try { const lb = lobbies.get(lobby.id); if (lb) lb.plannedMatchType = matchType; } catch {}
  try { lobby.status = "started"; } catch {}
  io.to(`lobby:${lobby.id}`).emit("lobbyUpdated", { lobby: getLobbyInfo(lobby) });
  broadcastLobbies();

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
  // Emit only from the lobby leader to avoid duplicate broadcasts
  (async () => {
    try { const leader = await getOrClaimLobbyLeader(); if (leader === INSTANCE_ID) io.emit("lobbiesUpdated", { lobbies: lobbiesArray() }); } catch {}
  })();
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

const REQUIRE_JWT = Boolean(
  (process.env.SOCKET_REQUIRE_JWT || "").toLowerCase() === "1" ||
  (process.env.SOCKET_REQUIRE_JWT || "").toLowerCase() === "true"
);

// Enforce NextAuth-signed JWT at connect time
io.use((socket, next) => {
  try {
    const token = (socket.handshake && socket.handshake.auth && socket.handshake.auth.token) || null;
    if (token && process.env.NEXTAUTH_SECRET) {
      const payload = jwt.verify(token, process.env.NEXTAUTH_SECRET);
      socket.data = socket.data || {};
      socket.data.authUser = {
        id: (payload && (payload.uid || payload.sub)) || null,
        name: payload && payload.name,
      };
      return next();
    }
    if (REQUIRE_JWT) {
      return next(new Error("auth_required"));
    }
    return next();
  } catch (e) {
    return next(new Error("invalid_token"));
  }
});

io.on("connection", (socket) => {
  let authed = false;
  let authUser = null;

  // Read auth result from middleware (fallback to soft-allow if not required)
  if (socket.data && socket.data.authUser) {
    authUser = socket.data.authUser;
  } else if (REQUIRE_JWT) {
    try { socket.emit("error", { message: "auth_required" }); } catch {}
    try { socket.disconnect(true); } catch {}
    return;
  }

  socket.on("hello", async (payload) => {
    const rawName = payload && typeof payload.displayName === "string" ? payload.displayName : "";
    let displayName = (rawName.trim() || "Player").slice(0, 40);
    if (authUser && authUser.name) {
      displayName = String(authUser.name).slice(0, 40);
    }
    const providedId = payload && payload.playerId ? String(payload.playerId) : null;
    const tokenId = authUser && authUser.id ? String(authUser.id) : null;
    const playerId = tokenId || providedId || rid("p");

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

    // Cache player displayName in Redis for cross-instance lookups
    try { if (storeRedis) { await storeRedis.hset(`player:${playerId}`, { displayName }); } } catch {}

    console.log(
      `[auth] hello <= name="${displayName}" id=${playerId} providedId=${!!providedId} tokenId=${tokenId ? "yes" : "no"} socket=${socket.id}`
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
    } else {
      // Server restart recovery path: attach player to an active match from DB if found
      try {
        const recovered = await findActiveMatchForPlayer(player.id);
        if (recovered) {
          player.matchId = recovered.id;
          socket.join(`match:${recovered.id}`);
          socket.emit("matchStarted", { match: getMatchInfo(recovered) });
          if (recovered.matchType === 'draft' && recovered.draftState && recovered.draftState.phase !== 'waiting') {
            socket.emit("draftUpdate", recovered.draftState);
          }
        }
      } catch {}
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
      // Ensure avatar positions exist so first-site placement rule can be applied client/server
      const sz = (match.game && match.game.board && match.game.board.size) || { w: 5, h: 5 };
      const cx = Math.floor(Math.max(1, Number(sz.w) || 5) / 2);
      const topY = (Number(sz.h) || 5) - 1;
      const botY = 0;
      const avPrev = (match.game && match.game.avatars) || { p1: {}, p2: {} };
      const p1Prev = avPrev.p1 || {};
      const p2Prev = avPrev.p2 || {};
      const avatars = {
        p1: { ...p1Prev, pos: Array.isArray(p1Prev.pos) ? p1Prev.pos : [cx, topY] },
        p2: { ...p2Prev, pos: Array.isArray(p2Prev.pos) ? p2Prev.pos : [cx, botY] },
      };
      const mainPatch = { phase: "Main", currentPlayer: cp, avatars };
      // Update server-side aggregated snapshot
      match.game = deepMergeReplaceArrays(match.game || {}, mainPatch);
      match.lastTs = now;
      io.to(room).emit("statePatch", { patch: mainPatch, t: now });
      try {
        console.log(`[Setup] All mulligans complete for match ${match.id}. Starting game.`);
      } catch {}
    }
  });

  socket.on("createLobby", async (payload = {}) => {
    if (!authed) return;
    const player = getPlayerBySocket(socket);
    if (!player) return;
    try {
      const leader = await getOrClaimLobbyLeader();
      const msg = { type: 'create', hostId: player.id, socketId: socket.id, options: { name: payload?.name || null, visibility: payload?.visibility || 'open', maxPlayers: payload?.maxPlayers } };
      if (leader && leader !== INSTANCE_ID) {
        if (storeRedis) await storeRedis.publish(LOBBY_CONTROL_CHANNEL, JSON.stringify(msg));
        return;
      }
      await handleLobbyControlAsLeader(msg);
    } catch {}
  });

  socket.on("joinLobby", async (payload = {}) => {
    if (!authed) return;
    const player = getPlayerBySocket(socket);
    if (!player) return;
    const lobbyId = payload.lobbyId || undefined;
    try {
      const leader = await getOrClaimLobbyLeader();
      const msg = { type: 'join', playerId: player.id, socketId: socket.id, lobbyId };
      if (leader && leader !== INSTANCE_ID) {
        if (storeRedis) await storeRedis.publish(LOBBY_CONTROL_CHANNEL, JSON.stringify(msg));
        return;
      }
      await handleLobbyControlAsLeader(msg);
    } catch {}
  });

  socket.on("leaveLobby", async () => {
    if (!authed) return;
    const player = getPlayerBySocket(socket);
    if (!player) return;
    try {
      const leader = await getOrClaimLobbyLeader();
      const msg = { type: 'leave', playerId: player.id, socketId: socket.id };
      if (leader && leader !== INSTANCE_ID) {
        if (storeRedis) await storeRedis.publish(LOBBY_CONTROL_CHANNEL, JSON.stringify(msg));
        return;
      }
      await handleLobbyControlAsLeader(msg);
    } catch {}
  });

  socket.on("setLobbyVisibility", async (payload = {}) => {
    if (!authed) return;
    const player = getPlayerBySocket(socket);
    if (!player) return;
    try {
      const leader = await getOrClaimLobbyLeader();
      const msg = { type: 'visibility', playerId: player.id, lobbyId: player.lobbyId || null, visibility: payload?.visibility };
      if (leader && leader !== INSTANCE_ID) {
        if (storeRedis) await storeRedis.publish(LOBBY_CONTROL_CHANNEL, JSON.stringify(msg));
        return;
      }
      await handleLobbyControlAsLeader(msg);
    } catch {}
  });

  // Host sets planned match type for lobby (visible to all clients)
  socket.on("setLobbyPlan", async (payload = {}) => {
    if (!authed) return;
    const player = getPlayerBySocket(socket);
    if (!player) return;
    try {
      const leader = await getOrClaimLobbyLeader();
      const msg = { type: 'plan', playerId: player.id, lobbyId: player.lobbyId || null, plannedMatchType: payload?.plannedMatchType };
      if (leader && leader !== INSTANCE_ID) {
        if (storeRedis) await storeRedis.publish(LOBBY_CONTROL_CHANNEL, JSON.stringify(msg));
        return;
      }
      await handleLobbyControlAsLeader(msg);
    } catch {}
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

  socket.on("ready", async (payload) => {
    if (!authed) return;
    const player = getPlayerBySocket(socket);
    if (!player) return;
    try {
      const leader = await getOrClaimLobbyLeader();
      const msg = { type: 'ready', playerId: player.id, lobbyId: player.lobbyId || null, ready: !!(payload && payload.ready) };
      if (leader && leader !== INSTANCE_ID) {
        if (storeRedis) await storeRedis.publish(LOBBY_CONTROL_CHANNEL, JSON.stringify(msg));
        return;
      }
      await handleLobbyControlAsLeader(msg);
    } catch {}
  });

  socket.on("startMatch", async (payload = {}) => {
    if (!authed) return;
    const player = getPlayerBySocket(socket);
    if (!player) return;
    const msg = { type: 'startMatch', playerId: player.id, matchType: payload?.matchType || 'constructed', sealedConfig: payload?.sealedConfig || null, draftConfig: payload?.draftConfig || null };
    try {
      const leader = await getOrClaimLobbyLeader();
      if (leader && leader !== INSTANCE_ID) {
        if (storeRedis) await storeRedis.publish(LOBBY_CONTROL_CHANNEL, JSON.stringify(msg));
        return;
      }
      await handleLobbyControlAsLeader(msg);
    } catch {}
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

  socket.on("joinMatch", async (payload) => {
    if (!authed) return;
    const matchId = payload && payload.matchId;
    if (!matchId) return;
    const player = getPlayerBySocket(socket);
    if (!player) return;
    try {
      const leader = await getOrClaimMatchLeader(matchId);
      if (leader && leader !== INSTANCE_ID) {
        // Forward to leader via pub/sub
        if (storeRedis) await storeRedis.publish(MATCH_CONTROL_CHANNEL, JSON.stringify({ type: 'join', matchId, playerId: player.id, socketId: socket.id }));
        return;
      }
      // We are the leader (or no leader configured but we claimed it), handle locally
      await leaderJoinMatch(matchId, player.id, socket.id);
    } catch {}
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

  socket.on("action", async (payload) => {
    if (!authed) return;
    const player = getPlayerBySocket(socket);
    if (!player || !player.matchId) return;
    const matchId = player.matchId;
    const patch = payload ? payload.action : null;
    try {
      const leader = await getOrClaimMatchLeader(matchId);
      if (leader && leader !== INSTANCE_ID) {
        if (storeRedis) await storeRedis.publish(MATCH_CONTROL_CHANNEL, JSON.stringify({ type: 'action', matchId, playerId: player.id, socketId: socket.id, patch }));
        return;
      }
      await leaderApplyAction(matchId, player.id, patch, socket.id);
    } catch {}
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
  socket.on("message", async (payload = {}) => {
    if (!authed) return;
    const player = getPlayerBySocket(socket);
    if (!player || !player.matchId) return;
    const matchId = player.matchId;
    const type = payload && typeof payload.type === "string" ? payload.type : null;
    if (type === "playerReady") {
      const ready = !!(payload && payload.ready);
      try {
        const leader = await getOrClaimMatchLeader(matchId);
        if (leader && leader !== INSTANCE_ID) {
          if (storeRedis) await storeRedis.publish(MATCH_CONTROL_CHANNEL, JSON.stringify({ type: 'draft:playerReady', matchId, playerId: player.id, ready }));
          return;
        }
        await leaderDraftPlayerReady(matchId, player.id, ready);
      } catch {}
    }
  });

  socket.on("resyncRequest", () => {
    if (!authed) return;
    const player = getPlayerBySocket(socket);
    if (player && player.matchId && matches.has(player.matchId)) {
      const match = matches.get(player.matchId);
      const snap = { match: getMatchInfo(match) };
      // Only include a game snapshot when it's meaningful.
      // During sealed/draft setup the server-side game can be an empty object ({}),
      // while the client has already loaded decks locally. Sending an empty game here
      // would wipe the client state on every resync. Avoid that by requiring either
      // an in-progress match or detectable game content.
      const hasMeaningfulGame = (() => {
        if (!match || !match.game) return false;
        if (match.status === "in_progress") return true;
        if (typeof match.game === "object") {
          const keys = Object.keys(match.game);
          if (keys.length === 0) return false;
          // Heuristic: presence of phase/libraries/zones indicates a real snapshot
          if ("phase" in match.game) return true;
          if ("libraries" in match.game) return true;
          if ("zones" in match.game) return true;
        }
        return false;
      })();
      if (hasMeaningfulGame) {
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

      // Keep lobby visible during the match for rematch/voting UX
      const lobby = match.lobbyId ? lobbies.get(match.lobbyId) : null;
      if (lobby) {
        try { lobby.status = "started"; } catch {}
        try { publishLobbyState(lobby); } catch {}
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

      // Fallback: if not all players choose within 12s, auto-assign first pack for those who didn't
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
      }, 12000);

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
      // Persist draft state progress
      try { persistMatchUpdate(match, null, requestingPlayer?.id || 'system', Date.now()); } catch {}
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
    const matchId = player.matchId;
    try {
      const leader = await getOrClaimMatchLeader(matchId);
      if (leader && leader !== INSTANCE_ID) {
        if (storeRedis) await storeRedis.publish(MATCH_CONTROL_CHANNEL, JSON.stringify({ type: 'draft:start', matchId, playerId: player.id, draftConfig: payload?.draftConfig || null, socketId: socket.id }));
        return;
      }
      await leaderStartDraft(matchId, player.id, payload?.draftConfig || null, socket.id);
    } catch {}
  });

  socket.on("makeDraftPick", async (payload) => {
    if (!authed) return;
    const player = getPlayerBySocket(socket);
    if (!player || !player.matchId) return;
    const matchId = player.matchId;
    const { cardId, packIndex, pickNumber } = payload || {};
    try {
      const leader = await getOrClaimMatchLeader(matchId);
      if (leader && leader !== INSTANCE_ID) {
        if (storeRedis) await storeRedis.publish(MATCH_CONTROL_CHANNEL, JSON.stringify({ type: 'draft:pick', matchId, playerId: player.id, cardId, packIndex, pickNumber }));
        return;
      }
      await leaderMakeDraftPick(matchId, player.id, { cardId, packIndex, pickNumber });
    } catch {}
  });

  socket.on("chooseDraftPack", async (payload) => {
    if (!authed) return;
    const player = getPlayerBySocket(socket);
    if (!player || !player.matchId) return;
    const matchId = player.matchId;
    const { setChoice, packIndex } = payload || {};
    try {
      const leader = await getOrClaimMatchLeader(matchId);
      if (leader && leader !== INSTANCE_ID) {
        if (storeRedis) await storeRedis.publish(MATCH_CONTROL_CHANNEL, JSON.stringify({ type: 'draft:choosePack', matchId, playerId: player.id, setChoice, packIndex }));
        return;
      }
      await leaderChooseDraftPack(matchId, player.id, { setChoice, packIndex });
    } catch {}
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
        `[Match] All draft decks submitted for match ${match.id}, transitioning to waiting (setup)`
      );
      // Do NOT skip setup for draft; mirror sealed flow: move to waiting and keep lobby visible
      match.status = "waiting";
      try { io.to(`match:${match.id}`).emit("matchStarted", { match: getMatchInfo(match) }); } catch {}

      // Keep lobby visible (mark as started) for in-progress match
      if (match.lobbyId) {
        const lobby = lobbies.get(match.lobbyId);
        if (lobby) {
          try { lobby.status = "started"; } catch {}
          try { publishLobbyState(lobby); } catch {}
          broadcastLobbies();
        }
      }
    }

    // Broadcast updated match info
    io.to(`match:${match.id}`).emit("matchStarted", {
      match: getMatchInfo(match),
    });
    try { persistMatchUpdate(match, null, player.id, Date.now()); } catch {}
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
    try { persistMatchEnded(match); } catch {}
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

// Startup: connect DB and attempt recovery
(async () => {
  try {
    await prisma.$connect();
    try { console.log('[db] connected'); } catch {}
  } catch (e) {
    try { console.error('[db] connection failed:', e?.message || e); } catch {}
  }
  try {
    await recoverActiveMatches();
  } catch {}
  isReady = true;
})();

// Graceful shutdown
async function shutdown() {
  if (isShuttingDown) return;
  isShuttingDown = true;
  const timeout = Number(process.env.SHUTDOWN_TIMEOUT_MS || 10000);
  try { console.log('[server] shutting down...'); } catch {}
  const timer = setTimeout(() => process.exit(0), timeout);
  try { await new Promise((resolve) => io.close(() => resolve())); } catch {}
  try { await new Promise((resolve) => server.close(() => resolve())); } catch {}
  try { if (pubClient) await pubClient.quit(); } catch {}
  try { if (subClient) await subClient.quit(); } catch {}
  try { await prisma.$disconnect(); } catch {}
  clearTimeout(timer);
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
