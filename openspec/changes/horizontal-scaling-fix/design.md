# Horizontal Scaling Fix - Technical Design

## Context

The Socket.IO server currently stores critical state in instance-local JavaScript Maps:

- `players`: Player info (displayName, socketId, lobbyId, matchId)
- `playerIdBySocket`: Reverse lookup socket → player
- `matches`: Active match state
- `lobbies`: Active lobby state

This works for single-instance deployment but breaks when multiple instances are behind a load balancer because:

1. Players may reconnect to a different instance
2. Match actions forwarded via pub/sub reference socket IDs that don't exist on the leader
3. Leader election has no heartbeat, causing 60s orphan windows

## Goals / Non-Goals

**Goals:**

- Enable reliable horizontal scaling with 2+ server instances
- Maintain <100ms latency for state operations
- Zero client-side changes required
- Graceful failover when instances crash
- Support for sticky sessions (preferred) and non-sticky (required to work)

**Non-Goals:**

- Sharding matches across instances (single leader per match is fine)
- Multi-region deployment
- Real-time horizontal autoscaling (manual scaling is acceptable)

## Decisions

### Decision 1: Redis as Authoritative State Store

**Choice**: Store all player and match state in Redis, using local Maps as read-through caches only.

**Alternatives considered**:

1. **Postgres for state** - Too slow for real-time (10-50ms per query)
2. **Local Maps with pub/sub sync** - Race conditions, eventual consistency issues
3. **Dedicated state service** - Over-engineering for current scale

**Rationale**: Redis provides <1ms operations, atomic transactions, pub/sub, and TTL-based cleanup. Already integrated for Socket.IO adapter.

### Decision 2: Player Rooms Instead of Socket IDs

**Choice**: Emit to `io.to(\`player:${playerId}\`)`instead of`io.to(socketId)`.

**Alternatives considered**:

1. **Forward socket IDs and use adapter** - Doesn't work; adapter broadcasts to rooms, not individual foreign sockets
2. **Store socketId → instanceId mapping** - Requires cross-instance coordination for each emit

**Rationale**: Socket.IO Redis adapter automatically propagates room emissions. Player joins their room on connect; room follows them across reconnects.

### Decision 3: Reduced Leader TTL with Heartbeat

**Choice**: 15s TTL with 5s heartbeat loop.

**Alternatives considered**:

1. **Keep 60s TTL** - Too long for failover
2. **5s TTL** - Risk of flapping if Redis hiccups
3. **No TTL, explicit release** - Orphans if instance crashes

**Rationale**: 15s provides reasonable failover time while tolerating brief network issues. Heartbeat ensures TTL doesn't expire during normal operation.

### Decision 4: Feature Flag for Gradual Rollout

**Choice**: `REDIS_STATE_ENABLED` env var, default false.

**Rationale**: Allows testing in production with single instance before enabling multi-instance. Easy rollback path.

## Redis Key Schema

```
# Player State
player:{playerId}           HASH    { displayName, instanceId, matchId, lobbyId, lastSeen }
player:socket:{socketId}    STRING  playerId (TTL 1h)

# Match State
match:state:{matchId}       HASH    { id, status, playerIds, game, draftState, ... }
match:leader:{matchId}      STRING  instanceId (TTL 15s, heartbeat refresh)
match:game:{matchId}        STRING  JSON game state (high-frequency updates)

# Lobby State
lobby:state:{lobbyId}       HASH    { id, hostId, status, matchType, ... }
lobby:members:{lobbyId}     SET     playerIds
lobby:ready:{lobbyId}       SET     playerIds
lobby:leader                STRING  instanceId (TTL 15s)

# Pub/Sub Channels (existing)
match:control               For action/join/cleanup forwarding
lobby:control               For lobby mutations
lobby:state                 For lobby sync
draft:session:update        For draft state sync
```

## State Access Patterns

### Read Path (Hot)

```
getPlayer(playerId):
  1. Check local cache (players Map)
  2. If miss, fetch from Redis HGETALL player:{playerId}
  3. Cache locally with 5min soft TTL
  4. Return player or null
```

### Write Path

```
registerPlayer(playerId, data):
  1. HSET player:{playerId} { ...data, instanceId, lastSeen }
  2. SET player:socket:{socketId} playerId EX 3600
  3. Update local cache
  4. Join socket to player:{playerId} room
```

### Match State Updates

```
updateMatchState(matchId, patch):
  1. Assert we are leader (check match:leader:{matchId})
  2. HSET match:state:{matchId} { ...patch }
  3. If game state changed, SET match:game:{matchId} JSON
  4. Update local cache
  5. Emit to match room (adapter handles cross-instance)
```

## Risks / Trade-offs

| Risk                       | Mitigation                                                   |
| -------------------------- | ------------------------------------------------------------ |
| Redis becomes SPOF         | Use Redis Sentinel or managed Redis with HA                  |
| Increased latency          | Local caching, batch Redis operations                        |
| Cache inconsistency        | Short TTLs, prefer Redis on critical reads                   |
| Complexity increase        | Comprehensive logging, /metrics endpoint                     |
| Data loss on Redis restart | Accept for in-flight matches; persistent matches in Postgres |

## Migration Plan

### Phase 1: Parallel Write

1. Enable `REDIS_STATE_ENABLED=true` on single instance
2. Write to both local Maps and Redis
3. Read from local Maps (Redis as backup)
4. Monitor Redis operation latency

### Phase 2: Redis Primary

1. Switch reads to prefer Redis
2. Local Maps become pure cache
3. Verify all operations work

### Phase 3: Multi-Instance

1. Scale to 2 instances
2. Test reconnection scenarios
3. Test leader failover
4. Run tournament draft

### Rollback

1. Set `REDIS_STATE_ENABLED=false`
2. Scale to 1 instance
3. Restart server (clears local state)
4. Players rejoin matches from Postgres recovery

## Open Questions

1. **Redis memory limits**: With 100 concurrent matches and 500 players, estimate ~50MB. Acceptable?
2. **Cleanup timing**: How long to retain ended match state in Redis for debugging? Propose 1h.
3. **Monitoring**: Do we need a dedicated monitoring stack (Prometheus + Grafana) or is /metrics.json sufficient?

## Appendix: Current vs New Architecture

### Current (Single Instance)

```
Client → Caddy → Server
                   ↓
            [In-Memory Maps]
                   ↓
              Postgres (persist)
```

### New (Multi-Instance)

```
Client → Caddy (ip_hash) → Server 1 ──┐
         (sticky)         Server 2 ──┼── Redis ←→ Postgres
                          Server N ──┘   (state)   (persist)
```
