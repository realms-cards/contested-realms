#!/usr/bin/env node
// Training log analysis and regression detection
// Parses JSONL logs from self-play matches and computes quality metrics
// Usage:
//   node scripts/training/analyze-logs.js logs/training/20251015/*.jsonl
//   node scripts/training/analyze-logs.js --detect-regressions logs/training/20251015/*.jsonl

const fs = require('fs');
const path = require('path');

/**
 * Parse a JSONL file into array of log entries
 * @param {string} filePath - Path to JSONL file
 * @returns {Array<object>} Parsed log entries
 */
function parseJSONL(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n').filter(line => line.trim());
    return lines.map((line, idx) => {
      try {
        return JSON.parse(line);
      } catch (e) {
        console.warn(`[ParseError] ${filePath}:${idx + 1}: ${e.message}`);
        return null;
      }
    }).filter(Boolean);
  } catch (e) {
    console.error(`[ReadError] Failed to read ${filePath}: ${e.message}`);
    return [];
  }
}

/**
 * Compute statistics from log entries
 * @param {Array<object>} logs - Log entries from a single match
 * @returns {object} Match statistics
 */
function computeMatchStats(logs) {
  if (!logs || logs.length === 0) {
    return {
      gameLength: 0,
      rootEvalVariance: 0,
      rootEvalMean: 0,
      rootEvalStdDev: 0,
      sitePlaysCount: 0,
      sitePlaysPercent: 0,
      meaningfulActionsCount: 0,
      meaningfulActionsPercent: 0,
      avgManaWasted: 0,
      turnsAnalyzed: 0,
    };
  }

  const rootEvals = logs.map(log => log.rootEval || 0).filter(v => Number.isFinite(v));
  const mean = rootEvals.length > 0 ? rootEvals.reduce((a, b) => a + b, 0) / rootEvals.length : 0;
  const variance = rootEvals.length > 1
    ? rootEvals.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / (rootEvals.length - 1)
    : 0;
  const stdDev = Math.sqrt(variance);

  // Count site plays in turns 5-15 when mana >= 3
  const turnsForSiteAnalysis = logs.filter(log => {
    const turn = log.turnIndex || 0;
    const mana = (log.rootFeatures && log.rootFeatures.mana_avail) || 0;
    return turn >= 5 && turn <= 15 && mana >= 3;
  });

  const sitePlaysCount = turnsForSiteAnalysis.filter(log => {
    const chosen = log.chosenCards || {};
    return chosen.playedSite && chosen.playedSite.name;
  }).length;

  const sitePlaysPercent = turnsForSiteAnalysis.length > 0
    ? (sitePlaysCount / turnsForSiteAnalysis.length) * 100
    : 0;

  // Count meaningful actions (non-pass, non-site when mana >= 3)
  const turnsWithMana = logs.filter(log => {
    const mana = (log.rootFeatures && log.rootFeatures.mana_avail) || 0;
    return mana >= 3;
  });

  const meaningfulActionsCount = turnsWithMana.filter(log => {
    const chosen = log.chosenCards || {};
    // Meaningful = played unit/spell or attacked (not just site or pass)
    return chosen.playedUnit || chosen.playedSpell || chosen.attack;
  }).length;

  const meaningfulActionsPercent = turnsWithMana.length > 0
    ? (meaningfulActionsCount / turnsWithMana.length) * 100
    : 0;

  // Average mana wasted in turns 5+
  const lateGameTurns = logs.filter(log => (log.turnIndex || 0) >= 5);
  const manaWastedValues = lateGameTurns
    .map(log => (log.rootFeatures && log.rootFeatures.mana_wasted) || 0)
    .filter(v => Number.isFinite(v));
  const avgManaWasted = manaWastedValues.length > 0
    ? manaWastedValues.reduce((a, b) => a + b, 0) / manaWastedValues.length
    : 0;

  return {
    gameLength: logs.length,
    rootEvalVariance: variance,
    rootEvalMean: mean,
    rootEvalStdDev: stdDev,
    sitePlaysCount,
    sitePlaysPercent,
    turnsForSiteAnalysis: turnsForSiteAnalysis.length,
    meaningfulActionsCount,
    meaningfulActionsPercent,
    turnsWithMana: turnsWithMana.length,
    avgManaWasted,
    turnsAnalyzed: logs.length,
  };
}

/**
 * Detect regressions in match statistics
 * @param {object} stats - Match statistics from computeMatchStats
 * @returns {object} Regression detection results
 */
