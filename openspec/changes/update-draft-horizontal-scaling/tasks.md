## 1. Implementation
- [ ] 1.1 Socket.IO: Enable connection state recovery (120s) in server/core/bootstrap/index.ts
- [ ] 1.2 Socket.IO: Adjust perMessageDeflate (disable or set threshold ≥ 32768); verify pingInterval/pingTimeout
- [ ] 1.3 Redis adapter: Verify wiring and logging of adapter attach; ensure instanceId is included in cross-instance payloads
- [ ] 1.4 Pub/Sub: Ensure draft state listener ignores origin instance; keep room fanout to `draft:<sessionId>`
- [ ] 1.5 Draft engine: Implement per-session publish throttle (50–100 ms) and dedupe updates
- [ ] 1.6 Client: Set NEXT_PUBLIC_WS_TRANSPORTS=websocket and NEXT_PUBLIC_WS_URL for production
- [ ] 1.7 Caddy: Set Access-Control-Allow-Credentials true; keep origin to app domain; confirm sticky cookie policy and timeouts

## 2. Verification
- [ ] 2.1 Simulate 32–64 drafters across 2–4 instances; ensure no elevated ping timeouts during pick storms
- [ ] 2.2 Validate state recovery: disconnect/reconnect within 120s → client receives latest draft state
- [ ] 2.3 Confirm stickiness: same upstream after reconnect; LB cookie present on handshake
- [ ] 2.4 Measure p95 event loop delay (< 50 ms) and CPU utilization during batch picks
- [ ] 2.5 Measure payload sizes and throughput with compression off vs thresholded

## 3. Tooling & Ops
- [ ] 3.1 Add basic metrics: ping timeouts, event loop delay, CPU, Redis pub/sub latency
- [ ] 3.2 Load test script/runbook updates for tournament drafts
- [ ] 3.3 Document env var changes and Caddy header changes

## 4. Validation
- [ ] 4.1 Run `openspec validate update-draft-horizontal-scaling --strict`
- [ ] 4.2 Capture results and address any spec formatting issues
