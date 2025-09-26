// Simple Socket.IO server for Sorcery online MVP
// Run with: node server/index.js

// Load environment variables (.env, .env.local) for standalone server runs
try { require('dotenv').config(); } catch {}

// -----------------------------
// Leader-aware Draft helpers (match-level)
// -----------------------------
function repairDraftInvariants(match) {
  if (!match || match.matchType !== 'draft' || !match.draftState) return;
  const ds = match.draftState;
  // If server thinks we're in picking for a new pack but hasn't distributed packs yet,
  // revert to pack_selection and wait for choices.
  if (ds.phase === 'picking' && Number(ds.pickNumber || 0) === 1) {
    const hasAnyCards = Array.isArray(ds.currentPacks)
      ? ds.currentPacks.some((p) => Array.isArray(p) && p.length > 0)
      : false;
    if (!hasAnyCards) {
      ds.phase = 'pack_selection';
      ds.waitingFor = [...match.playerIds];
      if (!Array.isArray(ds.packChoice) || ds.packChoice.length !== match.playerIds.length) {
        ds.packChoice = Array.from({ length: match.playerIds.length }, () => null);
      } else {
        ds.packChoice = ds.packChoice.map(() => null);
      }
      try { console.warn(`[Draft] Repaired invariant: picking@1 without packs -> reverted to pack_selection (round ${ds.packIndex + 1})`); } catch {}
    }
  }
  // Bound packIndex to configured packCount
  const maxPacks = (match.draftConfig && Number(match.draftConfig.packCount)) || 3;
  if (typeof ds.packIndex === 'number' && ds.packIndex >= maxPacks) {
    ds.packIndex = Math.max(0, maxPacks - 1);
  }
}

const INTERACTION_VERSION = 1;
const INTERACTION_ENFORCEMENT_ENABLED = (() => {
  const raw = process.env.INTERACTION_ENFORCEMENT_ENABLED;
  if (!raw) return false;
  const normalized = raw.trim().toLowerCase();
  if (normalized === '1' || normalized === 'true' || normalized === 'on' || normalized === 'yes') {
    return true;
  }
  if (normalized === '0' || normalized === 'false' || normalized === 'off' || normalized === 'no') {
    return false;
  }
  return false;
})();
const SNAPSHOT_INTERACTION_GRACE_MS = Number(process.env.SNAPSHOT_INTERACTION_GRACE_MS || 1500);
const INTERACTION_REQUEST_KINDS = new Set([
  'instantSpell',
  'defend',
  'forcedDraw',
  'inspectHand',
  'takeFromPile',
  'manipulatePermanent',
]);
const INTERACTION_DECISIONS = new Set(['approved', 'declined', 'cancelled']);

function getSeatForPlayer(match, playerId) {
  if (!match || !Array.isArray(match.playerIds)) return null;
  const idx = match.playerIds.indexOf(playerId);
  if (idx === 0) return 'p1';
  if (idx === 1) return 'p2';
  return null;
}

function getOpponentSeat(seat) {
  if (seat === 'p1') return 'p2';
  if (seat === 'p2') return 'p1';
  return null;
}

function ensureInteractionState(match) {
  if (!match) return;
  if (!(match.interactionRequests instanceof Map)) {
    match.interactionRequests = new Map();
  }
  if (!(match.interactionGrants instanceof Map)) {
    match.interactionGrants = new Map();
  }
}

function sanitizeGrantOptions(raw, fallbackSeat) {
  if (!raw || typeof raw !== 'object') {
    if (!fallbackSeat) return null;
    return {
      targetSeat: fallbackSeat,
    };
  }
  const targetSeat = raw.targetSeat === 'p1' || raw.targetSeat === 'p2' ? raw.targetSeat : fallbackSeat || null;
  const expiresAt = Number.isFinite(Number(raw.expiresAt)) ? Number(raw.expiresAt) : null;
  const result = {
    targetSeat,
  };
  if (expiresAt !== null) result.expiresAt = expiresAt;
  if (raw.singleUse === true) result.singleUse = true;
  if (raw.allowOpponentZoneWrite === true) result.allowOpponentZoneWrite = true;
  if (raw.allowRevealOpponentHand === true) result.allowRevealOpponentHand = true;
  return result;
}

function purgeExpiredGrants(match, now) {
  ensureInteractionState(match);
  if (!match || !(match.interactionGrants instanceof Map)) return;
  for (const [playerId, grants] of match.interactionGrants.entries()) {
    const filtered = Array.isArray(grants)
      ? grants.filter((grant) => !grant || !grant.expiresAt || grant.expiresAt > now)
      : [];
    if (filtered.length > 0) {
      match.interactionGrants.set(playerId, filtered);
    } else {
      match.interactionGrants.delete(playerId);
    }
  }
}

function detectOpponentZoneMutation(patch, actorSeat) {
  if (!patch || typeof patch !== 'object') return false;
  const opponentSeat = getOpponentSeat(actorSeat);
  if (!opponentSeat) return false;
  const zones = patch.zones;
  if (zones && typeof zones === 'object' && zones[opponentSeat] && typeof zones[opponentSeat] === 'object') {
    const zonePayload = zones[opponentSeat];
    for (const key of Object.keys(zonePayload)) {
      if (zonePayload[key] !== undefined) {
        return true;
      }
    }
  }
  const avatars = patch.avatars;
  if (avatars && typeof avatars === 'object' && avatars[opponentSeat] && typeof avatars[opponentSeat] === 'object') {
    if (Object.keys(avatars[opponentSeat]).length > 0) {
      return true;
    }
  }
  return false;
}

function collectInteractionRequirements(patch, actorSeat) {
  return {
    needsOpponentZoneWrite: detectOpponentZoneMutation(patch, actorSeat),
  };
}

function usePermitForRequirement(match, playerId, actorSeat, requirement, now) {
  ensureInteractionState(match);
  const grants = match.interactionGrants.get(playerId);
  if (!Array.isArray(grants) || grants.length === 0) return null;
  const opponentSeat = getOpponentSeat(actorSeat);
  let consumedIndex = -1;
  const usableGrant = grants.find((grant, idx) => {
    if (!grant) return false;
    if (grant.expiresAt && grant.expiresAt <= now) return false;
    if (grant.targetSeat && grant.targetSeat !== opponentSeat) return false;
    if (requirement === 'allowOpponentZoneWrite' && grant.allowOpponentZoneWrite !== true) return false;
    consumedIndex = idx;
    return true;
  });
  if (!usableGrant) return null;
  if (usableGrant.singleUse === true && consumedIndex > -1) {
    grants.splice(consumedIndex, 1);
    if (grants.length > 0) {
      match.interactionGrants.set(playerId, grants);
    } else {
      match.interactionGrants.delete(playerId);
    }
  }
  usableGrant.lastUsed = now;
  return usableGrant;
}

function createGrantRecord(request, response, grantOpts, now) {
  return {
    __grantId: rid('igr'),
    requestId: request.requestId,
    kind: request.kind,
    grantedBy: response.from,
    grantedTo: response.to,
    targetSeat: grantOpts?.targetSeat ?? null,
    createdAt: now,
    expiresAt: grantOpts?.expiresAt ?? null,
    singleUse: grantOpts?.singleUse === true,
    allowOpponentZoneWrite: grantOpts?.allowOpponentZoneWrite === true,
    allowRevealOpponentHand: grantOpts?.allowRevealOpponentHand === true,
  };
}

function recordInteractionRequest(match, message, proposedGrant, pendingAction) {
  ensureInteractionState(match);
  const entry = match.interactionRequests.get(message.requestId) || {};
  const now = message.createdAt || Date.now();
  match.interactionRequests.set(message.requestId, {
    request: message,
    response: entry.response || null,
    status: 'pending',
    proposedGrant: proposedGrant || entry.proposedGrant || null,
    grant: entry.grant || null,
    pendingAction: pendingAction || entry.pendingAction || null,
    result: entry.result || null,
    createdAt: entry.createdAt || now,
    updatedAt: now,
  });
}

function recordInteractionResponse(match, response, grantRecord) {
  ensureInteractionState(match);
  const entry = match.interactionRequests.get(response.requestId) || {};
  const now = response.respondedAt || Date.now();
  const next = {
    request: entry.request || null,
    response,
    status: response.decision,
    proposedGrant: entry.proposedGrant || null,
    grant: grantRecord || entry.grant || null,
    pendingAction: entry.pendingAction || null,
    result: entry.result || null,
    createdAt: entry.createdAt || (entry.request && entry.request.createdAt) || now,
    updatedAt: now,
  };
  if (!next.request) {
    next.request = {
      type: 'interaction:request',
      requestId: response.requestId,
      matchId: response.matchId,
      from: response.to,
      to: response.from,
      kind: response.kind,
      createdAt: response.createdAt || now,
      expiresAt: response.expiresAt,
    };
  }
  match.interactionRequests.set(response.requestId, next);
}

function emitInteraction(matchId, message) {
  const envelope = { type: 'interaction', version: INTERACTION_VERSION, message };
  const room = `match:${matchId}`;
  io.to(room).emit('interaction', envelope);
  io.to(room).emit(message.type, message);
}

function emitInteractionResult(matchId, result) {
  const room = `match:${matchId}`;
  io.to(room).emit('interaction:result', result);
}

function sanitizePendingAction(kind, payload, actorSeat, requestingPlayerId) {
  if (!payload || typeof payload !== 'object') return null;
  const safe = {};
  for (const [key, value] of Object.entries(payload)) {
    if (value === undefined) continue;
    if (key === 'grant' || key === 'proposedGrant') continue;
    safe[key] = value;
  }
  safe.kind = kind;
  safe.actorSeat = actorSeat;
  safe.requestedBy = requestingPlayerId;
  return safe;
}

function getTopCards(match, seat, pile, count, from) {
  if (!match || !match.game || !match.game.zones) return [];
  const zones = match.game.zones;
  const seatZones = zones && typeof zones === 'object' ? zones[seat] : null;
  if (!seatZones || typeof seatZones !== 'object') return [];
  const list = Array.isArray(seatZones[pile]) ? [...seatZones[pile]] : [];
  if (count <= 0) return [];
  if (from === 'bottom') {
    return list.slice(Math.max(0, list.length - count));
  }
  return list.slice(0, count);
}

