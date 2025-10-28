## ADDED Requirements

### Requirement: Client Cursor Send Gate
The client SHALL limit cursor send frequency with a configurable gate interval (default 66 ms).

#### Scenario: Default gate
- **WHEN** the cursor moves continuously
- **THEN** the client sends at most ~15 cursor updates per second

#### Scenario: Configured gate
- **WHEN** `NEXT_PUBLIC_CURSOR_MS` is set to 75
- **THEN** the client sends at most ~13 cursor updates per second

### Requirement: No Duplicate Cursor Broadcasts
The system SHALL NOT produce duplicate cursor events for a single movement.

#### Scenario: Single broadcast
- **WHEN** a player moves their cursor once
- **THEN** exactly one `boardCursor` event is delivered to each subscriber in the room
