#!/usr/bin/env node
// T016 Validation: Test regression detection with synthetic broken logs
// Creates synthetic log files with known issues and validates detection

const fs = require('fs');
const path = require('path');
const { analyzeLogFiles } = require('./analyze-logs');

/**
 * Create synthetic broken logs to test regression detection
 */
function createSyntheticLogs() {
  const testDir = path.join(process.cwd(), 'logs', 'training', 'test-regression');
  fs.mkdirSync(testDir, { recursive: true });

  // Test 1: Zero-variance regression (all moves scored equally - broken theta)
  const zeroVarianceLogs = [];
  for (let i = 0; i < 20; i++) {
    zeroVarianceLogs.push({
      matchId: 'test_zero_variance',
      turnIndex: i,
      thetaId: 'broken/all-zeros',
      rootEval: 5.0, // Same eval every turn!
      rootFeatures: {
        mana_avail: 3,
        mana_wasted: i >= 5 ? 2 : 0,
        sites_my: Math.min(i, 5),
      },
      chosenCards: { playedSite: { name: 'Test Site' } },
    });
  }
  fs.writeFileSync(
    path.join(testDir, 'match_test_zero_variance_cpu_A.jsonl'),
    zeroVarianceLogs.map(l => JSON.stringify(l)).join('\n')
  );

  // Test 2: Site-spam pathology (bot plays sites every turn 5-15)
  const siteSpamLogs = [];
  for (let i = 0; i < 20; i++) {
    siteSpamLogs.push({
      matchId: 'test_site_spam',
      turnIndex: i,
      thetaId: 'broken/site-spam',
      rootEval: 5.0 + Math.random() * 2, // Some variance
      rootFeatures: {
        mana_avail: 5,
        mana_wasted: 3,
        sites_my: Math.min(i, 10),
      },
      chosenCards: { playedSite: { name: 'Test Site' } }, // Always playing sites!
    });
  }
  fs.writeFileSync(
    path.join(testDir, 'match_test_site_spam_cpu_A.jsonl'),
    siteSpamLogs.map(l => JSON.stringify(l)).join('\n')
  );

  // Test 3: Infinite stalemate (game goes > 50 turns)
  const stalemateLogs = [];
  for (let i = 0; i < 60; i++) {
    stalemateLogs.push({
      matchId: 'test_stalemate',
      turnIndex: i,
      thetaId: 'broken/passive',
      rootEval: 5.0 + Math.random() * 3,
      rootFeatures: {
        mana_avail: 5,
        mana_wasted: 2,
        sites_my: 5,
      },
      chosenCards: i % 3 === 0 ? { playedUnit: { name: 'Test Unit' } } : {}, // Mostly passing
    });
  }
  fs.writeFileSync(
    path.join(testDir, 'match_test_stalemate_cpu_A.jsonl'),
    stalemateLogs.map(l => JSON.stringify(l)).join('\n')
  );

  // Test 4: Healthy logs (no regressions)
  const healthyLogs = [];
  for (let i = 0; i < 18; i++) {
    const isSitePhase = i < 4;
    const isUnitPhase = i >= 4 && i < 12;
    const isAttackPhase = i >= 12;

    healthyLogs.push({
      matchId: 'test_healthy',
      turnIndex: i,
      thetaId: 'refined/v3',
      rootEval: 5.0 + Math.random() * 5, // Good variance
      rootFeatures: {
        mana_avail: Math.min(i, 6),
        mana_wasted: i >= 5 ? Math.floor(Math.random() * 2) : 0, // Low waste
        sites_my: Math.min(i, 5),
      },
      chosenCards: isSitePhase
        ? { playedSite: { name: 'Test Site' } }
        : isUnitPhase
          ? { playedUnit: { name: 'Test Unit' } }
          : { attack: true },
    });
  }
  fs.writeFileSync(
    path.join(testDir, 'match_test_healthy_cpu_A.jsonl'),
    healthyLogs.map(l => JSON.stringify(l)).join('\n')
  );

  return testDir;
}

/**
 * Run validation tests
 */
