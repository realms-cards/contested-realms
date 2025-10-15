/**
 * Card Evaluation Cache Unit Tests
 *
 * Tests for the card evaluation system that enables card-specific
 * understanding in the bot AI.
 *
 * Critical requirements tested:
 * - Evaluation function compilation and validation
 * - Context building from game state
 * - Scoring accuracy and bounds checking
 * - Database and JSON loading
 * - Error handling and fallbacks
 * - Performance characteristics
 */

const { describe, it, expect, beforeEach, vi } = require('vitest');
const {
  CardEvaluationCache,
  buildEvaluationContext,
  evaluateCard,
} = require('../../bots/card-evaluations/loader');

describe('CardEvaluationCache', () => {
  let cache;

  beforeEach(() => {
    cache = new CardEvaluationCache();
  });

  describe('Constructor', () => {
    it('should initialize empty cache', () => {
      expect(cache.evaluations).toBeInstanceOf(Map);
      expect(cache.metadata).toBeInstanceOf(Map);
      expect(cache.evaluations.size).toBe(0);
      expect(cache.loaded).toBe(false);
      expect(cache.errorCount).toBe(0);
    });
  });

  describe('compileEvaluation', () => {
    it('should compile valid evaluation function', () => {
      const fnBody = 'return context.myLife < 10 ? 8.0 : 5.0;';
      const compiledFn = cache.compileEvaluation(fnBody, 'Test Card');

      expect(typeof compiledFn).toBe('function');
    });

    it('should validate function returns a number', () => {
      const fnBody = 'return context.myLife < 10 ? 8.0 : 5.0;';
      const compiledFn = cache.compileEvaluation(fnBody, 'Test Card');

      const testContext = cache.buildTestContext();
      const result = compiledFn(testContext);

      expect(typeof result).toBe('number');
      expect(Number.isFinite(result)).toBe(true);
    });

    it('should validate function returns value in range 0-10', () => {
      const fnBody = 'return 7.5;';
      const compiledFn = cache.compileEvaluation(fnBody, 'Test Card');

      const testContext = cache.buildTestContext();
      const result = compiledFn(testContext);

      expect(result).toBeGreaterThanOrEqual(0);
      expect(result).toBeLessThanOrEqual(10);
    });

    it('should reject function returning out-of-range value', () => {
      const fnBody = 'return 15.0;'; // Out of range

      expect(() => {
        cache.compileEvaluation(fnBody, 'Test Card');
      }).toThrow(/out-of-range/);
    });

    it('should reject function returning invalid value', () => {
      const fnBody = 'return "not a number";';

      expect(() => {
        cache.compileEvaluation(fnBody, 'Test Card');
      }).toThrow(/invalid value/);
    });

    it('should reject function with syntax errors', () => {
      const fnBody = 'return context.myLife <'; // Incomplete expression

      expect(() => {
        cache.compileEvaluation(fnBody, 'Test Card');
      }).toThrow();
    });

    it('should reject empty or null function body', () => {
      expect(() => {
        cache.compileEvaluation('', 'Test Card');
      }).toThrow(/Invalid evaluation function/);

      expect(() => {
        cache.compileEvaluation(null, 'Test Card');
      }).toThrow(/Invalid evaluation function/);
    });

    it('should allow access to all context properties', () => {
      const fnBody = `
        return context.myLife + context.oppLife + context.myMana +
               context.myUnitCount + context.turn;
      `;

      const compiledFn = cache.compileEvaluation(fnBody, 'Test Card');
      const testContext = cache.buildTestContext();
      const result = compiledFn(testContext);

      expect(Number.isFinite(result)).toBe(true);
    });
  });

  describe('buildTestContext', () => {
    it('should create valid test context', () => {
      const context = cache.buildTestContext();

      expect(context).toHaveProperty('myLife');
      expect(context).toHaveProperty('oppLife');
      expect(context).toHaveProperty('myMana');
      expect(context).toHaveProperty('turn');
    });

    it('should have all required properties', () => {
      const context = cache.buildTestContext();

      const requiredProps = [
        'myLife', 'oppLife', 'myMaxLife', 'oppMaxLife',
        'myUnits', 'oppUnits', 'myUnitCount', 'oppUnitCount',
        'myAttackingUnits', 'myBlockingUnits',
        'myTotalATK', 'oppTotalATK',
        'myMana', 'myManaMax', 'oppMana', 'manaLeftover',
        'myHandSize', 'oppHandSize', 'myDeckSize', 'oppDeckSize',
        'turn', 'isMyTurn', 'phase',
        'lethalThreat', 'nearLethal', 'underPressure',
      ];

      for (const prop of requiredProps) {
        expect(context).toHaveProperty(prop);
      }
    });

    it('should use sensible default values', () => {
      const context = cache.buildTestContext();

      expect(context.myLife).toBe(15);
      expect(context.oppLife).toBe(15);
      expect(context.myMana).toBe(5);
      expect(context.turn).toBe(5);
      expect(context.isMyTurn).toBe(true);
    });

    it('should have array properties as arrays', () => {
      const context = cache.buildTestContext();

      expect(Array.isArray(context.myUnits)).toBe(true);
      expect(Array.isArray(context.oppUnits)).toBe(true);
      expect(Array.isArray(context.myAttackingUnits)).toBe(true);
      expect(Array.isArray(context.myBlockingUnits)).toBe(true);
    });

    it('should have boolean threat flags', () => {
      const context = cache.buildTestContext();

      expect(typeof context.lethalThreat).toBe('boolean');
      expect(typeof context.nearLethal).toBe('boolean');
      expect(typeof context.underPressure).toBe('boolean');
    });
  });

  describe('getEvaluation', () => {
    it('should return null for non-existent card', () => {
      const evalFn = cache.getEvaluation('Non-Existent Card');
      expect(evalFn).toBeNull();
    });

    it('should return compiled function for cached card', () => {
      const fnBody = 'return 5.0;';
      const compiledFn = cache.compileEvaluation(fnBody, 'Test Card');
      cache.evaluations.set('Test Card', compiledFn);

      const retrieved = cache.getEvaluation('Test Card');
      expect(retrieved).toBe(compiledFn);
      expect(typeof retrieved).toBe('function');
    });
  });

  describe('hasEvaluation', () => {
    it('should return false for non-existent card', () => {
      expect(cache.hasEvaluation('Non-Existent Card')).toBe(false);
    });

    it('should return true for cached card', () => {
      const fnBody = 'return 5.0;';
      const compiledFn = cache.compileEvaluation(fnBody, 'Test Card');
      cache.evaluations.set('Test Card', compiledFn);

      expect(cache.hasEvaluation('Test Card')).toBe(true);
    });
  });

  describe('getMetadata', () => {
    it('should return null for non-existent card', () => {
      const metadata = cache.getMetadata('Non-Existent Card');
      expect(metadata).toBeNull();
    });

    it('should return metadata for cached card', () => {
      const testMetadata = {
        category: 'minion',
        rulesText: 'Test rules',
        priority: 'high',
        synergies: [],
        antiSynergies: [],
        situational: false,
        complexity: 'simple',
      };

      cache.metadata.set('Test Card', testMetadata);

      const retrieved = cache.getMetadata('Test Card');
      expect(retrieved).toEqual(testMetadata);
    });
  });

  describe('getFallbackScore', () => {
    it('should return minion score for minion category', () => {
      const score = cache.getFallbackScore('minion');
      expect(score).toBe(6.0);
    });

    it('should return spell score for spell category', () => {
      const score = cache.getFallbackScore('spell');
      expect(score).toBe(5.0);
    });

    it('should return removal score for removal category', () => {
      const score = cache.getFallbackScore('removal');
      expect(score).toBe(6.5);
    });

    it('should return default score for unknown category', () => {
      const score = cache.getFallbackScore('unknown_category');
      expect(score).toBe(5.0);
    });

    it('should handle null category', () => {
      const score = cache.getFallbackScore(null);
      expect(score).toBe(5.0);
    });
  });

  describe('getStats', () => {
    it('should return statistics object', () => {
      const stats = cache.getStats();

      expect(stats).toHaveProperty('loaded');
      expect(stats).toHaveProperty('errors');
      expect(stats).toHaveProperty('categories');
    });

    it('should track loaded count correctly', () => {
      const fnBody = 'return 5.0;';
      const compiledFn = cache.compileEvaluation(fnBody, 'Test Card 1');
      cache.evaluations.set('Test Card 1', compiledFn);
      cache.evaluations.set('Test Card 2', compiledFn);

      const stats = cache.getStats();
      expect(stats.loaded).toBe(2);
    });

    it('should track errors correctly', () => {
      cache.errorCount = 3;
      const stats = cache.getStats();
      expect(stats.errors).toBe(3);
    });

    it('should provide category breakdown', () => {
      cache.metadata.set('Card 1', { category: 'minion' });
      cache.metadata.set('Card 2', { category: 'minion' });
      cache.metadata.set('Card 3', { category: 'spell' });

      const stats = cache.getStats();
      expect(stats.categories.minion).toBe(2);
      expect(stats.categories.spell).toBe(1);
    });
  });

  describe('getCategoryStats', () => {
    it('should return empty object for empty cache', () => {
      const categories = cache.getCategoryStats();
      expect(Object.keys(categories).length).toBe(0);
    });

    it('should count categories correctly', () => {
      cache.metadata.set('Card 1', { category: 'minion' });
      cache.metadata.set('Card 2', { category: 'minion' });
      cache.metadata.set('Card 3', { category: 'spell' });
      cache.metadata.set('Card 4', { category: 'removal' });

      const categories = cache.getCategoryStats();

      expect(categories.minion).toBe(2);
      expect(categories.spell).toBe(1);
      expect(categories.removal).toBe(1);
    });
  });
});

