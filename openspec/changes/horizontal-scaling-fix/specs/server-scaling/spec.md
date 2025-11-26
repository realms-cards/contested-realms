# Server Horizontal Scaling

## ADDED Requirements

### Requirement: Redis State Store

The server SHALL store all player, match, and lobby state in Redis as the authoritative source of truth, using instance-local Maps only as read-through caches.

#### Scenario: Player state persisted to Redis

- **GIVEN** a player connects and sends hello
- **WHEN** the server registers the player
- **THEN** player data is stored in Redis at `player:{playerId}` with displayName, instanceId, matchId, lobbyId, and lastSeen
- **AND** a reverse lookup is stored at `player:socket:{socketId}` with 1 hour TTL

#### Scenario: Match state persisted to Redis

- **GIVEN** a match is created or updated
- **WHEN** the server persists match state
- **THEN** full match state is stored in Redis at `match:state:{matchId}`
- **AND** game state updates are stored at `match:game:{matchId}`

#### Scenario: Player lookup from Redis on cache miss

- **GIVEN** instance A receives a request for a player registered on instance B
- **WHEN** the local cache does not contain the player
- **THEN** the server fetches player data from Redis
- **AND** caches it locally with a 5-minute soft TTL

### Requirement: Player Room Pattern

The server SHALL use player-based Socket.IO rooms for cross-instance message delivery instead of direct socket ID emissions.

#### Scenario: Player joins player room on connect

- **GIVEN** a player connects and authenticates
- **WHEN** the hello handler completes
- **THEN** the socket joins room `player:{playerId}`

#### Scenario: Cross-instance emission via player room

- **GIVEN** player A is connected to instance 1
- **AND** match leader is on instance 2
- **WHEN** instance 2 needs to emit to player A
- **THEN** it emits to room `player:{playerAId}`
- **AND** the Socket.IO Redis adapter delivers to instance 1
- **AND** player A receives the message

#### Scenario: Reconnection uses same player room

- **GIVEN** player A was connected to instance 1
- **AND** player A reconnects to instance 2
- **WHEN** the new socket joins room `player:{playerId}`
- **THEN** future emissions to the player room reach instance 2

### Requirement: Match Leader Heartbeat

The server SHALL maintain match leadership with a 15-second TTL and 5-second heartbeat refresh to enable fast failover.

#### Scenario: Leader heartbeat refresh

- **GIVEN** instance A is the leader for match M
- **WHEN** 5 seconds pass
- **THEN** instance A refreshes the `match:leader:{matchId}` TTL to 15 seconds

#### Scenario: Leader failover on crash

- **GIVEN** instance A is the leader for match M
- **AND** instance A crashes without releasing leadership
- **WHEN** 15 seconds pass
- **THEN** the `match:leader:{matchId}` key expires
- **AND** any instance can claim leadership by setting the key

#### Scenario: New leader loads state from Redis

- **GIVEN** instance B claims leadership of match M after failover
- **WHEN** instance B processes the first action
- **THEN** instance B loads match state from Redis (not local cache)
- **AND** match continues without data loss

### Requirement: Sticky Sessions with Fallback

The server infrastructure SHALL prefer sticky sessions via IP hash but SHALL function correctly when players reconnect to different instances.

#### Scenario: Sticky session via IP hash

- **GIVEN** Caddy load balancer uses ip_hash policy
- **WHEN** a player makes multiple requests
- **THEN** all requests route to the same backend instance

#### Scenario: Non-sticky reconnect handled gracefully

- **GIVEN** player A was connected to instance 1
- **AND** player A reconnects to instance 2
- **WHEN** instance 2 receives the hello
- **THEN** instance 2 fetches player state from Redis
- **AND** instance 2 joins the socket to appropriate rooms
- **AND** player A continues their match without interruption

### Requirement: Cross-Instance Disconnect Handling

The server SHALL coordinate disconnect handling across instances to prevent premature cleanup when a player reconnects to a different instance.

#### Scenario: Disconnect with grace period

- **GIVEN** player A disconnects from instance 1
- **WHEN** the disconnect event fires
- **THEN** instance 1 publishes `player:disconnect` event
- **AND** waits 30 seconds before treating the disconnect as final

#### Scenario: Reconnect cancels disconnect cleanup

- **GIVEN** player A disconnected from instance 1
- **AND** player A reconnects to instance 2 within 30 seconds
- **WHEN** instance 2 publishes `player:connect` event
- **THEN** instance 1 cancels pending cleanup for player A

### Requirement: Orphan Match Cleanup

The server SHALL periodically scan for and adopt orphaned matches whose leader instance has failed.

#### Scenario: Orphan detection and adoption

- **GIVEN** match M has no active leader (TTL expired)
- **WHEN** the 30-second orphan scan runs
- **THEN** an available instance claims leadership
- **AND** loads match state from Redis
- **AND** resumes normal operation

#### Scenario: Stale match cleanup

- **GIVEN** match M has been inactive for 3 hours
- **AND** no players are connected
- **WHEN** the cleanup scan runs
- **THEN** the match is marked as ended
- **AND** Redis keys are scheduled for deletion (1 hour delay)

### Requirement: Feature Flag Rollout

The server SHALL support gradual rollout of Redis state via the `REDIS_STATE_ENABLED` environment variable.

#### Scenario: Feature disabled (default)

- **GIVEN** `REDIS_STATE_ENABLED` is not set or false
- **WHEN** the server starts
- **THEN** state is stored only in instance-local Maps
- **AND** horizontal scaling is not supported

#### Scenario: Feature enabled

- **GIVEN** `REDIS_STATE_ENABLED=true`
- **WHEN** the server starts
- **THEN** state is stored in Redis as authoritative source
- **AND** local Maps are used only as cache
- **AND** horizontal scaling is fully supported

#### Scenario: Rollback path

- **GIVEN** `REDIS_STATE_ENABLED=true` was previously set
- **AND** issues are discovered
- **WHEN** operator sets `REDIS_STATE_ENABLED=false` and restarts
- **THEN** server reverts to single-instance mode
- **AND** active matches can be recovered from Postgres
