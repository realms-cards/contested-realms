## Context
Drafts require low-latency fanout to many participants across multiple Socket.IO instances. Under load, CPU-heavy compression, missing sticky sessions, and lack of recovery cause disconnects.

## Goals / Non-Goals
- Goals: Stable cross-instance delivery; avoid ping timeouts; seamless short-term recovery
- Non-Goals: New transport protocol; deep diff/patch protocol for draft payloads

## Decisions
- Redis adapter for cross-instance Socket.IO rooms with explicit `draft:<sessionId>` room targeting
- Include `instanceId` in Redis pub payloads and ignore origin on subscribers to prevent echo
- Enable `connectionStateRecovery` (120s) to mask transient drops
- Disable per-message deflate or set threshold ≥ 32KB to reduce CPU during fanout
- Enforce WebSocket-only transport in production to avoid polling/CORS/stickiness pitfalls
- Maintain cookie-based stickiness at the proxy with credentials and same-origin ACAO

## Alternatives Considered
- Keep compression at low threshold: rejected due to CPU saturation
- Polling as fallback: rejected in prod due to CORS + stickiness fragility
- Custom leader-only emit pipeline: kept current approach using rooms + Redis pub/sub for simplicity

## Risks / Trade-offs
- Slightly higher network usage if compression disabled; mitigated by throttling broadcasts
- Connection state recovery window introduces memory for missed packets; bounded to 120s

## Migration Plan
1. Deploy proxy header change (credentials), confirm LB cookie
2. Deploy server Socket.IO option changes and restart all instances
3. Deploy client env changes (WS-transport only)
4. Roll out draft publish throttling
5. Execute load test and monitor metrics

## Open Questions
- What throttle duration balances perceived latency vs CPU best for 64–128 players? Start at 50 ms and adjust after measurement.
