## 1. Core Rule Enforcement

### T001 Implement Explicit Game State Model ✅ COMPLETE
- [x] Create `buildGameStateModel(serverState)` function in `bots/engine/index.js`
- Extract and structure:
  - `resources.{p1,p2}.{manaAvailable, manaSpent, sitesUntapped, sitesTapped}`
  - `thresholds.{p1,p2}.{air, water, earth, fire}`
  - `turnState.{currentPlayer, phase, turnNumber}`
  - `avatarStatus.{p1,p2}.{life, atDeathsDoor}`
- Add unit tests: verify mana calculation matches site count + providers
- **Validation**: Parse 10 existing training log states; confirm mana calculations match manual counts

### T002 Implement Cost and Threshold Validation ✅ COMPLETE
- [x] Create `canAffordCard(state, seat, card)` function
  - Check `card.cost <= countUntappedMana(state, seat)`
  - Check `card.thresholds` satisfied by `countThresholdsForSeat(state, seat)`
- Create `countUntappedMana(state, seat)` helper
  - Count sites where `tapped = false`
  - Add mana providers (e.g., Blacksmith Family) where `tapped = false`
- Update `generateCandidates()` to call `canAffordCard()` before adding play-card candidates
- Add unit tests: verify 5-cost card filtered when mana = 2; verify 2E card filtered when earth thresholds = 1
- **Validation**: Run bot with test deck containing high-cost cards; confirm illegal candidates not generated

### T003 Implement Win Condition Detection ✅ COMPLETE
- [x] Create `detectWinCondition(state, seat)` function
  - Check opponent life = 0 → mark `atDeathsDoor = true`
  - Check `atDeathsDoor = true` and damage dealt → return `VICTORY`
- Integrate into `extractFeatures()`: set `lethal_now = 1` when victory detectable
- Add unit tests: verify detection when opp life = 0; verify lethal priority when bot can attack
- **Validation**: Self-play match where bot reduces opponent to 0 life; confirm bot attacks next turn for victory

## 2. Enhanced Evaluation Function

### T004 Implement Board Development Feature ✅ COMPLETE
- [x] Add `extractBoardDevelopment(state, seat)` function
  - Count minions owned by `seat` in `state.permanents`
  - Count relics/structures owned by `seat`
  - Return integer count
- Update `extractFeatures()` to include `board_development`
- Update `evalFeatures()` to apply `w_board_development` weight
- Add unit tests: verify count increases when minion played; verify weight application
- **Validation**: Log shows `board_development: 0` turn 1, `board_development: 2` after 2 minions played

### T005 Implement Mana Efficiency Feature ✅ COMPLETE
- [x] Add `extractManaEfficiency(state, prevState, seat)` function
  - Calculate `spentRatio = manaSpent / max(1, manaAvailable)`
  - Calculate `manaWasted = max(0, manaAvailable - manaSpent)`
  - Return `{ efficiency: spentRatio, wasted: manaWasted }`
- Update `extractFeatures()` to include `mana_efficiency` and `mana_wasted`
- Update `evalFeatures()` to apply `w_mana_efficiency` and `w_mana_waste` (negative) weights
- Add unit tests: verify penalty when 5 mana available but 0 spent
- **Validation**: Bot with 5 mana and playable 3-cost card scores higher for "play card" than "pass"

### T006 Implement Threat Deployment Feature ✅ COMPLETE
- [x] Add `extractThreatDeployment(state, seat)` function
  - Sum ATK values of untapped minions owned by `seat`
  - Return integer sum
- Update `extractFeatures()` to include `threat_deployment`
- Update `evalFeatures()` to apply `w_threat_deployment` weight
- Add unit tests: verify ATK sum matches minion stats
- **Validation**: Bot with 2x 3-ATK minions shows `threat_deployment: 6`

### T007 Implement Life Pressure Feature ✅ COMPLETE
- [x] Add `extractLifePressure(state, seat)` function
  - Identify bot's units within attack range (orthogonally adjacent) of opponent Avatar or opponent units
  - Sum ATK of those units
  - Return integer sum
- Update `extractFeatures()` to include `life_pressure`
- Update `evalFeatures()` to apply `w_life_pressure` weight (high priority)
- Add unit tests: verify pressure = 0 when no units adjacent; pressure = ATK when adjacent to Avatar
- **Validation**: Bot with 4-ATK unit adjacent to opponent Avatar shows `life_pressure: 4`

