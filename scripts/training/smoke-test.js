#!/usr/bin/env node
// T019: Baseline Functional Play Smoke Test
// Validates bot is playing functionally before starting training
// Runs quick validation matches and checks quality metrics

const { analyzeLogFiles } = require('./analyze-logs');

/**
 * Smoke test criteria for functional play
 */
const SMOKE_TEST_CRITERIA = {
  minMeaningfulActionsPercent: 70, // ≥70% of turns with mana ≥ 3 should be non-site/non-pass
  maxGameLength: 30, // Average game should end in < 30 turns
  minRootEvalVariance: 1.0, // Bot should show decision variety (not all moves scored equally)
};

/**
 * Run smoke test on collected log files
 * @param {Array<string>} logFiles - Paths to JSONL log files
 * @returns {object} Smoke test results
 */
function runSmokeTest(logFiles) {
  if (!logFiles || logFiles.length === 0) {
    return {
      passed: false,
      error: 'No log files provided for smoke test',
    };
  }

  console.log(`[SmokeTest] Analyzing ${logFiles.length} match logs...`);

  const analysis = analyzeLogFiles(logFiles, { detectRegressions: false });
  const { results, aggregate } = analysis;

  console.log(`[SmokeTest] Matches analyzed: ${aggregate.matchCount}`);
  console.log(`[SmokeTest] Avg game length: ${aggregate.avgGameLength.toFixed(1)} turns`);
  console.log(`[SmokeTest] Avg rootEval variance: ${aggregate.avgRootEvalVariance.toFixed(4)}`);
  console.log(`[SmokeTest] Avg meaningful actions: ${aggregate.avgMeaningfulActionsPercent.toFixed(1)}%`);

  const failures = [];

  // Check 1: Meaningful actions (non-site, non-pass when mana >= 3)
  if (aggregate.avgMeaningfulActionsPercent < SMOKE_TEST_CRITERIA.minMeaningfulActionsPercent) {
    failures.push({
      criterion: 'meaningful_actions',
      expected: `>= ${SMOKE_TEST_CRITERIA.minMeaningfulActionsPercent}%`,
      actual: `${aggregate.avgMeaningfulActionsPercent.toFixed(1)}%`,
      message: `Bot is too passive - only ${aggregate.avgMeaningfulActionsPercent.toFixed(1)}% of turns with mana are meaningful actions`,
    });
  }

  // Check 2: Game length (should end games, not stalemate)
  if (aggregate.avgGameLength > SMOKE_TEST_CRITERIA.maxGameLength) {
    failures.push({
      criterion: 'game_length',
      expected: `< ${SMOKE_TEST_CRITERIA.maxGameLength} turns`,
      actual: `${aggregate.avgGameLength.toFixed(1)} turns`,
      message: `Games taking too long - average ${aggregate.avgGameLength.toFixed(1)} turns suggests bot cannot close games`,
    });
  }

  // Check 3: Root eval variance (decision variety)
  if (aggregate.avgRootEvalVariance < SMOKE_TEST_CRITERIA.minRootEvalVariance) {
    failures.push({
      criterion: 'eval_variance',
      expected: `>= ${SMOKE_TEST_CRITERIA.minRootEvalVariance}`,
      actual: `${aggregate.avgRootEvalVariance.toFixed(4)}`,
      message: `No decision variety - variance ${aggregate.avgRootEvalVariance.toFixed(4)} suggests all moves scored equally (broken theta)`,
    });
  }

  const passed = failures.length === 0;

  return {
    passed,
    failures,
    metrics: {
      matchCount: aggregate.matchCount,
      avgGameLength: aggregate.avgGameLength,
      avgRootEvalVariance: aggregate.avgRootEvalVariance,
      avgMeaningfulActionsPercent: aggregate.avgMeaningfulActionsPercent,
    },
    criteria: SMOKE_TEST_CRITERIA,
  };
}

/**
 * Report smoke test results
 * @param {object} result - Smoke test results
 * @param {boolean} verbose - Show detailed output
 */
function reportSmokeTest(result, verbose = false) {
  console.log('\n=== Smoke Test Results ===\n');

  if (result.passed) {
    console.log('✅ SMOKE TEST PASSED - Bot is playing functionally');
    console.log('\nMetrics:');
    console.log(`  Meaningful actions: ${result.metrics.avgMeaningfulActionsPercent.toFixed(1)}% (>= ${result.criteria.minMeaningfulActionsPercent}%)`);
    console.log(`  Game length: ${result.metrics.avgGameLength.toFixed(1)} turns (< ${result.criteria.maxGameLength})`);
    console.log(`  Eval variance: ${result.metrics.avgRootEvalVariance.toFixed(4)} (>= ${result.criteria.minRootEvalVariance})`);
    console.log('\nTraining can proceed safely.\n');
  } else {
    console.error('❌ SMOKE TEST FAILED - Bot is not playing functionally\n');
    console.error(`Failed ${result.failures.length} criteria:\n`);

    for (const failure of result.failures) {
      console.error(`  ❌ ${failure.criterion}`);
      console.error(`     Expected: ${failure.expected}`);
      console.error(`     Actual: ${failure.actual}`);
      console.error(`     ${failure.message}\n`);
    }

    console.error('Training should NOT proceed until issues are resolved.');
    console.error('Possible causes:');
    console.error('  - Broken theta (all weights = 0)');
    console.error('  - Missing rule enforcement (canAffordCard, etc.)');
    console.error('  - Pathological evaluation weights (site-spam, etc.)\n');
  }
}

/**
 * CLI entry point for standalone smoke testing
 */
function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    console.log('Usage: node smoke-test.js <log-files...>');
    console.log('Example: node smoke-test.js logs/training/20251015/*.jsonl');
    console.log('\nValidates bot functional play quality before training.');
    console.log('\nCriteria:');
    console.log(`  - Meaningful actions: >= ${SMOKE_TEST_CRITERIA.minMeaningfulActionsPercent}%`);
    console.log(`  - Game length: < ${SMOKE_TEST_CRITERIA.maxGameLength} turns`);
    console.log(`  - Eval variance: >= ${SMOKE_TEST_CRITERIA.minRootEvalVariance}`);
    process.exit(0);
  }

  const logFiles = args.filter(arg => !arg.startsWith('--'));

  const result = runSmokeTest(logFiles);
  reportSmokeTest(result, args.includes('--verbose') || args.includes('-v'));

  process.exit(result.passed ? 0 : 1);
}

// Export for use in other scripts (e.g., selfplay.js)
module.exports = {
  runSmokeTest,
  reportSmokeTest,
  SMOKE_TEST_CRITERIA,
};

// Run CLI if invoked directly
if (require.main === module) {
  main();
}
