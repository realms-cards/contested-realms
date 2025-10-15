// Unit tests for training log analysis and regression detection
// Tests analyze-logs.js functionality with synthetic log data

const { describe, it, expect } = require('@jest/globals');
const { computeMatchStats, detectRegressions } = require('../../scripts/training/analyze-logs');

describe('computeMatchStats', () => {
  it('should compute statistics from log entries', () => {
    const logs = [
      {
        turnIndex: 1,
        rootEval: 5.0,
        rootFeatures: { mana_avail: 1, mana_wasted: 0 },
        chosenCards: { playedSite: { name: 'Forest' } },
      },
      {
        turnIndex: 2,
        rootEval: 6.0,
        rootFeatures: { mana_avail: 2, mana_wasted: 0 },
        chosenCards: { playedSite: { name: 'Mountain' } },
      },
      {
        turnIndex: 3,
        rootEval: 8.0,
        rootFeatures: { mana_avail: 3, mana_wasted: 0 },
        chosenCards: { playedUnit: { name: 'Knight' } },
      },
    ];

    const stats = computeMatchStats(logs);

    expect(stats.gameLength).toBe(3);
    expect(stats.turnsAnalyzed).toBe(3);
    expect(stats.rootEvalMean).toBeCloseTo(6.33, 1);
    expect(stats.rootEvalVariance).toBeGreaterThan(0);
  });

  it('should handle empty logs', () => {
    const stats = computeMatchStats([]);

    expect(stats.gameLength).toBe(0);
    expect(stats.rootEvalVariance).toBe(0);
    expect(stats.sitePlaysPercent).toBe(0);
  });

  it('should count site plays in turns 5-15 with mana >= 3', () => {
    const logs = [];
    // Turns 1-4: should not count
    for (let i = 1; i <= 4; i++) {
      logs.push({
        turnIndex: i,
        rootEval: 5.0,
        rootFeatures: { mana_avail: 3, mana_wasted: 0 },
        chosenCards: { playedSite: { name: 'Site' } },
      });
    }
    // Turns 5-15: should count - all site plays
    for (let i = 5; i <= 15; i++) {
      logs.push({
        turnIndex: i,
        rootEval: 5.0,
        rootFeatures: { mana_avail: 3, mana_wasted: 0 },
        chosenCards: { playedSite: { name: 'Site' } },
      });
    }

    const stats = computeMatchStats(logs);

    expect(stats.turnsForSiteAnalysis).toBe(11); // turns 5-15
    expect(stats.sitePlaysCount).toBe(11);
    expect(stats.sitePlaysPercent).toBe(100);
  });

  it('should count meaningful actions (non-pass, non-site)', () => {
    const logs = [
      {
        turnIndex: 5,
        rootEval: 5.0,
        rootFeatures: { mana_avail: 4, mana_wasted: 0 },
        chosenCards: { playedUnit: { name: 'Knight' } },
      },
      {
        turnIndex: 6,
        rootEval: 5.0,
        rootFeatures: { mana_avail: 4, mana_wasted: 0 },
        chosenCards: { playedSite: { name: 'Site' } },
      },
      {
        turnIndex: 7,
        rootEval: 5.0,
        rootFeatures: { mana_avail: 4, mana_wasted: 0 },
        chosenCards: {}, // pass
      },
    ];

    const stats = computeMatchStats(logs);

    expect(stats.turnsWithMana).toBe(3);
    expect(stats.meaningfulActionsCount).toBe(1); // only the unit play
    expect(stats.meaningfulActionsPercent).toBeCloseTo(33.3, 1);
  });

  it('should compute average mana wasted in turns 5+', () => {
    const logs = [
      { turnIndex: 4, rootEval: 5.0, rootFeatures: { mana_wasted: 10 } }, // not counted (turn < 5)
      { turnIndex: 5, rootEval: 5.0, rootFeatures: { mana_wasted: 2 } },
      { turnIndex: 6, rootEval: 5.0, rootFeatures: { mana_wasted: 4 } },
      { turnIndex: 7, rootEval: 5.0, rootFeatures: { mana_wasted: 6 } },
    ];

    const stats = computeMatchStats(logs);

    expect(stats.avgManaWasted).toBeCloseTo(4.0, 1); // (2+4+6)/3 = 4
  });
});

