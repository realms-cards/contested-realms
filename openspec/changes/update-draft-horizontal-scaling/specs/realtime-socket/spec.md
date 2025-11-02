## ADDED Requirements

### Requirement: Socket.IO Cross-Instance Stability
The realtime system SHALL provide resilient, cross-instance delivery of draft updates with recovery from transient disconnects.

- The server SHALL use the Socket.IO Redis adapter for cross-instance room delivery.
- The server SHALL publish draft state updates to a Redis channel including `sessionId` and an `instanceId` field.
- Subscribers SHALL ignore messages originating from the same `instanceId` and emit to room `draft:<sessionId>` exactly once.
- The server SHALL enable connection state recovery with a maximum disconnection duration of at least 120 seconds.
- In production, clients SHALL use WebSocket transport; polling MAY be permitted in development only.
- The server SHALL disable per-message compression or set a compression threshold ≥ 32KB.
- Heartbeat configuration (pingInterval and pingTimeout) SHALL be compatible with proxy timeouts (>= 25s and >= 90s respectively).

#### Scenario: Cross-instance draft fanout
- WHEN a draft update is published on one instance to the Redis channel with `sessionId = s`
- THEN all clients joined to `draft:s` across all instances SHALL receive exactly one `draftUpdate` within 250 ms

#### Scenario: Recovery within window
- WHEN a client disconnects during draft and reconnects within 120 seconds
- THEN the client SHALL recover the connection state and receive the latest `draftUpdate` without manual refresh

#### Scenario: Production transport enforcement
- WHEN the client connects in production environment
- THEN the handshake SHALL use WebSocket transport only (no polling fallback)

#### Scenario: Reduced CPU during fanout
- WHEN the server emits `draftUpdate` to >= 16 participants concurrently
- THEN per-message compression SHALL NOT be applied unless the payload exceeds 32KB