function runValidation() {
  console.log('=== T016 Regression Detection Validation ===\n');
  console.log('Creating synthetic test logs...');

  const testDir = createSyntheticLogs();
  const logFiles = fs.readdirSync(testDir)
    .filter(f => f.endsWith('.jsonl'))
    .map(f => path.join(testDir, f));

  console.log(`Created ${logFiles.length} synthetic log files\n`);

  let passed = 0;
  let failed = 0;

  // Test 1: Zero-variance should be detected
  console.log('Test 1: Zero-variance detection');
  const zeroVarianceFile = logFiles.find(f => f.includes('zero_variance'));
  if (zeroVarianceFile) {
    const analysis = analyzeLogFiles([zeroVarianceFile], { detectRegressions: true });
    const hasCritical = analysis.results[0].regression.hasCriticalIssues;
    const hasZeroVariance = analysis.results[0].regression.issues.some(i => i.type === 'zero-variance');

    if (hasCritical && hasZeroVariance) {
      console.log('  ✅ PASS: Zero-variance regression detected\n');
      passed++;
    } else {
      console.log('  ❌ FAIL: Zero-variance regression NOT detected\n');
      failed++;
    }
  }

  // Test 2: Site-spam should be detected
  console.log('Test 2: Site-spam detection');
  const siteSpamFile = logFiles.find(f => f.includes('site_spam'));
  if (siteSpamFile) {
    const analysis = analyzeLogFiles([siteSpamFile], { detectRegressions: true });
    const hasCritical = analysis.results[0].regression.hasCriticalIssues;
    const hasSiteSpam = analysis.results[0].regression.issues.some(i => i.type === 'site-spam');

    if (hasCritical && hasSiteSpam) {
      console.log('  ✅ PASS: Site-spam pathology detected\n');
      passed++;
    } else {
      console.log('  ❌ FAIL: Site-spam pathology NOT detected\n');
      failed++;
    }
  }

  // Test 3: Infinite stalemate should be detected
  console.log('Test 3: Infinite stalemate detection');
  const stalemateFile = logFiles.find(f => f.includes('stalemate'));
  if (stalemateFile) {
    const analysis = analyzeLogFiles([stalemateFile], { detectRegressions: true });
    const hasStalemate = analysis.results[0].regression.issues.some(i => i.type === 'infinite-stalemate');

    if (hasStalemate) {
      console.log('  ✅ PASS: Infinite stalemate detected\n');
      passed++;
    } else {
      console.log('  ❌ FAIL: Infinite stalemate NOT detected\n');
      failed++;
    }
  }

  // Test 4: Healthy logs should have no critical regressions
  console.log('Test 4: Healthy logs validation');
  const healthyFile = logFiles.find(f => f.includes('healthy'));
  if (healthyFile) {
    const analysis = analyzeLogFiles([healthyFile], { detectRegressions: true });
    const hasCritical = analysis.results[0].regression.hasCriticalIssues;

    if (!hasCritical) {
      console.log('  ✅ PASS: No critical regressions in healthy logs\n');
      passed++;
    } else {
      console.log('  ❌ FAIL: False positive - healthy logs flagged as critical\n');
      console.log('  Issues detected:', analysis.results[0].regression.issues.map(i => i.type).join(', '));
      failed++;
    }
  }

  // Summary
  console.log('\n=== Validation Summary ===');
  console.log(`Passed: ${passed}/${passed + failed}`);
  console.log(`Failed: ${failed}/${passed + failed}`);

  if (failed === 0) {
    console.log('\n✅ All regression detection tests passed!');
    console.log('T016 validation complete.\n');

    // Cleanup test logs
    try {
      for (const file of logFiles) {
        fs.unlinkSync(file);
      }
      fs.rmdirSync(testDir);
      console.log('Test logs cleaned up.\n');
    } catch (e) {
      console.warn('Warning: Failed to cleanup test logs:', e.message);
    }

    process.exit(0);
  } else {
    console.log('\n❌ Some regression detection tests failed!');
    console.log(`Test logs preserved in: ${testDir}\n`);
    process.exit(1);
  }
}

// Run validation
if (require.main === module) {
  runValidation();
}

module.exports = { createSyntheticLogs, runValidation };
