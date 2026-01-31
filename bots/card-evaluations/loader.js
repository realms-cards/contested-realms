// Card Evaluation Cache Loader
// Loads and manages LLM-generated card evaluation functions
// Used by bot engine to evaluate cards based on game context

const fs = require('fs');
const path = require('path');

/**
 * Card evaluation cache
 * Maps card name → compiled evaluation function
 */
class CardEvaluationCache {
  constructor() {
    this.evaluations = new Map();
    this.metadata = new Map();
    this.fallbackScores = new Map();
    this.loaded = false;
    this.errorCount = 0;
  }

  /**
   * Load evaluations from JSON file
   * @param {string} filePath - Path to card-evaluations.json
   * @returns {object} Load statistics
   */
  load(filePath) {
    try {
      const absPath = path.isAbsolute(filePath)
        ? filePath
        : path.join(process.cwd(), filePath);

      if (!fs.existsSync(absPath)) {
        console.warn(`[CardEval] Cache file not found: ${absPath}`);
        return { loaded: 0, errors: 0, cached: false };
      }

      const raw = fs.readFileSync(absPath, 'utf8');
      const data = JSON.parse(raw);

      if (!data.cards || typeof data.cards !== 'object') {
        console.error('[CardEval] Invalid cache format: missing cards object');
        return { loaded: 0, errors: 0, cached: false };
      }

      let loaded = 0;
      let errors = 0;

      for (const [cardName, cardData] of Object.entries(data.cards)) {
        try {
          // Compile evaluation function
          const evalFn = this.compileEvaluation(cardData.evaluationFunction, cardName);

          // Store compiled function
          this.evaluations.set(cardName, evalFn);

          // Store metadata
          this.metadata.set(cardName, {
            category: cardData.category || 'unknown',
            rulesText: cardData.rulesText || '',
            priority: cardData.priority || '',
            synergies: cardData.synergies || [],
            antiSynergies: cardData.antiSynergies || [],
            situational: cardData.situational !== false,
            complexity: cardData.complexity || 'simple',
          });

          loaded++;
        } catch (e) {
          console.warn(`[CardEval] Failed to compile ${cardName}:`, e.message);
          errors++;
          this.errorCount++;
        }
      }

      this.loaded = true;

      console.log(`[CardEval] Loaded ${loaded} card evaluations (${errors} errors)`);

      return {
        loaded,
        errors,
        cached: true,
        version: data.version || 'unknown',
      };
    } catch (e) {
      console.error('[CardEval] Failed to load cache:', e.message);
      return { loaded: 0, errors: 0, cached: false, error: e.message };
    }
  }

  /**
   * Load evaluations from database (async)
   * @returns {Promise<object>} Load statistics
   */
  async loadFromDatabase() {
    try {
      // Dynamically require Prisma to avoid dependency issues
      const { PrismaClient } = require('@prisma/client');
      const prisma = new PrismaClient();

      // Query all validated evaluations
      const evaluations = await prisma.cardEvaluation.findMany({
        where: { validationStatus: 'validated' },
        include: { card: { include: { meta: true } } }
      });

      await prisma.$disconnect();

      let loaded = 0;
      let errors = 0;

      for (const evaluation of evaluations) {
        const cardName = evaluation.card.name;
        try {
          // Compile evaluation function
          const evalFn = this.compileEvaluation(evaluation.evaluationFunction, cardName);

          // Store compiled function
          this.evaluations.set(cardName, evalFn);

          // Store metadata
          const meta = evaluation.card.meta[0];
          this.metadata.set(cardName, {
            category: evaluation.category || 'unknown',
            rulesText: meta?.rulesText || '',
            priority: evaluation.priority || '',
            synergies: evaluation.synergies || [],
            antiSynergies: evaluation.antiSynergies || [],
            situational: evaluation.situational !== false,
            complexity: evaluation.complexity || 'simple',
          });

          loaded++;
        } catch (e) {
          console.warn(`[CardEval] Failed to compile ${cardName}:`, e.message);
          errors++;
          this.errorCount++;
        }
      }

      this.loaded = true;

      console.log(`[CardEval] Loaded ${loaded} card evaluations from database (${errors} errors)`);

      return {
        loaded,
        errors,
        cached: true,
        source: 'database',
      };
    } catch (e) {
      console.error('[CardEval] Failed to load from database:', e.message);
      return { loaded: 0, errors: 0, cached: false, error: e.message };
    }
  }

