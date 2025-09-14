// Minimal rules scaffolding: apply turn start effects and validate actions
const path = require('path');

// Lazy-load card DB for thresholds lookup (if needed)
let _CARDS_DB = null;
function loadCardsDb() {
  if (_CARDS_DB) return _CARDS_DB;
  try {
    _CARDS_DB = require(path.join(__dirname, '..', '..', 'data', 'cards_raw.json'));
  } catch {
    _CARDS_DB = [];
  }
  return _CARDS_DB;
}

function getCostForCard(card) {
  if (card && typeof card.cost === 'number') return Number(card.cost) || 0;
  // Lookup by slug or name
  const slug = card && card.slug ? String(card.slug) : null;
  const nm = card && card.name ? String(card.name) : null;
  const db = loadCardsDb();
  let found = null;
  if (slug) {
    found = getCardBySlug(slug);
  } else if (nm) {
    found = getCardByName(nm);
  }
  if (found) {
    const meta = (found.guardian || (found.sets && found.sets[0] && found.sets[0].metadata));
    if (meta && typeof meta.cost === 'number') return Number(meta.cost) || 0;
  }
  return 0;
}

function parseCellKey(key) {
  try {
    const [xs, ys] = String(key).split(',');
    const x = Number(xs); const y = Number(ys);
    if (Number.isFinite(x) && Number.isFinite(y)) return { x, y };
  } catch {}
  return null;
}

function isAdjacentToOwnedSite(game, playerNum, key) {
  const pos = parseCellKey(key);
  if (!pos) return false;
  const neighbors = [ [pos.x+1,pos.y], [pos.x-1,pos.y], [pos.x,pos.y+1], [pos.x,pos.y-1] ];
  const sites = (game && game.board && game.board.sites) || {};
  for (const [nx, ny] of neighbors) {
    const k = `${nx},${ny}`;
    const tile = sites[k];
    if (tile && tile.card && Number(tile.owner) === playerNum) return true;
  }
  return false;
}

function getCardBySlug(slug) {
  if (!slug) return null;
  const db = loadCardsDb();
  for (const c of db) {
    try {
      const sets = Array.isArray(c.sets) ? c.sets : [];
      for (const s of sets) {
        const vs = Array.isArray(s.variants) ? s.variants : [];
        if (vs.find((v) => String(v.slug) === String(slug))) return c;
      }
    } catch {}
  }
  return null;
}

function getCardByName(name) {
  if (!name) return null;
  const db = loadCardsDb();
  const low = String(name).toLowerCase();
  return db.find((c) => String(c.name || '').toLowerCase() === low) || null;
}

function getThresholdsForCard(card) {
  // Inline thresholds (preferred for tests)
  if (card && card.thresholds && typeof card.thresholds === 'object') return card.thresholds;
  // Lookup by slug
  const slug = card && card.slug ? String(card.slug) : null;
  if (slug) {
    const found = getCardBySlug(slug);
    const m = found && (found.guardian || (found.sets && found.sets[0] && found.sets[0].metadata));
    if (m && m.thresholds) return m.thresholds;
  }
  // Lookup by exact name
  const nm = card && card.name ? String(card.name) : null;
  if (nm) {
    const found = getCardByName(nm);
    const m = found && (found.guardian || (found.sets && found.sets[0] && found.sets[0].metadata));
    if (m && m.thresholds) return m.thresholds;
  }
  return null;
}

// Map standard site names to element keywords used in thresholds
const SITE_ELEMENT_BY_NAME = {
  Spire: 'air',
  Stream: 'water',
  Valley: 'earth',
  Wasteland: 'fire',
};

function countThresholdsForPlayer(game, playerNum) {
  const board = (game && game.board) || { sites: {} };
  const sites = (board && board.sites) || {};
  const tally = { air: 0, water: 0, earth: 0, fire: 0 };
  for (const key of Object.keys(sites)) {
    try {
      const tile = sites[key];
      if (!tile || Number(tile.owner) !== playerNum) continue;
      const nm = tile.card && tile.card.name ? String(tile.card.name) : '';
      const el = SITE_ELEMENT_BY_NAME[nm];
      if (el) tally[el]++;
    } catch {}
  }
  return tally;
}

