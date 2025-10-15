## MODIFIED Requirements

### Requirement: Parameterized Rules Bot Engine
The system SHALL provide a deterministic, parameterized bot engine that selects legal moves via rules+search without neural networks, with explicit cost and threshold validation.

#### Scenario: Enforce mana costs and thresholds before candidate generation
- GIVEN a game state with available mana M and accumulated thresholds T
- WHEN generating candidate moves for cards in hand
- THEN the engine SHALL filter out cards that:
  - Require mana cost > M
  - Require thresholds not satisfied by T
  - Are not legal in the current phase (e.g., permanents in Combat phase)
- AND only legal, affordable candidates SHALL be evaluated

#### Scenario: Produce a legal move within time budget
- WHEN the bot is the current player in Main phase
- THEN it SHALL select a legal move within a soft per-turn budget (e.g., 40–80 ms)
- AND the move SHALL be applied as a valid state patch compatible with `server/index.js`
- AND the chosen move SHALL have passed mana/threshold validation

#### Scenario: Evaluation function produces non-zero variance
- GIVEN two candidate game states:
  - State A: 3 sites, 0 minions, 5 mana wasted
  - State B: 3 sites, 2 minions deployed, 1 mana wasted
- WHEN evaluating both states
- THEN State B SHALL score higher than State A
- AND the evaluation SHALL return non-zero scores for meaningful state differences

#### Scenario: Strategic primitives guide decision-making
- GIVEN turn number N and game state S
- WHEN N ≤ 3 and owned sites < 3
- THEN the evaluation SHALL prioritize "establish mana base" actions (play sites)
- WHEN N > 3 and owned sites ≥ 3 and no threats deployed
- THEN the evaluation SHALL prioritize "deploy threats" actions (play minions/relics)
- WHEN opponent Avatar at death's door and bot has damage available
- THEN the evaluation SHALL prioritize "apply lethal pressure" actions (attack/direct damage)

#### Scenario: Anti-pattern penalties prevent degenerate play
- GIVEN owned sites ≥ 6 and no units played this turn
- WHEN evaluating a "play site" candidate
- THEN the evaluation SHALL apply a site-spam penalty of ≤ -2.0
- GIVEN mana available and playable cards in hand
- WHEN evaluating a "pass turn" candidate
- THEN the evaluation SHALL apply a wasted-resources penalty of ≤ -1.5

### Requirement: Explicit Game State Model
The engine SHALL maintain an explicit, structured representation of game resources, thresholds, turn state, and win conditions beyond raw server patches.

#### Scenario: Track mana availability per player
- GIVEN a game state after Main phase actions
- WHEN calculating mana for player P
- THEN the engine SHALL count:
  - Untapped sites owned by P
  - Untapped mana providers (permanents) owned by P
  - Subtract mana spent this turn
- AND return an integer `manaAvailable`

#### Scenario: Track threshold accumulation per player
- GIVEN a game state with sites and threshold-granting permanents
- WHEN calculating thresholds for player P
- THEN the engine SHALL aggregate:
  - Threshold icons from all sites owned by P
  - Threshold grants from permanents (e.g., Ruby Core grants 1 Fire)
- AND return a threshold object `{ air: X, water: Y, earth: Z, fire: W }`

#### Scenario: Detect win conditions
- GIVEN opponent Avatar life = 0
- WHEN evaluating next state
- THEN the engine SHALL mark opponent as "at death's door"
- GIVEN opponent at death's door and bot action deals ≥1 damage to Avatar
- THEN the evaluation SHALL score +10.0 for lethal victory

### Requirement: Phase-in legality toward full rules
The system SHALL phase-in legality coverage and target full Sorcery rules over time, guided by `reference/SorceryRulebook.pdf`, with v1 covering mana, thresholds, and Main-phase actions.

