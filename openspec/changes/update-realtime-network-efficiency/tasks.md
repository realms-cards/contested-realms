## 1. Implementation
- [ ] 1.1 Server: Cursor de-duplication
  - Emit only `boardCursor` for cursor updates (remove duplicate `message` echo).
  - Back-compat: keep handling inbound `message` with `type: "boardCursor"` if present, but do not broadcast.
- [ ] 1.2 Client: Cursor gating
  - Increase send gate from ~45 ms to 60–75 ms (default 66 ms).
  - Guard with env `NEXT_PUBLIC_CURSOR_MS` (optional).
- [ ] 1.3 Lobby broadcasts scoping + debounce
  - Add `lobbies` room and have UI opt-in when lobby browser is visible.
  - Debounce `lobbiesUpdated` to ≤4 Hz (coalesce bursts) and emit only to `lobbies` room.
  - Send snapshot on join.
- [ ] 1.4 Production transports
  - Default `NEXT_PUBLIC_WS_TRANSPORTS=websocket` in production envs; retain fallback in dev.
- [ ] 1.5 Tournament persistence toggle
  - Add env `PERSIST_TOURNAMENT_FORCE_IMMEDIATE` (0/1) and buffered defaults (flush ~1000 ms, batch ≤100).
  - Ensure flush-on-end on finalize/shutdown.
- [ ] 1.6 Per-socket rate limiting
  - Token-buckets: chat (5/10s burst 5), cursor (30/s burst 30), generic message (50/10s burst 50).
  - Behavior: chat returns `error: rate_limited`; cursor/messages silently drop.
  - Env overrides for ceilings.
- [ ] 1.7 Metrics
  - Counters: `cursor_recv_total`, `cursor_sent_total`, `chat_recv_total`, `chat_sent_total`, `lobbies_updated_sent_total`, `rate_limit_hits_total{type}`.
  - Persistence: `persist_buffer_flush_total`, `persist_buffer_items_total`, `persist_flush_duration_ms` histogram.
- [ ] 1.8 Logs
  - Gate hot-path debug logs behind `DEBUG_LOGS=1`. Remove cross-cluster `fetchSockets()` usage from hot path logs.

## 2. Validation
- [ ] 2.1 Unit/integration tests for rate limiter buckets and lobby debounce behavior.
- [ ] 2.2 Simulated load: 100 matches x 2 players @ 15 Hz cursor → confirm no duplicate events; p95 < 100 ms.
- [ ] 2.3 Tournament round start with immediate vs buffered persistence → observe DB QPS and p95.
- [ ] 2.4 Metrics: verify counters increment and appear on Prometheus scrape.

## 3. Rollout
- [ ] 3.1 Staged deploy with feature toggles: start with persistence buffered, rate limits soft.
- [ ] 3.2 Monitor metrics; increase rate limits if false positives appear.
- [ ] 3.3 Document envs in PRODUCTION_ENV_VARS.md.