describe('buildEvaluationContext', () => {
  it('should build context from game state', () => {
    const mockState = {
      permanents: {},
      board: { sites: {} },
      zones: {
        p1: { hand: [], spellbook: [] },
        p2: { hand: [], spellbook: [] },
      },
      players: {
        p1: { life: 15 },
        p2: { life: 12 },
      },
      turnNumber: 5,
      activePlayer: 'p1',
      phase: 'main',
    };

    const card = { cost: 3, name: 'Test Card' };
    const context = buildEvaluationContext(mockState, 'p1', card);

    expect(context).toHaveProperty('myLife');
    expect(context).toHaveProperty('oppLife');
    expect(context).toHaveProperty('turn');
    expect(context.myLife).toBe(15);
    expect(context.oppLife).toBe(12);
  });

  it('should calculate manaLeftover correctly', () => {
    const mockState = {
      permanents: {},
      board: { sites: {
        '0,0': { owner: 1, tapped: false, card: { name: 'Valley' } },
        '1,0': { owner: 1, tapped: false, card: { name: 'Spire' } },
        '2,0': { owner: 1, tapped: false, card: { name: 'Stream' } },
      } },
      zones: {
        p1: { hand: [], spellbook: [] },
        p2: { hand: [], spellbook: [] },
      },
      players: {
        p1: { life: 20 },
        p2: { life: 20 },
      },
    };

    const card = { cost: 2, name: 'Test Card' };
    const context = buildEvaluationContext(mockState, 'p1', card);

    expect(context.myMana).toBe(3); // 3 untapped sites
    expect(context.manaLeftover).toBe(1); // 3 - 2 = 1
  });

  it('should handle empty game state gracefully', () => {
    const emptyState = {};
    const card = { cost: 0, name: 'Test Card' };

    const context = buildEvaluationContext(emptyState, 'p1', card);

    expect(context.myLife).toBe(20); // Default life
    expect(context.oppLife).toBe(20);
    expect(context.myMana).toBe(0);
    expect(context.myUnitCount).toBe(0);
  });

  it('should detect lethal threat correctly', () => {
    const mockState = {
      permanents: {
        '0,0': [
          { owner: 2, card: { attack: 10 }, tapped: false },
          { owner: 2, card: { attack: 5 }, tapped: false },
        ],
      },
      board: { sites: {} },
      zones: {
        p1: { hand: [], spellbook: [] },
        p2: { hand: [], spellbook: [] },
      },
      players: {
        p1: { life: 12 }, // Opponent has 15 damage, player has 12 life
        p2: { life: 20 },
      },
    };

    const card = { cost: 0, name: 'Test Card' };
    const context = buildEvaluationContext(mockState, 'p1', card);

    expect(context.lethalThreat).toBe(true);
  });

  it('should detect near-lethal correctly', () => {
    const mockState = {
      permanents: {
        '0,0': [
          { owner: 1, card: { attack: 10 }, tapped: false },
          { owner: 1, card: { attack: 8 }, tapped: false },
        ],
      },
      board: { sites: {} },
      zones: {
        p1: { hand: [], spellbook: [] },
        p2: { hand: [], spellbook: [] },
      },
      players: {
        p1: { life: 20 },
        p2: { life: 15 }, // Player has 18 damage, opponent has 15 life
      },
    };

    const card = { cost: 0, name: 'Test Card' };
    const context = buildEvaluationContext(mockState, 'p1', card);

    expect(context.nearLethal).toBe(true);
  });

  it('should count hand sizes correctly', () => {
    const mockState = {
      permanents: {},
      board: { sites: {} },
      zones: {
        p1: {
          hand: [{ name: 'Card 1' }, { name: 'Card 2' }, { name: 'Card 3' }],
          spellbook: [{ name: 'Card 4' }],
        },
        p2: {
          hand: [{ name: 'Card 5' }, { name: 'Card 6' }],
          spellbook: [],
        },
      },
      players: {
        p1: { life: 20 },
        p2: { life: 20 },
      },
    };

    const card = { cost: 0, name: 'Test Card' };
    const context = buildEvaluationContext(mockState, 'p1', card);

    expect(context.myHandSize).toBe(3);
    expect(context.oppHandSize).toBe(2);
    expect(context.myDeckSize).toBe(1);
  });
});

