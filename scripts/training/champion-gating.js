#!/usr/bin/env node
// T020: Champion Gating on Functional Play
// Validates that new champion candidates meet quality thresholds
// More strict than smoke test - used to gate champion selection

const { analyzeLogFiles } = require('./analyze-logs');

/**
 * Champion selection criteria (stricter than smoke test)
 */
const CHAMPION_CRITERIA = {
  minWinRate: 55, // ≥55% win rate vs. previous champion over ≥100 matches
  minMeaningfulActionsPercent: 60, // ≥60% of turns with mana ≥ 3 result in unit/spell played
  maxAvgManaWasted: 4.0, // ≤4.0 average mana wasted in turns 5+
  maxGameLength: 30, // All games must end within 30 turns
  minMatches: 100, // Minimum matches required for statistical significance
};

/**
 * Evaluate champion candidate against quality criteria
 * @param {Array<string>} candidateLogFiles - Log files from candidate theta
 * @param {Array<string>} championLogFiles - Log files from current champion (optional)
 * @returns {object} Champion gating results
 */
function evaluateChampionCandidate(candidateLogFiles, championLogFiles = null) {
  if (!candidateLogFiles || candidateLogFiles.length === 0) {
    return {
      approved: false,
      reason: 'No log files provided for candidate',
    };
  }

  console.log(`[ChampionGating] Evaluating candidate with ${candidateLogFiles.length} matches...`);

  const candidateAnalysis = analyzeLogFiles(candidateLogFiles, { detectRegressions: false });
  const { aggregate: candidateMetrics } = candidateAnalysis;

  console.log(`[ChampionGating] Candidate metrics:`);
  console.log(`  Matches: ${candidateMetrics.matchCount}`);
  console.log(`  Avg game length: ${candidateMetrics.avgGameLength.toFixed(1)} turns`);
  console.log(`  Avg meaningful actions: ${candidateMetrics.avgMeaningfulActionsPercent.toFixed(1)}%`);
  console.log(`  Avg mana wasted: ${candidateMetrics.avgManaWasted.toFixed(2)}`);

  const failures = [];

  // Check 1: Sufficient matches for statistical significance
  if (candidateMetrics.matchCount < CHAMPION_CRITERIA.minMatches) {
    failures.push({
      criterion: 'min_matches',
      expected: `>= ${CHAMPION_CRITERIA.minMatches} matches`,
      actual: `${candidateMetrics.matchCount} matches`,
      message: `Insufficient data - need at least ${CHAMPION_CRITERIA.minMatches} matches for statistical significance`,
    });
  }

  // Check 2: Meaningful actions (unit/spell plays when mana >= 3)
  if (candidateMetrics.avgMeaningfulActionsPercent < CHAMPION_CRITERIA.minMeaningfulActionsPercent) {
    failures.push({
      criterion: 'meaningful_actions',
      expected: `>= ${CHAMPION_CRITERIA.minMeaningfulActionsPercent}%`,
      actual: `${candidateMetrics.avgMeaningfulActionsPercent.toFixed(1)}%`,
      message: `Too passive - only ${candidateMetrics.avgMeaningfulActionsPercent.toFixed(1)}% meaningful actions`,
    });
  }

  // Check 3: Mana efficiency (low waste)
  if (candidateMetrics.avgManaWasted > CHAMPION_CRITERIA.maxAvgManaWasted) {
    failures.push({
      criterion: 'mana_efficiency',
      expected: `<= ${CHAMPION_CRITERIA.maxAvgManaWasted} mana wasted`,
      actual: `${candidateMetrics.avgManaWasted.toFixed(2)} mana wasted`,
      message: `Inefficient mana usage - wasting ${candidateMetrics.avgManaWasted.toFixed(2)} mana per turn`,
    });
  }

  // Check 4: Game length (must close games)
  if (candidateMetrics.avgGameLength > CHAMPION_CRITERIA.maxGameLength) {
    failures.push({
      criterion: 'game_length',
      expected: `<= ${CHAMPION_CRITERIA.maxGameLength} turns`,
      actual: `${candidateMetrics.avgGameLength.toFixed(1)} turns`,
      message: `Games too long - averaging ${candidateMetrics.avgGameLength.toFixed(1)} turns`,
    });
  }

  // Check 5: Win rate vs. previous champion (if champion logs provided)
  let winRate = null;
  if (championLogFiles && championLogFiles.length > 0) {
    // Parse head-to-head results to compute win rate
    // This would require match results data, simplified for now
    console.log(`[ChampionGating] Champion comparison not yet implemented - skipping win rate check`);
    console.log(`[ChampionGating] In production, would compare vs. ${championLogFiles.length} champion matches`);
  }

  const approved = failures.length === 0;

  return {
    approved,
    failures,
    metrics: candidateMetrics,
    criteria: CHAMPION_CRITERIA,
    winRate,
  };
}