#### Scenario: Baseline legality coverage (v1)
- WHEN v1 ships
- THEN the engine SHALL enforce:
  - Mana costs for playing cards
  - Threshold requirements for playing cards
  - Site placement rules (first site at Avatar pos, subsequent adjacent to owned)
  - Main-phase timing (only generate play-card candidates during Main phase)
  - Basic win conditions (Avatar at 0 life → death's door → death blow)

#### Scenario: Incremental expansion without regressions (v2+)
- WHEN additional timing windows and card interactions are implemented
- THEN prior-covered rules SHALL continue to function
- AND new coverage SHALL align with `reference/SorceryRulebook.pdf`
- AND regression tests SHALL verify v1 rules remain enforced

#### Scenario: Evaluation function with transparent features
- WHEN evaluating a state
- THEN the engine SHALL compute features for:
  - **Board development**: count of permanents deployed
  - **Mana efficiency**: ratio of mana spent to mana available
  - **Tempo**: meaningful actions taken vs. passed turns
  - **Threat deployment**: count and ATK of units on board
  - **Life pressure**: damage potential against opponent
  - **Card advantage**: hand size differential
- AND it SHALL return V(s; θ) as a weighted sum of these features
- AND V(s; θ) SHALL vary across different game states (non-zero variance)

#### Scenario: Exploration disabled in evaluation mode
- WHEN CPU evaluation mode is active
- THEN ε-greedy and leaf noise SHALL be disabled

#### Scenario: Hot-swap champion parameters
- WHEN a new champion θ file path is provided
- THEN the bot SHALL load it on process start without code changes

### Requirement: Telemetry and logging
The system MUST emit per-turn telemetry for bot decisions during training and optionally during development, with diagnostic breakdowns.

#### Scenario: Per-turn JSONL logs with evaluation breakdown
- WHEN training mode is active
- THEN the system SHALL write JSONL entries containing:
  - seed, θ id, candidate moves, chosen, root features, root eval, nodes, depth, beam, timeMs
  - **New**: `evaluationBreakdown` object with per-feature contributions (e.g., `{ board_development: 3.2, mana_efficiency: -1.5, ... }`)
  - **New**: `candidateDetails` array with per-candidate action labels, scores, and legality checks

#### Scenario: Legality failure logging
- WHEN a candidate is filtered out due to insufficient mana or thresholds
- THEN the log entry SHALL include:
  - `filteredCandidates` count
  - Example illegal action and reason (e.g., `"play_unit_Dragon: insufficient_mana (cost=5, available=2)"`)

## ADDED Requirements

### Requirement: Candidate Pruning and Prioritization
The engine SHALL generate candidates in priority order, favoring impactful game actions over degenerate sequences.

#### Scenario: Prioritize unit deployment when mana available
- GIVEN mana available ≥ 3 and playable units in hand
- WHEN generating candidates
- THEN the engine SHALL generate 5-8 unit-playing candidates before site-playing candidates
- AND shall limit site-playing candidates to ≤3 if units are available

#### Scenario: Gate site-playing after mana base established
- GIVEN owned sites ≥ 6
- WHEN generating candidates
- THEN the engine SHALL deprioritize "play site" candidates (lower in candidate list)
- AND shall boost "play unit" or "draw spell" candidates to top positions

#### Scenario: Limit branching factor for performance
- WHEN generating candidates in beam search
- THEN the engine SHALL cap total candidates per turn to ≤16
- AND prioritize candidates by strategic relevance (units > sites > pass)

### Requirement: Strategic Primitives Library
The engine SHALL encode fundamental Sorcery strategic concepts as conditional weights in theta, adapting evaluation to game phase.

#### Scenario: Establish mana base (early game)
- GIVEN turn number ≤ 3 and owned sites < 3
- WHEN evaluating candidates
- THEN "play site" actions SHALL receive weight modifier +2.0
- AND "play unit" actions SHALL receive weight modifier +0.5 (deprioritized until mana ready)

#### Scenario: Deploy threats (mid game)
- GIVEN owned sites ≥ 3 and threats on board = 0
- WHEN evaluating candidates
- THEN "play minion" actions SHALL receive weight modifier +1.5
- AND "play site" actions SHALL receive weight modifier -0.5

#### Scenario: Apply pressure (late game)
- GIVEN threats on board > 0 and opponent life < 15
- WHEN evaluating candidates
- THEN movement/attack actions SHALL receive weight modifier +1.2
- AND "play site" actions SHALL receive weight modifier -1.0

#### Scenario: Defend against lethal (reactive)
- GIVEN opponent has damage potential ≥ bot life
- WHEN evaluating candidates
- THEN blocker deployment/removal SHALL receive weight modifier +5.0
- AND aggressive actions SHALL receive weight modifier -2.0

## REMOVED Requirements

_(None. All requirements from previous spec remain; this change enhances and extends them.)_