describe('evaluateCard', () => {
  beforeEach(() => {
    // Reset global cache
    const { getCache } = require('../../bots/card-evaluations/loader');
    const cache = getCache();
    cache.evaluations.clear();
    cache.metadata.clear();
  });

  it('should return null for unknown card', () => {
    const context = { myLife: 15, oppLife: 15 };
    const score = evaluateCard('Unknown Card', context);

    expect(score).toBeNull();
  });

  it('should execute evaluation function and return score', () => {
    const { getCache } = require('../../bots/card-evaluations/loader');
    const cache = getCache();

    // Add test evaluation
    const fnBody = 'return context.myLife < 10 ? 8.0 : 5.0;';
    const compiledFn = cache.compileEvaluation(fnBody, 'Test Card');
    cache.evaluations.set('Test Card', compiledFn);

    const context = { myLife: 8 };
    const score = evaluateCard('Test Card', context);

    expect(score).toBe(8.0);
  });

  it('should clamp scores to 0-10 range', () => {
    const { getCache } = require('../../bots/card-evaluations/loader');
    const cache = getCache();

    // Function that tries to return out-of-range (but passes initial validation with test context)
    const fnBody = 'return context.myLife * 10;'; // Could be > 10
    const compiledFn = cache.compileEvaluation(fnBody, 'Test Card');
    cache.evaluations.set('Test Card', compiledFn);

    const context = { myLife: 2 }; // Would return 20
    const score = evaluateCard('Test Card', context);

    expect(score).toBeLessThanOrEqual(10);
    expect(score).toBeGreaterThanOrEqual(0);
  });

  it('should handle evaluation errors gracefully', () => {
    const { getCache } = require('../../bots/card-evaluations/loader');
    const cache = getCache();

    // Function that will throw error (accessing undefined property)
    const fnBody = 'return context.nonExistentProperty.value;';
    const testContext = { myLife: 15, oppLife: 15 }; // Passes basic validation

    // Manually add function without validation (simulates corrupted cache)
    const unsafeFn = new Function('context', fnBody);
    cache.evaluations.set('Error Card', unsafeFn);

    const context = { myLife: 15 };
    const score = evaluateCard('Error Card', context);

    expect(score).toBeNull(); // Should return null on error
  });

  it('should handle NaN and Infinity', () => {
    const { getCache } = require('../../bots/card-evaluations/loader');
    const cache = getCache();

    // Function that could return NaN
    const fnBody = 'return context.myLife / (context.oppLife - 15);'; // Division by zero
    const testContext = { myLife: 15, oppLife: 15 };
    const unsafeFn = new Function('context', fnBody);
    cache.evaluations.set('NaN Card', unsafeFn);

    const context = { myLife: 10, oppLife: 15 };
    const score = evaluateCard('NaN Card', context);

    // Should return null for invalid numeric values
    if (score !== null) {
      expect(Number.isFinite(score)).toBe(true);
    }
  });
});

