## ADDED Requirements

### Requirement: Parameterized Rules Bot Engine
The system SHALL provide a deterministic, parameterized bot engine that selects legal moves via rules+search without neural networks.

#### Scenario: Produce a legal move within time budget
- WHEN the bot is the current player in Main phase
- THEN it SHALL select a legal move within the configured per-turn budget (e.g., 40–80 ms)
- AND the move SHALL be applied as a valid state patch compatible with `server/index.js`

#### Scenario: Deterministic output under fixed seed and θ
- WHEN the same state, seed, and parameter set θ are provided
- THEN the engine SHALL produce the same chosen move and evaluation repeatedly

#### Scenario: Quiescence for tactical instability
- WHEN immediate lethal lines or removal blowouts exist
- THEN the search SHALL extend locally (quiescence) before evaluating the leaf

#### Scenario: Evaluation function with transparent features
- WHEN evaluating a state
- THEN the engine SHALL compute features for board presence, card economy, tempo/mana, life/lethal pressure, and optional synergy/risk hooks
- AND it SHALL return V(s; θ) as a weighted sum of these features

#### Scenario: Exploration disabled in evaluation mode
- WHEN CPU evaluation mode is active
- THEN ε-greedy and leaf noise SHALL be disabled

#### Scenario: Hot-swap champion parameters
- WHEN a new champion θ file path is provided
- THEN the bot SHALL load it on process start without code changes

### Requirement: Telemetry and logging
The system MUST emit per-turn telemetry for bot decisions during training and optionally during development.

#### Scenario: Per-turn JSONL logs
- WHEN training mode is active
- THEN the system SHALL write JSONL entries containing seed, θ id, candidate moves, chosen, root features, root eval, nodes, depth, beam, and timeMs