/**
 * Compute a patch to apply at the start of the turn for the current player in `game`.
 * Untaps sites, permanents, and avatar of the current player.
 * @param {any} game - current or simulated next game state (must contain currentPlayer)
 * @returns {any|null} partial patch to merge, or null if none
 */
function applyTurnStart(game) {
  try {
    const cp = Number(game && game.currentPlayer);
    if (!(cp === 1 || cp === 2)) return null;

    // Untap sites owned by current player
    const board = (game && game.board) || { sites: {} };
    const sitesPrev = (board && board.sites) || {};
    const sites = { ...sitesPrev };
    for (const key of Object.keys(sites)) {
      try {
        const st = sites[key] || {};
        if (st && Number(st.owner) === cp) sites[key] = { ...st, tapped: false };
      } catch {}
    }

    // Untap permanents owned by current player
    const permsPrev = (game && game.permanents) || {};
    const permanents = {};
    for (const cellKey of Object.keys(permsPrev)) {
      const arr = Array.isArray(permsPrev[cellKey]) ? permsPrev[cellKey] : [];
      permanents[cellKey] = arr.map((p) => {
        try { return Number(p.owner) === cp ? { ...p, tapped: false } : p; } catch { return p; }
      });
    }

    // Untap avatar of current player
    const avatarsPrev = (game && game.avatars) || { p1: { card: null }, p2: { card: null } };
    const avatars = { ...avatarsPrev };
    const nextKey = cp === 1 ? 'p1' : 'p2';
    avatars[nextKey] = { ...(avatars[nextKey] || {}), tapped: false };

    const boardNext = { ...board, sites };
    return { board: boardNext, permanents, avatars };
  } catch {
    return null;
  }
}

/**
 * Validate a client-submitted action/patch against minimal rules.
 * - Prevent overwriting an occupied site tile with a new site.
 * - Prevent placing permanents onto cells without a site.
 * Future: thresholds, costs, targeting, timing windows, etc.
 *
 * @param {any} game - current game state
 * @param {any} action - proposed patch/action
 * @param {string} playerId - acting player id
 * @param {object} [context] - optional context object
 * @returns {{ ok: boolean, error?: string }}
 */
function validateAction(game, action, playerId, context) {
  try {
    if (!action || typeof action !== 'object') return { ok: true };
    const match = context && context.match ? context.match : null;
    const idx = match && Array.isArray(match.playerIds) ? match.playerIds.indexOf(playerId) : -1;
    const meKey = idx === 0 ? 'p1' : idx === 1 ? 'p2' : null;
    const meNum = idx >= 0 ? (idx + 1) : null;

    // Compute effective current player and phase after applying patch
    const effectivePlayer = (action && typeof action.currentPlayer === 'number') ? action.currentPlayer : (game && game.currentPlayer);
    const effectivePhase = (action && typeof action.phase === 'string') ? action.phase : (game && game.phase);

    // Validate site placement into empty cells only
    if (action.board && action.board.sites && typeof action.board.sites === 'object') {
      const currentSites = (game && game.board && game.board.sites) || {};
      for (const key of Object.keys(action.board.sites)) {
        const nextTile = action.board.sites[key];
        const prevTile = currentSites[key];
        // If both have a card, then it's an overwrite attempt
        if (nextTile && nextTile.card && prevTile && prevTile.card) {
          return { ok: false, error: `Cannot place site on occupied tile ${key}` };
        }
        // If adding a new site, enforce owner equals actor (when resolvable)
        if (nextTile && nextTile.card && meNum && Number(nextTile.owner) !== meNum) {
          return { ok: false, error: `Cannot place site owned by opponent` };
        }
        // Adjacency: after the player's first site, any new site must be adjacent to an owned site
        if (nextTile && nextTile.card && meNum) {
          const sitesOwned = Object.values(currentSites).filter((t) => t && t.card && Number(t.owner) === meNum).length;
          if (sitesOwned > 0 && !isAdjacentToOwnedSite(game, meNum, key)) {
            return { ok: false, error: `New sites must be adjacent to your existing sites` };
          }
        }
      }
    }

    // Validate permanents placement must be onto a sited cell
    if (action.permanents && typeof action.permanents === 'object') {
      const currentSites = (game && game.board && game.board.sites) || {};
      for (const key of Object.keys(action.permanents)) {
        if (!currentSites[key] || !currentSites[key].card) {
          return { ok: false, error: `Cannot place permanent on unsited cell ${key}` };
        }
      }
    }

    // Zones scoping: do not allow modifying opponent's zones
    if (action.zones && typeof action.zones === 'object' && meKey) {
      for (const zk of Object.keys(action.zones)) {
        if (zk !== meKey) {
          return { ok: false, error: `Cannot modify opponent zones (${zk})` };
        }
      }
    }

    // Threshold checks for newly placed permanents (basic)
    if (action.permanents && typeof action.permanents === 'object' && meNum) {
      // Timing: permanents may only be placed during Main phase by the active player
      if (!(effectivePlayer === meNum && effectivePhase === 'Main')) {
        return { ok: false, error: 'Permanents can only be played during your Main phase' };
      }
      const available = countThresholdsForPlayer(game, meNum);
      for (const key of Object.keys(action.permanents)) {
        const arr = Array.isArray(action.permanents[key]) ? action.permanents[key] : [];
        for (const p of arr) {
          const card = p && p.card ? p.card : null;
          if (!card) continue;
          const th = getThresholdsForCard(card);
          if (!th) continue; // unknown => allow for now
          // Compare element-wise using >=
          if ((th.air || 0) > (available.air || 0)) return { ok: false, error: 'Insufficient Air thresholds' };
          if ((th.earth || 0) > (available.earth || 0)) return { ok: false, error: 'Insufficient Earth thresholds' };
          if ((th.fire || 0) > (available.fire || 0)) return { ok: false, error: 'Insufficient Fire thresholds' };
          if ((th.water || 0) > (available.water || 0)) return { ok: false, error: 'Insufficient Water thresholds' };
        }
      }
    }

    // Allow all other changes for now; future checks go here
    return { ok: true };
  } catch {
    return { ok: true };
  }
}

