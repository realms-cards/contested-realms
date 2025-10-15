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
};
