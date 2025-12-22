## ADDED Requirements
### Requirement: Open Seat Registration Mode
The tournament system SHALL support an "open seat" registration mode that allows players to register beyond a fixed cap until the host locks registration.

#### Scenario: Host locks open seat registration
- **WHEN** a host creates an open seat tournament
- **AND** players register beyond the default player cap
- **AND** the host locks registration
- **THEN** additional registration attempts are rejected
- **AND** existing seats remain active

### Requirement: Seat Vacancy and Replacement
The system SHALL preserve a vacated seat's deck and record, and allow the host to approve replacements that inherit that seat.

#### Scenario: Player leaves and a replacement joins
- **WHEN** a registered player leaves an open seat tournament
- **THEN** their seat is marked vacant and retains deck data and match record
- **WHEN** the host approves a replacement and a new player joins
- **THEN** the new player occupies the vacated seat and inherits its deck and record

### Requirement: Rejoin Before Replacement
The system SHALL allow the original player to rejoin their seat while it remains vacant.

#### Scenario: Original player reclaims a vacant seat
- **WHEN** a player leaves an open seat tournament
- **AND** their seat is still vacant
- **AND** the player rejoins
- **THEN** they regain control of their original seat

### Requirement: Mid-Round Leave Forfeit
The system SHALL treat a mid-round departure as a forfeit loss for that seat and allow replacements only after the round completes.

#### Scenario: Player leaves during an active round
- **WHEN** a player leaves while their round match is active
- **THEN** the current match is recorded as a loss for that seat
- **AND** the seat is marked vacant for the next round
