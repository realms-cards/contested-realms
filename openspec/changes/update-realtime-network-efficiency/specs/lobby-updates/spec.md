## ADDED Requirements

### Requirement: Scoped Lobby Broadcasts
Lobby list updates SHALL be broadcast only to clients in the `lobbies` room.

#### Scenario: Subscriber receives updates
- **WHEN** a client joins the `lobbies` room
- **THEN** the server immediately sends a snapshot of current lobbies
- **AND** subsequent updates are delivered only to that room

#### Scenario: Non-subscriber does not receive updates
- **WHEN** a client is not in the `lobbies` room
- **THEN** the client SHALL NOT receive `lobbiesUpdated` broadcasts

### Requirement: Debounced Lobby Updates
Lobby updates SHALL be debounced and coalesced to at most 4 times per second.

#### Scenario: Burst of lobby changes
- **WHEN** multiple lobby changes occur within 250 ms
- **THEN** the server broadcasts at most one `lobbiesUpdated` event with the latest state
