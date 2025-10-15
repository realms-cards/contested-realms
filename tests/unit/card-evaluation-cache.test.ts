/**
 * Unit tests for Card Evaluation Cache
 * Tests the loader, compilation, validation, and evaluation of LLM-generated card functions
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';

// Mock Prisma to avoid database dependency in unit tests
vi.mock('@prisma/client', () => ({
  PrismaClient: vi.fn(() => ({
    cardEvaluation: {
      findMany: vi.fn(),
    },
    $disconnect: vi.fn(),
  })),
}));

// Import after mocks
const loaderPath = path.join(process.cwd(), 'bots', 'card-evaluations', 'loader.js');
const loader = require(loaderPath);

describe('CardEvaluationCache', () => {
  let cache: any;

  beforeEach(() => {
    cache = new loader.CardEvaluationCache();
  });

  describe('Construction', () => {
    it('should initialize with empty state', () => {
      expect(cache.evaluations.size).toBe(0);
      expect(cache.metadata.size).toBe(0);
      expect(cache.loaded).toBe(false);
      expect(cache.errorCount).toBe(0);
    });
  });

  describe('compileEvaluation', () => {
    it('should compile valid evaluation function', () => {
      const fnBody = 'return context.myLife < 10 ? 8.0 : 5.0;';
      const fn = cache.compileEvaluation(fnBody, 'Test Card');

      expect(typeof fn).toBe('function');

      const testContext = cache.buildTestContext();
      const result = fn(testContext);

      expect(typeof result).toBe('number');
      expect(result).toBeGreaterThanOrEqual(0);
      expect(result).toBeLessThanOrEqual(10);
    });

    it('should validate return value is a number', () => {
      const fnBody = 'return "not a number";';

      expect(() => {
        cache.compileEvaluation(fnBody, 'Bad Card');
      }).toThrow(/invalid value/i);
    });

    it('should validate return value is finite', () => {
      const fnBody = 'return Infinity;';

      expect(() => {
        cache.compileEvaluation(fnBody, 'Infinite Card');
      }).toThrow(/invalid value/i);
    });

    it('should validate return value is in range [0, 10]', () => {
      const fnBody = 'return 15;';

      expect(() => {
        cache.compileEvaluation(fnBody, 'Out of Range Card');
      }).toThrow(/out-of-range/i);
    });

    it('should handle syntax errors gracefully', () => {
      const fnBody = 'return context.myLife <';

      expect(() => {
        cache.compileEvaluation(fnBody, 'Syntax Error Card');
      }).toThrow();
    });

    it('should allow access to all context properties', () => {
      const fnBody = `
        const score =
          (context.myLife / context.myMaxLife) * 2 +
          (context.myUnitCount * 0.5) +
          (context.myHandSize * 0.2) +
          (context.myMana * 0.3);
        return Math.min(10, score);
      `;

      const fn = cache.compileEvaluation(fnBody, 'Complex Card');
      const testContext = cache.buildTestContext();
      const result = fn(testContext);

      expect(result).toBeGreaterThanOrEqual(0);
      expect(result).toBeLessThanOrEqual(10);
    });
  });

  describe('buildTestContext', () => {
    it('should build valid test context', () => {
      const context = cache.buildTestContext();

      expect(context).toHaveProperty('myLife');
      expect(context).toHaveProperty('oppLife');
      expect(context).toHaveProperty('myUnits');
      expect(context).toHaveProperty('myMana');
      expect(context).toHaveProperty('turn');
      expect(context).toHaveProperty('phase');

      expect(typeof context.myLife).toBe('number');
      expect(typeof context.myMana).toBe('number');
      expect(Array.isArray(context.myUnits)).toBe(true);
    });

    it('should provide reasonable default values', () => {
      const context = cache.buildTestContext();

      expect(context.myLife).toBe(15);
      expect(context.oppLife).toBe(15);
      expect(context.myMana).toBe(5);
      expect(context.turn).toBe(5);
      expect(context.myUnitCount).toBe(0);
    });
  });

  describe('load from JSON', () => {
    it('should return load failure when file does not exist', () => {
      const result = cache.load('/nonexistent/path.json');

      expect(result.loaded).toBe(0);
      expect(result.cached).toBe(false);
    });

    it('should load valid JSON cache file', () => {
      const tempFile = path.join(process.cwd(), 'test-cache.json');
      const testData = {
        version: '1.0.0',
        cards: {
          'Lightning Bolt': {
            evaluationFunction: 'return 7.0;',
            category: 'removal',
            rulesText: 'Deal 3 damage to target',
            priority: 'high',
            synergies: [],
            antiSynergies: [],
            situational: false,
            complexity: 'simple',
          },
          'Healing Potion': {
            evaluationFunction: 'return context.myLife < 10 ? 8.0 : 3.0;',
            category: 'healing',
            rulesText: 'Gain 5 life',
            priority: 'medium',
            synergies: [],
            antiSynergies: [],
            situational: true,
            complexity: 'simple',
          },
        },
      };

      fs.writeFileSync(tempFile, JSON.stringify(testData));

      const result = cache.load(tempFile);

      fs.unlinkSync(tempFile);

      expect(result.loaded).toBe(2);
      expect(result.errors).toBe(0);
      expect(result.cached).toBe(true);
      expect(cache.loaded).toBe(true);
    });

    it('should handle invalid JSON gracefully', () => {
      const tempFile = path.join(process.cwd(), 'bad-cache.json');
      fs.writeFileSync(tempFile, 'not valid json{');

      const result = cache.load(tempFile);

      fs.unlinkSync(tempFile);

      expect(result.loaded).toBe(0);
      expect(result.cached).toBe(false);
    });

    it('should count errors for cards with bad evaluation functions', () => {
      const tempFile = path.join(process.cwd(), 'error-cache.json');
      const testData = {
        version: '1.0.0',
        cards: {
          'Good Card': {
            evaluationFunction: 'return 5.0;',
            category: 'minion',
          },
          'Bad Card': {
            evaluationFunction: 'return "not a number";',
            category: 'minion',
          },
          'Syntax Error Card': {
            evaluationFunction: 'return context.myLife <',
            category: 'minion',
          },
        },
      };

      fs.writeFileSync(tempFile, JSON.stringify(testData));

      const result = cache.load(tempFile);

      fs.unlinkSync(tempFile);

      expect(result.loaded).toBe(1); // Only Good Card
      expect(result.errors).toBe(2); // Bad Card + Syntax Error Card
    });
  });

  describe('getEvaluation', () => {
    beforeEach(() => {
      cache.evaluations.set('Test Card', (ctx: any) => 5.0);
    });

    it('should return cached evaluation function', () => {
      const fn = cache.getEvaluation('Test Card');

      expect(fn).toBeDefined();
      expect(typeof fn).toBe('function');
    });

    it('should return null for uncached card', () => {
      const fn = cache.getEvaluation('Unknown Card');

      expect(fn).toBeNull();
    });
  });

  describe('hasEvaluation', () => {
    beforeEach(() => {
      cache.evaluations.set('Test Card', (ctx: any) => 5.0);
    });

    it('should return true for cached card', () => {
      expect(cache.hasEvaluation('Test Card')).toBe(true);
    });

    it('should return false for uncached card', () => {
      expect(cache.hasEvaluation('Unknown Card')).toBe(false);
    });
  });

  describe('getMetadata', () => {
    beforeEach(() => {
      cache.metadata.set('Test Card', {
        category: 'minion',
        rulesText: 'Test rules',
        priority: 'high',
        synergies: ['burn'],
        antiSynergies: ['lifegain'],
        situational: true,
        complexity: 'moderate',
      });
    });

    it('should return cached metadata', () => {
      const meta = cache.getMetadata('Test Card');

      expect(meta).toBeDefined();
      expect(meta.category).toBe('minion');
      expect(meta.priority).toBe('high');
      expect(meta.synergies).toContain('burn');
    });

    it('should return null for uncached card', () => {
      const meta = cache.getMetadata('Unknown Card');

      expect(meta).toBeNull();
    });
  });

  describe('getStats', () => {
    beforeEach(() => {
      cache.evaluations.set('Card 1', (ctx: any) => 5.0);
      cache.evaluations.set('Card 2', (ctx: any) => 7.0);
      cache.errorCount = 3;

      cache.metadata.set('Card 1', { category: 'minion' });
      cache.metadata.set('Card 2', { category: 'spell' });
    });

    it('should return correct statistics', () => {
      const stats = cache.getStats();

      expect(stats.loaded).toBe(2);
      expect(stats.errors).toBe(3);
      expect(stats.categories).toHaveProperty('minion', 1);
      expect(stats.categories).toHaveProperty('spell', 1);
    });
  });

  describe('getFallbackScore', () => {
    it('should return correct fallback for known categories', () => {
      expect(cache.getFallbackScore('minion')).toBe(6.0);
      expect(cache.getFallbackScore('removal')).toBe(6.5);
      expect(cache.getFallbackScore('draw')).toBe(5.5);
      expect(cache.getFallbackScore('healing')).toBe(4.0);
    });

    it('should return default for unknown category', () => {
      expect(cache.getFallbackScore('exotic')).toBe(5.0);
    });
  });
});

describe('buildEvaluationContext', () => {
  it('should build context from minimal game state', () => {
    const state = {
      permanents: {},
      board: { sites: {} },
      zones: {
        p1: { hand: [], spellbook: [] },
        p2: { hand: [], spellbook: [] },
      },
      turnNumber: 1,
      activePlayer: 'p1',
      phase: 'main',
    };

    const card = { cost: 3 };
    const context = loader.buildEvaluationContext(state, 'p1', card);

    expect(context).toHaveProperty('myLife');
    expect(context).toHaveProperty('oppLife');
    expect(context).toHaveProperty('myMana');
    expect(context).toHaveProperty('turn', 1);
    expect(context).toHaveProperty('isMyTurn', true);
    expect(context).toHaveProperty('phase', 'main');
  });

  it('should calculate mana leftover correctly', () => {
    const state = {
      permanents: {},
      board: {
        sites: {
          '0,0': { owner: 'p1', tapped: false },
          '1,0': { owner: 'p1', tapped: false },
          '2,0': { owner: 'p1', tapped: false },
        },
      },
      zones: { p1: { hand: [] }, p2: { hand: [] } },
      turnNumber: 5,
      activePlayer: 'p1',
      phase: 'main',
    };

    const card = { cost: 2 };
    const context = loader.buildEvaluationContext(state, 'p1', card);

    expect(context.myMana).toBe(3);
    expect(context.manaLeftover).toBe(1); // 3 mana - 2 cost = 1 leftover
  });

  it('should detect lethal threat', () => {
    const state = {
      permanents: {
        '0,0': [{ seat: 'p2', atk: 15, tapped: false }],
      },
      board: { sites: {} },
      zones: { p1: { hand: [] }, p2: { hand: [] } },
      turnNumber: 5,
      activePlayer: 'p1',
      phase: 'main',
    };

    // Mock avatar with low life
    const stateWithAvatar = {
      ...state,
      permanents: {
        ...state.permanents,
        '5,5': [{ seat: 'p1', type: 'Avatar', life: 10 }],
      },
    };

    const card = { cost: 0 };
    const context = loader.buildEvaluationContext(stateWithAvatar, 'p1', card);

    expect(context.oppTotalATK).toBe(15);
    expect(context.myLife).toBe(10);
    expect(context.lethalThreat).toBe(true);
  });
});

describe('evaluateCard', () => {
  it('should return null when no cache available', () => {
    const context = {
      myLife: 15,
      myMana: 5,
    };

    // Clear any global cache
    const result = loader.evaluateCard('Unknown Card', context);

    expect(result).toBeNull();
  });

  it('should evaluate card with cached function', () => {
    const cache = loader.getCache();

    // Manually add a test evaluation
    const testFn = (ctx: any) => ctx.myLife < 10 ? 9.0 : 4.0;
    cache.evaluations.set('Test Card', testFn);

    const context1 = { myLife: 5 };
    const result1 = loader.evaluateCard('Test Card', context1);
    expect(result1).toBe(9.0);

    const context2 = { myLife: 15 };
    const result2 = loader.evaluateCard('Test Card', context2);
    expect(result2).toBe(4.0);
  });

  it('should clamp out-of-range values', () => {
    const cache = loader.getCache();

    // Function that returns value outside [0, 10]
    const testFn = (ctx: any) => ctx.myLife * 2;
    cache.evaluations.set('Clamped Card', testFn);

    const context = { myLife: 20 }; // Would return 40
    const result = loader.evaluateCard('Clamped Card', context);

    expect(result).toBe(10); // Clamped to max
  });

  it('should handle evaluation errors gracefully', () => {
    const cache = loader.getCache();

    // Function that throws error
    const testFn = (ctx: any) => {
      throw new Error('Evaluation failed');
    };
    cache.evaluations.set('Error Card', testFn);

    const context = { myLife: 15 };
    const result = loader.evaluateCard('Error Card', context);

    expect(result).toBeNull();
  });
});
