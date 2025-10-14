## ADDED Requirements

### Requirement: Self-Play Training and Model Selection
The system SHALL train θ via self-play with evolutionary selection, without neural networks.

#### Scenario: Population initialization and season play
- WHEN a training season starts
- THEN the system SHALL generate a population of θ (seeded from a baseline with noise)
- AND it SHALL schedule paired matches with fixed seeds and swapped seats

#### Scenario: Ranking and selection
- WHEN all scheduled matches complete
- THEN the system SHALL compute Elo or Glicko ratings per θ
- AND it SHALL select the top percentile as elites

#### Scenario: Cross-Entropy Method resampling
- WHEN elites are identified
- THEN the system SHALL fit a Gaussian over elite θ and sample a new population

#### Scenario: Champion gating and promotion
- WHEN a candidate surpasses the current champion by a statistically significant margin (e.g., SPR t-test)
- THEN the system SHALL promote it as the new champion θ and persist it to `data/bots/params/champion.yaml`

#### Scenario: Deterministic and exploratory modes
- WHEN running evaluation matches
- THEN the system SHALL set ε=0 and disable noise
- WHEN running training matches
- THEN the system SHALL enable ε>0 and small leaf noise

### Requirement: Out-of-Process Training and Exportable Artifacts
The system SHALL allow training to run separately from the live application and export artifacts consumable by other instances.

#### Scenario: Export champion and logs
- WHEN a generation promotes a new champion
- THEN the system SHALL write the champion θ (e.g., `data/bots/params/champion.yaml`) and season logs to a portable location

#### Scenario: Import champion on another instance
- WHEN a champion θ file is provided to a different deployment
- THEN the live bot engine SHALL load it on start without requiring a code change

### Requirement: Opening/Mulligan Book (v1)
The system MAY maintain an opening/mulligan book derived from frequency and win-rate statistics.

#### Scenario: Book extraction
- WHEN enough games are logged
- THEN the system SHALL extract the first 2–3 turns and mulligan decisions into a state-hash → move book with win-rates

### Requirement: Telemetry for training
The system MUST store per-turn telemetry and season summaries for analysis.

#### Scenario: Season summary
- WHEN a season completes
- THEN the system SHALL write a summary with generation id, ratings, elites, and champion id

### Requirement: Admin Dashboard Ladder View
The system SHOULD surface training results on an admin dashboard.

#### Scenario: Elo ladder and champion metadata at /admin
- WHEN visiting `/admin`
- THEN the dashboard SHALL display θ id, Elo, generation, recent head-to-heads, and current champion metadata
