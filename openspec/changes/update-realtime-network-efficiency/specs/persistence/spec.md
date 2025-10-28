## ADDED Requirements

### Requirement: Configurable Tournament Persistence Mode
Tournament match persistence SHALL be configurable between immediate and buffered modes via environment variables.

#### Scenario: Buffered persistence (default)
- **WHEN** `PERSIST_TOURNAMENT_FORCE_IMMEDIATE=0`
- **THEN** match updates are buffered and flushed at ~1000 ms intervals or on finalize/shutdown
- **AND** flush batches up to 100 operations per transaction

#### Scenario: Immediate persistence
- **WHEN** `PERSIST_TOURNAMENT_FORCE_IMMEDIATE=1`
- **THEN** each match update is persisted in a transaction without delay

#### Scenario: Flush-on-end
- **WHEN** a tournament match ends or the server shuts down
- **THEN** any buffered updates MUST be flushed before returning/signal completion