### T008 Implement Anti-Pattern Penalties ✅ COMPLETE
- [x] Add `extractAntiPatterns(state, prevState, seat, candidateAction)` function
  - Detect site spam: `sites >= 6 && candidateAction == 'play_site'` → penalty -2.0
  - Detect wasted resources: `mana >= 3 && playableCards.length > 0 && candidateAction == 'pass'` → penalty -1.5
  - Return penalty sum
- Update `evalFeatures()` to subtract anti-pattern penalties
- Add unit tests: verify penalties applied correctly
- **Validation**: Bot with 8 sites scores "play site" lower than "play minion" when minion affordable

### T009 Integrate All Features into Evaluation ✅ COMPLETE
- [x] Update `evalFeatures(f, w)` to include all new features:
  - `board_development`, `mana_efficiency`, `mana_wasted`, `threat_deployment`, `life_pressure`
  - Anti-pattern penalties
- Update default theta in `loadTheta()` with hand-tuned weights:
  - `w_board_development: 0.8`
  - `w_mana_efficiency: 0.7`
  - `w_mana_waste: -0.5`
  - `w_threat_deployment: 0.6`
  - `w_life_pressure: 1.2`
  - `w_site_spam_penalty: -2.0`
  - `w_wasted_resources: -1.5`
- Add integration test: run bot for 10 turns; verify `rootEval` varies (not all zeros)
- **Validation**: Training logs show non-zero `rootEval` on ≥80% of turns

## 3. Strategic Primitives

### T010 Implement Phase-Based Weight Modifiers ✅ COMPLETE
- [x] Add `getStrategicModifiers(state, seat, theta)` function
  - **Establish mana base** (turns 1-3, sites < 3): return `{ play_site: +2.0, play_unit: +0.5 }`
  - **Deploy threats** (sites ≥ 3, threats = 0): return `{ play_minion: +1.5, play_site: -0.5 }`
  - **Apply pressure** (threats > 0, opp life < 15): return `{ attack: +1.2, play_site: -1.0 }`
  - **Defend lethal** (opp damage potential ≥ bot life): return `{ play_blocker: +5.0, attack: -2.0 }`
- Integrate into `evalFeatures()`: multiply base score by modifier
- Add unit tests: verify modifiers activate at correct thresholds
- **Validation**: Bot on turn 2 with 1 site prioritizes playing site over passing; bot on turn 5 with 4 sites prioritizes playing minion

### T011 Conditional Feature Extraction ⚠️ PARTIAL
- [ ] Update `extractFeatures()` to call `getStrategicModifiers()`
- Note: Strategic modifiers implemented but not yet integrated into search scoring
- Apply modifiers to candidate scores before ranking
- Add integration test: verify turn-by-turn priority shifts (sites early → units mid → attacks late)
- **Validation**: Self-play match logs show phase transitions: mana base → threat deployment → pressure application

## 4. Candidate Generation Refinement

### T012 Prioritize Unit Deployment Candidates ✅ COMPLETE
- [x] Rewrite `generateCandidates()` to:
  1. Generate all affordable unit-playing candidates (up to 8)
  2. Generate site-playing candidates (up to 3) only if `sites < 4` OR no units affordable
  3. Generate movement/attack candidates (up to 4)
  4. Generate draw/pass candidates (always include)
- Add `filterPlayableUnits(state, seat)` helper
  - Filter hand by `canAffordCard()`
  - Return up to 8 playable units
- Add unit tests: verify unit candidates appear before site candidates when both affordable
- **Validation**: Bot with 4 sites and affordable 3-cost minion generates 1 unit candidate + 1 site candidate (not 8 site candidates)

### T013 Gate Site-Playing After Mana Base Established ✅ COMPLETE
- [x] Add logic to `generateCandidates()`:
  - If `sites >= 6`, deprioritize site candidates (move to end of list)
  - If `sites >= 6` and no affordable units, prefer "draw spell" over "play site"
- Add unit tests: verify site candidates ranked last when sites ≥ 6
- **Validation**: Bot with 7 sites and no affordable units draws from spellbook instead of playing 8th site

### T014 Limit Branching Factor ✅ COMPLETE
- [x] Cap `generateCandidates()` to return ≤ 16 total candidates
- Prioritize by strategic relevance:
  1. Lethal attacks (if available)
  2. Affordable units (up to 8)
  3. Movement toward opponent (up to 4)
  4. Sites (up to 3)
  5. Draw/pass (always include)
- Add unit tests: verify cap enforced; verify priority ordering
- **Validation**: Training logs show `candidates.length <= 16` on all turns

## 5. Telemetry and Diagnostics