describe('Situational Evaluation Examples', () => {
  beforeEach(() => {
    const { getCache } = require('../../bots/card-evaluations/loader');
    const cache = getCache();
    cache.evaluations.clear();
    cache.metadata.clear();
  });

  describe('Divine Healing (Healing Card)', () => {
    beforeEach(() => {
      const { getCache } = require('../../bots/card-evaluations/loader');
      const cache = getCache();

      // Divine Healing: "You gain 7 life"
      const fnBody = 'return context.myLife < 10 ? 8.0 : (context.myLife < 15 ? 4.0 : 1.0);';
      const compiledFn = cache.compileEvaluation(fnBody, 'Divine Healing');
      cache.evaluations.set('Divine Healing', compiledFn);
    });

    it('should value healing highly when at low life', () => {
      const context = { myLife: 5, oppLife: 15 };
      const score = evaluateCard('Divine Healing', context);

      expect(score).toBeGreaterThanOrEqual(7.5);
    });

    it('should value healing moderately at mid life', () => {
      const context = { myLife: 12, oppLife: 15 };
      const score = evaluateCard('Divine Healing', context);

      expect(score).toBeGreaterThanOrEqual(3.5);
      expect(score).toBeLessThan(5.0);
    });

    it('should value healing poorly at high life', () => {
      const context = { myLife: 19, oppLife: 15 };
      const score = evaluateCard('Divine Healing', context);

      expect(score).toBeLessThanOrEqual(2.0);
    });
  });

  describe('Overpower (Combat Trick)', () => {
    beforeEach(() => {
      const { getCache } = require('../../bots/card-evaluations/loader');
      const cache = getCache();

      // Overpower: "+3/+0 to attacking minion"
      const fnBody = 'return context.myAttackingUnits.length > 0 ? 7.0 : 1.0;';
      const compiledFn = cache.compileEvaluation(fnBody, 'Overpower');
      cache.evaluations.set('Overpower', compiledFn);
    });

    it('should value combat trick highly with attackers', () => {
      const context = {
        myAttackingUnits: [{ name: 'Attacker 1' }, { name: 'Attacker 2' }],
      };
      const score = evaluateCard('Overpower', context);

      expect(score).toBeGreaterThanOrEqual(6.5);
    });

    it('should value combat trick poorly without attackers', () => {
      const context = { myAttackingUnits: [] };
      const score = evaluateCard('Overpower', context);

      expect(score).toBeLessThanOrEqual(2.0);
    });
  });

  describe('Flood (Board Clear)', () => {
    beforeEach(() => {
      const { getCache } = require('../../bots/card-evaluations/loader');
      const cache = getCache();

      // Flood: "Destroy all minions"
      const fnBody = `
        if (context.oppUnitCount === 0) return 0.0;
        const netLoss = context.myUnitCount - context.oppUnitCount;
        if (netLoss >= 2) return 9.0;
        if (netLoss >= 0) return 6.0;
        return 3.0;
      `;
      const compiledFn = cache.compileEvaluation(fnBody, 'Flood');
      cache.evaluations.set('Flood', compiledFn);
    });

    it('should value board clear highly when behind on board', () => {
      const context = { myUnitCount: 1, oppUnitCount: 5 };
      const score = evaluateCard('Flood', context);

      expect(score).toBeGreaterThanOrEqual(8.5);
    });

    it('should value board clear moderately when even', () => {
      const context = { myUnitCount: 3, oppUnitCount: 3 };
      const score = evaluateCard('Flood', context);

      expect(score).toBeGreaterThanOrEqual(5.5);
      expect(score).toBeLessThan(7.0);
    });

    it('should value board clear poorly when ahead', () => {
      const context = { myUnitCount: 5, oppUnitCount: 1 };
      const score = evaluateCard('Flood', context);

      expect(score).toBeLessThan(4.0);
    });

    it('should value board clear at zero when opponent has no units', () => {
      const context = { myUnitCount: 2, oppUnitCount: 0 };
      const score = evaluateCard('Flood', context);

      expect(score).toBe(0.0);
    });
  });
});