function applyPendingAction(match, entry, now) {
  if (!match || !entry || !entry.pendingAction) return null;
  const { pendingAction, request } = entry;
  if (!pendingAction || typeof pendingAction !== 'object') return null;
  const kind = pendingAction.kind;
  const actorSeat = pendingAction.actorSeat;
  const resultBase = {
    requestId: request.requestId,
    matchId: match.id,
    kind,
    success: false,
    t: now,
  };
  if (kind === 'takeFromPile') {
    const seat = pendingAction.seat === 'p1' || pendingAction.seat === 'p2' ? pendingAction.seat : null;
    const pile = pendingAction.pile === 'atlas' ? 'atlas' : 'spellbook';
    const from = pendingAction.from === 'bottom' ? 'bottom' : 'top';
    const rawCount = Number(pendingAction.count);
    const count = Number.isFinite(rawCount) && rawCount > 0 ? Math.min(rawCount, 20) : 3;
    if (!seat) {
      return { ...resultBase, success: false, message: 'Invalid seat for pile peek' };
    }
    const cards = getTopCards(match, seat, pile, count, from).map((card) => {
      if (!card || typeof card !== 'object') return {};
      const out = {};
      if (card.name) out.name = card.name;
      if (card.type) out.type = card.type;
      if (card.slug) out.slug = card.slug;
      if (Number.isFinite(card.cardId)) out.cardId = Number(card.cardId);
      if (Number.isFinite(card.variantId)) out.variantId = Number(card.variantId);
      return out;
    });
    return {
      ...resultBase,
      success: true,
      payload: {
        seat,
        pile,
        from,
        count,
        cards,
        requestedBy: pendingAction.requestedBy || null,
      },
    };
  }
  if (kind === 'inspectHand') {
    const seat = pendingAction.seat === 'p1' || pendingAction.seat === 'p2' ? pendingAction.seat : null;
    if (!seat) {
      return { ...resultBase, success: false, message: 'Invalid seat for hand inspect' };
    }
    const cards = getTopCards(match, seat, 'hand', 99, 'top').map((card) => {
      if (!card || typeof card !== 'object') return {};
      const out = {};
      if (card.name) out.name = card.name;
      if (card.type) out.type = card.type;
      if (card.slug) out.slug = card.slug;
      if (Number.isFinite(card.cardId)) out.cardId = Number(card.cardId);
      if (Number.isFinite(card.variantId)) out.variantId = Number(card.variantId);
      return out;
    });
    return {
      ...resultBase,
      success: true,
      payload: {
        seat,
        pile: 'hand',
        from: 'top',
        count: cards.length,
        cards,
        requestedBy: pendingAction.requestedBy || null,
      },
    };
  }
  return { ...resultBase, success: false, message: 'Unsupported pending action kind' };
}
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
  // One-way ready: ignore attempts to unready
  if (!ready) {
    return;
  }
  match.draftState.playerReady[playerKey] = true;
  io.to(room).emit('message', { type: 'playerReady', playerKey, ready: !!ready });
  // Auto-start if both ready and still in waiting
  const pr = match.draftState.playerReady;
  if (match.draftState.phase === 'waiting' && pr && pr.p1 === true && pr.p2 === true) {
    try { await leaderStartDraft(matchId, playerId); } catch (e) { try { console.warn('[Draft] auto-start failed:', e?.message || e); } catch {} }
    // Watchdog: if we're still in 'waiting' shortly after, attempt again (handles leader handoff/race)
    try { if (draftStartWatchdogs.has(matchId)) { clearTimeout(draftStartWatchdogs.get(matchId)); } } catch {}
    const t = setTimeout(async () => {
      try {
        const m = await getOrLoadMatch(matchId);
        if (!m || m.matchType !== 'draft' || !m.draftState) return;
        const pr2 = m.draftState.playerReady || { p1: false, p2: false };
        if (m.draftState.phase === 'waiting' && pr2.p1 === true && pr2.p2 === true && !m.draftState.__startingDraft) {
          await leaderStartDraft(matchId, playerId);
        }
      } catch {}
      try { draftStartWatchdogs.delete(matchId); } catch {}
    }, 1500);
    draftStartWatchdogs.set(matchId, t);
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
    try { console.log(`[Draft] Draft start -> enter pack_selection (round 1)`); } catch {}
    // Safety: repair invariants before broadcasting
    try { repairDraftInvariants(match); } catch {}
    io.to(room).emit('draftUpdate', match.draftState);
    if (requestingSocketId) { try { io.to(requestingSocketId).emit('draftUpdate', match.draftState); } catch {} }
    // Also emit matchStarted so clients observing only matchStarted get updated draftState
    try { io.to(room).emit('matchStarted', { match: getMatchInfo(match) }); } catch {}
    // Clear any pending watchdog once we transition away from waiting
    try { if (draftStartWatchdogs.has(match.id)) { clearTimeout(draftStartWatchdogs.get(match.id)); draftStartWatchdogs.delete(match.id); } } catch {}
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
      const maxPacks = (match.draftConfig && Number(match.draftConfig.packCount)) || 3;
      if (draftState.packIndex >= maxPacks) {
        draftState.phase = 'complete';
        match.status = 'deck_construction';
      } else {
        // Next round: re-enter pack selection and wait for choices
        draftState.pickNumber = 1;
        draftState.packDirection = draftState.packDirection === 'left' ? 'right' : 'left';
        draftState.phase = 'pack_selection';
        draftState.waitingFor = [...match.playerIds];
        // Clear distributed packs to ensure a clean re-selection each round
        draftState.currentPacks = [];
        // Reset choices for this round
        if (!Array.isArray(draftState.packChoice) || draftState.packChoice.length !== match.playerIds.length) {
          draftState.packChoice = Array.from({ length: match.playerIds.length }, () => null);
        } else {
          draftState.packChoice = draftState.packChoice.map(() => null);
        }
        try { console.log(`[Draft] Enter pack_selection for round ${draftState.packIndex + 1}`); } catch {}
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
  try { repairDraftInvariants(match); } catch {}
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
  // Honor chosen pack index by swapping it into the current round position
  const chosenIdx = Math.max(0, Number(packIndex) || 0);
  const roundIdx = Math.max(0, Number(draftState.packIndex) || 0);
  const playerPacks = Array.isArray(draftState.allGeneratedPacks?.[playerIndex])
    ? draftState.allGeneratedPacks[playerIndex]
    : [];
  if (Array.isArray(playerPacks) && chosenIdx >= 0 && chosenIdx < playerPacks.length && roundIdx >= 0 && roundIdx < playerPacks.length) {
    if (chosenIdx !== roundIdx) {
      const tmp = playerPacks[roundIdx];
      playerPacks[roundIdx] = playerPacks[chosenIdx];
      playerPacks[chosenIdx] = tmp;
    }
  }
  draftState.packChoice[playerIndex] = setChoice;
  const allChoicesMade = draftState.packChoice.every((choice) => choice !== null);
  if (allChoicesMade && draftState.phase === 'pack_selection') {
    // Distribute packs based on the chosen order for this round (clone arrays)
    draftState.currentPacks = draftState.allGeneratedPacks.map((packs) => (packs[draftState.packIndex] ? [...packs[draftState.packIndex]] : []));
    draftState.phase = 'picking';
    draftState.waitingFor = [...match.playerIds];
    try { console.log(`[Draft] All pack choices resolved for round ${draftState.packIndex + 1}. Enter picking.`); } catch {}
  }
  try { repairDraftInvariants(match); } catch {}
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
      // Ensure clients receive a fresh lobbies list
      await (async () => { const leader = await getOrClaimLobbyLeader(); if (leader === INSTANCE_ID) io.emit('lobbiesUpdated', { lobbies: lobbiesArray() }); })();
      return;
    } else if (!lobbyHasHumanPlayers(lobby)) {
      lobby.status = 'closed';
      try { botManager.cleanupBotsForLobby(lobbyId); } catch {}
      lobbies.delete(lobbyId);
      await publishLobbyDelete(lobbyId);
      // Ensure clients receive a fresh lobbies list
      await (async () => { const leader = await getOrClaimLobbyLeader(); if (leader === INSTANCE_ID) io.emit('lobbiesUpdated', { lobbies: lobbiesArray() }); })();
      return;
    } else if (lobby.hostId === playerId) {
      // Host is leaving: close and delete the lobby instead of reassigning host
      // Proactively remove remaining players from the lobby and clear their lobbyId
      try {
        const remaining = Array.from(lobby.playerIds);
        for (const pid of remaining) {
          const pl = await ensurePlayerCached(pid);
          if (pl?.socketId) {
            try { await io.in(pl.socketId).socketsLeave(`lobby:${lobbyId}`); } catch {}
          }
          try { pl.lobbyId = null; } catch {}
        }
      } catch {}
      lobby.status = 'closed';
      try { botManager.cleanupBotsForLobby(lobbyId); } catch {}
      lobbies.delete(lobbyId);
      await publishLobbyDelete(lobbyId);
      // Ensure clients receive a fresh lobbies list
      await (async () => { const leader = await getOrClaimLobbyLeader(); if (leader === INSTANCE_ID) io.emit('lobbiesUpdated', { lobbies: lobbiesArray() }); })();
      return;
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
    // One-way ready: ignore attempts to unready
    if (!ready) {
      return;
    }
    // Allow host (and any player) to mark ready at any time
    lobby.ready.add(playerId);
    markLobbyActive(lobby);
    io.to(`lobby:${lobby.id}`).emit('lobbyUpdated', { lobby: getLobbyInfo(lobby) });
    await publishLobbyState(lobby);
    // Also broadcast updated lobbies list so lobby cards reflect readiness without manual refresh
    await (async () => { const leader = await getOrClaimLobbyLeader(); if (leader === INSTANCE_ID) io.emit('lobbiesUpdated', { lobbies: lobbiesArray() }); })();
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
  // Be a bit more tolerant behind proxies/CDNs to avoid false disconnects
  pingInterval: Number(process.env.SOCKET_PING_INTERVAL_MS || 15000),
  pingTimeout: Number(process.env.SOCKET_PING_TIMEOUT_MS || 30000),
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
const MATCH_CLEANUP_DELAY_MS = Number(process.env.MATCH_CLEANUP_DELAY_MS || 60000); // 60s default
const STALE_WAITING_MS = Number(process.env.STALE_MATCH_WAITING_MS || 10 * 60 * 1000); // 10 min default
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
          } else if (msg.type === 'interaction:request' && msg.playerId) {
            await leaderHandleInteractionRequest(matchId, msg.playerId, msg.payload || null, msg.socketId || null);
          } else if (msg.type === 'interaction:response' && msg.playerId) {
            await leaderHandleInteractionResponse(matchId, msg.playerId, msg.payload || null, msg.socketId || null);
          } else if (msg.type === 'draft:playerReady' && typeof msg.ready === 'boolean' && msg.playerId) {
            await leaderDraftPlayerReady(matchId, msg.playerId, !!msg.ready);
          } else if (msg.type === 'draft:start' && msg.playerId) {
            const m = await getOrLoadMatch(matchId);
            if (!m || m.matchType !== 'draft' || !m.draftState) return;
            if (m.draftState.phase !== 'waiting') {
              // Already started: broadcast current state to sync clients
              try { io.to(`match:${m.id}`).emit('draftUpdate', m.draftState); } catch {}
            } else {
              await leaderStartDraft(matchId, msg.playerId, msg.draftConfig || null, msg.socketId || null);
            }
          } else if (msg.type === 'draft:pick' && msg.playerId && msg.cardId) {
            await leaderMakeDraftPick(matchId, msg.playerId, { cardId: msg.cardId, packIndex: Number(msg.packIndex || 0), pickNumber: Number(msg.pickNumber || 1) });
          } else if (msg.type === 'draft:choosePack' && msg.playerId && msg.setChoice) {
            await leaderChooseDraftPack(matchId, msg.playerId, { setChoice: msg.setChoice, packIndex: Number(msg.packIndex || 0) });
          } else if (msg.type === 'mulligan:done' && msg.playerId) {
            await leaderHandleMulliganDone(matchId, msg.playerId);
          } else if (msg.type === 'match:cleanup' && msg.reason) {
            await cleanupMatchNow(matchId, msg.reason, !!msg.force);
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
/** @type {Map<string, Set<string>>} voiceRoomId -> set of playerIds participating in WebRTC */
const rtcParticipants = new Map();
/** @type {Map<string, { id: string, displayName: string, lobbyId: string|null, matchId: string|null, roomId: string, joinedAt: number }>} playerId -> participant details */
const participantDetails = new Map();
/** @type {Map<string, { id: string, from: string, to: string, lobbyId: string|null, matchId: string|null, createdAt: number }>} */
const pendingVoiceRequests = new Map();

function getVoiceRoomIdForPlayer(player) {
  if (!player) return null;
  if (player.lobbyId) return `lobby:${player.lobbyId}`;
  if (player.matchId) return `match:${player.matchId}`;
  return null;
}
/** @type {Map<string, NodeJS.Timeout>} */
const draftStartWatchdogs = new Map();
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
  // Send match info directly to the joiner to avoid any race, then broadcast to the room
  try { if (socketId) io.to(socketId).emit('matchStarted', { match: getMatchInfo(match) }); } catch {}
  try { io.to(room).emit('matchStarted', { match: getMatchInfo(match) }); } catch {}
  // If a draft is in progress, immediately sync the joining socket with the current draft state
  try {
    if (match.matchType === 'draft' && match.draftState && match.draftState.phase && match.draftState.phase !== 'waiting') {
      if (socketId) io.to(socketId).emit('draftUpdate', match.draftState);
    }
  } catch {}
  // Persist roster change and refresh cache
  try { await persistMatchUpdate(match, null, playerId, Date.now()); } catch {}
  // Keep our leadership fresh
  try { if (storeRedis) await storeRedis.expire(`match:leader:${matchId}`, 60); } catch {}
}

// Permanently remove a match if truly empty (no players, no sockets in room)
async function cleanupMatchNow(matchId, reason, force = false) {
  const match = await getOrLoadMatch(matchId);
  if (!match) return;
  // Check roster empty condition
  const rosterEmpty = !Array.isArray(match.playerIds) || match.playerIds.length === 0;
  // Check room occupancy across cluster (requires Redis adapter)
  let roomEmpty = true;
  try {
    const room = `match:${matchId}`;
    if (typeof io.in(room).allSockets === 'function') {
      const sockets = await io.in(room).allSockets();
      roomEmpty = !sockets || sockets.size === 0;
    }
  } catch {}
  // Force allows cleanup of orphaned waiting matches even if roster still lists players,
  // as long as the room is empty across the cluster.
  if ((!(rosterEmpty) && !force) || !roomEmpty) {
    try { console.log(`[match] cleanup skipped for ${matchId}: rosterEmpty=${rosterEmpty}, roomEmpty=${roomEmpty}, force=${force}`); } catch {}
    return;
  }
  // Clear any pending timers
  try { if (match._cleanupTimer) { clearTimeout(match._cleanupTimer); match._cleanupTimer = null; } } catch {}
  try { console.log(`[match] cleaning up ${matchId} (reason=${reason})`); } catch {}
  // Delete from DB and cache
  try { if (storeRedis) await storeRedis.del(`match:session:${matchId}`); } catch {}
  try { await prisma.onlineMatchAction.deleteMany({ where: { matchId } }); } catch {}
  try { await prisma.onlineMatchSession.delete({ where: { id: matchId } }); } catch {}
  try { matches.delete(matchId); } catch {}
}

async function leaderApplyAction(matchId, playerId, incomingPatch, actorSocketId) {
  const match = await getOrLoadMatch(matchId);
  if (!match) return;
  const matchRoom = `match:${matchId}`;
  const now = Date.now();
  ensureInteractionState(match);
  purgeExpiredGrants(match, now);
  const actorSeat = getSeatForPlayer(match, playerId);
  if (!actorSeat) {
    if (actorSocketId) io.to(actorSocketId).emit("error", { message: "Only seated players may take actions", code: "action_not_authorized" });
    return;
  }
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
      const enforce = RULES_ENFORCE_MODE === 'all' || (RULES_ENFORCE_MODE === 'bot_only' && isCpuPlayerId(playerId));
      const isSnapshot = Array.isArray(patchToApply && patchToApply.__replaceKeys) && patchToApply.__replaceKeys.length > 0;
      if (isSnapshot) {
        try {
          console.debug('[match] apply snapshot', {
            matchId,
            playerId,
            keys: Array.isArray(patchToApply.__replaceKeys) ? patchToApply.__replaceKeys : [],
            hasEvents: Array.isArray(patchToApply.events),
            phase: patchToApply.phase,
            eventSeq: patchToApply.eventSeq,
            t: now,
          });
        } catch {}
        // Record time of last snapshot per player to allow a brief grace window for follow-up client sync messages
        try {
          if (!match._lastSnapshotByPlayer) match._lastSnapshotByPlayer = new Map();
          match._lastSnapshotByPlayer.set(playerId, now);
        } catch {}
      }
      if (patch && typeof patch === 'object' && patch.d20Rolls) {
        const prev = (match.game && match.game.d20Rolls) || { p1: null, p2: null };
        const incRaw = patch.d20Rolls || {};
        // Determine the seat (p1/p2) for the acting player
        const seat = actorSeat;
        // Only allow a player to set their own seat, and only if it hasn't been set yet
        /** @type {{ p1?: number, p2?: number }} */
        const inc = {};
        if (seat === 'p1') {
          if (incRaw.p1 !== undefined) {
            if (prev.p1 == null) {
              const v = Number(incRaw.p1);
              if (Number.isFinite(v)) inc.p1 = v;
            } else {
              try { console.warn('[d20] ignoring extra roll from p1; already rolled', { prev, incRaw, matchId, playerId }); } catch {}
            }
          }
        } else if (seat === 'p2') {
          if (incRaw.p2 !== undefined) {
            if (prev.p2 == null) {
              const v = Number(incRaw.p2);
              if (Number.isFinite(v)) inc.p2 = v;
            } else {
              try { console.warn('[d20] ignoring extra roll from p2; already rolled', { prev, incRaw, matchId, playerId }); } catch {}
            }
          }
        } else {
          // Spectators or unknown seats cannot affect d20 rolls
          try { console.warn('[d20] ignoring roll from non-seated actor', { incRaw, matchId, playerId }); } catch {}
        }
        const mergedD20 = {
          p1: (inc.p1 !== undefined ? inc.p1 : (prev.p1 ?? null)),
          p2: (inc.p2 !== undefined ? inc.p2 : (prev.p2 ?? null)),
        };
        try { console.log('[d20] merge', { prev, inc: incRaw, merged: mergedD20, matchId }); } catch {}
        if (mergedD20.p1 != null && mergedD20.p2 != null) {
          if (Number(mergedD20.p1) === Number(mergedD20.p2)) {
            try { console.log('[d20] tie detected -> resetting for reroll', { merged: mergedD20, matchId }); } catch {}
            patchToApply = { ...patchToApply, d20Rolls: { p1: null, p2: null }, setupWinner: null };
            try { if (match._autoSeatTimer) { clearTimeout(match._autoSeatTimer); match._autoSeatTimer = null; } } catch {}
            try { match._autoSeatApplied = false; } catch {}
          } else {
            const winner = Number(mergedD20.p1) > Number(mergedD20.p2) ? 'p1' : 'p2';
            patchToApply = { ...patchToApply, d20Rolls: mergedD20 };
            if (patchToApply.setupWinner === undefined) patchToApply = { ...patchToApply, setupWinner: winner };
            try { console.log('[d20] winner decided', { merged: mergedD20, winner, matchId }); } catch {}
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
      // Compute a short grace window for post-snapshot follow-up messages
      const withinUndoGrace = (() => {
        try {
          if (match._lastSnapshotByPlayer && typeof match._lastSnapshotByPlayer.get === 'function') {
            const t = match._lastSnapshotByPlayer.get(playerId);
            return typeof t === 'number' && (now - t) <= SNAPSHOT_INTERACTION_GRACE_MS;
          }
        } catch {}
        return false;
      })();
      if (!isSnapshot) {
        try {
          const costRes = ensureCosts(match.game || {}, patchToApply, playerId, { match });
          if (costRes && costRes.autoPatch && RULES_HELPERS_ENABLED) {
            patchToApply = deepMergeReplaceArrays(patchToApply || {}, costRes.autoPatch);
            try {
              console.debug('[rules] ensureCosts autoPatch applied', {
                matchId,
                playerId,
                keys: Object.keys(costRes.autoPatch || {}),
                isSnapshot,
              });
            } catch {}
          }
          if (costRes && costRes.ok === false) {
            if (enforce && !withinUndoGrace) {
              if (actorSocketId) io.to(actorSocketId).emit('error', { message: costRes.error || 'Insufficient resources', code: 'cost_unpaid' });
              try {
                console.warn('[rules] ensureCosts rejected action', {
                  matchId,
                  playerId,
                  error: costRes.error,
                  isSnapshot,
                });
              } catch {}
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
          if (!v.ok) {
            const msg = (v && v.error) ? String(v.error) : '';
            try {
              console.warn('[rules] validateAction rejected action', {
                matchId,
                playerId,
                error: msg,
                isSnapshot,
              });
            } catch {}
            const mustReject = /Cannot tap or untap opponent|Sites cannot be tapped/i.test(msg);
            if (mustReject) {
              if (actorSocketId) io.to(actorSocketId).emit('error', { message: msg || 'Illegal tap action', code: 'rules_violation' });
              return;
            }
            if (enforce && !withinUndoGrace) {
              if (actorSocketId) io.to(actorSocketId).emit('error', { message: v.error || 'Rules violation', code: 'rules_violation' });
              return;
            } else {
              const warnEvent = [{ id: 0, ts: Date.now(), text: `[Warning] ${v.error || 'Potential rules issue'}` }];
              const existing = Array.isArray(patchToApply && patchToApply.events) ? patchToApply.events : [];
              patchToApply = { ...patchToApply, events: [...existing, ...warnEvent] };
            }
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
      }
      const interactionRequirements = collectInteractionRequirements(patchToApply, actorSeat);
      // Provide a brief grace period after an authoritative snapshot from this actor
      // to avoid gating benign follow-up messages during client resync.
      const withinUndoGrace = (() => {
        try {
          if (match._lastSnapshotByPlayer && typeof match._lastSnapshotByPlayer.get === 'function') {
            const t = match._lastSnapshotByPlayer.get(playerId);
            return typeof t === 'number' && (now - t) <= SNAPSHOT_INTERACTION_GRACE_MS;
          }
        } catch {}
        return false;
      })();
      const shouldEnforceInteraction =
        INTERACTION_ENFORCEMENT_ENABLED &&
        match.status === 'in_progress' &&
        !isSnapshot &&
        !withinUndoGrace;
      if (shouldEnforceInteraction && interactionRequirements.needsOpponentZoneWrite) {
        const grant = usePermitForRequirement(match, playerId, actorSeat, 'allowOpponentZoneWrite', now);
        if (!grant) {
          if (actorSocketId) io.to(actorSocketId).emit('error', { message: 'Interaction approval is required before modifying the opponent\'s zones.', code: 'interaction_required' });
          return;
        }
      }
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
      // If patch specifies __replaceKeys (authoritative snapshot like Undo),
      // prime the base so those keys become exact replacements
      let baseForMerge = match.game || {};
      try {
        if (patchToApply && Array.isArray(patchToApply.__replaceKeys)) {
          const keys = patchToApply.__replaceKeys;
          baseForMerge = { ...(match.game || {}) };
          for (const k of keys) {
            if (Object.prototype.hasOwnProperty.call(patchToApply, k)) {
              baseForMerge[k] = patchToApply[k];
            }
          }
        }
      } catch {}
      // Merge player patch into game snapshot
      if (patchToApply && Array.isArray(patchToApply.__replaceKeys)) {
        const prevZones = (match.game && match.game.zones) || null;
        const emptyZones = {
          spellbook: [],
          atlas: [],
          hand: [],
          graveyard: [],
          battlefield: [],
          banished: [],
        };
        const normalizedZones = {
          p1: prevZones && prevZones.p1
            ? {
                spellbook: Array.isArray(prevZones.p1.spellbook) ? prevZones.p1.spellbook : [],
                atlas: Array.isArray(prevZones.p1.atlas) ? prevZones.p1.atlas : [],
                hand: Array.isArray(prevZones.p1.hand) ? prevZones.p1.hand : [],
                graveyard: Array.isArray(prevZones.p1.graveyard) ? prevZones.p1.graveyard : [],
                battlefield: Array.isArray(prevZones.p1.battlefield) ? prevZones.p1.battlefield : [],
                banished: Array.isArray(prevZones.p1.banished) ? prevZones.p1.banished : [],
              }
            : emptyZones,
          p2: prevZones && prevZones.p2
            ? {
                spellbook: Array.isArray(prevZones.p2.spellbook) ? prevZones.p2.spellbook : [],
                atlas: Array.isArray(prevZones.p2.atlas) ? prevZones.p2.atlas : [],
                hand: Array.isArray(prevZones.p2.hand) ? prevZones.p2.hand : [],
                graveyard: Array.isArray(prevZones.p2.graveyard) ? prevZones.p2.graveyard : [],
                battlefield: Array.isArray(prevZones.p2.battlefield) ? prevZones.p2.battlefield : [],
                banished: Array.isArray(prevZones.p2.banished) ? prevZones.p2.banished : [],
              }
            : emptyZones,
        };
        patchToApply = {
          ...patchToApply,
          zones: {
            p1:
              patchToApply.zones && patchToApply.zones.p1
                ? {
                    spellbook: Array.isArray(patchToApply.zones.p1.spellbook)
                      ? patchToApply.zones.p1.spellbook
                      : normalizedZones.p1.spellbook,
                    atlas: Array.isArray(patchToApply.zones.p1.atlas)
                      ? patchToApply.zones.p1.atlas
                      : normalizedZones.p1.atlas,
                    hand: Array.isArray(patchToApply.zones.p1.hand)
                      ? patchToApply.zones.p1.hand
                      : normalizedZones.p1.hand,
                    graveyard: Array.isArray(patchToApply.zones.p1.graveyard)
                      ? patchToApply.zones.p1.graveyard
                      : normalizedZones.p1.graveyard,
                    battlefield: Array.isArray(patchToApply.zones.p1.battlefield)
                      ? patchToApply.zones.p1.battlefield
                      : normalizedZones.p1.battlefield,
                    banished: Array.isArray(patchToApply.zones.p1.banished)
                      ? patchToApply.zones.p1.banished
                      : normalizedZones.p1.banished,
                  }
                : normalizedZones.p1,
            p2:
              patchToApply.zones && patchToApply.zones.p2
                ? {
                    spellbook: Array.isArray(patchToApply.zones.p2.spellbook)
                      ? patchToApply.zones.p2.spellbook
                      : normalizedZones.p2.spellbook,
                    atlas: Array.isArray(patchToApply.zones.p2.atlas)
                      ? patchToApply.zones.p2.atlas
                      : normalizedZones.p2.atlas,
                    hand: Array.isArray(patchToApply.zones.p2.hand)
                      ? patchToApply.zones.p2.hand
                      : normalizedZones.p2.hand,
                    graveyard: Array.isArray(patchToApply.zones.p2.graveyard)
                      ? patchToApply.zones.p2.graveyard
                      : normalizedZones.p2.graveyard,
                    battlefield: Array.isArray(patchToApply.zones.p2.battlefield)
                      ? patchToApply.zones.p2.battlefield
                      : normalizedZones.p2.battlefield,
                    banished: Array.isArray(patchToApply.zones.p2.banished)
                      ? patchToApply.zones.p2.banished
                      : normalizedZones.p2.banished,
                  }
                : normalizedZones.p2,
          },
        };
        const prevAvatars = (match.game && match.game.avatars) || { p1: {}, p2: {} };
        const normalizeAvatar = (candidate, fallback) => {
          const base = fallback || {};
          const card = candidate && 'card' in candidate ? candidate.card ?? null : base.card ?? null;
          const pos = candidate && Array.isArray(candidate.pos) && candidate.pos.length === 2
            ? [candidate.pos[0], candidate.pos[1]]
            : Array.isArray(base.pos) && base.pos.length === 2
              ? [base.pos[0], base.pos[1]]
              : null;
          const tapped = candidate && typeof candidate.tapped === 'boolean'
            ? candidate.tapped
            : typeof base.tapped === 'boolean'
              ? base.tapped
              : false;
          const next = { card, pos, tapped };
          if (candidate && 'offset' in candidate) {
            next.offset = candidate.offset ?? null;
          } else if (base && 'offset' in base) {
            next.offset = base.offset ?? null;
          }
          return next;
        };
        const fallbackAvatars = {
          p1: normalizeAvatar(prevAvatars.p1, { card: null, pos: null, tapped: false }),
          p2: normalizeAvatar(prevAvatars.p2, { card: null, pos: null, tapped: false }),
        };
        const patchAvatars = (patchToApply.avatars && typeof patchToApply.avatars === 'object') ? patchToApply.avatars : {};
        patchToApply = {
          ...patchToApply,
          avatars: {
            p1: normalizeAvatar(patchAvatars.p1, fallbackAvatars.p1),
            p2: normalizeAvatar(patchAvatars.p2, fallbackAvatars.p2),
          },
        };
        const prevPos = (match.game && match.game.playerPositions) || {
          p1: { playerId: 1, position: { x: 0, z: 0 } },
          p2: { playerId: 2, position: { x: 0, z: 0 } },
        };
        const normalizePos = (seat, candidate, fallback) => {
          const base = fallback || { playerId: seat === 'p1' ? 1 : 2, position: { x: 0, z: 0 } };
          const id = candidate && typeof candidate.playerId === 'number' ? candidate.playerId : base.playerId;
          const posObj = candidate && candidate.position && typeof candidate.position === 'object' ? candidate.position : base.position || {};
          return {
            playerId: id,
            position: {
              x: typeof posObj.x === 'number' ? posObj.x : 0,
              z: typeof posObj.z === 'number' ? posObj.z : 0,
            },
          };
        };
        const patchPos = (patchToApply.playerPositions && typeof patchToApply.playerPositions === 'object')
          ? patchToApply.playerPositions
          : {};
        patchToApply = {
          ...patchToApply,
          playerPositions: {
            p1: normalizePos('p1', patchPos.p1, prevPos.p1),
            p2: normalizePos('p2', patchPos.p2, prevPos.p2),
          },
        };
      }
      match.game = deepMergeReplaceArrays(baseForMerge, patchToApply);
      // Apply start-of-turn effects if phase/currentPlayer indicates a new turn
      try {
        const prevPhase = (baseForMerge && baseForMerge.phase) || null;
        const prevCp = (baseForMerge && typeof baseForMerge.currentPlayer === 'number') ? baseForMerge.currentPlayer : null;
        const nextPhase = (match.game && match.game.phase) || prevPhase;
        const nextCp = (match.game && typeof match.game.currentPlayer === 'number') ? match.game.currentPlayer : prevCp;
        const phaseBecameStart = nextPhase === 'Start' && nextPhase !== prevPhase;
        const enteredMainWithNewCp = nextPhase === 'Main' && prevCp != null && nextCp != null && nextCp !== prevCp;
        if (phaseBecameStart || enteredMainWithNewCp) {
          const tsPatch = applyTurnStart(match.game || {});
          if (tsPatch && typeof tsPatch === 'object') {
            // Update stored snapshot and outgoing patch
            match.game = deepMergeReplaceArrays(match.game || {}, tsPatch);
            patchToApply = deepMergeReplaceArrays(patchToApply || {}, tsPatch);
            try { console.debug('[rules] applyTurnStart merged', { matchId, phase: nextPhase, currentPlayer: nextCp }); } catch {}
          }
        }
      } catch {}
      try {
        if (match.game && match.game.permanents) {
          match.game.permanents = dedupePermanents(match.game.permanents);
        }
        if (isSnapshot) {
          const perCount = match.game && match.game.permanents && typeof match.game.permanents === 'object'
            ? Object.values(match.game.permanents).reduce((a, v) => a + (Array.isArray(v) ? v.length : 0), 0)
            : null;
          const zones = match.game && match.game.zones ? match.game.zones : null;
          console.debug('[match] snapshot merge result', {
            matchId,
            permanentsCount: perCount,
            handP1: zones && zones.p1 && Array.isArray(zones.p1.hand) ? zones.p1.hand.length : null,
            handP2: zones && zones.p2 && Array.isArray(zones.p2.hand) ? zones.p2.hand.length : null,
          });
        }
      } catch {}
      match.lastTs = now;
      recordMatchAction(matchId, patchToApply, playerId);
      io.to(matchRoom).emit('statePatch', { patch: patchToApply, t: now });
      if (isSnapshot) {
        try {
          const sites = match.game && match.game.board && match.game.board.sites ? Object.keys(match.game.board.sites).length : null;
          const per = match.game && match.game.permanents && typeof match.game.permanents === 'object'
            ? Object.values(match.game.permanents).reduce((a, v) => a + (Array.isArray(v) ? v.length : 0), 0)
            : null;
          console.debug('[match] snapshot applied and broadcast', { matchId, sites, permanentsCount: per, t: now });
        } catch {}
      }
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

// Handle per-player mulligan completion as the cluster leader
async function leaderHandleMulliganDone(matchId, playerId) {
  const match = await getOrLoadMatch(matchId);
  if (!match) return;
  if (match.status !== "waiting") return; // Only relevant during setup

  // Track per-player mulligan completion for this match
  if (!match.mulliganDone || !(match.mulliganDone instanceof Set)) {
    match.mulliganDone = new Set();
  }
  match.mulliganDone.add(playerId);

  try {
    const doneCount = match.mulliganDone.size;
    const total = Array.isArray(match.playerIds) ? match.playerIds.length : 0;
    const waitingFor = Array.isArray(match.playerIds)
      ? match.playerIds.filter((pid) => !match.mulliganDone.has(pid))
      : [];
    const names = waitingFor.map((pid) => players.get(pid)?.displayName || pid);
    console.log(`[Setup] mulliganDone <= ${playerId}. ${doneCount}/${total} complete. Waiting for: ${names.join(", ") || "none"}`);
  } catch {}

  // If all current players have finished mulligans, start the game
  const allDone =
    Array.isArray(match.playerIds) &&
    match.playerIds.every((pid) => match.mulliganDone.has(pid));
  if (!allDone) return;

  const room = `match:${match.id}`;
  // Flip match status and broadcast updated match info for strict sync
  match.status = "in_progress";
  io.to(room).emit("matchStarted", { match: getMatchInfo(match) });
  // Broadcast a deterministic patch to set phase to Main
  const now = Date.now();
  // If currentPlayer isn't set yet (e.g., human winner hasn't chosen), set a sensible default
  let cp = match.game && typeof match.game.currentPlayer === 'number' ? match.game.currentPlayer : null;
  if (cp !== 1 && cp !== 2) {
    const sw = match.game ? match.game.setupWinner : null;
    cp = sw === 'p2' ? 2 : 1; // default to P1 if undefined
  }
  // Ensure avatar positions exist so first-site placement rule can be applied client/server
  const sz = (match.game && match.game.board && match.game.board.size) || { w: 5, h: 4 };
  const cx = Math.floor(Math.max(1, Number(sz.w) || 5) / 2);
  const topY = (Number(sz.h) || 4) - 1;
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
  try { await persistMatchUpdate(match, mainPatch, playerId, now); } catch {}
  try { console.log(`[Setup] All mulligans complete for match ${match.id}. Starting game.`); } catch {}
  try { if (storeRedis) await storeRedis.expire(`match:leader:${matchId}`, 60); } catch {}
}

async function leaderHandleInteractionRequest(matchId, playerId, payload, actorSocketId) {
  try {
    const match = await getOrLoadMatch(matchId);
    if (!match) return;
    const now = Date.now();
    const actorSeat = getSeatForPlayer(match, playerId);
    if (!actorSeat) {
      return {
        ok: false,
        error: "Interaction requests are only available to seated players",
        code: "interaction_invalid",
      };
    }
    const opponentSeat = getOpponentSeat(actorSeat);
    if (!opponentSeat) return;
    const opponentIndex = actorSeat === "p1" ? 1 : 0;
    const opponentId = Array.isArray(match.playerIds) ? match.playerIds[opponentIndex] : null;
    if (!opponentId) {
      return {
        ok: false,
        error: "Opponent unavailable for interaction",
        code: "interaction_invalid_opponent",
      };
    }

    const rawKind = typeof payload?.kind === "string" ? payload.kind : null;
    if (!rawKind || !INTERACTION_REQUEST_KINDS.has(rawKind)) {
      return {
        ok: false,
        error: "Unsupported interaction kind",
        code: "interaction_invalid_kind",
      };
    }

    const requestId = typeof payload?.requestId === "string" && payload.requestId.length >= 6 ? payload.requestId : rid("intl");
    const expiresAtRaw = Number(payload?.expiresAt);
    const expiresAt = Number.isFinite(expiresAtRaw) && expiresAtRaw > now ? expiresAtRaw : null;
    const note = typeof payload?.note === "string" ? payload.note.slice(0, 280) : undefined;

    const rawPayload = payload && typeof payload.payload === "object" && payload.payload !== null ? payload.payload : {};
    const sanitizedPayload = {};
    for (const [key, value] of Object.entries(rawPayload)) {
      if (key === "grant" || key === "proposedGrant") continue;
      sanitizedPayload[key] = value;
    }

    const proposedGrant = sanitizeGrantOptions(
      payload?.grant ?? rawPayload?.grant ?? rawPayload?.proposedGrant,
      opponentSeat
    );
    if (proposedGrant) {
      sanitizedPayload.proposedGrant = proposedGrant;
    }

    const message = {
      type: "interaction:request",
      requestId,
      matchId: match.id,
      from: playerId,
      to: opponentId,
      kind: rawKind,
      createdAt: now,
    };
    if (expiresAt) message.expiresAt = expiresAt;
    if (note) message.note = note;
    if (Object.keys(sanitizedPayload).length > 0) message.payload = sanitizedPayload;

    const pendingAction = sanitizePendingAction(rawKind, sanitizedPayload, actorSeat, playerId);
    recordInteractionRequest(match, message, proposedGrant || null, pendingAction);
    match.lastTs = now;
    emitInteraction(matchId, message);
    try { await persistMatchUpdate(match, null, playerId, now); } catch {}
    return { ok: true };
  } catch (err) {
    try { console.warn("[interaction] request failed", err?.message || err); } catch {}
    return { ok: false, error: "Failed to process interaction request", code: "interaction_internal" };
  }
}

async function leaderHandleInteractionResponse(matchId, playerId, payload, actorSocketId) {
  try {
    const match = await getOrLoadMatch(matchId);
    if (!match) return;
    ensureInteractionState(match);
    const now = Date.now();
    const actorSeat = getSeatForPlayer(match, playerId);
    const requestId = typeof payload?.requestId === "string" ? payload.requestId : null;
    if (!requestId) {
      return {
        ok: false,
        error: "Missing interaction request identifier",
        code: "interaction_invalid_request",
      };
    }
    const entry = match.interactionRequests instanceof Map ? match.interactionRequests.get(requestId) : null;
    const request = entry && entry.request ? entry.request : null;
    if (!request) {
      return {
        ok: false,
        error: "Interaction request not found",
        code: "interaction_unknown_request",
      };
    }

    const rawDecision = typeof payload?.decision === "string" ? payload.decision : null;
    if (!rawDecision || !INTERACTION_DECISIONS.has(rawDecision)) {
      return {
        ok: false,
        error: "Invalid interaction decision",
        code: "interaction_invalid_decision",
      };
    }

    const responderTargetsOpponent = rawDecision !== "cancelled";
    if (responderTargetsOpponent && playerId !== request.to) {
      return {
        ok: false,
        error: "Only the targeted opponent may respond",
        code: "interaction_not_authorized",
      };
    }
    if (!responderTargetsOpponent && playerId !== request.from) {
      return {
        ok: false,
        error: "Only the requester may cancel",
        code: "interaction_not_authorized",
      };
    }

    const reason = typeof payload?.reason === "string" ? payload.reason.slice(0, 280) : undefined;
    const rawPayload = payload && typeof payload.payload === "object" && payload.payload !== null ? payload.payload : {};
    const sanitizedPayload = {};
    for (const [key, value] of Object.entries(rawPayload)) {
      if (key === "grant" || key === "proposedGrant") continue;
      sanitizedPayload[key] = value;
    }

    let grantOpts = null;
    if (rawDecision === "approved") {
      grantOpts = sanitizeGrantOptions(
        payload?.grant ?? rawPayload?.grant ?? rawPayload?.proposedGrant,
        actorSeat || getOpponentSeat(getSeatForPlayer(match, request.from))
      );
      if (grantOpts) {
        sanitizedPayload.grant = grantOpts;
      }
    }

    const recipientId = playerId === request.from ? request.to : request.from;
    const responseMessage = {
      type: "interaction:response",
      requestId: request.requestId,
      matchId: match.id,
      from: playerId,
      to: recipientId,
      kind: request.kind,
      decision: rawDecision,
      createdAt: request.createdAt,
      expiresAt: request.expiresAt,
      respondedAt: now,
    };
    if (reason) responseMessage.reason = reason;
    if (Object.keys(sanitizedPayload).length > 0) responseMessage.payload = sanitizedPayload;

    let grantRecord = null;
    if (rawDecision === "approved" && grantOpts) {
      grantRecord = createGrantRecord(request, responseMessage, grantOpts, now);
      const existing = match.interactionGrants.get(grantRecord.grantedTo) || [];
      existing.push(grantRecord);
      match.interactionGrants.set(grantRecord.grantedTo, existing);
    }

    recordInteractionResponse(match, responseMessage, grantRecord);
    if (rawDecision === 'approved') {
      try {
        const entry = match.interactionRequests.get(requestId);
        if (entry) {
          const result = applyPendingAction(match, entry, now);
          if (result) {
            entry.result = result;
            entry.pendingAction = null;
            match.interactionRequests.set(requestId, entry);
            emitInteractionResult(matchId, result);
          }
        }
      } catch (err) {
        try { console.warn('[interaction] failed to execute pending action', err?.message || err); } catch {}
      }
    }
    match.lastTs = now;
    emitInteraction(matchId, responseMessage);
    try { await persistMatchUpdate(match, null, playerId, now); } catch {}
    return { ok: true };
  } catch (err) {
    try { console.warn("[interaction] response failed", err?.message || err); } catch {}
    return { ok: false, error: "Failed to process interaction response", code: "interaction_internal" };
  }
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

// Remove duplicate permanents across the entire board by cardId
function dedupePermanents(per) {
  try {
    if (!per || typeof per !== 'object') return per;
    const out = {};
    const seen = new Set();
    for (const [cell, arrAny] of Object.entries(per)) {
      const arr = Array.isArray(arrAny) ? arrAny : [];
      const next = [];
      for (const item of arr) {
        const id = Number(item && item.card && item.card.cardId);
        if (Number.isFinite(id)) {
          if (seen.has(id)) {
            try { console.warn('[match] dedupe permanents: drop duplicate', { cell, cardId: id, name: item && item.card && item.card.name }); } catch {}
            continue;
          }
          seen.add(id);
        }
        next.push(item);
      }
      out[cell] = next;
    }
    return out;
  } catch {
    return per;
  }
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
    // Replicate deletion cluster-wide
    try { publishLobbyDelete(lobbyId); } catch {}
  } else if (!lobbyHasHumanPlayers(lobby)) {
    // If only CPUs remain, close the lobby and cleanup bots instead of promoting a CPU to host
    lobby.status = "closed";
    try { botManager.cleanupBotsForLobby(lobbyId); } catch {}
    lobbies.delete(lobbyId);
    // Replicate deletion cluster-wide
    try { publishLobbyDelete(lobbyId); } catch {}
    broadcastLobbies();
  } else if (lobby.hostId === player.id) {
    // Host left: close and delete the lobby (do not reassign host)
    lobby.status = "closed";
    try { botManager.cleanupBotsForLobby(lobbyId); } catch {}
    lobbies.delete(lobbyId);
    // Replicate deletion cluster-wide
    try { publishLobbyDelete(lobbyId); } catch {}
    broadcastLobbies();
    return;
  }

  if (lobbies.has(lobbyId)) {
    io.to(`lobby:${lobbyId}`).emit("lobbyUpdated", {
      lobby: getLobbyInfo(lobby),
    });
    // Replicate state cluster-wide
    try { publishLobbyState(lobby); } catch {}
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
    interactionRequests: new Map(),
    interactionGrants: new Map(),
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

  // Join all sockets to match room (cross-instance via Redis adapter)
  for (const pid of match.playerIds) {
    const p = players.get(pid);
    if (!p) continue;
    const room = `match:${match.id}`;
    const sid = p.socketId || null;
    if (sid) { try { await io.in(sid).socketsJoin(room); } catch {} }
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
        /** @type {Array<{ id: string, set: string, cards: Array<{ id: string, name: string, set: string, slug: string, type?: string|null, cost?: number|null, rarity: string, cardId?: number, variantId?: number, finish?: string, product?: string }> }>} */
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
            // Include identifiers so clients can avoid per-card lookups
            cardId: typeof p.cardId === 'number' ? p.cardId : undefined,
            variantId: typeof p.variantId === 'number' ? p.variantId : undefined,
            finish: typeof p.finish === 'string' ? p.finish : undefined,
            product: typeof p.product === 'string' ? p.product : undefined,
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
      try {
        console.warn('[auth] connect rejected: auth_required', {
          tokenPresent: !!token,
          origin: socket.handshake && socket.handshake.headers && socket.handshake.headers.origin,
          referer: socket.handshake && socket.handshake.headers && socket.handshake.headers.referer,
        });
      } catch {}
      return next(new Error('auth_required'));
    }
    return next();
  } catch (e) {
    try { console.warn('[auth] connect rejected: invalid_token', { message: e?.message || String(e) }); } catch {}
    return next(new Error('invalid_token'));
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
  socket.on("mulliganDone", async () => {
    if (!authed) return;
    const player = getPlayerBySocket(socket);
    if (!player || !player.matchId) return;
    const matchId = player.matchId;
    try {
      const leader = await getOrClaimMatchLeader(matchId);
      if (leader && leader !== INSTANCE_ID) {
        if (storeRedis) await storeRedis.publish(MATCH_CONTROL_CHANNEL, JSON.stringify({ type: 'mulligan:done', matchId, playerId: player.id }));
        return;
      }
      await leaderHandleMulliganDone(matchId, player.id);
    } catch {}
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
  socket.on("startTournamentMatch", async (payload = {}) => {
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
        interactionRequests: new Map(),
        interactionGrants: new Map(),
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

    // Join all currently connected sockets for provided players (cross-instance)
    const room = `match:${match.id}`;
    for (const pid of playerIds) {
      const p = players.get(pid);
      if (!p) continue;
      p.matchId = match.id;
      const sid = p.socketId || null;
      if (sid) { try { await io.in(sid).socketsJoin(room); } catch {} }
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

            /** @type {Array<{ id: string, set: string, cards: Array<{ id: string, name: string, set: string, slug: string, type?: string|null, cost?: number|null, rarity: string, cardId?: number, variantId?: number, finish?: string, product?: string }> }>} */
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
                // Include identifiers so clients can avoid per-card lookups
                cardId: typeof p.cardId === 'number' ? p.cardId : undefined,
                variantId: typeof p.variantId === 'number' ? p.variantId : undefined,
                finish: typeof p.finish === 'string' ? p.finish : undefined,
                product: typeof p.product === 'string' ? p.product : undefined,
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

  socket.on("leaveMatch", async () => {
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
      // Persist roster change
      try { await persistMatchUpdate(match, null, player.id, Date.now()); } catch {}
      // If no players left, schedule cleanup
      if (!Array.isArray(match.playerIds) || match.playerIds.length === 0) {
        try {
          // Debounce existing timer
          if (match._cleanupTimer) { clearTimeout(match._cleanupTimer); match._cleanupTimer = null; }
        } catch {}
        const delay = MATCH_CLEANUP_DELAY_MS;
        try { console.log(`[match] scheduling cleanup in ${delay}ms for ${matchId} (both players left)`); } catch {}
        try {
          match._cleanupTimer = setTimeout(async () => {
            try {
              const leader = await getOrClaimMatchLeader(matchId);
              if (leader && leader !== INSTANCE_ID) {
                if (storeRedis) await storeRedis.publish(MATCH_CONTROL_CHANNEL, JSON.stringify({ type: 'match:cleanup', matchId, reason: 'timeout_after_empty' }));
                return;
              }
              await cleanupMatchNow(matchId, 'timeout_after_empty');
            } catch {}
          }, delay);
        } catch {}
      }
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

  socket.on("interaction:request", async (payload = {}) => {
    if (!authed) return;
    const player = getPlayerBySocket(socket);
    if (!player || !player.matchId) return;
    const matchId = player.matchId;
    try {
      const leader = await getOrClaimMatchLeader(matchId);
      if (leader && leader !== INSTANCE_ID) {
        if (storeRedis) {
          const msg = {
            type: 'interaction:request',
            matchId,
            playerId: player.id,
            socketId: socket.id,
            payload,
          };
          await storeRedis.publish(MATCH_CONTROL_CHANNEL, JSON.stringify(msg));
        }
        return;
      }
      await leaderHandleInteractionRequest(matchId, player.id, payload, socket.id);
    } catch (err) {
      try { console.warn('[interaction] request handler error', err?.message || err); } catch {}
    }
  });

  socket.on("interaction:response", async (payload = {}) => {
    if (!authed) return;
    const player = getPlayerBySocket(socket);
    if (!player || !player.matchId) return;
    const matchId = player.matchId;
    try {
      const leader = await getOrClaimMatchLeader(matchId);
      if (leader && leader !== INSTANCE_ID) {
        if (storeRedis) {
          const msg = {
            type: 'interaction:response',
            matchId,
            playerId: player.id,
            socketId: socket.id,
            payload,
          };
          await storeRedis.publish(MATCH_CONTROL_CHANNEL, JSON.stringify(msg));
        }
        return;
      }
      await leaderHandleInteractionResponse(matchId, player.id, payload, socket.id);
    } catch (err) {
      try { console.warn('[interaction] response handler error', err?.message || err); } catch {}
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
    } else if (type === "boardPing") {
      try {
        const match = await getOrLoadMatch(matchId);
        const room = `match:${matchId}`;
        const idx = Array.isArray(match?.playerIds) ? match.playerIds.indexOf(player.id) : 0;
        const playerKey = idx === 1 ? 'p2' : 'p1';
        const x = Number(payload && payload.position && payload.position.x);
        const z = Number(payload && payload.position && payload.position.z);
        if (!Number.isFinite(x) || !Number.isFinite(z)) return;
        const id = payload && typeof payload.id === 'string' ? payload.id : rid('ping');
        const out = { type: 'boardPing', id, position: { x, z }, playerKey, ts: Date.now() };
        io.to(room).emit('message', out);
      } catch {}
    } else if (type === "boardCursor") {
      try {
        const match = await getOrLoadMatch(matchId);
        const room = `match:${matchId}`;
        const idx = Array.isArray(match?.playerIds) ? match.playerIds.indexOf(player.id) : 0;
        const playerKey = idx === 1 ? 'p2' : 'p1';
        const positionPayload = payload && payload.position ? payload.position : null;
        const x = Number(positionPayload && positionPayload.x);
        const z = Number(positionPayload && positionPayload.z);
        const position = Number.isFinite(x) && Number.isFinite(z) ? { x, z } : null;
        let dragging = null;
        if (payload && typeof payload.dragging === 'object' && payload.dragging) {
          const raw = payload.dragging;
          const kind = typeof raw.kind === 'string' ? raw.kind : null;
          const allowedKinds = new Set(['permanent', 'hand', 'pile', 'avatar', 'token']);
          if (kind && allowedKinds.has(kind)) {
            const next = { kind };
            if (kind === 'permanent') {
              const from = typeof raw.from === 'string' ? raw.from.slice(0, 32) : null;
              const index = Number.isFinite(Number(raw.index)) ? Number(raw.index) : null;
              if (from) next.from = from;
              if (index !== null) next.index = index;
            }
            if (kind === 'avatar') {
              const who = raw.who === 'p1' || raw.who === 'p2' ? raw.who : null;
              if (who) next.who = who;
            }
            const source = typeof raw.source === 'string' ? raw.source.slice(0, 32) : null;
            if (source) next.source = source;
            const cardId = Number.isFinite(Number(raw.cardId)) ? Number(raw.cardId) : null;
            if (cardId !== null) next.cardId = cardId;
            const slug = typeof raw.slug === 'string' ? raw.slug.slice(0, 64) : null;
            if (slug) next.slug = slug;
            if (typeof raw.meta === 'object' && raw.meta) {
              const meta = {};
              if (typeof raw.meta.owner === 'number' && Number.isFinite(raw.meta.owner)) {
                meta.owner = Number(raw.meta.owner);
              }
              if (meta.owner !== undefined) next.meta = meta;
            }
            dragging = Object.keys(next).length > 1 ? next : null;
          }
        }
        // Sanitize highlight from payload: expect an object with { cardId?, slug? }
        let highlight = null;
        if (payload && typeof payload.highlight === 'object' && payload.highlight) {
          const h = payload.highlight;
          const cardId = Number.isFinite(Number(h.cardId)) ? Number(h.cardId) : null;
          const slug = typeof h.slug === 'string' ? String(h.slug).slice(0, 64) : null;
          if (cardId !== null || (slug && slug.length > 0)) {
            highlight = { cardId, slug };
          }
        }
        const out = {
          type: 'boardCursor',
          playerId: player.id,
          playerKey,
          position,
          dragging,
          highlight,
          ts: Date.now(),
        };
        io.to(room).emit('message', out);
        io.to(room).emit('boardCursor', out);
      } catch {}
    }
  });

  socket.on("resyncRequest", async () => {
    if (!authed) return;
    const player = getPlayerBySocket(socket);
    if (player && player.matchId) {
      const match = await getOrLoadMatch(player.matchId);
      if (match) {
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
            const g = match.game;
            const keys = Object.keys(g);
            if (keys.length === 0) return false;
            // Heuristic: presence of core state indicates a real snapshot (phase alone is not enough)
            if ("libraries" in g) return true;
            if ("zones" in g) return true;
            if ("board" in g) return true;
            if ("permanents" in g) return true;
            if ("currentPlayer" in g) return true;
            // Consider avatars meaningful when at least one seat has a card or position
            try {
              const a = g.avatars || {};
              const p1Has = !!(a.p1 && (a.p1.card || (Array.isArray(a.p1.pos) && a.p1.pos.length === 2)));
              const p2Has = !!(a.p2 && (a.p2.card || (Array.isArray(a.p2.pos) && a.p2.pos.length === 2)));
              if (p1Has || p2Has) return true;
            } catch {}
            // Do not include d20 rolls alone; only meaningful with core state (already handled above)
          }
          return false;
        })();
        if (hasMeaningfulGame) {
          snap.game = match.game;
          snap.t = typeof match.lastTs === "number" ? match.lastTs : Date.now();
        }
        socket.emit("resyncResponse", { snapshot: snap });
        // If a draft is in progress, proactively sync draft state to this socket
        try {
          if (match.matchType === 'draft' && match.draftState && match.draftState.phase && match.draftState.phase !== 'waiting') {
            io.to(socket.id).emit('draftUpdate', match.draftState);
          }
        } catch {}
        return;
      }
    }
    if (player && player.lobbyId && lobbies.has(player.lobbyId)) {
      const lobby = lobbies.get(player.lobbyId);
      socket.emit("resyncResponse", { snapshot: { lobby: getLobbyInfo(lobby) } });
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
    if (!player) return;

    const roomId = getVoiceRoomIdForPlayer(player);
    if (!roomId) return;

    const playerId = player.id;

    console.log('[RTC][join] join request', {
      playerId,
      socket: socket.id,
      roomId,
      lobbyId: player.lobbyId || null,
      matchId: player.matchId || null,
    });

    if (!rtcParticipants.has(roomId)) {
      rtcParticipants.set(roomId, new Set());
    }

    const roomParticipants = rtcParticipants.get(roomId);
    roomParticipants.add(playerId);

    participantDetails.set(playerId, {
      id: playerId,
      displayName: player.displayName,
      lobbyId: player.lobbyId || null,
      matchId: player.matchId || null,
      roomId,
      joinedAt: Date.now()
    });

    const participants = Array.from(roomParticipants).map((pid) => {
      const details = participantDetails.get(pid);
      return details
        ? {
            id: details.id,
            displayName: details.displayName,
            lobbyId: details.lobbyId,
            matchId: details.matchId,
            roomId: details.roomId,
            joinedAt: details.joinedAt,
          }
        : null;
    }).filter(Boolean);

    roomParticipants.forEach((pid) => {
      if (pid === playerId) return;
      const participantPlayer = players.get(pid);
      if (participantPlayer && participantPlayer.socketId) {
        io.to(participantPlayer.socketId).emit("rtc:peer-joined", {
          from: getPlayerInfo(playerId),
          participants,
        });
      }
    });

    socket.emit("rtc:participants", { participants });
  });

  socket.on("rtc:signal", (payload = {}) => {
    if (!authed) return;
    const player = getPlayerBySocket(socket);
    if (!player) return;

    const roomId = getVoiceRoomIdForPlayer(player);
    if (!roomId) return;

    const playerId = player.id;
    const data = payload && typeof payload === "object" ? payload.data : null;
    if (!data) return;

    console.log('[RTC][signal] forwarding signal', {
      from: playerId,
      roomId,
      hasSdp: !!data.sdp,
      hasCandidate: !!data.candidate,
    });

    const roomParticipants = rtcParticipants.get(roomId);
    if (!roomParticipants || !roomParticipants.has(playerId)) return;

    roomParticipants.forEach((pid) => {
      if (pid === playerId) return;
      const participantPlayer = players.get(pid);
      if (participantPlayer && participantPlayer.socketId) {
        io.to(participantPlayer.socketId).emit("rtc:signal", {
          from: playerId,
          data,
        });
      }
    });
  });

  socket.on("rtc:leave", () => {
    if (!authed) return;
    const player = getPlayerBySocket(socket);
    if (!player) return;

    const roomId = getVoiceRoomIdForPlayer(player);
    if (!roomId) return;

    const playerId = player.id;

    const roomParticipants = rtcParticipants.get(roomId);
    if (roomParticipants) {
      roomParticipants.delete(playerId);

      if (roomParticipants.size === 0) {
        rtcParticipants.delete(roomId);
      }

      const remainingParticipants = Array.from(roomParticipants).map((pid) => {
        const details = participantDetails.get(pid);
        return details
          ? {
              id: details.id,
              displayName: details.displayName,
              lobbyId: details.lobbyId,
              matchId: details.matchId,
              roomId: details.roomId,
              joinedAt: details.joinedAt,
            }
          : null;
      }).filter(Boolean);

      roomParticipants.forEach((pid) => {
        const participantPlayer = players.get(pid);
        if (participantPlayer && participantPlayer.socketId) {
          io.to(participantPlayer.socketId).emit("rtc:peer-left", {
            from: playerId,
            participants: remainingParticipants,
          });
        }
      });
    }

    participantDetails.delete(playerId);
  });

  // WebRTC connection failure reporting
  socket.on("rtc:connection-failed", (payload = {}) => {
    if (!authed) return;
    const player = getPlayerBySocket(socket);
    if (!player) return;

    const roomId = getVoiceRoomIdForPlayer(player);
    if (!roomId) return;

    const playerId = player.id;
    const reason = payload.reason || "unknown";
    const code = payload.code || "CONNECTION_ERROR";

    console.warn(`WebRTC connection failed for player ${playerId} in ${roomId}: ${reason} (${code})`);

    const roomParticipants = rtcParticipants.get(roomId);
    if (roomParticipants && roomParticipants.has(playerId)) {
      roomParticipants.forEach((pid) => {
        if (pid === playerId) return;
        const participantPlayer = players.get(pid);
        if (participantPlayer && participantPlayer.socketId) {
          io.to(participantPlayer.socketId).emit("rtc:peer-connection-failed", {
            from: playerId,
            reason,
            code,
            timestamp: Date.now(),
          });
        }
      });
    }

    socket.emit("rtc:connection-failed-ack", {
      playerId,
      matchId: player.matchId || null,
      roomId,
      timestamp: Date.now(),
    });
  });

  socket.on("rtc:request", (payload = {}) => {
    if (!authed) return;
    const player = getPlayerBySocket(socket);
    if (!player) return;

    const targetId = payload && typeof payload.targetId === 'string' ? payload.targetId : null;
    const requestedLobbyId = payload && typeof payload.lobbyId === 'string' ? payload.lobbyId : null;
    const requestedMatchId = payload && typeof payload.matchId === 'string' ? payload.matchId : null;
    if (!targetId || targetId === player.id) {
      console.warn('[RTC][request] invalid target', {
        from: player.id,
        targetId,
        requestedLobbyId,
        requestedMatchId,
      });
      return;
    }

    const targetPlayer = players.get(targetId);
    if (!targetPlayer || !targetPlayer.socketId) {
      console.warn('[RTC][request] target not connected', {
        from: player.id,
        targetId,
      });
      return;
    }

    const shareLobby = player.lobbyId && targetPlayer.lobbyId && player.lobbyId === targetPlayer.lobbyId;
    const shareMatch = player.matchId && targetPlayer.matchId && player.matchId === targetPlayer.matchId;

    let lobbyId = null;
    if (requestedLobbyId) {
      const lobby = lobbies.get(requestedLobbyId);
      if (lobby && lobby.playerIds.has(player.id) && lobby.playerIds.has(targetId)) {
        lobbyId = requestedLobbyId;
      }
    }
    if (!lobbyId && shareLobby) {
      lobbyId = player.lobbyId;
    }

    let matchId = null;
    if (requestedMatchId) {
      const match = matches.get(requestedMatchId);
      if (match && Array.isArray(match.playerIds) && match.playerIds.includes(player.id) && match.playerIds.includes(targetId)) {
        matchId = requestedMatchId;
      }
    }
    if (!matchId && shareMatch) {
      matchId = player.matchId;
    }

    if (!lobbyId && !matchId) {
      console.warn('[RTC][request] rejected - no shared scope', {
        from: player.id,
        targetId,
        requestedLobbyId,
        requestedMatchId,
        shareLobby,
        shareMatch,
      });
      return;
    }

    const requestId = rid('rtc_req');

    pendingVoiceRequests.set(requestId, {
      id: requestId,
      from: player.id,
      to: targetId,
      lobbyId,
      matchId,
      createdAt: Date.now(),
    });

    console.log('[RTC][request] forwarding request', {
      requestId,
      from: player.id,
      to: targetId,
      lobbyId,
      matchId,
    });

    io.to(targetPlayer.socketId).emit("rtc:request", {
      requestId,
      from: getPlayerInfo(player.id),
      lobbyId,
      matchId,
      timestamp: Date.now(),
    });

    socket.emit("rtc:request:sent", {
      requestId,
      targetId,
      lobbyId,
      matchId,
      timestamp: Date.now(),
    });
  });

  socket.on("rtc:request:respond", (payload = {}) => {
    if (!authed) return;
    const player = getPlayerBySocket(socket);
    if (!player) return;

    const requestId = payload && typeof payload.requestId === 'string' ? payload.requestId : null;
    const requesterId = payload && typeof payload.requesterId === 'string' ? payload.requesterId : null;
    const accepted = payload && typeof payload.accepted === 'boolean' ? payload.accepted : false;

    if (!requestId || !requesterId) {
      console.warn('[RTC][request:respond] missing identifiers', {
        player: player.id,
        requestId,
        requesterId,
        accepted,
      });
      return;
    }

    const request = pendingVoiceRequests.get(requestId);
    if (!request) {
      console.warn('[RTC][request:respond] unknown request', {
        player: player.id,
        requestId,
        requesterId,
        accepted,
      });
      return;
    }
    if (request.to !== player.id || request.from !== requesterId) {
      console.warn('[RTC][request:respond] mismatched request ownership', {
        player: player.id,
        request,
        requesterId,
      });
      return;
    }

    const requesterPlayer = players.get(requesterId);
    if (!requesterPlayer || !requesterPlayer.socketId) {
      pendingVoiceRequests.delete(requestId);
      console.warn('[RTC][request:respond] requester offline', {
        requestId,
        requesterId,
      });
      return;
    }

    const sameLobby = request.lobbyId && player.lobbyId === request.lobbyId && requesterPlayer.lobbyId === request.lobbyId;
    const sameMatch = request.matchId && player.matchId === request.matchId && requesterPlayer.matchId === request.matchId;
    if (!sameLobby && !sameMatch) {
      pendingVoiceRequests.delete(requestId);
      return;
    }

    pendingVoiceRequests.delete(requestId);

    const responsePayload = {
      requestId,
      from: getPlayerInfo(player.id),
      lobbyId: request.lobbyId,
      matchId: request.matchId,
      accepted,
      timestamp: Date.now(),
    };

    console.log('[RTC][request:respond]', {
      requestId,
      requesterId,
      responder: player.id,
      accepted,
      lobbyId: request.lobbyId,
      matchId: request.matchId,
    });

    io.to(requesterPlayer.socketId).emit(
      accepted ? "rtc:request:accepted" : "rtc:request:declined",
      responsePayload,
    );

    // Confirm to responder so UI can clear state
    socket.emit("rtc:request:ack", responsePayload);

    if (accepted) {
      // Also let responder's client handle unified acceptance flow
      socket.emit("rtc:request:accepted", responsePayload);
    }
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

    // Lightweight ack so client UI can flip instantly
    try {
      socket.emit("deckAccepted", {
        matchId: match.id,
        playerId: player.id,
        mode: "sealed",
        counts: val.counts || null,
        ts: Date.now(),
      });
    } catch {}

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
      // Initialize/reset pack choices for all players
      if (!Array.isArray(match.draftState.packChoice) || match.draftState.packChoice.length !== match.playerIds.length) {
        match.draftState.packChoice = Array.from({ length: match.playerIds.length }, () => null);
      } else {
        match.draftState.packChoice = match.draftState.packChoice.map(() => null);
      }
      try { console.log(`[Draft] (legacy helper) start -> enter pack_selection (round 1)`); } catch {}

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
      const match = await getOrLoadMatch(matchId);
      if (!match || match.matchType !== 'draft' || !match.draftState) return;
      if (match.draftState.phase !== 'waiting') {
        // Already started or in-progress: re-emit current state to salvage stuck clients
        try { io.to(`match:${match.id}`).emit('draftUpdate', match.draftState); } catch {}
      } else {
        await leaderStartDraft(matchId, player.id, payload?.draftConfig || null, socket.id);
      }
      // Failsafe: fetch fresh state and broadcast to ensure clients transition
      try {
        const m2 = await getOrLoadMatch(matchId);
        if (m2 && m2.draftState) {
          io.to(`match:${m2.id}`).emit('draftUpdate', m2.draftState);
        }
      } catch {}
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

    // Lightweight ack so client UI can flip instantly
    try {
      socket.emit("deckAccepted", {
        matchId: match.id,
        playerId: player.id,
        mode: "draft",
        counts: val.counts || null,
        ts: Date.now(),
      });
    } catch {}

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
    try { if (draftStartWatchdogs.has(match.id)) { clearTimeout(draftStartWatchdogs.get(match.id)); draftStartWatchdogs.delete(match.id); } } catch {}
  });

  socket.on("disconnect", () => {
    const pid = playerIdBySocket.get(socket.id);
    if (!pid) return;
    const player = players.get(pid);
    playerIdBySocket.delete(socket.id);

    for (const [requestId, request] of Array.from(pendingVoiceRequests.entries())) {
      if (request.from === pid || request.to === pid) {
        pendingVoiceRequests.delete(requestId);
        const otherId = request.from === pid ? request.to : request.from;
        const otherPlayer = players.get(otherId);
        if (otherPlayer && otherPlayer.socketId) {
          console.log('[RTC][request:cancelled] disconnect cleanup', {
            requestId,
            cancelledBy: pid,
            other: otherId,
          });
          io.to(otherPlayer.socketId).emit("rtc:request:cancelled", {
            requestId,
            cancelledBy: pid,
            lobbyId: request.lobbyId,
            matchId: request.matchId,
            timestamp: Date.now(),
          });
        }
      }
    }

    // Clean up WebRTC participant state on disconnect
    const participantInfo = participantDetails.get(pid);
    const roomId = participantInfo?.roomId || (player ? getVoiceRoomIdForPlayer(player) : null);
    if (roomId) {
      const roomParticipants = rtcParticipants.get(roomId);
      if (roomParticipants && roomParticipants.has(pid)) {
        roomParticipants.delete(pid);

        if (roomParticipants.size === 0) {
          rtcParticipants.delete(roomId);
        }

        const remainingParticipants = Array.from(roomParticipants).map((participantId) => {
          const details = participantDetails.get(participantId);
          return details
            ? {
                id: details.id,
                displayName: details.displayName,
                lobbyId: details.lobbyId,
                matchId: details.matchId,
                roomId: details.roomId,
                joinedAt: details.joinedAt,
              }
            : null;
        }).filter(Boolean);

        roomParticipants.forEach((participantId) => {
          const participantPlayer = players.get(participantId);
          if (participantPlayer && participantPlayer.socketId) {
            io.to(participantPlayer.socketId).emit("rtc:peer-left", {
              from: pid,
              participants: remainingParticipants,
            });
          }
        });
      }
    }

    participantDetails.delete(pid);
    
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
          // Replicate deletion cluster-wide
          try { publishLobbyDelete(lobby.id); } catch {}
          broadcastLobbies();
        } else if (lobby.hostId === player.id) {
          const remaining = Array.from(lobby.playerIds);
          const humanNext = remaining.find((id) => !isCpuPlayerId(id)) || remaining[0];
          lobby.hostId = humanNext;
          lobby.ready.clear();
          io.to(`lobby:${lobby.id}`).emit("lobbyUpdated", { lobby: getLobbyInfo(lobby) });
          // Replicate update cluster-wide
          try { publishLobbyState(lobby); } catch {}
          broadcastLobbies();
        } else {
          io.to(`lobby:${lobby.id}`).emit("lobbyUpdated", { lobby: getLobbyInfo(lobby) });
          // Replicate update cluster-wide
          try { publishLobbyState(lobby); } catch {}
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

// Periodic cleanup: trim CPU-only lobbies; keep human lobbies alive even when idle
setInterval(() => {
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
  }
}, 30 * 1000);

// Periodic cleanup: remove long-idle waiting matches with no connected sockets.
setInterval(async () => {
  const now = Date.now();
  for (const match of matches.values()) {
    try {
      if (!match || match.status !== 'waiting') continue;
      const age = now - (Number(match.lastTs) || now);
      if (age < STALE_WAITING_MS) continue;
      const room = `match:${match.id}`;
      let roomEmpty = true;
      try {
        if (typeof io.in(room).allSockets === 'function') {
          const sockets = await io.in(room).allSockets();
          roomEmpty = !sockets || sockets.size === 0;
        }
      } catch {}
      if (!roomEmpty) continue;
      // Coordinate via leader; followers request cleanup through pub/sub
      try {
        const leader = await getOrClaimMatchLeader(match.id);
        if (leader && leader !== INSTANCE_ID) {
          if (storeRedis) await storeRedis.publish(MATCH_CONTROL_CHANNEL, JSON.stringify({ type: 'match:cleanup', matchId: match.id, reason: 'stale_waiting', force: true }));
          continue;
        }
        await cleanupMatchNow(match.id, 'stale_waiting', true);
      } catch {}
    } catch {}
  }
}, 60 * 1000);

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
  // Enable cluster pub/sub processing now that maps are initialized
  try { clusterStateReady = true; console.log('[store] cluster state ready; pub/sub handlers active'); } catch {}
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
