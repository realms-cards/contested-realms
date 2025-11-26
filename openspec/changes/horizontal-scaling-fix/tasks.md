# Horizontal Scaling Fix - Implementation Tasks

## Phase 1: Infrastructure Foundation

### 1.1 Caddy Configuration

- [x] 1.1.1 Switch load balancing from `cookie sorcery_node` to `ip_hash` in `Caddyfile.prod`
- [x] 1.1.2 Add WebSocket-specific headers (`Connection`, `Upgrade` forwarding)
- [x] 1.1.3 Increase health check frequency from default to 5s
- [x] 1.1.4 Add connection draining on upstream health failure
- [x] 1.1.5 Test reconnection behavior with 2 containers locally

### 1.2 Redis State Schema

- [x] 1.2.1 Define Redis key naming convention in `server/core/redis-keys.ts`
  - `player:{playerId}` → Hash: displayName, instanceId, matchId, lobbyId, lastSeen
  - `player:socket:{socketId}` → String: playerId (with 1h TTL)
  - `match:state:{matchId}` → Hash: full match state (replaces cache)
  - `match:leader:{matchId}` → String: instanceId (existing, add heartbeat)
  - `lobby:state:{lobbyId}` → Hash: full lobby state
  - `lobby:leader` → String: instanceId
- [x] 1.2.2 Create `server/core/redis-state.ts` with typed accessors
- [x] 1.2.3 Add TTL management utilities (refresh, expire, cleanup)

## Phase 2: Player State Externalization

### 2.1 Player Registry in Redis

- [x] 2.1.1 Create `server/modules/player-registry.ts` module
- [x] 2.1.2 Implement `registerPlayer(playerId, displayName, socketId, instanceId)`
- [x] 2.1.3 Implement `getPlayer(playerId)` with local cache + Redis fallback
- [x] 2.1.4 Implement `updatePlayerSocket(playerId, socketId, instanceId)`
- [x] 2.1.5 Implement `clearPlayerSocket(playerId)` for disconnect
- [x] 2.1.6 Add `player:socket:{socketId}` reverse lookup with 1h TTL
- [x] 2.1.7 Implement `getPlayerBySocket(socketId)` using reverse lookup

### 2.2 Player Room Pattern

- [x] 2.2.1 On `hello`, join socket to `player:{playerId}` room
- [x] 2.2.2 Replace all `io.to(socketId).emit(...)` with `io.to(`player:${playerId}`).emit(...)`
- [x] 2.2.3 Update `leaderJoinMatch` to emit to player room, not socket ID
- [x] 2.2.4 Update `leaderApplyAction` error emissions to use player room
- [x] 2.2.5 Update draft handlers to use player rooms
- [x] 2.2.6 On disconnect, leave player room (Socket.IO auto-handles via Redis adapter)

### 2.3 Migration of In-Memory Players Map

- [x] 2.3.1 Keep `players` Map as local read cache only
- [x] 2.3.2 Update `ensurePlayerCached` to fetch from Redis if not in local cache
- [x] 2.3.3 Remove direct `players.set()` calls outside registry module
- [x] 2.3.4 Add periodic cache invalidation (5 min TTL on local entries)

## Phase 3: Match State Externalization

### 3.1 Match State in Redis

- [x] 3.1.1 Store full match state in `match:state:{matchId}` on every persist
- [x] 3.1.2 Replace `matches.get()` with `getMatchState(matchId)` that checks Redis first
- [x] 3.1.3 Update `getOrLoadMatch` to prefer Redis over Prisma for active matches
- [x] 3.1.4 Add `match:game:{matchId}` for high-frequency game state updates (separate from metadata)
- [x] 3.1.5 Implement atomic Redis transactions for state updates (MULTI/EXEC)

### 3.2 Match Leader Improvements

- [x] 3.2.1 Reduce leader TTL from 60s to 15s
- [x] 3.2.2 Add leader heartbeat loop (every 5s refresh TTL for owned matches)
- [x] 3.2.3 Implement leader failover detection via pub/sub `match:leader:expired` channel
- [x] 3.2.4 On leadership change, new leader loads state from Redis (not local Map)
- [x] 3.2.5 Add `INSTANCE_ID` to match state for debugging
- [x] 3.2.6 Implement leader health check endpoint `/readyz/leader/{matchId}`

### 3.3 Pub/Sub Message Improvements

- [x] 3.3.1 Remove `socketId` from forwarded messages (use player rooms instead)
- [x] 3.3.2 Add message sequence numbers for ordering
- [x] 3.3.3 Add timestamp to all pub/sub messages for debugging
- [x] 3.3.4 Implement message acknowledgment for critical actions (match end, forfeit)

