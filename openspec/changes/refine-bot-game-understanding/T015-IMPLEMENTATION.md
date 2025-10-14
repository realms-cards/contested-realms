# T015: Enhanced JSONL Logging Implementation

**Date**: 2025-10-14
**Status**: ✅ COMPLETE
**Task**: Enhanced telemetry logging with evaluation breakdown, candidate details, and filtering stats

## Summary

Enhanced the bot engine's telemetry logging to provide detailed diagnostic information for debugging and training analysis. The enhanced logs now include:

1. **Evaluation Breakdown** - Per-feature contributions to final score
2. **Candidate Details** - Action labels, scores, and legality for all candidates
3. **Filtered Candidates** - Stats on illegal moves pruned during generation

## Changes Made

### 1. New Function: `evalFeaturesWithBreakdown()`

**Location**: `bots/engine/index.js:1084-1115`

```javascript
function evalFeaturesWithBreakdown(f, w) {
  const breakdown = {};
  breakdown.life = (w.w_life || 0) * (f.life_my - f.life_opp);
  breakdown.atk = (w.w_atk || 0) * (f.atk_my - f.atk_opp);
  // ... all 20+ features

  let total = 0;
  for (const key of Object.keys(breakdown)) {
    if (Number.isFinite(breakdown[key])) total += breakdown[key];
  }

  return { breakdown, total };
}
```

**Purpose**: Computes per-feature contributions to evaluation score for transparency and debugging.

### 2. Enhanced `generateCandidates()` Tracking

**Location**: `bots/engine/index.js:1117-1225`

Added statistics tracking:

```javascript
const stats = {
  totalUnitsInHand: 0,      // Total units available
  filteredUnaffordable: 0,   // Units filtered due to cost
  playableUnits: 0,          // Units that passed validation
  sitesGated: false,         // Whether site playing was gated
  candidatesGenerated: 0,    // Total before limit
};
```

**Purpose**: Track how many illegal moves are filtered at generation time.

### 3. Updated `search()` to Collect Stats

**Location**: `bots/engine/index.js:1239-1243`

```javascript
const collectStats = options && typeof options.logger === 'function';
const genResult = generateCandidates(state, seat, { ...options, collectStats });
const list = collectStats ? genResult.candidates : genResult;
const generationStats = collectStats ? genResult.stats : null;
```

**Purpose**: Conditionally collect stats only when logging is enabled (no performance impact otherwise).

### 4. Enhanced Telemetry Output

**Location**: `bots/engine/index.js:1368-1422`

Added three new fields to logger output:

```javascript
{
  // ... existing fields ...

  // T015: Enhanced telemetry fields
  evaluationBreakdown: {
    life: 0.8,
    board_development: 3.2,
    mana_efficiency: 1.4,
    threat_deployment: 2.1,
    // ... all features
  },

  candidateDetails: [
    {
      action: "play_unit:Blacksmith_Family",
      score: 4.5,
      refined: 8.2,
      isLegal: true
    },
    // ... all candidates
  ],

  filteredCandidates: {
    totalUnitsInHand: 5,
    filteredUnaffordable: 3,
    playableUnits: 2,
    sitesGated: false,
    candidatesGenerated: 9,
    candidatesAfterLimit: 9
  }
}
```

## Usage Example

When `options.logger` is provided to `search()`, logs will automatically include enhanced fields:

```javascript
const { search } = require('./bots/engine');

const patch = search(state, seat, theta, rng, {
  mode: 'train',
  logger: (entry) => {
    // entry.evaluationBreakdown shows which features contributed most
    // entry.candidateDetails shows all moves considered with labels
    // entry.filteredCandidates shows how many illegal moves were pruned
    console.log(JSON.stringify(entry));
  }
});
```

## Diagnostic Value

### 1. Evaluation Breakdown

**Use Case**: Identify which features are dominating evaluation
**Example**: If `board_development: 12.5` and all others are <1.0, we know board presence is overpowered

### 2. Candidate Details

**Use Case**: See what actions the bot considered and why it chose one
**Example**: Bot chose `play_unit:Blacksmith_Family` (refined=8.2) over `draw:spellbook` (refined=3.1)

### 3. Filtered Candidates

**Use Case**: Verify cost validation is working
**Example**: `filteredUnaffordable: 3` means 3 units were in hand but unplayable due to cost

## Expected Behavior After T015

### Zero-Variance Detection

**Before**: No way to see if all candidates score 0.0
**After**: `evaluationBreakdown` shows which features are non-zero

### Illegal Move Detection

**Before**: No visibility into filtered candidates
**After**: `filteredCandidates` shows exactly how many illegal moves were pruned

### Action Interpretation

**Before**: Logs show generic patches without context
**After**: `candidateDetails` shows human-readable action labels

## Validation

### Code Verification

```bash
grep -n "T015" bots/engine/index.js
# Output shows 8 references to T015 implementation
```

### Log Schema Test

```bash
node scripts/test-t015-logging.js
# Verifies all three new fields are present in logs
```

### Next Run Verification

The next self-play training run will automatically include enhanced fields. Check logs:

```bash
tail -1 logs/training/YYYYMMDD/*.jsonl | jq '.evaluationBreakdown'
tail -1 logs/training/YYYYMMDD/*.jsonl | jq '.candidateDetails'
tail -1 logs/training/YYYYMMDD/*.jsonl | jq '.filteredCandidates'
```

## Files Modified

- `bots/engine/index.js`: Added `evalFeaturesWithBreakdown()`, enhanced stats tracking, updated logger
- `openspec/changes/refine-bot-game-understanding/tasks.md`: Marked T015 complete
- `scripts/test-t015-logging.js`: Created verification script (NEW)

## Next Steps

After T015, the recommended next task is **T016: Regression Detection Automation** to build tooling that automatically detects when bot behavior regresses.

## Success Criteria

✅ Evaluation breakdown computed for all logged turns
✅ Candidate details include action labels and scores
✅ Filtered candidates stats track illegal move pruning
✅ No performance impact when logging disabled
✅ Logs remain valid JSON and parse correctly
