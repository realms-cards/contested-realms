// Tournament Draft Engine (server-side)
// Runs on the Socket.IO server for low-latency tournament draft handling.
// Uses Redis for cross-instance broadcast and batches DB writes for persistence.

let prisma = null;
let io = null;
let storeRedis = null;

const DRAFT_STATE_CHANNEL = 'draft:session:update';

// In-memory session cache
// Map<sessionId, { session: { id, participants, status, packConfiguration, settings }, state, persistTimer, lastPersistAt, meta }>
const sessions = new Map();

export function setDeps({ prismaClient, ioServer, storeRedisClient }) {
  prisma = prismaClient;
  io = ioServer;
  storeRedis = storeRedisClient;
}

function room(sessionId) {
  return `draft:${sessionId}`;
}

async function loadSession(sessionId) {
  if (!prisma) throw new Error('Tournament engine not initialized');
  const rec = await prisma.draftSession.findUnique({
    where: { id: sessionId },
    include: {
      participants: {
        select: { playerId: true, seatNumber: true, deckData: true },
        orderBy: { seatNumber: 'asc' },
      },
    },
  });
  if (!rec) throw new Error('Draft session not found');
  let state = null;
  try {
    state = typeof rec.draftState === 'string' ? JSON.parse(rec.draftState) : rec.draftState;
  } catch {}
  if (!state || typeof state !== 'object') state = {};
  const packConfig = Array.isArray(rec.packConfiguration) ? rec.packConfiguration : [];
  const packCount = packConfig.reduce((acc, x) => acc + Math.max(0, Number(x?.packCount) || 0), 0) || 3;
  const packSize = Math.max(8, Number(rec?.settings?.packSize) || 15);
  const meta = { packCount, packSize };
  const entry = { session: rec, state, persistTimer: null, lastPersistAt: 0, meta };
  sessions.set(sessionId, entry);
  return entry;
}

async function getOrLoad(sessionId) {
  if (sessions.has(sessionId)) return sessions.get(sessionId);
  return await loadSession(sessionId);
}

function publishState(sessionId, state) {
  // Local fast-path emit
  try { io && io.to(room(sessionId)).emit('draftUpdate', state); } catch {}
  // Cross-instance broadcast
  try {
    if (storeRedis) storeRedis.publish(DRAFT_STATE_CHANNEL, JSON.stringify({ sessionId, draftState: state }));
  } catch {}
}

async function persistState(sessionId, state) {
  if (!prisma) return;
  try {
    await prisma.draftSession.update({
      where: { id: sessionId },
      data: {
        draftState: state,
        // Touch updatedAt implicitly
      },
    });
  } catch (e) {
    try { console.warn('[tourney] persistState failed:', e?.message || e); } catch {}
  }
}

function schedulePersist(sessionId, state) {
  const entry = sessions.get(sessionId);
  if (!entry) return;
  entry.state = state;
  if (entry.persistTimer) return;
  entry.persistTimer = setTimeout(async () => {
    entry.persistTimer = null;
    entry.lastPersistAt = Date.now();
    await persistState(sessionId, entry.state);
  }, 150);
}

// Simple Redis-based lock to serialize updates across instances
async function withLock(sessionId, fn, timeoutMs = 2000) {
  const key = `draft:lock:${sessionId}`;
  const waitStep = 25;
  const started = Date.now();
  if (!storeRedis) {
    // Single-instance fallback
    return await fn();
  }
  while (Date.now() - started < timeoutMs) {
    try {
      const ok = await storeRedis.set(key, '1', 'NX', 'PX', timeoutMs);
      if (ok) {
        try {
          const res = await fn();
          return res;
        } finally {
          try { await storeRedis.del(key); } catch {}
        }
      }
    } catch {}
    await new Promise((r) => setTimeout(r, waitStep));
  }
  throw new Error('Lock timeout');
}

function ensureArrays(state, playerCount) {
  if (!Array.isArray(state.waitingFor)) state.waitingFor = [];
  if (!Array.isArray(state.currentPacks)) state.currentPacks = Array.from({ length: playerCount }, () => []);
  if (!Array.isArray(state.picks) || state.picks.length !== playerCount) state.picks = Array.from({ length: playerCount }, () => []);
  if (!Array.isArray(state.packChoice) || state.packChoice.length !== playerCount) state.packChoice = Array.from({ length: playerCount }, () => null);
  if (typeof state.pickNumber !== 'number' || state.pickNumber < 1) state.pickNumber = 1;
  if (typeof state.packIndex !== 'number' || state.packIndex < 0) state.packIndex = 0;
  if (state.packDirection !== 'left' && state.packDirection !== 'right') state.packDirection = 'left';
}

function indexByPlayer(participants, playerId) {
  const idx = participants.findIndex((p) => p.playerId === playerId);
  return idx >= 0 ? idx : -1;
}

