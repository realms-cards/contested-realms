/**
 * Tournament Tiebreaker Module
 * Handles tiebreaker logic for tournament matches when time expires
 * 
 * Rules (in order):
 * 1. 5 extra turns starting with inactive player
 * 2. First player to reach Death's Door (DD) loses
 * 3. Player with most life wins
 * 4. Player with most cards in spellbook wins
 * 5. Coin flip (host/judge decides)
 * 
 * Forced draws are NOT allowed:
 * - Actions that would kill both players simultaneously continue the game
 * - See: The Codex (Death Blow)
 */

const TIEBREAKER_DEFAULTS = {
  extraTurns: 5,
  preventForcedDraws: true,
  allowDrawAgreement: false,
  roundTimeMinutes: 45
};

/**
 * Get tiebreaker settings from tournament settings
 * @param {object} tournamentSettings - Tournament settings object
 * @returns {object} Tiebreaker settings with defaults
 */
function getTiebreakerSettings(tournamentSettings) {
  const settings = tournamentSettings || {};
  const tiebreaker = settings.tiebreakerSettings || {};
  
  return {
    extraTurns: typeof tiebreaker.extraTurns === 'number' ? tiebreaker.extraTurns : TIEBREAKER_DEFAULTS.extraTurns,
    preventForcedDraws: tiebreaker.preventForcedDraws !== false, // Default true
    allowDrawAgreement: tiebreaker.allowDrawAgreement === true, // Default false
    roundTimeMinutes: typeof settings.roundTimeLimit === 'number' ? settings.roundTimeLimit : TIEBREAKER_DEFAULTS.roundTimeMinutes
  };
}

/**
 * Check if a match is in extra turns mode
 * @param {object} match - Match state
 * @returns {boolean}
 */
function isInExtraTurns(match) {
  return match?.extraTurnsMode === true;
}

/**
 * Get remaining extra turns for a match
 * @param {object} match - Match state
 * @param {object} tiebreakerSettings - Tiebreaker settings
 * @returns {number} Remaining extra turns
 */
function getRemainingExtraTurns(match, tiebreakerSettings) {
  if (!isInExtraTurns(match)) return tiebreakerSettings.extraTurns;
  return Math.max(0, (tiebreakerSettings.extraTurns || 5) - (match.extraTurnsUsed || 0));
}

/**
 * Start extra turns mode for a match
 * @param {object} match - Match state
 * @param {object} tiebreakerSettings - Tiebreaker settings
 * @returns {object} Updated match state info
 */
function startExtraTurns(match, tiebreakerSettings) {
  const settings = tiebreakerSettings || TIEBREAKER_DEFAULTS;
  
  // Determine inactive player (the one who is NOT currently taking their turn)
  const game = match?.game || {};
  const currentTurn = game.turn || match?.turn;
  const inactivePlayer = currentTurn === 'p1' ? 'p2' : 'p1';
  
  return {
    extraTurnsMode: true,
    extraTurnsRemaining: settings.extraTurns,
    extraTurnsUsed: 0,
    extraTurnsStartPlayer: inactivePlayer, // Inactive player starts extra turns
    tiebreakerActive: true,
    timeExpired: true,
    timeExpiredAt: Date.now()
  };
}

/**
 * Record an extra turn being used
 * @param {object} match - Match state
 * @returns {object} Updated extra turns info
 */
function useExtraTurn(match) {
  const used = (match.extraTurnsUsed || 0) + 1;
  const remaining = Math.max(0, (match.extraTurnsRemaining || 5) - 1);
  
  return {
    extraTurnsUsed: used,
    extraTurnsRemaining: remaining,
    extraTurnsExhausted: remaining === 0
  };
}

/**
 * Determine winner using tiebreaker cascade
 * Called when extra turns are exhausted and no winner yet
 * 
 * @param {object} match - Match state
 * @param {object} game - Game state
 * @returns {object} Tiebreaker result { winnerId, winnerSeat, reason, needsHostDecision }
 */