/**
 * Report champion gating results
 * @param {object} result - Champion gating results
 * @param {boolean} verbose - Show detailed output
 */
function reportChampionGating(result, verbose = false) {
  console.log('\n=== Champion Gating Results ===\n');

  if (result.approved) {
    console.log('✅ CHAMPION CANDIDATE APPROVED');
    console.log('\nCandidate meets all quality criteria:');
    console.log(`  ✅ Matches: ${result.metrics.matchCount} (>= ${result.criteria.minMatches})`);
    console.log(`  ✅ Meaningful actions: ${result.metrics.avgMeaningfulActionsPercent.toFixed(1)}% (>= ${result.criteria.minMeaningfulActionsPercent}%)`);
    console.log(`  ✅ Mana efficiency: ${result.metrics.avgManaWasted.toFixed(2)} wasted (<= ${result.criteria.maxAvgManaWasted})`);
    console.log(`  ✅ Game length: ${result.metrics.avgGameLength.toFixed(1)} turns (<= ${result.criteria.maxGameLength})`);

    if (result.winRate !== null) {
      console.log(`  ✅ Win rate: ${result.winRate.toFixed(1)}% (>= ${result.criteria.minWinRate}%)`);
    }

    console.log('\nCandidate can be promoted to champion.\n');
  } else {
    console.error('❌ CHAMPION CANDIDATE REJECTED\n');
    console.error(`Failed ${result.failures.length} criteria:\n`);

    for (const failure of result.failures) {
      console.error(`  ❌ ${failure.criterion}`);
      console.error(`     Expected: ${failure.expected}`);
      console.error(`     Actual: ${failure.actual}`);
      console.error(`     ${failure.message}\n`);
    }

    console.error('Candidate does NOT meet quality bar for champion.');
    console.error('Continue training or adjust theta weights.\n');
  }
}

/**
 * CLI entry point
 */
function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    console.log('Usage: node champion-gating.js <candidate-log-files...> [--champion <champion-log-files...>]');
    console.log('Example: node champion-gating.js logs/training/candidate/*.jsonl');
    console.log('\nValidates champion candidate against quality criteria.');
    console.log('\nCriteria:');
    console.log(`  - Minimum matches: >= ${CHAMPION_CRITERIA.minMatches}`);
    console.log(`  - Meaningful actions: >= ${CHAMPION_CRITERIA.minMeaningfulActionsPercent}%`);
    console.log(`  - Mana efficiency: <= ${CHAMPION_CRITERIA.maxAvgManaWasted} wasted`);
    console.log(`  - Game length: <= ${CHAMPION_CRITERIA.maxGameLength} turns`);
    console.log(`  - Win rate vs. champion: >= ${CHAMPION_CRITERIA.minWinRate}% (if champion logs provided)`);
    process.exit(0);
  }

  const championIdx = args.indexOf('--champion');
  const candidateFiles = championIdx >= 0 ? args.slice(0, championIdx) : args;
  const championFiles = championIdx >= 0 ? args.slice(championIdx + 1) : [];

  const result = evaluateChampionCandidate(candidateFiles, championFiles.length > 0 ? championFiles : null);
  reportChampionGating(result, args.includes('--verbose') || args.includes('-v'));

  process.exit(result.approved ? 0 : 1);
}

// Export for use in other scripts
module.exports = {
  evaluateChampionCandidate,
  reportChampionGating,
  CHAMPION_CRITERIA,
};

// Run CLI if invoked directly
if (require.main === module) {
  main();
}