  /**
   * Compile evaluation function from string
   * @param {string} fnBody - JavaScript function body
   * @param {string} cardName - Card name (for error reporting)
   * @returns {Function} Compiled evaluation function
   */
  compileEvaluation(fnBody, cardName) {
    if (!fnBody || typeof fnBody !== 'string') {
      throw new Error('Invalid evaluation function body');
    }

    // Create function with context parameter
    // Function body should be a return statement: "return myLife < 10 ? 8.0 : 1.0;"
    try {
      const fn = new Function('context', fnBody);

      // Validate function with test context
      const testContext = this.buildTestContext();
      const result = fn(testContext);

      // Validate return value
      if (typeof result !== 'number' || !isFinite(result)) {
        throw new Error(`Function returned invalid value: ${result}`);
      }

      if (result < 0 || result > 10) {
        throw new Error(`Function returned out-of-range value: ${result}`);
      }

      return fn;
    } catch (e) {
      throw new Error(`Compilation error for ${cardName}: ${e.message}`);
    }
  }

  /**
   * Build test context for validation
   * @returns {object} Test context
   */
  buildTestContext() {
    return {
      myLife: 15,
      oppLife: 15,
      myMaxLife: 20,
      oppMaxLife: 20,
      myUnits: [],
      oppUnits: [],
      myUnitCount: 0,
      oppUnitCount: 0,
      myAttackingUnits: [],
      myBlockingUnits: [],
      myTotalATK: 0,
      oppTotalATK: 0,
      myMana: 5,
      myManaMax: 5,
      oppMana: 5,
      manaLeftover: 2,
      myHandSize: 5,
      oppHandSize: 5,
      myDeckSize: 30,
      oppDeckSize: 30,
      turn: 5,
      isMyTurn: true,
      phase: 'main',
      lethalThreat: false,
      nearLethal: false,
      underPressure: false,
    };
  }

  /**
   * Get card evaluation function
   * @param {string} cardName - Card name
   * @returns {Function|null} Evaluation function or null if not cached
   */
  getEvaluation(cardName) {
    return this.evaluations.get(cardName) || null;
  }

  /**
   * Get card metadata
   * @param {string} cardName - Card name
   * @returns {object|null} Metadata or null if not cached
   */
  getMetadata(cardName) {
    return this.metadata.get(cardName) || null;
  }

  /**
   * Check if card has cached evaluation
   * @param {string} cardName - Card name
   * @returns {boolean}
   */
  hasEvaluation(cardName) {
    return this.evaluations.has(cardName);
  }

  /**
   * Get cache statistics
   * @returns {object} Statistics
   */
  getStats() {
    return {
      loaded: this.evaluations.size,
      errors: this.errorCount,
      categories: this.getCategoryStats(),
    };
  }

  /**
   * Get category distribution
   * @returns {object} Category counts
   */
  getCategoryStats() {
    const categories = {};
    for (const meta of this.metadata.values()) {
      categories[meta.category] = (categories[meta.category] || 0) + 1;
    }
    return categories;
  }

  /**
   * Get fallback score for category
   * @param {string} category - Card category
   * @returns {number} Default score
   */
  getFallbackScore(category) {
    const defaults = {
      minion: 6.0,
      spell: 5.0,
      relic: 5.0,
      structure: 5.0,
      healing: 4.0,
      combat_trick: 5.0,
      board_clear: 6.0,
      draw: 5.5,
      removal: 6.5,
      unknown: 5.0,
    };

    return defaults[category] || 5.0;
  }
}

/**
 * Build evaluation context from game state
 * @param {object} state - Game state from bot engine
 * @param {string} seat - Bot's seat ('p1' or 'p2')
 * @param {object} card - Card being evaluated
 * @returns {object} Evaluation context
 */