// Cost/tap enforcement with optional auto-pay tapping
function ensureCosts(game, action, playerId, context) {
  try {
    const match = context && context.match ? context.match : null;
    const idx = match && Array.isArray(match.playerIds) ? match.playerIds.indexOf(playerId) : -1;
    const meNum = idx >= 0 ? (idx + 1) : null;
    if (!meNum) return { ok: true };

    // Sum costs of permanents being placed now
    let totalCost = 0;
    if (action.permanents && typeof action.permanents === 'object') {
      for (const key of Object.keys(action.permanents)) {
        const arr = Array.isArray(action.permanents[key]) ? action.permanents[key] : [];
        for (const p of arr) {
          const card = p && p.card ? p.card : null;
          if (card) totalCost += getCostForCard(card);
        }
      }
    }
    if (totalCost <= 0) return { ok: true };

    const currentSites = (game && game.board && game.board.sites) || {};
    const patchSites = (action.board && action.board.sites) || {};

    // Count newly tapped sites in the action
    let newlyTapped = 0;
    for (const key of Object.keys(patchSites)) {
      const prev = currentSites[key];
      const next = patchSites[key];
      if (!prev || !next) continue;
      if (Number(next.owner) !== meNum) continue;
      const prevTapped = !!prev.tapped;
      const nextTapped = !!next.tapped;
      if (prevTapped === false && nextTapped === true) newlyTapped++;
    }

    // Count available untapped sites we could auto-tap
    const availableKeys = Object.keys(currentSites).filter((k) => {
      const tile = currentSites[k];
      return tile && Number(tile.owner) === meNum && (!!tile.tapped === false);
    });

    if (newlyTapped >= totalCost) return { ok: true };
    const need = totalCost - newlyTapped;
    if (availableKeys.length < need) return { ok: false, error: 'Insufficient sites to pay costs' };

    // Build auto-tap patch for first N available sites
    const autoSites = {};
    let taken = 0;
    for (const k of availableKeys) {
      if (taken >= need) break;
      const tile = currentSites[k];
      autoSites[k] = { ...tile, tapped: true };
      taken++;
    }
    return { ok: true, autoPatch: { board: { sites: autoSites } } };
  } catch {
    return { ok: true };
  }
}

module.exports = { applyTurnStart, validateAction, ensureCosts };