### T015 Enhanced JSONL Logging ✅ COMPLETE
- [x] Update telemetry schema in `bots/engine/index.js`:
  - [x] Add `evaluationBreakdown`: object with per-feature contributions
    - Example: `{ board_development: 3.2, mana_efficiency: -1.5, threat_deployment: 4.8, total: 6.5 }`
  - [x] Add `candidateDetails`: array with action labels, scores, legality
    - Example: `[{ action: "play_unit:Blacksmith_Family", score: 4.5, refined: 8.2, isLegal: true }, ...]`
  - [x] Add `filteredCandidates`: count of illegal moves pruned
    - Example: `{ totalUnitsInHand: 5, filteredUnaffordable: 3, playableUnits: 2, sitesGated: false, candidatesGenerated: 9, candidatesAfterLimit: 9 }`
- [x] Created `evalFeaturesWithBreakdown()` helper function for per-feature scoring
- [x] Enhanced `generateCandidates()` to track filtering stats
- [x] Updated logger call to include all three new fields
- [ ] Update `scripts/training/selfplay.js` to write enhanced logs (logs already enhanced by engine)
- [ ] Add log parsing script `scripts/training/analyze-logs.js` to compute:
  - Variance of `rootEval` across turns
  - % of turns with meaningful actions (non-pass when mana ≥ 3)
  - Average `mana_wasted` in turns 5+
- **Validation**: Logs include `evaluationBreakdown`; analysis script runs without errors

### T016 Regression Detection Automation
- Add `detectRegressions()` function in `scripts/training/analyze-logs.js`
  - Check: if `rootEval` variance < 0.1, flag "zero-variance regression"
  - Check: if % site-playing turns 5-15 > 80% while mana ≥ 3, flag "site-spam pathology"
  - Check: if average game length > 50 turns, flag "infinite stalemate"
- Integrate into `selfplay.js`: halt training if regression detected
- Add unit tests: verify detection with synthetic logs
- **Validation**: Inject broken theta (all weights = 0); confirm training halts with diagnostic message

## 6. Rulebook Integration