describe('Performance', () => {
  it('should compile 100 functions in under 100ms', () => {
    const cache = new CardEvaluationCache();
    const fnBody = 'return context.myLife < 10 ? 8.0 : 5.0;';

    const startTime = performance.now();
    for (let i = 0; i < 100; i++) {
      cache.compileEvaluation(fnBody, `Card ${i}`);
    }
    const duration = performance.now() - startTime;

    expect(duration).toBeLessThan(100);
  });

  it('should execute 1000 evaluations in under 10ms', () => {
    const cache = new CardEvaluationCache();
    const fnBody = 'return context.myLife < 10 ? 8.0 : 5.0;';
    const compiledFn = cache.compileEvaluation(fnBody, 'Test Card');
    cache.evaluations.set('Test Card', compiledFn);

    const context = { myLife: 15 };

    const startTime = performance.now();
    for (let i = 0; i < 1000; i++) {
      evaluateCard('Test Card', context);
    }
    const duration = performance.now() - startTime;

    expect(duration).toBeLessThan(10);
  });

  it('should perform O(1) lookup for evaluation functions', () => {
    const cache = new CardEvaluationCache();
    const fnBody = 'return 5.0;';

    // Add 100 cards to cache
    for (let i = 0; i < 100; i++) {
      const compiledFn = cache.compileEvaluation(fnBody, `Card ${i}`);
      cache.evaluations.set(`Card ${i}`, compiledFn);
    }

    const startTime = performance.now();
    for (let i = 0; i < 1000; i++) {
      cache.getEvaluation('Card 50');
    }
    const duration = performance.now() - startTime;

    expect(duration).toBeLessThan(5);
  });
});

