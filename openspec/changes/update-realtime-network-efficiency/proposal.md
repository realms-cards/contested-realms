## Why
Current realtime networking has unnecessary fan-out and avoidable write/compute on hot paths:
- Duplicate cursor broadcasts on both `message` and `boardCursor`.
- Global `lobbiesUpdated` broadcasts to all clients instead of only interested viewers and without debouncing.
- Cursor send interval is aggressive (≈22 Hz) and unbounded by server-side limits.
- Tournament persistence forces immediate DB transactions, causing p95 latency spikes during rounds.
- No per-socket rate limiting for chat/custom messages.
- Limited metrics on hot signals, making capacity and regressions hard to track.

## What Changes
- De-duplicate cursor broadcasts to a single `boardCursor` channel; reserve `message` for typed transient signals.
- Scope lobby list updates to an opt-in `lobbies` room and debounce/coalesce broadcasts (target ≤4 Hz).
- Increase client cursor send gate default to ≈66 ms (15 Hz) and maintain smoothness.
- Make tournament persistence mode configurable; default to buffered (≈1s flush, batched) with flush-on-end.
- Add lightweight per-socket token-bucket rate limits (chat, cursor, generic message).
- Expand Prometheus metrics for hot signals (cursor/chat recv/sent, lobby broadcast count, persistence buffer stats, rate-limit hits).
- Production transport defaults to websocket-only; keep polling fallback in dev.

## Impact
- Affected specs: realtime-transport, lobby-updates, cursor-telemetry, persistence, rate-limiting, observability.
- Affected code:
  - Client: `src/lib/net/socketTransport.ts`, `src/lib/game/Board.tsx`, env `NEXT_PUBLIC_WS_TRANSPORTS`.
  - Server: `server/index.ts`, `server/features/lobby/index.js`, persistence helpers, metrics exporter.
  - Infra/env: new env toggles for persistence and rate limits.