function detectRegressions(stats) {
  const issues = [];

  // Check 1: Zero-variance regression (rootEval variance < 0.1)
  if (stats.rootEvalVariance < 0.1 && stats.turnsAnalyzed > 5) {
    issues.push({
      type: 'zero-variance',
      severity: 'critical',
      message: `Root evaluation variance too low: ${stats.rootEvalVariance.toFixed(4)} < 0.1`,
      detail: 'Bot may be stuck in degenerate strategy (all moves scored equally)',
      stats: { variance: stats.rootEvalVariance, stdDev: stats.rootEvalStdDev },
    });
  }

  // Check 2: Site-spam pathology (>80% site-playing in turns 5-15 when mana >= 3)
  if (stats.sitePlaysPercent > 80 && stats.turnsForSiteAnalysis > 3) {
    issues.push({
      type: 'site-spam',
      severity: 'critical',
      message: `Excessive site playing: ${stats.sitePlaysPercent.toFixed(1)}% > 80%`,
      detail: `Bot played sites on ${stats.sitePlaysCount}/${stats.turnsForSiteAnalysis} turns (5-15) with mana >= 3`,
      stats: { percent: stats.sitePlaysPercent, count: stats.sitePlaysCount, total: stats.turnsForSiteAnalysis },
    });
  }

  // Check 3: Infinite stalemate (game length > 50 turns)
  if (stats.gameLength > 50) {
    issues.push({
      type: 'infinite-stalemate',
      severity: 'warning',
      message: `Game too long: ${stats.gameLength} turns > 50`,
      detail: 'Bot may be unable to close out games or stuck in defensive loop',
      stats: { gameLength: stats.gameLength },
    });
  }

  // Check 4: Low meaningful actions (< 60% when mana >= 3)
  if (stats.meaningfulActionsPercent < 60 && stats.turnsWithMana > 3) {
    issues.push({
      type: 'passive-play',
      severity: 'warning',
      message: `Too few meaningful actions: ${stats.meaningfulActionsPercent.toFixed(1)}% < 60%`,
      detail: `Bot only played units/spells on ${stats.meaningfulActionsCount}/${stats.turnsWithMana} turns with mana >= 3`,
      stats: { percent: stats.meaningfulActionsPercent, count: stats.meaningfulActionsCount, total: stats.turnsWithMana },
    });
  }

  // Check 5: High mana waste (average > 4.0 in turns 5+)
  if (stats.avgManaWasted > 4.0) {
    issues.push({
      type: 'mana-waste',
      severity: 'warning',
      message: `High mana waste: ${stats.avgManaWasted.toFixed(2)} > 4.0`,
      detail: 'Bot frequently ends turns with unspent mana',
      stats: { avgManaWasted: stats.avgManaWasted },
    });
  }

  return {
    hasCriticalIssues: issues.some(i => i.severity === 'critical'),
    hasWarnings: issues.some(i => i.severity === 'warning'),
    issues,
    stats,
  };
}

/**
 * Analyze all log files and aggregate results
 * @param {Array<string>} filePaths - Array of JSONL file paths
 * @param {object} options - Analysis options
 * @returns {object} Aggregated analysis results
 */
function analyzeLogFiles(filePaths, options = {}) {
  const results = [];

  for (const filePath of filePaths) {
    const logs = parseJSONL(filePath);
    if (logs.length === 0) continue;

    const stats = computeMatchStats(logs);
    const regression = options.detectRegressions ? detectRegressions(stats) : null;

    results.push({
      file: path.basename(filePath),
      filePath,
      matchId: logs[0]?.matchId || 'unknown',
      thetaId: logs[0]?.thetaId || 'unknown',
      stats,
      regression,
    });
  }

  // Compute aggregate statistics
  const allStats = results.map(r => r.stats);
  const aggregate = {
    matchCount: results.length,
    avgGameLength: allStats.length > 0 ? allStats.reduce((a, s) => a + s.gameLength, 0) / allStats.length : 0,
    avgRootEvalVariance: allStats.length > 0 ? allStats.reduce((a, s) => a + s.rootEvalVariance, 0) / allStats.length : 0,
    avgSitePlaysPercent: allStats.length > 0 ? allStats.reduce((a, s) => a + s.sitePlaysPercent, 0) / allStats.length : 0,
    avgMeaningfulActionsPercent: allStats.length > 0 ? allStats.reduce((a, s) => a + s.meaningfulActionsPercent, 0) / allStats.length : 0,
    avgManaWasted: allStats.length > 0 ? allStats.reduce((a, s) => a + s.avgManaWasted, 0) / allStats.length : 0,
  };

  return {
    results,
    aggregate,
  };
}

/**
 * Format and print analysis results
 * @param {object} analysis - Results from analyzeLogFiles
 * @param {object} options - Display options
 */