function buildEvaluationContext(state, seat, card) {
  const opp = seat === 'p1' ? 'p2' : 'p1';

  // Extract avatar info
  const myAvatar = locateAvatar(state, seat);
  const oppAvatar = locateAvatar(state, opp);

  const myLife = myAvatar ? (myAvatar.life || 20) : 20;
  const oppLife = oppAvatar ? (oppAvatar.life || 20) : 20;

  // Extract units
  const myUnits = getUnitsForSeat(state, seat);
  const oppUnits = getUnitsForSeat(state, opp);

  const myAttackingUnits = myUnits.filter(u => !u.tapped && (u.atk || 0) > 0);
  const myBlockingUnits = myUnits.filter(u => !u.tapped);

  const myTotalATK = myUnits.reduce((sum, u) => sum + (u.atk || 0), 0);
  const oppTotalATK = oppUnits.reduce((sum, u) => sum + (u.atk || 0), 0);

  // Extract mana info
  const myMana = countUntappedMana(state, seat);
  const myManaMax = countOwnedManaSites(state, seat);
  const oppMana = countUntappedMana(state, opp);

  const cardCost = getCardManaCost(card);
  const manaLeftover = myMana - cardCost;

  // Extract hand/deck sizes
  const myHandSize = (state.zones && state.zones[seat] && state.zones[seat].hand || []).length;
  const oppHandSize = (state.zones && state.zones[opp] && state.zones[opp].hand || []).length;
  const myDeckSize = (state.zones && state.zones[seat] && state.zones[seat].spellbook || []).length;
  const oppDeckSize = (state.zones && state.zones[opp] && state.zones[opp].spellbook || []).length;

  // Turn and phase
  const turn = state.turnNumber || 0;
  const isMyTurn = state.activePlayer === seat;
  const phase = state.phase || 'main';

  // Threat assessment
  const lethalThreat = oppTotalATK >= myLife;
  const nearLethal = myTotalATK >= oppLife;
  const underPressure = oppUnits.length > myUnits.length + 2;

  return {
    myLife,
    oppLife,
    myMaxLife: 20,
    oppMaxLife: 20,
    myUnits,
    oppUnits,
    myUnitCount: myUnits.length,
    oppUnitCount: oppUnits.length,
    myAttackingUnits,
    myBlockingUnits,
    myTotalATK,
    oppTotalATK,
    myMana,
    myManaMax,
    oppMana,
    manaLeftover,
    myHandSize,
    oppHandSize,
    myDeckSize,
    oppDeckSize,
    turn,
    isMyTurn,
    phase,
    lethalThreat,
    nearLethal,
    underPressure,
  };
}

// Helper functions (would normally be imported from bot engine)
function locateAvatar(state, seat) {
  if (!state || !state.permanents) return null;
  for (const cell of Object.keys(state.permanents)) {
    const stack = state.permanents[cell];
    if (!Array.isArray(stack)) continue;
    for (const perm of stack) {
      if (perm && perm.seat === seat && (perm.type || '').toLowerCase().includes('avatar')) {
        return { ...perm, position: parsePosition(cell) };
      }
    }
  }
  return null;
}

function getUnitsForSeat(state, seat) {
  const units = [];
  if (!state || !state.permanents) return units;

  for (const cell of Object.keys(state.permanents)) {
    const stack = state.permanents[cell];
    if (!Array.isArray(stack)) continue;
    for (const perm of stack) {
      if (perm && perm.seat === seat && !isAvatar(perm)) {
        units.push({
          name: perm.card?.name || 'Unknown',
          atk: perm.atk || 0,
          hp: perm.hp || 0,
          keywords: perm.keywords || [],
          tapped: perm.tapped === true,
          canAttack: !perm.tapped && (perm.atk || 0) > 0,
          canBlock: !perm.tapped,
        });
      }
    }
  }

  return units;
}

function isAvatar(perm) {
  return perm && (perm.type || '').toLowerCase().includes('avatar');
}

function countUntappedMana(state, seat) {
  let mana = 0;
  if (!state || !state.board || !state.board.sites) return mana;

  for (const cell of Object.keys(state.board.sites)) {
    const site = state.board.sites[cell];
    if (site && site.owner === seat && site.tapped !== true) {
      mana++;
    }
  }

  // Add mana providers (units with mana ability)
  if (state.permanents) {
    for (const cell of Object.keys(state.permanents)) {
      const stack = state.permanents[cell];
      if (!Array.isArray(stack)) continue;
      for (const perm of stack) {
        if (perm && perm.seat === seat && perm.providesMana && perm.tapped !== true) {
          mana++;
        }
      }
    }
  }

  return mana;
}

