## ADDED Requirements

### Requirement: Websocket Transport Default (Production)
The client transport in production SHALL default to websocket-only.

#### Scenario: Production transport
- **WHEN** running in production
- **THEN** the client initializes Socket.IO with `transports=["websocket"]`

#### Scenario: Development transport
- **WHEN** running in development
- **THEN** the client MAY include polling fallback for easier debugging

### Requirement: Single Cursor Event Channel
Cursor updates SHALL be emitted by the server only on the `boardCursor` event. The generic `message` channel SHALL NOT carry cursor payloads.

#### Scenario: Server emits cursor update
- **WHEN** a player moves their cursor
- **THEN** the server broadcasts exactly one `boardCursor` event to the room
- **AND** the server does not broadcast a `message` event for the same update

#### Scenario: Backward-compatible inbound handling
- **WHEN** a client sends a `message` with `type: "boardCursor"`
- **THEN** the server MAY accept it for now
- **AND** the server MUST NOT re-broadcast it on `message`