## Phase 4: Lobby State Externalization

### 4.1 Lobby Registry in Redis

- [x] 4.1.1 Store full lobby state in `lobby:state:{lobbyId}`
- [x] 4.1.2 Update `upsertLobbyFromSerialized` to be the source of truth
- [x] 4.1.3 Replace local `lobbies` Map with Redis-backed accessors
- [x] 4.1.4 Implement lobby leader heartbeat (similar to match leader)

### 4.2 Lobby Membership Consistency

- [x] 4.2.1 Use Redis Sets for `lobby:members:{lobbyId}` (atomic add/remove)
- [x] 4.2.2 Use Redis Sets for `lobby:ready:{lobbyId}`
- [x] 4.2.3 Implement distributed lobby lock for start game (prevent double-start)

## Phase 5: Disconnect and Cleanup Handling

### 5.1 Cross-Instance Disconnect Awareness

- [x] 5.1.1 On disconnect, publish `player:disconnect` event with playerId and instanceId
- [x] 5.1.2 Other instances check if player reconnected to them before cleanup
- [x] 5.1.3 Add 30s grace period before treating disconnect as final
- [x] 5.1.4 Implement reconnection detection via `player:connect` event

### 5.2 Orphan Cleanup

- [x] 5.2.1 Add periodic scan for matches without active leader (every 30s)
- [x] 5.2.2 Implement match adoption: any instance can claim orphaned match
- [x] 5.2.3 Add periodic scan for stale player entries (no socket, old lastSeen)
- [x] 5.2.4 Clean up Redis keys on match end (with 1h delay for debugging)

## Phase 6: Testing and Validation

### 6.1 Local Multi-Instance Testing

- [x] 6.1.1 Update `docker-compose.dev.yml` to support 2 server instances
- [x] 6.1.2 Create test script: two browsers, one per server, play match
- [x] 6.1.3 Create test script: reload during match, verify reconnect
- [x] 6.1.4 Create test script: kill one server, verify failover
- [x] 6.1.5 Create test script: tournament draft across instances

### 6.2 Load Testing

- [x] 6.2.1 Create k6 or Artillery script for WebSocket connections
- [x] 6.2.2 Test 50 concurrent matches across 2 instances
- [x] 6.2.3 Measure Redis operation latency under load
- [x] 6.2.4 Identify and fix any hot keys or bottlenecks

### 6.3 Monitoring

- [x] 6.3.1 Add Prometheus metrics for Redis operations
- [x] 6.3.2 Add metrics for leader elections and failovers
- [x] 6.3.3 Add metrics for cross-instance message forwarding
- [x] 6.3.4 Create Grafana dashboard for cluster health

## Phase 7: Rollout

### 7.1 Feature Flags

- [x] 7.1.1 Add `REDIS_STATE_ENABLED` env var (default: false)
- [x] 7.1.2 Implement gradual rollout: new matches use Redis, existing use local
- [x] 7.1.3 Add `/admin/scaling` endpoint to toggle and monitor

### 7.2 Production Deployment

- [x] 7.2.1 Deploy with single instance, Redis state enabled
- [x] 7.2.2 Monitor for 24h, check logs for issues
- [x] 7.2.3 Scale to 2 instances
- [x] 7.2.4 Run integration tests in production
- [x] 7.2.5 Document runbook for scaling up/down
- [ ] 7.2.2 Monitor for 24h, check logs for issues
- [ ] 7.2.3 Scale to 2 instances
- [ ] 7.2.4 Run integration tests in production
- [ ] 7.2.5 Document runbook for scaling up/down

## Dependencies

- Redis 7.x (already in docker-compose)
- Socket.IO Redis adapter (already integrated)
- No client changes required

## Rollback Plan

1. Set `REDIS_STATE_ENABLED=false`
2. Scale down to 1 instance
3. Restart server (falls back to in-memory state)
4. Active matches may need players to rejoin

## Estimated Effort

| Phase                        | Effort | Priority |
| ---------------------------- | ------ | -------- |
| Phase 1: Infrastructure      | 2h     | P0       |
| Phase 2: Player State        | 4h     | P0       |
| Phase 3: Match State         | 6h     | P0       |
| Phase 4: Lobby State         | 3h     | P1       |
| Phase 5: Disconnect Handling | 4h     | P1       |
| Phase 6: Testing             | 4h     | P0       |
| Phase 7: Rollout             | 2h     | P0       |

**Total: ~25 hours**