function countOwnedManaSites(state, seat) {
  let count = 0;
  if (!state || !state.board || !state.board.sites) return count;

  for (const site of Object.values(state.board.sites)) {
    if (site && site.owner === seat) {
      count++;
    }
  }

  return count;
}

function getCardManaCost(card) {
  if (!card) return 0;
  if (typeof card.cost === 'number') return card.cost;
  if (card.manaCost && typeof card.manaCost === 'number') return card.manaCost;
  return 0;
}

function parsePosition(cellKey) {
  const [r, c] = cellKey.split(',').map(Number);
  return { r, c };
}

// =============================================================================
// Card Lookup Table - unified metadata with winrates, power tiers, keywords
// =============================================================================

let cardLookup = null;

/**
 * Load the unified card lookup table
 * @param {string} [filePath] - Optional path to card-lookup.json
 * @returns {object|null} The lookup table or null
 */
function loadCardLookup(filePath) {
  if (cardLookup) return cardLookup;

  const absPath = filePath
    ? (path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath))
    : path.join(process.cwd(), 'data', 'bots', 'card-lookup.json');

  try {
    if (!fs.existsSync(absPath)) {
      console.warn(`[CardEval] Card lookup not found: ${absPath}`);
      return null;
    }
    const raw = JSON.parse(fs.readFileSync(absPath, 'utf8'));
    cardLookup = raw.cards || {};
    console.log(`[CardEval] Loaded card lookup: ${Object.keys(cardLookup).length} cards`);
    return cardLookup;
  } catch (e) {
    console.warn(`[CardEval] Failed to load card lookup:`, e.message);
    return null;
  }
}

/**
 * Get card lookup entry
 * @param {string} cardName
 * @returns {object|null}
 */
function getCardLookup(cardName) {
  if (!cardLookup) loadCardLookup();
  return (cardLookup && cardLookup[cardName]) || null;
}

/**
 * Get power tier (1=premium, 5=weak, 3=default)
 * @param {string} cardName
 * @returns {number}
 */
function getCardPowerTier(cardName) {
  const entry = getCardLookup(cardName);
  return entry ? (entry.powerTier || 3) : 3;
}

/**
 * Get production winrate
 * @param {string} cardName
 * @returns {number|null}
 */
function getWinRate(cardName) {
  const entry = getCardLookup(cardName);
  return entry ? (entry.winRate || null) : null;
}

// Lazy-loaded name→type map from cards_raw.json for fallback type detection
let _cardTypeMap = null;
function _getCardTypeMap() {
  if (_cardTypeMap) return _cardTypeMap;
  _cardTypeMap = {};
  try {
    const rawPath = path.join(__dirname, '..', '..', 'data', 'cards_raw.json');
    if (fs.existsSync(rawPath)) {
      const cards = JSON.parse(fs.readFileSync(rawPath, 'utf8'));
      for (const c of cards) {
        const name = c && c.name;
        const type = c?.guardian?.type || (c?.sets?.[0]?.metadata?.type) || null;
        if (name && type) _cardTypeMap[name.toLowerCase()] = type;
      }
      console.log(`[CardEval] Loaded card type map: ${Object.keys(_cardTypeMap).length} cards from cards_raw.json`);
    }
  } catch (e) {
    console.warn('[CardEval] Failed to load card type map:', e.message);
  }
  return _cardTypeMap;
}

/**
 * Look up card type by name from cards_raw.json
 * @param {string} cardName
 * @returns {string|null} Raw type string or null
 */
function lookupCardTypeByName(cardName) {
  if (!cardName) return null;
  const map = _getCardTypeMap();
  return map[cardName.toLowerCase()] || null;
}

/**
 * Normalize card type to canonical form.
 * Falls back to cards_raw.json lookup if card.type is missing.
 * @param {object} card - Card object with type field
 * @returns {string} One of: site, minion, magic, aura, artifact, avatar, unknown
 */
