#!/usr/bin/env node
// Quick test to verify T015 enhanced logging fields

const fs = require('fs');
const path = require('path');

const logDir = path.join(__dirname, '../logs/training/20251014');
const files = fs.readdirSync(logDir).filter(f => f.endsWith('.jsonl'));

if (files.length === 0) {
  console.log('No log files found');
  process.exit(0);
}

// Read first entry from most recent log
const mostRecent = files.sort().reverse()[0];
const logPath = path.join(logDir, mostRecent);
const firstLine = fs.readFileSync(logPath, 'utf8').split('\n')[0];

if (!firstLine) {
  console.log('Empty log file');
  process.exit(0);
}

const entry = JSON.parse(firstLine);

console.log('=== T015 Enhanced Logging Verification ===\n');

// Check for T015 fields
const hasEvaluationBreakdown = entry.evaluationBreakdown !== undefined;
const hasCandidateDetails = entry.candidateDetails !== undefined;
const hasFilteredCandidates = entry.filteredCandidates !== undefined;

console.log(`✓ Log file: ${mostRecent}`);
console.log(`✓ Entry timestamp: ${new Date(entry.t).toISOString()}`);
console.log(`✓ Theta ID: ${entry.thetaId}\n`);

console.log('T015 Fields Present:');
console.log(`  evaluationBreakdown: ${hasEvaluationBreakdown ? '✓ YES' : '✗ NO'}`);
console.log(`  candidateDetails: ${hasCandidateDetails ? '✓ YES' : '✗ NO'}`);
console.log(`  filteredCandidates: ${hasFilteredCandidates ? '✓ YES' : '✗ NO'}\n`);

if (hasEvaluationBreakdown) {
  console.log('Evaluation Breakdown Sample:');
  const bd = entry.evaluationBreakdown;
  const topContributors = Object.entries(bd)
    .filter(([k, v]) => Math.abs(v) > 0.01)
    .sort(([, a], [, b]) => Math.abs(b) - Math.abs(a))
    .slice(0, 5);
  topContributors.forEach(([feature, value]) => {
    console.log(`  ${feature}: ${value.toFixed(3)}`);
  });
  console.log('');
}

if (hasCandidateDetails) {
  console.log('Candidate Details Sample:');
  const details = entry.candidateDetails.slice(0, 5);
  details.forEach((c, i) => {
    console.log(`  ${i + 1}. ${c.action} | score=${c.score.toFixed(2)} refined=${c.refined.toFixed(2)} legal=${c.isLegal}`);
  });
  console.log('');
}

if (hasFilteredCandidates) {
  console.log('Filtered Candidates Stats:');
  const fc = entry.filteredCandidates;
  console.log(`  Total units in hand: ${fc.totalUnitsInHand}`);
  console.log(`  Filtered (unaffordable): ${fc.filteredUnaffordable}`);
  console.log(`  Playable units: ${fc.playableUnits}`);
  console.log(`  Sites gated: ${fc.sitesGated}`);
  console.log(`  Candidates generated: ${fc.candidatesGenerated}`);
  console.log(`  After limit: ${fc.candidatesAfterLimit}\n`);
}

// Summary
const allFieldsPresent = hasEvaluationBreakdown && hasCandidateDetails && hasFilteredCandidates;
console.log(allFieldsPresent
  ? '✓ T015 Implementation: COMPLETE - All enhanced fields present'
  : '✗ T015 Implementation: INCOMPLETE - Some fields missing');

process.exit(allFieldsPresent ? 0 : 1);