function determineTiebreakerWinner(match, game) {
  const p1Life = game?.players?.p1?.life ?? game?.p1?.life ?? 20;
  const p2Life = game?.players?.p2?.life ?? game?.p2?.life ?? 20;
  
  const p1Spellbook = getSpellbookCount(game, 'p1');
  const p2Spellbook = getSpellbookCount(game, 'p2');
  
  const p1Id = match?.playerIds?.[0] || match?.p1?.id;
  const p2Id = match?.playerIds?.[1] || match?.p2?.id;
  
  // Death's Door is typically 0 or 1 life in Sorcery TCG
  const DD_THRESHOLD = 1;
  const p1AtDD = p1Life <= DD_THRESHOLD;
  const p2AtDD = p2Life <= DD_THRESHOLD;
  
  // Rule 2: First player at Death's Door loses
  // If one is at DD and the other isn't, the one at DD loses
  if (p1AtDD && !p2AtDD) {
    return {
      winnerId: p2Id,
      winnerSeat: 'p2',
      loserId: p1Id,
      loserSeat: 'p1',
      reason: 'tiebreaker_deaths_door',
      description: 'P1 at Death\'s Door'
    };
  }
  if (p2AtDD && !p1AtDD) {
    return {
      winnerId: p1Id,
      winnerSeat: 'p1',
      loserId: p2Id,
      loserSeat: 'p2',
      reason: 'tiebreaker_deaths_door',
      description: 'P2 at Death\'s Door'
    };
  }
  
  // Rule 3: Player with most life wins
  if (p1Life > p2Life) {
    return {
      winnerId: p1Id,
      winnerSeat: 'p1',
      loserId: p2Id,
      loserSeat: 'p2',
      reason: 'tiebreaker_life',
      description: `P1 has more life (${p1Life} vs ${p2Life})`
    };
  }
  if (p2Life > p1Life) {
    return {
      winnerId: p2Id,
      winnerSeat: 'p2',
      loserId: p1Id,
      loserSeat: 'p1',
      reason: 'tiebreaker_life',
      description: `P2 has more life (${p2Life} vs ${p1Life})`
    };
  }
  
  // Rule 4: Player with most cards in spellbook wins
  if (p1Spellbook > p2Spellbook) {
    return {
      winnerId: p1Id,
      winnerSeat: 'p1',
      loserId: p2Id,
      loserSeat: 'p2',
      reason: 'tiebreaker_spellbook',
      description: `P1 has more cards in spellbook (${p1Spellbook} vs ${p2Spellbook})`
    };
  }
  if (p2Spellbook > p1Spellbook) {
    return {
      winnerId: p2Id,
      winnerSeat: 'p2',
      loserId: p1Id,
      loserSeat: 'p1',
      reason: 'tiebreaker_spellbook',
      description: `P2 has more cards in spellbook (${p2Spellbook} vs ${p1Spellbook})`
    };
  }
  
  // Rule 5: Coin flip - needs host/judge decision
  // For automated resolution, we can do a random coin flip
  // But ideally the host should decide
  return {
    winnerId: null,
    winnerSeat: null,
    loserId: null,
    loserSeat: null,
    reason: 'tiebreaker_coin_flip',
    description: 'All tiebreakers equal - coin flip required',
    needsHostDecision: true
  };
}

/**
 * Perform automated coin flip for tiebreaker
 * @param {object} match - Match state
 * @returns {object} Coin flip result
 */
function performCoinFlip(match) {
  const p1Id = match?.playerIds?.[0] || match?.p1?.id;
  const p2Id = match?.playerIds?.[1] || match?.p2?.id;
  
  const coinResult = Math.random() < 0.5 ? 'p1' : 'p2';
  
  if (coinResult === 'p1') {
    return {
      winnerId: p1Id,
      winnerSeat: 'p1',
      loserId: p2Id,
      loserSeat: 'p2',
      reason: 'tiebreaker_coin_flip',
      description: 'Coin flip: P1 wins',
      coinFlipResult: 'p1'
    };
  } else {
    return {
      winnerId: p2Id,
      winnerSeat: 'p2',
      loserId: p1Id,
      loserSeat: 'p1',
      reason: 'tiebreaker_coin_flip',
      description: 'Coin flip: P2 wins',
      coinFlipResult: 'p2'
    };
  }
}

/**
 * Get count of cards in a player's spellbook (library/deck)
 * @param {object} game - Game state
 * @param {string} seat - 'p1' or 'p2'
 * @returns {number} Card count
 */