### T017 Map Rulebook Rules to Bot Logic
- Create `reference/bot-rulebook-mapping.md`:
  - **PLACEMENT rules** → implemented in `playSitePatch()` (first site at Avatar pos, adjacent to owned)
  - **COST rules** → implemented in `canAffordCard()` (mana and thresholds)
  - **TIMING rules** → implemented in `generateCandidates()` (Main-phase gating)
  - **COMBAT rules** → implemented in `generateMoveCandidates()` (orthogonal adjacency)
  - **WINNING THE GAME** → implemented in `detectWinCondition()` (death's door, death blow)
- Document coverage gaps for v2: regions, instants, triggered abilities
- **Validation**: Manual review confirms all v1 rules mapped

### T018 Validate Against Reference Rules
- Create test suite `tests/bot-rules-validation.test.js`:
  - Load `reference/BotRules.csv`
  - For each PLACEMENT rule, verify `playSitePatch()` enforces constraint
  - For each COST rule, verify `canAffordCard()` rejects violations
  - For each TIMING rule, verify `generateCandidates()` respects phase
- Run tests; fix any violations
- **Validation**: All rulebook tests pass

## 7. Training Validation

### T019 Baseline Functional Play Smoke Test
- Update `scripts/training/selfplay.js` to run smoke test before training:
  - Run 10 self-play matches with baseline theta
  - Validate:
    - ≥70% of turns with mana ≥ 3 result in non-site, non-pass actions
    - Average game length < 30 turns
    - `rootEval` variance ≥ 1.0
  - If fails, halt with error message
- Add smoke test to CI/CD pipeline
- **Validation**: Smoke test passes with refined theta; fails with broken (all-zeros) theta

### T020 Champion Gating on Functional Play
- Update champion selection logic in `scripts/training/selfplay.js`:
  - Require win rate ≥ 55% vs. previous champion over ≥100 matches
  - Require average `mana_wasted` in turns 5+ ≤ 4.0
  - Require ≥60% of turns with mana ≥ 3 result in unit/spell played
  - Require all games end within 30 turns
- Reject theta candidates failing criteria even if Elo higher
- Log rejection reason
- **Validation**: Inject theta with high Elo but site-spam behavior; confirm rejection with diagnostic

### T021 Update Champion Theta with Refined Weights
- Create `data/bots/params/champion-v2.yaml`:
  - Copy baseline theta from `loadTheta()`
  - Set `meta.id = "refined/v2"`
  - Set `meta.description = "Hand-tuned weights with mana/threshold enforcement"`
- Run 20 self-play matches; validate functional play
- Replace `data/bots/params/champion.yaml` with v2
- **Validation**: Bot plays minions on turn 4-7; attacks on turn 8+; games end with victory in <20 turns

## 8. Documentation and Examples

### T022 Update Bot Engine README
- Add section to `bots/engine/README.md` (create if missing):
  - Explain evaluation features (board development, mana efficiency, etc.)
  - Document strategic primitives (establish mana base, deploy threats, etc.)
  - Provide example theta configurations
  - Explain how to enable/disable bots via env flags
- Include troubleshooting section for common issues (zero-variance, site-spam)
- **Validation**: Manual review confirms clarity and completeness

### T023 Create Tutorial Mode Integration Example
- Create `examples/tutorial-bot-integration.md`:
  - Show how to spawn tutorial bot with "beginner-friendly" theta
  - Explain how to adjust difficulty (reduce beam width, increase epsilon for mistakes)
  - Provide example UI for "bot is thinking..." message during search
- Add mock UI component `TutorialBotOpponent.tsx` in `src/components/tutorial/`
- **Validation**: Example runnable in dev environment; bot plays functionally

## 9. Testing and Validation

### T024 Unit Tests for Rule Enforcement
- `tests/bot/cost-validation.test.js`: verify `canAffordCard()` with various mana/threshold scenarios
- `tests/bot/state-model.test.js`: verify `buildGameStateModel()` extracts correct resources
- `tests/bot/win-condition.test.js`: verify `detectWinCondition()` detects death's door and death blow
- All tests pass
- **Validation**: Run `npm test -- bot/` confirms 100% pass

### T025 Integration Tests for Evaluation Quality
- `tests/bot/evaluation-variance.test.js`:
  - Generate 20 random game states
  - Run `search()` on each
  - Verify `rootEval` varies (standard deviation ≥ 1.0)
  - Verify candidates have non-zero score differences
- `tests/bot/functional-play.test.js`:
  - Run bot for 15 turns in mock match
  - Verify minions played on turns 4-7
  - Verify mana_wasted < 3 on average
- All tests pass
- **Validation**: Run `npm test -- bot/integration` confirms functional play

### T026 Self-Play Validation Matches
- Run 50 self-play matches with refined theta vs. baseline (broken) theta
- Collect statistics:
  - Win rate (expect ≥90% for refined)
  - Average game length (expect <20 turns for refined vs. timeout for baseline)
  - % turns with meaningful actions (expect ≥70% for refined vs. ~10% for baseline)
- Document results in `openspec/changes/refine-bot-game-understanding/validation-results.md`
- **Validation**: Refined theta dominates baseline; games conclude with victories

## 10. Deployment and Monitoring

### T027 Enable Refined Bot in Development Environment
- Set env flags in `.env.local`:
  - `NEXT_PUBLIC_CPU_BOTS_ENABLED=true`
  - `CPU_AI_ENGINE_MODE=evaluate` (deterministic, no exploration)
- Start dev server; create match with CPU opponent
- Observe bot play: should play sites turns 1-3, minions turns 4-7, attack turn 8+
- **Validation**: Manual play against bot confirms functional, tutorial-quality behavior

### T028 Production Telemetry Integration
- Update `server/index.js` to optionally log bot decisions to `logs/production/bot-decisions.jsonl`
  - Only if `LOG_BOT_DECISIONS=true` env flag set
- Add log rotation (daily) to prevent disk bloat
- Create dashboard query to monitor:
  - % of bot turns with meaningful actions
  - Average `mana_wasted`
  - Variance of `rootEval`
- **Validation**: Dashboard shows healthy metrics after 100 production bot matches

### T029 Rollback Plan
- Document rollback procedure in `docs/bot-rollback.md`:
  - Revert `data/bots/params/champion.yaml` to previous version
  - Restart bot processes to reload theta
  - Monitor for regression resolution
- Test rollback in staging
- **Validation**: Rollback completes in <5 minutes; bot reverts to previous behavior

## 11. Finalization

### T030 OpenSpec Validation
- Run `openspec validate refine-bot-game-understanding --strict`
- Resolve all validation errors
- Confirm all requirements mapped to tasks
- **Validation**: OpenSpec validation passes with 0 errors

### T031 Update Project Documentation
- Update `CLAUDE.md` to document bot refinement completion
- Add bot architecture summary to project README
- Document known limitations (no regions, no instants, no triggered abilities in v1)
- **Validation**: Documentation reviewed and approved

### T032 Training Handoff
- Run initial 100-match training session with refined theta
- Export champion and logs to `data/bots/training-artifacts/refine-v2/`
- Document training parameters and results in `openspec/changes/refine-bot-game-understanding/training-report.md`
- **Validation**: Training produces champion theta with win rate ≥60% vs. hand-tuned baseline
