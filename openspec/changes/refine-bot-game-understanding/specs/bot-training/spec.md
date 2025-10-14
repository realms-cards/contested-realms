## MODIFIED Requirements

### Requirement: Self-play training runner
The system SHALL provide an out-of-process self-play training runner that evolves bot parameters (θ) through population-based optimization, with enhanced telemetry for diagnosing evaluation quality.

#### Scenario: Population-based parameter optimization (CEM/CMA-ES)
- WHEN training runs
- THEN the system SHALL:
  - Maintain a population of θ candidates
  - Run paired matches (swap seats, common seeds) for each θ vs. baseline
  - Compute Elo/Glicko ratings based on match outcomes
  - Select top performers and resample (CEM) or adapt covariance (CMA-ES)
  - Export best θ as `data/bots/params/champion.yaml` with generation id

#### Scenario: Enhanced telemetry for evaluation quality
- WHEN self-play matches log turns
- THEN JSONL entries SHALL include:
  - **Evaluation breakdown**: per-feature contributions to final score (e.g., `{ board_development: 3.2, mana_efficiency: -1.5, total: 4.5 }`)
  - **Candidate details**: action labels, scores, legality status for all candidates considered
  - **Filtered candidates**: count of illegal moves pruned due to mana/threshold/timing violations
- AND training analysis SHALL detect regressions (e.g., "all scores = 0 again") automatically

#### Scenario: Validation of non-zero evaluation
- WHEN analyzing training logs after N matches
- THEN the analysis script SHALL:
  - Compute variance of `rootEval` across all turns
  - Flag θ candidates where variance < 0.1 (likely broken evaluation)
  - Report % of turns with meaningful action (non-pass) when mana available
- AND reject θ candidates that exhibit site-spam pathology (sites > 6, units = 0 for ≥10 consecutive turns)

#### Scenario: Champion gating on functional play
- WHEN selecting a new champion θ
- THEN the system SHALL require:
  - Win rate ≥ 55% vs. previous champion over ≥100 paired matches
  - Average `mana_wasted` in turns 5+ ≤ 4.0 (down from 14+ in broken baseline)
  - ≥60% of turns with 3+ mana result in a unit/spell played
  - No infinite-stalemate games (all games end within 30 turns)
- AND θ candidates failing these criteria SHALL be excluded even if Elo is higher

### Requirement: Feature Definition and Extraction
The training system SHALL define authoritative feature extraction logic aligned with refined evaluation function.

#### Scenario: Board development feature
- WHEN extracting features from a game state
- THEN `board_development` SHALL equal:
  - Count of minions owned by bot on battlefield
  - Plus count of relics/structures owned by bot on battlefield
  - Weighted by θ.w_board_development (default: 0.8)

#### Scenario: Mana efficiency feature
- WHEN extracting features from a game state
- THEN `mana_efficiency` SHALL equal:
  - `(mana_spent_this_turn / max(1, mana_available)) - 1.0` if turn ≥ 3
  - Weighted by θ.w_mana_efficiency (default: 0.7)
- AND `mana_wasted` SHALL apply penalty:
  - `-θ.w_mana_waste * max(0, mana_available - mana_spent)` if turn ≥ 4

#### Scenario: Threat deployment feature
- WHEN extracting features from a game state
- THEN `threat_deployment` SHALL equal:
  - Sum of ATK values of bot's untapped minions on battlefield
  - Weighted by θ.w_threat_deployment (default: 0.6)

#### Scenario: Life pressure feature
- WHEN extracting features from a game state
- THEN `life_pressure` SHALL equal:
  - Sum of ATK of bot's units within attack range (orthogonal) of opponent Avatar or opponent units
  - Weighted by θ.w_life_pressure (default: 1.2)

#### Scenario: Anti-pattern penalties
- WHEN extracting features from a candidate move
- THEN the system SHALL apply penalties for:
  - **Site spam**: `-θ.w_site_spam_penalty * 1.0` if sites ≥ 6 and action = "play_site"
  - **Wasted resources**: `-θ.w_wasted_resources * 1.0` if mana ≥ 3 and playable cards exist and action = "pass"
  - **Default weights**: `w_site_spam_penalty: 2.0`, `w_wasted_resources: 1.5`

### Requirement: Training run configuration
The training runner SHALL accept configuration for feature weights, search parameters, and evaluation modes.

#### Scenario: Theta configuration schema
- WHEN loading θ from YAML/JSON
- THEN the schema SHALL include:
  - `meta`: { id, generation, description }
  - `search`: { beamWidth, maxDepth, budgetMs, gamma }
  - `exploration`: { epsilon_root, gumbel_leaf } (0 in eval mode, >0 in training mode)
  - `weights`: { w_board_development, w_mana_efficiency, w_threat_deployment, w_life_pressure, w_site_spam_penalty, w_wasted_resources, ... }
  - `strategic_modifiers`: { establish_mana_turns: [1,2,3], deploy_threats_min_sites: 3, ... }

#### Scenario: Training vs. evaluation mode
- WHEN training mode is active
- THEN epsilon_root > 0 (e.g., 0.1) to encourage exploration
- AND gumbel_leaf > 0 (e.g., 0.05) for stochastic leaf evaluation
- WHEN evaluation mode is active
- THEN epsilon_root = 0 and gumbel_leaf = 0 for deterministic play

## ADDED Requirements

### Requirement: Regression Detection and Alerts
The training system SHALL automatically detect evaluation regressions and alert operators.

#### Scenario: Zero-variance detection
- WHEN analyzing logs from a training generation
- THEN if ≥80% of turns have `rootEval = 0.0` or variance < 0.05
- THEN the system SHALL:
  - Flag θ as "broken evaluation"
  - Halt promotion to champion
  - Log diagnostic: "Evaluation returned zero for all candidates; check feature extraction"

#### Scenario: Site-spam pathology detection
- WHEN analyzing match logs
- THEN if a bot plays sites on ≥90% of turns 5-15 while having mana ≥ 3
- THEN the system SHALL:
  - Flag θ as "degenerate site-spam"
  - Exclude from champion consideration
  - Log diagnostic: "Bot played sites on X/10 turns despite available mana; candidate filtering likely broken"

#### Scenario: Infinite stalemate detection
- WHEN a self-play match exceeds 50 turns without a winner
- THEN the system SHALL:
  - Terminate the match
  - Flag θ as "stalemate-prone"
  - Log diagnostic: "Match exceeded turn limit; neither bot applied win condition pressure"

### Requirement: Baseline Functional Play Validation
Before beginning parameter optimization, the training system SHALL validate that the baseline θ produces functional play.

#### Scenario: Smoke test for new training runs
- WHEN starting a training session
- THEN the system SHALL run 10 self-play matches with baseline θ
- AND validate:
  - ≥70% of turns with mana ≥ 3 result in non-site, non-pass actions
  - Average game length < 30 turns
  - `rootEval` variance ≥ 1.0 across all turns
- IF validation fails
- THEN halt training and report: "Baseline θ is broken; fix evaluation before training"

#### Scenario: Tutorial-quality play benchmarks
- WHEN validating a champion θ candidate
- THEN the system SHALL run 20 matches vs. baseline
- AND human-observer validation SHALL confirm:
  - Early turns (1-3): bot plays 2-3 sites (mana base establishment visible)
  - Mid turns (4-7): bot plays minions/relics (board development visible)
  - Late turns (8+): bot attacks or advances units (pressure visible)
- AND bots SHALL reach win conditions (Avatar defeated) in ≥90% of games

## REMOVED Requirements

_(None. This change extends the training system with quality gates; original training requirements remain.)_