function printResults(analysis, options = {}) {
  const { results, aggregate } = analysis;

  console.log('\n=== Training Log Analysis ===\n');
  console.log(`Matches analyzed: ${aggregate.matchCount}`);
  console.log(`Avg game length: ${aggregate.avgGameLength.toFixed(1)} turns`);
  console.log(`Avg rootEval variance: ${aggregate.avgRootEvalVariance.toFixed(4)}`);
  console.log(`Avg site plays (turns 5-15, mana >= 3): ${aggregate.avgSitePlaysPercent.toFixed(1)}%`);
  console.log(`Avg meaningful actions (mana >= 3): ${aggregate.avgMeaningfulActionsPercent.toFixed(1)}%`);
  console.log(`Avg mana wasted (turns 5+): ${aggregate.avgManaWasted.toFixed(2)}`);

  if (options.detectRegressions) {
    console.log('\n=== Regression Detection ===\n');

    const criticalMatches = results.filter(r => r.regression && r.regression.hasCriticalIssues);
    const warningMatches = results.filter(r => r.regression && r.regression.hasWarnings && !r.regression.hasCriticalIssues);

    if (criticalMatches.length > 0) {
      console.log(`❌ CRITICAL: ${criticalMatches.length} matches with critical regressions\n`);
      for (const result of criticalMatches) {
        console.log(`  Match: ${result.matchId} (${result.file})`);
        console.log(`  Theta: ${result.thetaId}`);
        for (const issue of result.regression.issues.filter(i => i.severity === 'critical')) {
          console.log(`    - [${issue.type}] ${issue.message}`);
          console.log(`      ${issue.detail}`);
        }
        console.log();
      }
    }

    if (warningMatches.length > 0) {
      console.log(`⚠️  WARNING: ${warningMatches.length} matches with warnings\n`);
      if (options.verbose) {
        for (const result of warningMatches) {
          console.log(`  Match: ${result.matchId} (${result.file})`);
          for (const issue of result.regression.issues.filter(i => i.severity === 'warning')) {
            console.log(`    - [${issue.type}] ${issue.message}`);
          }
        }
        console.log();
      }
    }

    if (criticalMatches.length === 0 && warningMatches.length === 0) {
      console.log('✅ No regressions detected\n');
    }

    // Return exit code 1 if critical issues found (for CI integration)
    if (criticalMatches.length > 0) {
      console.error('❌ Training should be halted due to critical regressions.');
      process.exit(1);
    }
  }

  if (options.verbose) {
    console.log('\n=== Per-Match Details ===\n');
    for (const result of results) {
      console.log(`Match: ${result.matchId} (${result.file})`);
      console.log(`  Theta: ${result.thetaId}`);
      console.log(`  Game length: ${result.stats.gameLength} turns`);
      console.log(`  RootEval: mean=${result.stats.rootEvalMean.toFixed(2)}, variance=${result.stats.rootEvalVariance.toFixed(4)}, stdDev=${result.stats.rootEvalStdDev.toFixed(2)}`);
      console.log(`  Site plays (turns 5-15): ${result.stats.sitePlaysPercent.toFixed(1)}% (${result.stats.sitePlaysCount}/${result.stats.turnsForSiteAnalysis})`);
      console.log(`  Meaningful actions: ${result.stats.meaningfulActionsPercent.toFixed(1)}% (${result.stats.meaningfulActionsCount}/${result.stats.turnsWithMana})`);
      console.log(`  Mana wasted (turns 5+): ${result.stats.avgManaWasted.toFixed(2)}`);
      console.log();
    }
  }
}

/**
 * CLI entry point
 */
function main() {
  const args = process.argv.slice(2);
  const options = {
    detectRegressions: args.includes('--detect-regressions') || args.includes('-r'),
    verbose: args.includes('--verbose') || args.includes('-v'),
  };

  const filePaths = args.filter(arg => !arg.startsWith('--') && !arg.startsWith('-'));

  if (filePaths.length === 0) {
    console.error('Usage: node analyze-logs.js [--detect-regressions] [--verbose] <log-files...>');
    console.error('Example: node analyze-logs.js logs/training/20251015/*.jsonl');
    console.error('Example: node analyze-logs.js -r logs/training/20251015/*.jsonl');
    process.exit(1);
  }

  const analysis = analyzeLogFiles(filePaths, options);
  printResults(analysis, options);
}

// Export functions for use in other scripts
module.exports = {
  parseJSONL,
  computeMatchStats,
  detectRegressions,
  analyzeLogFiles,
  printResults,
};

// Run CLI if invoked directly
if (require.main === module) {
  main();
}