function getSpellbookCount(game, seat) {
  if (!game) return 0;
  
  // Try different possible locations for spellbook/library
  const player = game.players?.[seat] || game[seat];
  if (!player) return 0;
  
  // Spellbook might be called library, deck, or spellbook
  const spellbook = player.spellbook || player.library || player.deck;
  if (Array.isArray(spellbook)) return spellbook.length;
  if (typeof spellbook === 'number') return spellbook;
  
  return 0;
}

/**
 * Check if simultaneous death would occur from damage
 * This is used to prevent forced draws in tournaments
 * 
 * @param {object} game - Game state
 * @param {number} p1Damage - Damage to be dealt to P1
 * @param {number} p2Damage - Damage to be dealt to P2
 * @returns {boolean} True if both players would die
 */
function wouldCauseSimultaneousDeath(game, p1Damage, p2Damage) {
  const p1Life = game?.players?.p1?.life ?? game?.p1?.life ?? 20;
  const p2Life = game?.players?.p2?.life ?? game?.p2?.life ?? 20;
  
  const p1WouldDie = p1Life - p1Damage <= 0;
  const p2WouldDie = p2Life - p2Damage <= 0;
  
  return p1WouldDie && p2WouldDie;
}

/**
 * Prevent forced draw by checking if an action would kill both players
 * Returns modified damage values that prevent the draw
 * 
 * @param {object} game - Game state
 * @param {number} p1Damage - Proposed damage to P1
 * @param {number} p2Damage - Proposed damage to P2
 * @param {boolean} preventDraws - Whether to prevent draws
 * @returns {object} { p1Damage, p2Damage, prevented } - Possibly modified damage values
 */
function preventForcedDraw(game, p1Damage, p2Damage, preventDraws = true) {
  if (!preventDraws) {
    return { p1Damage, p2Damage, prevented: false };
  }
  
  if (wouldCauseSimultaneousDeath(game, p1Damage, p2Damage)) {
    // Both would die - prevent the action from causing death
    // The game continues as if the damage didn't happen
    console.log('[Tiebreaker] Prevented forced draw - simultaneous death blocked');
    return { 
      p1Damage: 0, 
      p2Damage: 0, 
      prevented: true,
      reason: 'simultaneous_death_prevented'
    };
  }
  
  return { p1Damage, p2Damage, prevented: false };
}

/**
 * Check if a tieGame request should be blocked in tournament
 * @param {object} match - Match state
 * @param {object} tiebreakerSettings - Tiebreaker settings
 * @returns {boolean} True if tie game should be blocked
 */
function shouldBlockTieGame(match, tiebreakerSettings) {
  // In tournaments with preventForcedDraws, block tie game requests
  if (!match?.tournamentId) return false;
  
  const settings = tiebreakerSettings || getTiebreakerSettings(null);
  return !settings.allowDrawAgreement;
}

/**
 * Calculate match time remaining
 * @param {object} match - Match state
 * @param {object} tiebreakerSettings - Tiebreaker settings
 * @returns {object} { remainingMs, isExpired, expiresAt }
 */
function calculateMatchTimeRemaining(match, tiebreakerSettings) {
  const settings = tiebreakerSettings || TIEBREAKER_DEFAULTS;
  const roundTimeMs = (settings.roundTimeMinutes || 45) * 60 * 1000;
  
  const startedAt = match?.startedAt || match?.createdAt || Date.now();
  const startTime = typeof startedAt === 'number' ? startedAt : new Date(startedAt).getTime();
  const expiresAt = startTime + roundTimeMs;
  const now = Date.now();
  const remainingMs = Math.max(0, expiresAt - now);
  
  return {
    remainingMs,
    isExpired: remainingMs === 0,
    expiresAt,
    roundTimeMs,
    startTime
  };
}

module.exports = {
  TIEBREAKER_DEFAULTS,
  getTiebreakerSettings,
  isInExtraTurns,
  getRemainingExtraTurns,
  startExtraTurns,
  useExtraTurn,
  determineTiebreakerWinner,
  performCoinFlip,
  getSpellbookCount,
  wouldCauseSimultaneousDeath,
  preventForcedDraw,
  shouldBlockTieGame,
  calculateMatchTimeRemaining
};
