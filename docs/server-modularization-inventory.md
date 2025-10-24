# server/index.js Inventory

This document captures the current responsibilities inside `server/index.js` and maps them to the target module layout proposed in `refactor-server-modularization`. It also lists the active socket events and background jobs so we can keep parity while extracting code.

## Responsibility → Target Module (Task 1.1)

| Responsibility Cluster | Current Elements / Notes | Proposed Destination |
| --- | --- | --- |
| Environment bootstrap | Loads dotenv, reads env flags (ports, auth, RTC, Redis), seeds random instance ID, sets up graceful shutdown hooks | `server/core/bootstrap` |
| HTTP + Socket server creation | Builds Express app, HTTP server, Socket.IO instance, attaches middleware (JWT auth, CORS, redis adapter) | `server/core/bootstrap` + `server/infrastructure/sockets` |
| Config normalization | Constants for match timeouts, draft defaults, feature flags, parsing env for interaction enforcement, RTC config | `server/infrastructure/config` (TS) |
| Prisma integration | Creates Prisma client, helper `rehydrateMatch`, persistence buffers (`bufferPersistUpdate`, `flushPersistBuffer`), DB cleanup tasks | `server/infrastructure/prisma` (TS) |
| Redis + pub/sub | Redis clients for store/cache, adapter wiring, channel constants, message handlers for lobby/match/draft replication | `server/infrastructure/redis` |
| Metrics + health endpoints | In-memory metrics registry, Prometheus formatter, `/healthz` endpoints | `server/infrastructure/metrics` + `server/support/http` |
| Card metadata enrichment | `loadCardCosts`, `enrichPatchWithCosts` for patch augmentation | `server/features/game/card-metadata` (TS-ready utility) |
| Interaction gating | Helpers `repairDraftInvariants`, interaction request/response tracking, permit enforcement | `server/features/game/interactions` |
| Match state management | `getMatchInfo`, patch merging (`deepMergeReplaceArrays`, `dedupePermanents`, `mergeEvents`), room join/leave handlers, action processing, resync, match cleanup | `server/features/match` |
| Lobby management | Lobby maps, `createLobby`, `joinLobby`, `leaveLobby`, serialization, broadcast helpers | `server/features/lobby` |
| Draft flows | Draft config normalization, seat presence, pick handling, tournament draft snapshoting | `server/features/draft` |
| Tournament coordination | Standings integration, tournament presence map, broadcast helpers, tournament socket handlers | `server/features/tournament` |
| Replay capture | `startMatchRecording`, `recordMatchAction`, `finishMatchRecording`, export endpoints | `server/features/replay` |
| Deck validation/submission | `normalizeDeckPayload`, `validateDeckCards`, `submitDeck` socket handler | `server/features/decks` |
| Bot management | CPU bot detection, bot manager initialization, lifecycle hooks, lobby helpers | `server/support/bots` |
| Voice / RTC signalling | `rtc:*` socket events, voice room mapping helpers | `server/features/rtc` |
| Chat & messaging | `chat`, `message`, tournament chat handling | `server/features/chat` |
| Broadcast + notifications | `broadcastLobbies`, `broadcastPlayers`, tournament broadcast wrappers (currently direct) | `server/support/broadcast` (or feature-specific exports) |
| Background schedulers | Periodic cleanup intervals, Prisma cleanup job, shutdown timer, persist buffer timers | `server/support/jobs` |
| Auth middleware | NextAuth JWT verification during connection, player identity cache | `server/infrastructure/auth` |
| Shared utilities | Random ID generator `rid`, player lookup helpers, serialization utilities | `server/core/utils` (TS) |

## Socket Event Surface (Task 1.2)

Events are grouped by domain to guide module boundaries. All are registered inside `io.on("connection", …)`.

### Auth / Handshake
- `hello` – establish identity, join previous rooms, send welcome payload.

### Tournament
- `tournament:join`, `tournament:leave` – join/leave tournament rooms, update presence.
- `TOURNAMENT_CHAT` – relay tournament chat messages.
- `joinTournament`, `leaveTournament` – orchestrate tournament signup/exit.
- `UPDATE_PREPARATION` – update player readiness / deck submission status.

### Draft Sessions
- `draft:session:join`, `draft:session:leave` – manage tournament draft presence and snapshots.
- `startDraft`, `makeDraftPick`, `chooseDraftPack` – drive draft flow.

### Lobby
- `createLobby`, `joinLobby`, `leaveLobby` – lobby lifecycle.
- `setLobbyVisibility`, `setLobbyPlan` – lobby metadata updates.
- `inviteToLobby`, `addCpuBot`, `removeCpuBot` – lobby invitations and bot control.
- `requestLobbies`, `requestPlayers` – request lobby/player listings.
- `ready` – toggle ready state.
- `startMatch`, `startTournamentMatch` – initiate matches.

### Match Participation
- `joinMatch`, `leaveMatch` – room membership.
- `action` – primary gameplay action ingestion.
- `interaction:request`, `interaction:response` – permissioned interaction workflow.
- `resyncRequest` – request resync patch.
- `endMatch` – mark match complete (server trusted path).
- `mulliganDone` – signal mulligan completion.
- `chat`, `message` – in-match chat/log messages.
- `ping` – latency heartbeat.

### Replay & Records
- `getMatchRecordings`, `getMatchRecording` – fetch recorded match data.

### Deck Management
- `submitDeck` (two call sites: pre-match, post-draft) – submit decklists.

### RTC / Voice
- `rtc:join`, `rtc:signal`, `rtc:leave`, `rtc:connection-failed`, `rtc:request`, `rtc:request:respond` – WebRTC signalling and permissions.

### Draft Completion
- `submitDeck` (tournament draft context) – send final deck after draft.

### Cleanup
- `disconnect` – handle socket disconnect, cleanup bots/lobbies/matches.

## Background Jobs & Subscriptions (Task 1.2)

- **Interval 1 (30s)** – Trim CPU-only lobbies and completed/idle bot matches; depend on `botManager`, `broadcastLobbies`, `cleanupMatchNow`.
- **Interval 2 (60s)** – Cleanup stale or idle matches (non-tournament) with leadership coordination via Redis.
- **Interval 3 (5 min)** – Prisma `onlineMatchSession.deleteMany` cleanup for old matches.
- **Persist buffer timers** – `setTimeout` per match to flush buffered actions to Prisma (`flushPersistBuffer`).
- **Match cleanup timers** – `match._cleanupTimer` triggered after players leave to reclaim matches.
- **Draft presence timeout** – `setTimeout` sends presence snapshot after join.
- **Graceful shutdown** – `shutdown()` invoked on signals with `setTimeout` fail-safe.
- **Redis subscriptions** – `storeSub` subscribed to `MATCH_CONTROL_CHANNEL`, `LOBBY_CONTROL_CHANNEL`, `LOBBY_STATE_CHANNEL`, `DRAFT_STATE_CHANNEL` for cross-instance coordination.
- **Match control pub/sub** – leader election and command replication via Redis messages (`match:cleanup`, `lobby:update`, `draft:update` payloads).

## Notes for Extraction

- Bot manager (`server/botManager.js`) and replay module (`server/modules/replay`) already exist; integrate them through the forthcoming container API rather than direct requires.
- Several helpers (deck validation, card cost enrichment) are pure and can be moved to TypeScript early to serve as exemplars.
- Socket event handlers should be grouped by domain and exported as `register(container)` functions so iterative migrations (TS/JS mix) remain incremental.
