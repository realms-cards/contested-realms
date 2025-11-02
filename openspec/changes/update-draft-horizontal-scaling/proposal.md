## Why
Large tournament groups experience disconnects during draft when horizontally scaled across multiple Socket.IO instances. Root causes:
- Sticky sessions ineffective due to missing credentials in CORS, causing clients to switch upstreams mid-session.
- CPU spikes from compressing frequent large `draftUpdate` payloads to many recipients, causing ping timeouts.
- No connection state recovery; transient drops lead to loss of state.

## What Changes
- Edge proxy (Caddy)
  - Enable credentials for cross-origin WebSocket handshakes so sticky-session cookie is honored.
  - Keep cookie-based load-balancer stickiness; preserve 3m read/write timeouts and immediate flushing.
- Client
  - Enforce WebSocket-only transport in production (disable polling) and set explicit WS endpoint.
- Server (Socket.IO)
  - Enable `connectionStateRecovery` with `maxDisconnectionDuration: 120000`.
  - Adjust compression: disable per-message deflate or raise threshold to ≥ 32KB to avoid CPU contention.
  - Confirm Redis adapter for cross-instance rooms; publish draft updates across instances via Redis with instance ID to prevent echo; deliver via `draft:<sessionId>` room.
  - Keep heartbeat settings (pingInterval 25s, pingTimeout 90s) compatible with proxy timeouts.
- Tournament draft engine
  - Coalesce `draftUpdate` broadcasts per session in a 50–100 ms window.
  - Continue sending a snapshot to a joining socket immediately after `draft:session:join`.

## Impact
- Affected specs: realtime-socket, edge-proxy, tournament-draft
- Affected code (indicative):
  - server/core/bootstrap/index.ts (Socket.IO options)
  - server/socket/pubsub-listeners.ts (Redis fanout, origin dedupe)
  - server/modules/tournament/engine.js (publish throttling)
  - Caddyfile.prod (CORS credentials, stickiness)
  - src/lib/net/socketTransport.ts (WebSocket-only in prod)
  - src/components/game/TournamentDraft3DScreen.tsx (join ack + snapshot fallback)

## Notes
- No external API changes; production configuration and runtime behavior changes.
- Bandwidth may increase slightly if compression is disabled; acceptable given substantial reduction in timeouts and CPU contention.