function getCardType(card) {
  if (!card) return 'unknown';
  let rawType = card.type ? String(card.type) : null;
  // Fallback: look up from cards_raw.json by name
  if (!rawType && card.name) {
    rawType = lookupCardTypeByName(card.name);
  }
  if (!rawType) return 'unknown';
  const t = rawType.toLowerCase();
  if (t.includes('site')) return 'site';
  if (t.includes('avatar')) return 'avatar';
  if (t.includes('minion') || t.includes('unit')) return 'minion';
  if (t.includes('aura') || t.includes('enchantment')) return 'aura';
  if (t.includes('artifact') || t.includes('relic') || t.includes('equipment')) return 'artifact';
  if (t.includes('magic') || t.includes('sorcery')) return 'magic';
  return 'unknown';
}

/**
 * Get keyword-based score adjustments for a card
 * @param {object} card - Card object
 * @returns {number} Keyword bonus score
 */
function getKeywordBonuses(card) {
  const lookup = getCardLookup(card && card.name);
  const keywords = (lookup && lookup.keywords) || [];
  const rulesText = (card && card.text) || (lookup && lookup.rulesText) || '';
  const text = rulesText.toLowerCase();

  let bonus = 0;

  // Evasion keywords
  if (keywords.includes('airborne') || text.includes('airborne')) bonus += 1.5;
  if (keywords.includes('stealth') || text.includes('stealth')) bonus += 1.0;
  if (keywords.includes('burrow') || text.includes('burrow')) bonus += 0.8;
  if (keywords.includes('voidwalk') || text.includes('voidwalk')) bonus += 1.0;

  // Combat keywords
  if (keywords.includes('lethal') || text.includes('lethal')) bonus += 2.0;
  if (keywords.includes('ranged') || text.includes('ranged')) bonus += 1.2;
  if (keywords.includes('initiative') || text.includes('initiative')) bonus += 1.0;

  // Defensive keywords
  if (keywords.includes('defender') || text.includes('defender')) bonus += 0.5;
  if (keywords.includes('reach') || text.includes('reach')) bonus += 0.8;
  if (keywords.includes('ward') || text.includes('ward')) bonus += 1.5;
  if (keywords.includes('guardian') || text.includes('guardian')) bonus += 0.8;

  // Value keywords
  if (keywords.includes('genesis') || text.includes('genesis')) bonus += 1.5;
  if (keywords.includes('lifesteal') || text.includes('lifesteal')) bonus += 1.0;
  if (keywords.includes('dredge') || text.includes('dredge')) bonus += 0.5;

  // Movement bonus
  if (text.includes('movement +')) bonus += 0.5;

  return bonus;
}

/**
 * Get winrate-based bonus for scoring
 * Maps power tiers to score bonuses used in the engine
 * @param {string} cardName
 * @returns {number} Score bonus (-2.0 to +3.0)
 */
function getWinrateBonus(cardName) {
  const tier = getCardPowerTier(cardName);
  const tierBonuses = {
    1: 3.0,   // Premium cards
    2: 1.5,   // Above average
    3: 0.0,   // Average (no bonus)
    4: -1.0,  // Below average
    5: -2.0,  // Weak cards
  };
  return tierBonuses[tier] || 0;
}

/**
 * Resolver-aware bonus scoring for cards with custom resolvers.
 * Cards with interactive effects (tutors, card advantage, disruption)
 * get additional score reflecting their actual gameplay impact.
 * @param {string} cardName
 * @returns {number} Resolver bonus (0 to +2.5)
 */
