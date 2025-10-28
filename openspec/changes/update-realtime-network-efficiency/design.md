## Context
Real-time networking shows avoidable fan-out and CPU/DB load in hot paths:
- Duplicate cursor broadcasts (generic `message` and `boardCursor`).
- Global lobby list fan-out without interest scoping or debouncing.
- Aggressive client cursor send interval (~22 Hz) without server-side limits.
- Tournament persistence forces immediate DB transactions during peak rounds.
- Limited metrics on hot signals; coarse visibility into persistence buffers.

## Goals / Non-Goals
- Goals:
  - Reduce egress and server CPU on hot paths (cursor, lobbies).
  - Keep perceived UX quality (smooth cursors, timely lobby updates).
  - Make tournament persistence tunable (immediate vs buffered).
  - Introduce protective rate limits and actionable metrics.
- Non-Goals:
  - Change gameplay logic or tournament pairing semantics.
  - Redesign lobby UX beyond opt-in subscriptions.

## Decisions
- Decision: Single cursor event channel
  - Emit only `boardCursor` from server; reserve `message` for typed transient signals.
  - Back-compat: accept inbound `message` with `type: "boardCursor"` but do not re-broadcast on `message`.
- Decision: Scoped + debounced lobby updates
  - Create `lobbies` room. Clients join while lobby browser is visible; receive a snapshot and subsequent updates.
  - Debounce/coalesce broadcasts to ≤4 Hz (250 ms window) to reduce global fan-out.
- Decision: Client cursor gate default 66 ms
  - Gate cursor send at ~66 ms (15 Hz) with optional `NEXT_PUBLIC_CURSOR_MS` override (e.g., 75 → ~13 Hz).
- Decision: Per-socket rate limiting
  - Token-bucket limits (defaults): chat 5/10s (burst 5, error), cursor 30/s (burst 30, drop), message 50/10s (burst 50, drop).
  - Env overrides for ceilings; log drops via metrics.
- Decision: Tournament persistence toggle
  - Env `PERSIST_TOURNAMENT_FORCE_IMMEDIATE` (0/1). Default buffered: ~1000 ms flush, batch ≤100 ops.
  - Always flush on match end and server shutdown.
- Decision: Metrics
  - Counters: `cursor_recv_total`, `cursor_sent_total`, `chat_recv_total`, `chat_sent_total`, `lobbies_updated_sent_total`, `rate_limit_hits_total{type}`.
  - Persistence: `persist_buffer_flush_total`, `persist_buffer_items_total`, `persist_flush_duration_ms` histogram.
- Decision: Production transports
  - Default `NEXT_PUBLIC_WS_TRANSPORTS=websocket` in prod; keep fallback in development.

## Risks / Trade-offs
- Risk: Clients not in `lobbies` room miss updates
  - Mitigation: UI joins `lobbies` on browser open; snapshot on join.
- Risk: Rate limits too strict under bursty UI
  - Mitigation: Env overrides; start conservative and monitor `rate_limit_hits_total`.
- Risk: Buffered persistence increases loss risk on crash
  - Mitigation: Short flush (~1s), flush on end, keep Redis cache as interim if available.
- Trade-off: Reduced cursor frequency vs smoothness
  - 15 Hz visually acceptable; can tune per device or view if needed.

## Migration Plan
1) Ship server with cursor de-dup and lobby debounce guarded by env flags (off-by-default in a canary).
2) Enable `lobbies` room in UI; send snapshot on join. Rollout to 10% devices.
3) Enable client cursor gating default 66 ms.
4) Turn on rate limits in dry-run (metrics only), then enforce.
5) Switch tournament persistence to buffered default; monitor p95 latency and DB QPS.
6) Set production transports to websocket-only via env.

## Open Questions
- Should we expose a user setting for cursor quality (e.g., "Performance" vs "Smooth")?
- Preferred debounce window for lobbies (200 ms vs 250 ms)?
- What UI event should trigger joining/leaving `lobbies` (route-level vs component mount)?
- Any additional metrics dimensions needed (e.g., per-room counts, per-tournament labels)?

## References (implementation touchpoints)
- Server: `server/index.ts` (socket handlers, message routing).
- Server: `server/features/lobby/index.js` (lobby list, broadcast, rooms).
- Client: `src/lib/net/socketTransport.ts` (transports, events, logs).
- Client: `src/lib/game/Board.tsx` (cursor emit gating).