describe('Integration', () => {
  it('should handle full workflow: compile -> cache -> evaluate', () => {
    const cache = new CardEvaluationCache();

    // Compile
    const fnBody = 'return context.myLife < 10 ? 9.0 : (context.manaLeftover > 2 ? 6.0 : 4.0);';
    const compiledFn = cache.compileEvaluation(fnBody, 'Complex Card');

    // Cache
    cache.evaluations.set('Complex Card', compiledFn);
    cache.metadata.set('Complex Card', {
      category: 'minion',
      rulesText: 'Test rules',
      priority: 'situational',
      synergies: ['low_life'],
      antiSynergies: [],
      situational: true,
      complexity: 'moderate',
    });

    // Evaluate low life scenario
    const lowLifeContext = { myLife: 8, manaLeftover: 3 };
    const lowLifeScore = evaluateCard('Complex Card', lowLifeContext);
    expect(lowLifeScore).toBe(9.0);

    // Evaluate high mana scenario
    const highManaContext = { myLife: 15, manaLeftover: 4 };
    const highManaScore = evaluateCard('Complex Card', highManaContext);
    expect(highManaScore).toBe(6.0);

    // Evaluate low mana scenario
    const lowManaContext = { myLife: 15, manaLeftover: 1 };
    const lowManaScore = evaluateCard('Complex Card', lowManaContext);
    expect(lowManaScore).toBe(4.0);

    // Verify metadata
    const metadata = cache.getMetadata('Complex Card');
    expect(metadata.category).toBe('minion');
    expect(metadata.situational).toBe(true);
    expect(metadata.synergies).toContain('low_life');
  });

  it('should maintain cache statistics correctly', () => {
    const cache = new CardEvaluationCache();

    cache.evaluations.set('Card 1', () => 5.0);
    cache.metadata.set('Card 1', { category: 'minion' });

    cache.evaluations.set('Card 2', () => 6.0);
    cache.metadata.set('Card 2', { category: 'spell' });

    cache.evaluations.set('Card 3', () => 7.0);
    cache.metadata.set('Card 3', { category: 'minion' });

    cache.errorCount = 2;

    const stats = cache.getStats();

    expect(stats.loaded).toBe(3);
    expect(stats.errors).toBe(2);
    expect(stats.categories.minion).toBe(2);
    expect(stats.categories.spell).toBe(1);
  });
});