const RESOLVER_BONUSES = {
  // Spell resolvers — scored by effect type
  "browse":             { bonus: 2.5, tag: "card_advantage" },
  "common sense":       { bonus: 2.0, tag: "tutor" },
  "call to war":        { bonus: 2.0, tag: "tutor" },
  "searing truth":      { bonus: 1.5, tag: "disruption" },
  "accusation":         { bonus: 1.0, tag: "disruption" },
  "earthquake":         { bonus: 2.0, tag: "board_wipe" },
  "black mass":         { bonus: 1.5, tag: "sacrifice" },
  "demonic contract":   { bonus: 1.5, tag: "card_advantage" },
  "dhol chants":        { bonus: 1.0, tag: "card_advantage" },
  "atlantean fate":     { bonus: 1.0, tag: "board_control" },
  "doomsday cult":      { bonus: 1.0, tag: "sacrifice" },
  "chaos twister":      { bonus: 0.5, tag: "minigame" },
  "raise dead":         { bonus: 1.5, tag: "recursion" },
  // Minion resolvers — scored by ETB value
  "pith imp":           { bonus: 1.5, tag: "disruption" },
  "highland princess":  { bonus: 1.5, tag: "token_gen" },
  "assorted animals":   { bonus: 1.0, tag: "token_gen" },
  "frontier settlers":  { bonus: 1.0, tag: "token_gen" },
  "pigs of the sounder":{ bonus: 0.8, tag: "token_gen" },
  "headless haunt":     { bonus: 0.5, tag: "movement" },
  "lilith":             { bonus: 2.0, tag: "demon_summon" },
  "mephistopheles":     { bonus: 2.5, tag: "avatar_upgrade" },
  "legion of gall":     { bonus: 1.5, tag: "disruption" },
  "pathfinder":         { bonus: 1.0, tag: "movement" },
};

function getResolverBonus(cardName) {
  if (!cardName) return 0;
  const key = cardName.toLowerCase();
  const entry = RESOLVER_BONUSES[key];
  return entry ? entry.bonus : 0;
}

/**
 * Get the resolver tag for a card (e.g., "card_advantage", "tutor", "disruption").
 * Returns null if the card has no resolver.
 * @param {string} cardName
 * @returns {string|null}
 */
function getResolverTag(cardName) {
  if (!cardName) return null;
  const key = cardName.toLowerCase();
  const entry = RESOLVER_BONUSES[key];
  return entry ? entry.tag : null;
}

/**
 * Check if a card has a custom resolver
 * @param {string} cardName
 * @returns {boolean}
 */
function hasResolver(cardName) {
  if (!cardName) return false;
  return cardName.toLowerCase() in RESOLVER_BONUSES;
}

// Singleton instance
let globalCache = null;

/**
 * Get or create global card evaluation cache
 * @param {string} filePath - Optional path to cache file
 * @returns {CardEvaluationCache}
 */
function getCache(filePath = null) {
  if (!globalCache) {
    globalCache = new CardEvaluationCache();

    if (filePath) {
      globalCache.load(filePath);
    } else {
      // Try default location
      const defaultPath = path.join(process.cwd(), 'data', 'cards', 'card-evaluations.json');
      if (fs.existsSync(defaultPath)) {
        globalCache.load(defaultPath);
      }
    }
  }

  return globalCache;
}

/**
 * Initialize cache from database (async)
 * Call this to load from database instead of JSON
 * @returns {Promise<CardEvaluationCache>}
 */
async function initCacheFromDatabase() {
  if (!globalCache) {
    globalCache = new CardEvaluationCache();
    await globalCache.loadFromDatabase();
  }
  return globalCache;
}

/**
 * Evaluate a card in context
 * @param {string} cardName - Card name
 * @param {object} context - Evaluation context
 * @returns {number} Score 0-10, or null if no evaluation available
 */
function evaluateCard(cardName, context) {
  const cache = getCache();

  const evalFn = cache.getEvaluation(cardName);
  if (!evalFn) {
    return null; // No evaluation available
  }

  try {
    const score = evalFn(context);

    // Clamp to valid range
    if (typeof score !== 'number' || !isFinite(score)) {
      return null;
    }

    return Math.max(0, Math.min(10, score));
  } catch (e) {
    console.warn(`[CardEval] Evaluation error for ${cardName}:`, e.message);
    return null;
  }
}

module.exports = {
  CardEvaluationCache,
  getCache,
  initCacheFromDatabase,
  buildEvaluationContext,
  evaluateCard,
  // Card lookup table functions
  loadCardLookup,
  getCardLookup,
  getCardPowerTier,
  getWinRate,
  getCardType,
  lookupCardTypeByName,
  getKeywordBonuses,
  getWinrateBonus,
  // Resolver awareness
  getResolverBonus,
  getResolverTag,
  hasResolver,
};
