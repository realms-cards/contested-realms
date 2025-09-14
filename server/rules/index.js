// Minimal rules scaffolding: apply turn start effects and validate actions

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
 * @returns {{ ok: boolean, error?: string }}
 */
function validateAction(game, action, playerId) {
  try {
    if (!action || typeof action !== 'object') return { ok: true };

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

    // Allow all other changes for now; future checks go here
    return { ok: true };
  } catch {
    return { ok: true };
  }
}

module.exports = { applyTurnStart, validateAction };
