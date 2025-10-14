# OpenSpec Change: Refine Bot Game Understanding

**Change ID**: `refine-bot-game-understanding`
**Status**: Proposal (continuation of `add-parameterized-rules-bot`)
**Author**: AI Assistant
**Date**: 2025-10-14

## Quick Summary

This change fixes the critical pathology in the CPU bot where it only plays sites every turn and never deploys minions, spells, or meaningful actions. The root causes are:

1. **Zero-variance evaluation** - all moves score 0.0
2. **No cost/threshold enforcement** - illegal moves generated freely
3. **Candidate generation bias** - 70% of candidates are site-playing sequences
4. **Missing game flow logic** - no mana pool, phase tracking, or win conditions

## What's in This Proposal

### Files
- **[proposal.md](proposal.md)** - High-level why/what/impact (23 lines)
- **[design.md](design.md)** - Detailed architecture decisions and trade-offs (232 lines)
- **[tasks.md](tasks.md)** - 32 implementation tasks with validation criteria (321 lines)
- **[specs/bot-engine/spec.md](specs/bot-engine/spec.md)** - Requirements for rule enforcement and evaluation (178 lines)
- **[specs/bot-training/spec.md](specs/bot-training/spec.md)** - Requirements for training quality gates (148 lines)

### Key Changes

#### 1. Explicit Game State Model
Create structured state representation with mana availability, threshold accumulation, turn phases, and win conditions.

```js
{
  resources: { p1: { manaAvailable: 5, manaSpent: 2, sitesUntapped: 3 } },
  thresholds: { p1: { air: 1, water: 0, earth: 3, fire: 1 } },
  turnState: { currentPlayer: 1, phase: 'Main', turnNumber: 5 },
  avatarStatus: { p1: { life: 20, atDeathsDoor: false } }
}
```

#### 2. Cost & Threshold Validation
Enforce mana costs and threshold requirements **before** generating candidates:
- `canAffordCard(state, seat, card)` checks cost ≤ available mana
- Filters hand by threshold requirements (e.g., 2E card needs 2 Earth thresholds)
- Eliminates illegal moves at source

#### 3. Enhanced Evaluation Function
Replace zero-signal features with meaningful strategic signals:
- **Board Development**: +0.8 per permanent deployed
- **Mana Efficiency**: +0.7 for spending available mana, -0.5 penalty per wasted mana
- **Threat Deployment**: +0.6 per ATK point on board
- **Life Pressure**: +1.2 for damage potential against opponent
- **Anti-Patterns**: -2.0 for site spam (sites ≥ 6), -1.5 for passing with resources

#### 4. Strategic Primitives
Phase-based weight modifiers guide decision-making:
- **Turns 1-3**: Establish mana base (prioritize sites)
- **Turns 4-7**: Deploy threats (prioritize minions when mana ≥ 3)
- **Turns 8+**: Apply pressure (prioritize attacks/movement)
- **Reactive**: Defend against lethal (prioritize blockers when threatened)

#### 5. Candidate Prioritization
Rewrite `generateCandidates()` to favor impactful actions:
- Prioritize affordable units (up to 8 candidates)
- Limit sites to 3 candidates, only if sites < 4
- Cap total candidates at 16 to control branching

#### 6. Diagnostic Telemetry
Extended logging for root-cause analysis:
- Per-feature evaluation breakdown (`board_development: 3.2, mana_efficiency: -1.5, ...`)
- Candidate details with action labels and legality checks
- Regression detection: auto-flag zero-variance or site-spam behavior

## Evidence of Problem

### Training Log Analysis
From `logs/training/20251014/match_match_3mo1lsyccs_cpu_A_x5jvqo.jsonl`:

```json
{"turnIndex":0, "rootEval":0, "candidates":[{"score":0},{"score":0}], "chosenCards":{"playedSite":{"name":"Remote Desert"}}}
{"turnIndex":2, "rootEval":0, "candidates":[{"score":0},...], "chosenCards":{"playedSite":{"name":"Cornerstone"}}}
{"turnIndex":4, "rootEval":0, "mana_wasted":3, "chosenCards":{"playedSite":{"name":"Remote Desert"}}}
{"turnIndex":6, "rootEval":0, "mana_wasted":4, "chosenCards":{"playedSite":{"name":"Arid Desert"}}}
...
{"turnIndex":70, "rootEval":0, "mana_wasted":14, "sites_my":14, "chosenCards":{"playedSite":{"name":"Vesuvius"}}}
```

**Every turn**: `rootEval: 0`, all candidate scores = 0, only sites played, `mana_wasted` climbs to 14+

### Root Cause in Code

**`evalFeatures()` returns 0**:
```js
function evalFeatures(f, w) {
  let s = 0;
  s += (w.w_life || 0) * (f.life_my - f.life_opp); // 0 - 0 = 0
  s += (w.w_atk || 0) * (f.atk_my - f.atk_opp);     // 0 - 0 = 0
  s += (w.w_threats_my || 0) * f.threats_my;         // 0.7 * 0 = 0
  // ... all features extract 0 or cancel out
  return s; // always 0
}
```

**`generateCandidates()` biased toward sites**:
```js
// 70% of candidates involve playing sites
if (allowSiteOnly) {
  if (drawAtlas && siteAfterDrawA) moves.push(...);  // 3 site candidates
  if (drawSpell && siteAfterDrawS) moves.push(...);  // 3 more site candidates
  if (siteBase) moves.push(...);                     // 1 more site candidate
}
// Only 1-2 unit candidates generated when mana available
```

## Success Criteria

### Quantitative
1. **Non-zero evaluation**: `rootEval` variance ≥ 1.0 across turns (not all zeros)
2. **Unit deployment**: ≥60% of turns with mana ≥ 3 result in minion/spell played (not site)
3. **Mana efficiency**: Average `mana_wasted` in turns 5+ ≤ 4.0 (down from 14+)
4. **Game completion**: Self-play matches end with "Avatar defeated" within 20 turns (not stalemates)

### Qualitative (Tutorial Quality)
5. **Human-observable play patterns**:
   - Turns 1-3: Bot plays 2-3 sites (mana base)
   - Turns 4-7: Bot plays minions (board development)
   - Turns 8+: Bot attacks or advances units (pressure)

## Timeline

- **Week 1**: Core rule modeling (T001-T003), enhanced evaluation (T004-T009)
- **Week 2**: Strategic primitives (T010-T011), candidate refinement (T012-T014), telemetry (T015-T016)
- **Week 3**: Rulebook integration (T017-T018), training validation (T019-T021), testing (T024-T026)
- **Week 4**: Documentation (T022-T023), deployment (T027-T029), finalization (T030-T032)

## Next Steps

1. **Review this proposal** - Confirm scope and approach align with project goals
2. **Use `/openspec:apply refine-bot-game-understanding`** - Scaffold implementation when ready
3. **Start with T001-T003** - Core rule enforcement to unblock evaluation fixes
4. **Run smoke tests early** - Validate evaluation produces non-zero scores before full implementation

## Dependencies

- **Continuation of**: `add-parameterized-rules-bot` (provides baseline engine, theta configs, training harness)
- **Supersedes**: Evaluation and legality logic from `add-parameterized-rules-bot` (complete rewrite)
- **Blocks**: Tutorial mode UX integration (requires functional bot first)

## Related Files

- Current broken implementation: [bots/engine/index.js](../../../bots/engine/index.js)
- Training logs evidence: [logs/training/20251014/](../../../logs/training/20251014/)
- Rulebook reference: [reference/SorceryRulebook.pdf](../../../reference/SorceryRulebook.pdf)
- Extracted rules: [reference/SorceryRulesExtracted.csv](../../../reference/SorceryRulesExtracted.csv)
- Bot rules mapping: [reference/BotRules.csv](../../../reference/BotRules.csv)

## Questions?

See [design.md](design.md) for architectural decisions and trade-offs, or [tasks.md](tasks.md) for detailed implementation steps with validation criteria.