export async function choosePack(sessionId, playerId, { packIndex, setChoice } = {}) {
  return await withLock(sessionId, async () => {
    const entry = await getOrLoad(sessionId);
    const participants = entry.session.participants || [];
    const state = { ...(entry.state || {}) };
    const playerCount = participants.length;
    ensureArrays(state, playerCount);

    if (state.phase !== 'pack_selection') return state;

    const seatIdx = indexByPlayer(participants, playerId);
    if (seatIdx < 0) return state;

    const roundIndex = Math.max(0, Number(state.packIndex) || 0);
    const chosenIndex = typeof packIndex === 'number' ? Math.max(0, packIndex) : roundIndex;
    const allPacks = state.allGeneratedPacks || entry.state.allGeneratedPacks || null;
    if (!allPacks || !allPacks[seatIdx] || !allPacks[seatIdx][chosenIndex]) return state;

    // Swap chosen pack into the round position
    if (chosenIndex !== roundIndex) {
      try {
        const seatPacks = allPacks[seatIdx];
        const tmp = seatPacks[roundIndex];
        seatPacks[roundIndex] = seatPacks[chosenIndex];
        seatPacks[chosenIndex] = tmp;
      } catch {}
    }

    // Record choice (infer if not provided)
    const inferred = allPacks[seatIdx][roundIndex]?.[0]?.setName || null;
    state.packChoice[seatIdx] = setChoice || inferred;

    // Auto-finalize: distribute and enter picking immediately
    const nextCurrentPacks = Array.from({ length: playerCount }, (_, idx) => {
      const source = allPacks?.[idx]?.[roundIndex] ?? [];
      return Array.isArray(source) ? source.map((c) => ({ ...c })) : [];
    });
    const nextWaiting = participants
      .map((p, idx) => (Array.isArray(nextCurrentPacks[idx]) && nextCurrentPacks[idx].length > 0 ? p.playerId : null))
      .filter(Boolean);
    state.currentPacks = nextCurrentPacks;
    state.waitingFor = nextWaiting;
    state.phase = 'picking';
    state.pickNumber = 1;
    state.allGeneratedPacks = allPacks;

    // Broadcast immediately, then persist (batched) and publish for other instances
    publishState(sessionId, state);
    schedulePersist(sessionId, state);
    entry.state = state;
    return state;
  });
}

export async function makePick(sessionId, playerId, cardId) {
  return await withLock(sessionId, async () => {
    const entry = await getOrLoad(sessionId);
    const participants = entry.session.participants || [];
    const meta = entry.meta || { packCount: 3, packSize: 15 };
    const state = { ...(entry.state || {}) };
    const playerCount = participants.length;
    ensureArrays(state, playerCount);

    if (state.phase !== 'picking') return state;
    if (!Array.isArray(state.waitingFor) || !state.waitingFor.includes(playerId)) return state;

    const idx = indexByPlayer(participants, playerId);
    if (idx < 0) return state;
    const currentPack = Array.isArray(state.currentPacks?.[idx]) ? state.currentPacks[idx] : null;
    if (!currentPack) return state;

    const cardIndex = currentPack.findIndex((c) => c && c.id === cardId);
    if (cardIndex === -1) return state;

    const picked = currentPack.splice(cardIndex, 1)[0];
    if (!Array.isArray(state.picks[idx])) state.picks[idx] = [];
    state.picks[idx].push(picked);

    state.waitingFor = state.waitingFor.filter((pid) => pid !== playerId);

    // If all have picked, pass or advance round
    if (state.waitingFor.length === 0) {
      const packDone = currentPack.length === 0 || state.pickNumber >= meta.packSize;
      if (packDone) {
        // Next round
        state.packIndex = (Number(state.packIndex) || 0) + 1;
        state.pickNumber = 1;
        if (state.packIndex >= meta.packCount) {
          state.phase = 'complete';
        } else {
          state.phase = 'pack_selection';
          state.waitingFor = participants.map((p) => p.playerId);
          state.currentPacks = [];
          // Reset choices for this round
          state.packChoice = Array.from({ length: playerCount }, () => null);
          state.packDirection = state.packDirection === 'left' ? 'right' : 'left';
        }
      } else {
        // Passing
        state.pickNumber = Number(state.pickNumber) + 1;
        const tmp = [...state.currentPacks];
        const n = tmp.length;
        if (state.packDirection === 'left') {
          for (let i = 0; i < n; i++) state.currentPacks[(i + 1) % n] = tmp[i];
        } else {
          for (let i = 0; i < n; i++) state.currentPacks[(i - 1 + n) % n] = tmp[i];
        }
        state.phase = 'picking';
        // Only mark players as waiting if they have cards in their pack
        state.waitingFor = participants
          .map((p, idx) => (Array.isArray(state.currentPacks[idx]) && state.currentPacks[idx].length > 0 ? p.playerId : null))
          .filter(Boolean);
      }
    }

    publishState(sessionId, state);
    schedulePersist(sessionId, state);
    entry.state = state;
    return state;
  });
}

export async function getState(sessionId) {
  const entry = await getOrLoad(sessionId);
  return entry?.state || null;
}

