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

function getCellNumber(key, boardWidth = 5) {
  const pos = parseCellKey(key);
  if (!pos) return null;
  // Sorcery board is 5x4 (5 columns, 4 rows)
  // Cell numbering: 1-20, from top-left to bottom-right
  return pos.y * boardWidth + pos.x + 1;
}

function getBoardWidth(game) {
  // Sorcery board is always 5 columns wide
  return (game && game.board && game.board.size && game.board.size.w) || 5;
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

// Curated metadata (mirrors client `src/lib/game/mana-providers.ts`)
const MANA_PROVIDER_BY_NAME = new Set([
  'abundance',
  'amethyst core',
  'aquamarine core',
  'atlantean fate',
  'avalon',
  'blacksmith family',
  'caerleon-upon-usk',
  'castle servants',
  'common cottagers',
  'drought',
  'finwife',
  "fisherman's family",
  'glastonbury tor',
  'joyous garde',
  'onyx core',
  'pristine paradise',
  'ruby core',
  'shrine of the dragonlord',
  'the colour out of space',
  'tintagel',
  'valley of delight',
  'wedding hall',
  'älvalinne dryads',
]);

const THRESHOLD_GRANT_BY_NAME = {
  'amethyst core': { air: 1 },
  'aquamarine core': { water: 1 },
  'onyx core': { earth: 1 },
  'ruby core': { fire: 1 },
};

// Sites that do NOT provide 1 mana (keep empty until cataloged)
const NON_MANA_SITE_IDENTIFIERS = new Set([]);

const THRESHOLD_KEYS = ['air', 'water', 'earth', 'fire'];

function accumulateThresholds(acc, src) {
  if (!src || typeof src !== 'object') return;
  for (const k of THRESHOLD_KEYS) {
    const v = Number(src[k] || 0);
    if (Number.isFinite(v) && v !== 0) acc[k] = (acc[k] || 0) + v;
  }
}

function siteProvidesMana(card) {
  if (!card) return false;
  const name = (card.name || '').toString().toLowerCase();
  const slug = (card.slug || '').toString().toLowerCase();
  if (NON_MANA_SITE_IDENTIFIERS.has(name)) return false;
  if (slug && NON_MANA_SITE_IDENTIFIERS.has(slug)) return false;
  return true;
}

function countThresholdsForPlayer(game, playerNum) {
  const out = { air: 0, water: 0, earth: 0, fire: 0 };
  const sites = (game && game.board && game.board.sites) || {};
  for (const key of Object.keys(sites)) {
    try {
      const tile = sites[key];
      if (!tile || Number(tile.owner) !== playerNum) continue;
      const th = tile.card && tile.card.thresholds ? tile.card.thresholds : null;
      accumulateThresholds(out, th);
    } catch {}
  }
  const per = (game && game.permanents) || {};
  for (const cellKey of Object.keys(per)) {
    const arr = Array.isArray(per[cellKey]) ? per[cellKey] : [];
    for (const p of arr) {
      try {
        if (!p || Number(p.owner) !== playerNum) continue;
        const nm = (p.card && p.card.name ? String(p.card.name) : '').toLowerCase();
        const grant = THRESHOLD_GRANT_BY_NAME[nm];
        if (grant) accumulateThresholds(out, grant);
      } catch {}
    }
  }
  return out;
}

function countOwnedManaSites(game, playerNum) {
  let n = 0;
  const sites = (game && game.board && game.board.sites) || {};
  for (const key of Object.keys(sites)) {
    try {
      const tile = sites[key];
      if (!tile || Number(tile.owner) !== playerNum) continue;
      if (siteProvidesMana(tile.card)) n++;
    } catch {}
  }
  return n;
}

function countManaProvidersFromPermanents(game, playerNum) {
  let n = 0;
  const per = (game && game.permanents) || {};
  for (const cellKey of Object.keys(per)) {
    const arr = Array.isArray(per[cellKey]) ? per[cellKey] : [];
    for (const p of arr) {
      try {
        if (!p || Number(p.owner) !== playerNum) continue;
        const nm = (p.card && p.card.name ? String(p.card.name) : '').toLowerCase();
        if (MANA_PROVIDER_BY_NAME.has(nm)) n++;
      } catch {}
    }
  }
  return n;
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

    // Reset per-turn spend for current player (sites do not tap in Sorcery)
    const resPrev = (game && game.resources) || {};
    const meKey = cp === 1 ? 'p1' : 'p2';
    const meResPrev = resPrev[meKey] || {};
    const meRes = { ...meResPrev, spentThisTurn: 0 };
    const resources = { ...resPrev, [meKey]: meRes };

    // Do not modify board.sites at turn start (sites do not tap)
    return { permanents, avatars, resources };
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
      const avatars = (game && game.avatars) || {};
      for (const key of Object.keys(action.board.sites)) {
        const nextTile = action.board.sites[key];
        const prevTile = currentSites[key];
        // If both have a card, then it's an overwrite attempt
        if (nextTile && nextTile.card && prevTile && prevTile.card) {
          const cellNum = getCellNumber(key, getBoardWidth(game));
          const cellRef = cellNum ? `cell ${cellNum}` : `tile ${key}`;
          return { ok: false, error: `Cannot place site on occupied ${cellRef}` };
        }
        // If adding a new site, enforce owner equals actor (when resolvable)
        if (nextTile && nextTile.card && meNum && Number(nextTile.owner) !== meNum) {
          return { ok: false, error: `Cannot place site owned by opponent` };
        }
        // Adjacency: after the player's first site, any new site must be adjacent to an owned site
        if (nextTile && nextTile.card && meNum) {
          const sitesOwned = Object.values(currentSites).filter((t) => t && t.card && Number(t.owner) === meNum).length;
          // First site must be placed at the avatar's position
          if (sitesOwned === 0 && meKey) {
            const av = avatars[meKey] || {};
            const pos = Array.isArray(av.pos) ? av.pos : null;
            if (pos) {
              const atKey = `${pos[0]},${pos[1]}`;
              if (key !== atKey) {
                const cellNum = getCellNumber(atKey, getBoardWidth(game));
                const cellRef = cellNum ? `cell ${cellNum}` : `position ${atKey}`;
                return { ok: false, error: `First site must be played at your avatar's ${cellRef}` };
              }
            }
          }
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
          const cellNum = getCellNumber(key, getBoardWidth(game));
          const cellRef = cellNum ? `cell ${cellNum}` : `cell ${key}`;
          return { ok: false, error: `Cannot place permanent on unsited ${cellRef}` };
        }
      }
      // Ownership guard for tapping opponent permanents: reject if patch toggles tapped on a non-owned permanent
      if (meNum) {
        const prevPer = (game && game.permanents) || {};
        for (const key of Object.keys(action.permanents)) {
          const nextArr = Array.isArray(action.permanents[key]) ? action.permanents[key] : [];
          const prevArr = Array.isArray(prevPer[key]) ? prevPer[key] : [];
          const len = Math.min(prevArr.length, nextArr.length);
          for (let i = 0; i < len; i++) {
            const prevItem = prevArr[i] || {};
            const nextItem = nextArr[i] || {};
            try {
              const owner = Number(prevItem.owner);
              const prevTapped = !!prevItem.tapped;
              const nextTapped = Object.prototype.hasOwnProperty.call(nextItem, 'tapped') ? !!nextItem.tapped : prevTapped;
              if (prevTapped !== nextTapped && owner !== meNum) {
                return { ok: false, error: 'Cannot tap or untap opponent permanent' };
              }
            } catch {}
          }
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

    // Avatar tap ownership: only actor may change their own avatar tapped state
    if (action.avatars && typeof action.avatars === 'object' && meKey) {
      for (const k of Object.keys(action.avatars)) {
        if (k !== 'p1' && k !== 'p2') continue;
        const patch = action.avatars[k] || {};
        if (Object.prototype.hasOwnProperty.call(patch, 'tapped') && k !== meKey) {
          return { ok: false, error: 'Cannot tap or untap opponent avatar' };
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

// Cost enforcement using per-turn spend model (sites never tap; avatars tap to play sites)
function ensureCosts(game, action, playerId, context) {
  try {
    const match = context && context.match ? context.match : null;
    const idx = match && Array.isArray(match.playerIds) ? match.playerIds.indexOf(playerId) : -1;
    const meNum = idx >= 0 ? (idx + 1) : null;
    const meKey = idx === 0 ? 'p1' : idx === 1 ? 'p2' : null;
    if (!meNum || !meKey) return { ok: true };

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
    // Detect if actor is placing any new site this action
    let placingNewSite = false;
    if (action.board && action.board.sites && typeof action.board.sites === 'object') {
      const currentSites = (game && game.board && game.board.sites) || {};
      for (const key of Object.keys(action.board.sites)) {
        const nextTile = action.board.sites[key];
        const prevTile = currentSites[key];
        if (nextTile && nextTile.card && (!prevTile || !prevTile.card) && Number(nextTile.owner) === meNum) {
          placingNewSite = true;
          break;
        }
      }
    }

    // Build auto patch accumulator (resources + potential avatar tap)
    const auto = { resources: {}, avatars: {} };
    let hasAuto = false;

    // Mana spend check (per-turn spend model)
    if (totalCost > 0) {
      const ownedSiteCount = countOwnedManaSites(game, meNum);
      const manaProviders = countManaProvidersFromPermanents(game, meNum);
      const spentPrev = (game && game.resources && game.resources[meKey] && Number(game.resources[meKey].spentThisTurn)) || 0;
      const available = Math.max(0, ownedSiteCount + manaProviders - spentPrev);
      if (totalCost > available) return { ok: false, error: 'Insufficient resources to pay costs' };
      const newSpent = spentPrev + totalCost;
      auto.resources[meKey] = { spentThisTurn: newSpent };
      hasAuto = true;
    }

    // Avatar tap requirement to play any site
    if (placingNewSite) {
      const avPrev = (game && game.avatars && game.avatars[meKey]) || {};
      const tappedPrev = !!avPrev.tapped;
      const avPatch = action.avatars && action.avatars[meKey];
      const tappedNext = avPatch && Object.prototype.hasOwnProperty.call(avPatch, 'tapped') ? !!avPatch.tapped : tappedPrev;
      if (tappedPrev) {
        // Already tapped -> cannot pay site placement cost again this turn
        return { ok: false, error: 'Avatar must be untapped to play a site' };
      }
      if (!tappedNext) {
        // Auto-tap avatar as a helper
        auto.avatars[meKey] = { ...(avPrev || {}), tapped: true };
        hasAuto = true;
      }
    }

    if (hasAuto) return { ok: true, autoPatch: auto };
    return { ok: true };
  } catch {
    return { ok: true };
  }
}

module.exports = { applyTurnStart, validateAction, ensureCosts };
