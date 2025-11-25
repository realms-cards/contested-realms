# OpenSpec Change: Horizontal Scaling Fix

## Summary

Fix critical issues preventing Socket.IO server horizontal scaling by:

1. Externalizing all session state to Redis
2. Using player-based rooms for cross-instance messaging
3. Implementing proper sticky sessions for WebSocket connections
4. Adding leader heartbeat and failover mechanisms

## Motivation

Current multi-instance deployment fails because:

- Cookie-based Caddy stickiness doesn't work reliably with WebSocket upgrades
- `players` and `playerIdBySocket` Maps are instance-local only
- Forwarded socket IDs don't exist on leader instances
- Match leader TTL (60s) has no heartbeat, causing orphan windows
- Disconnect cleanup happens on wrong server

## Scope

- **In scope**: Server state management, Redis integration, Caddy configuration, Socket.IO room patterns
- **Out of scope**: Client changes (none needed), database schema changes, new features

## Success Criteria

1. Two players can play a full match with 2+ server instances behind Caddy
2. Page reload reconnects without losing match state
3. Server crash/restart doesn't orphan active matches for >10s
4. Tournament drafts work correctly across instances
5. Lobby state stays consistent across all instances

## Risk Assessment

- **High**: Core realtime infrastructure change
- **Mitigation**: Feature flag for gradual rollout, extensive local testing with docker-compose

## Approvals

- [ ] Architecture review
- [ ] Load testing plan