describe('detectRegressions', () => {
  it('should detect zero-variance regression', () => {
    const stats = {
      gameLength: 20,
      rootEvalVariance: 0.05, // < 0.1
      rootEvalStdDev: 0.22,
      sitePlaysPercent: 50,
      meaningfulActionsPercent: 70,
      avgManaWasted: 2.0,
      turnsAnalyzed: 20,
      turnsForSiteAnalysis: 10,
      turnsWithMana: 15,
    };

    const result = detectRegressions(stats);

    expect(result.hasCriticalIssues).toBe(true);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].type).toBe('zero-variance');
    expect(result.issues[0].severity).toBe('critical');
  });

  it('should detect site-spam pathology', () => {
    const stats = {
      gameLength: 20,
      rootEvalVariance: 2.0,
      rootEvalStdDev: 1.41,
      sitePlaysPercent: 85, // > 80%
      sitePlaysCount: 9,
      meaningfulActionsPercent: 70,
      avgManaWasted: 2.0,
      turnsAnalyzed: 20,
      turnsForSiteAnalysis: 10,
      turnsWithMana: 15,
    };

    const result = detectRegressions(stats);

    expect(result.hasCriticalIssues).toBe(true);
    expect(result.issues.some(i => i.type === 'site-spam')).toBe(true);
    const siteSpamIssue = result.issues.find(i => i.type === 'site-spam');
    expect(siteSpamIssue.severity).toBe('critical');
  });

  it('should detect infinite stalemate', () => {
    const stats = {
      gameLength: 55, // > 50
      rootEvalVariance: 2.0,
      rootEvalStdDev: 1.41,
      sitePlaysPercent: 50,
      meaningfulActionsPercent: 70,
      avgManaWasted: 2.0,
      turnsAnalyzed: 55,
      turnsForSiteAnalysis: 10,
      turnsWithMana: 45,
    };

    const result = detectRegressions(stats);

    expect(result.hasWarnings).toBe(true);
    expect(result.issues.some(i => i.type === 'infinite-stalemate')).toBe(true);
    const stalemate = result.issues.find(i => i.type === 'infinite-stalemate');
    expect(stalemate.severity).toBe('warning');
  });

  it('should detect passive play', () => {
    const stats = {
      gameLength: 20,
      rootEvalVariance: 2.0,
      rootEvalStdDev: 1.41,
      sitePlaysPercent: 50,
      meaningfulActionsPercent: 40, // < 60%
      meaningfulActionsCount: 6,
      avgManaWasted: 2.0,
      turnsAnalyzed: 20,
      turnsForSiteAnalysis: 10,
      turnsWithMana: 15,
    };

    const result = detectRegressions(stats);

    expect(result.hasWarnings).toBe(true);
    expect(result.issues.some(i => i.type === 'passive-play')).toBe(true);
  });

  it('should detect high mana waste', () => {
    const stats = {
      gameLength: 20,
      rootEvalVariance: 2.0,
      rootEvalStdDev: 1.41,
      sitePlaysPercent: 50,
      meaningfulActionsPercent: 70,
      avgManaWasted: 5.0, // > 4.0
      turnsAnalyzed: 20,
      turnsForSiteAnalysis: 10,
      turnsWithMana: 15,
    };

    const result = detectRegressions(stats);

    expect(result.hasWarnings).toBe(true);
    expect(result.issues.some(i => i.type === 'mana-waste')).toBe(true);
  });

  it('should detect no issues for healthy stats', () => {
    const stats = {
      gameLength: 18,
      rootEvalVariance: 2.5,
      rootEvalStdDev: 1.58,
      sitePlaysPercent: 60,
      meaningfulActionsPercent: 75,
      avgManaWasted: 2.5,
      turnsAnalyzed: 18,
      turnsForSiteAnalysis: 10,
      turnsWithMana: 14,
    };

    const result = detectRegressions(stats);

    expect(result.hasCriticalIssues).toBe(false);
    expect(result.hasWarnings).toBe(false);
    expect(result.issues).toHaveLength(0);
  });

  it('should detect multiple issues simultaneously', () => {
    const stats = {
      gameLength: 60, // stalemate
      rootEvalVariance: 0.05, // zero-variance
      rootEvalStdDev: 0.22,
      sitePlaysPercent: 90, // site-spam
      sitePlaysCount: 9,
      meaningfulActionsPercent: 30, // passive play
      meaningfulActionsCount: 6,
      avgManaWasted: 6.0, // mana waste
      turnsAnalyzed: 60,
      turnsForSiteAnalysis: 10,
      turnsWithMana: 20,
    };

    const result = detectRegressions(stats);

    expect(result.hasCriticalIssues).toBe(true);
    expect(result.hasWarnings).toBe(true);
    expect(result.issues.length).toBeGreaterThan(3);
    expect(result.issues.some(i => i.type === 'zero-variance')).toBe(true);
    expect(result.issues.some(i => i.type === 'site-spam')).toBe(true);
    expect(result.issues.some(i => i.type === 'infinite-stalemate')).toBe(true);
  });
});
