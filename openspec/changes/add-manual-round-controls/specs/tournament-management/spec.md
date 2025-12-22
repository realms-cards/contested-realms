## ADDED Requirements
### Requirement: Manual Round Completion
The system SHALL require the host to explicitly end a round before advancing to the next round.

#### Scenario: Round ready but awaiting host
- **GIVEN** all matches in a round are completed or invalidated
- **WHEN** the host has not ended the round
- **THEN** the round remains active and no next-round pairings start

#### Scenario: Host ends a round
- **GIVEN** a round is ready to end
- **WHEN** the host ends the round
- **THEN** the round is completed and standings are updated

### Requirement: Match Invalidations and Byes
The system SHALL allow the host to mark a match as invalid and optionally award a bye to the remaining player.

#### Scenario: Host invalidates a match
- **GIVEN** a match cannot be completed
- **WHEN** the host marks the match invalid
- **THEN** the match no longer blocks round completion

#### Scenario: Host awards a bye
- **GIVEN** a match is invalidated and one player is available
- **WHEN** the host awards a bye
- **THEN** the remaining player receives a win for the round

### Requirement: Proposed Next Round Pairings
The system SHALL generate next-round pairings after a round is ended and keep them pending until the host starts the next round.

#### Scenario: Host starts the next round
- **GIVEN** a round has ended
- **AND** next-round pairings are generated
- **WHEN** the host starts the next round
- **THEN** the next round transitions to active with those pairings

### Requirement: Final Round Host Completion
The system SHALL complete the tournament only after the host ends the final round.

#### Scenario: Host ends the final round
- **GIVEN** the final round is ready to end
- **WHEN** the host ends the final round
- **THEN** the tournament completes and the victory screen is broadcast
