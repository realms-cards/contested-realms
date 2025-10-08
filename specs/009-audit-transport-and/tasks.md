# Tasks: Tournament Flow Audit and Server Architecture Refactoring

**Input**: Design documents from `/specs/009-audit-transport-and/`
**Prerequisites**: plan.md ✅, research.md ✅, data-model.md ✅, contracts/ ✅, quickstart.md ✅

## Execution Flow (main)
```
1. Load plan.md from feature directory ✅
   → Extract: TypeScript 5.x, Socket.IO 4.x, Prisma 5.x, Next.js 15.x
   → Structure: Web app (Next.js + API + Socket.IO server)
2. Load optional design documents ✅
   → data-model.md: TournamentBroadcastEvent, SocketBroadcastHealth, DraftConfiguration
   → contracts/: BroadcastService, DraftConfigService, StandingsService
   → research.md: 4 critical bugs, module extraction strategy
   → quickstart.md: 5 validation scenarios
3. Generate tasks by category ✅
   → Setup: Environment validation, test infrastructure
   → Tests: Contract tests (3), integration tests (5), performance tests
   → Core: Critical bug fixes (4), module extraction (3)
   → Integration: Client improvements, monitoring
   → Polish: Documentation, cleanup
4. Apply task rules ✅
   → Different files = [P] parallel
   → Same file = sequential
   → Tests before implementation (TDD)
5. Number tasks sequentially (T001-T036) ✅
6. Generate dependency graph ✅
7. Create parallel execution examples ✅
8. Validate task completeness ✅
```

## Format: `[ID] [P?] Description`
- **[P]**: Can run in parallel (different files, no dependencies)
- File paths are absolute from repository root

---

## Phase 3.1: Setup & Environment (Priority 0)

**Goal**: Prepare for implementation and testing

- [ ] **T001** Create server modules directory structure
  - Create: `server/modules/tournament/`, `server/modules/draft/`, `server/modules/shared/`
  - Create: `tests/contract/`, `tests/integration/tournament/`, `tests/unit/server/`
  - **Files**: New directories only
  - **Dependencies**: None
  - **Verification**: Run `ls -la server/modules/` to confirm structure

- [ ] **T002** Create environment validation script
  - Create: `scripts/validate-socket-env.sh`
  - Check: `SOCKET_SERVER_URL`, `NEXT_PUBLIC_WS_URL`, `NEXT_PUBLIC_APP_URL` set
  - Test connectivity to socket server
  - Exit code 1 on failure, 0 on success
  - **Files**: `scripts/validate-socket-env.sh`
  - **Dependencies**: None
  - **Verification**: Run `scripts/validate-socket-env.sh` in local env

- [ ] **T003** [P] Add test utilities for tournament flows
  - Create: `tests/helpers/tournament-test-utils.ts`
  - Functions: `createTestTournament()`, `registerTestPlayers()`, `startTournament()`
  - Mock Socket.IO client for testing
  - **Files**: `tests/helpers/tournament-test-utils.ts`
  - **Dependencies**: None
  - **Verification**: Import in test file, no TypeScript errors

---

## Phase 3.2: Tests First (TDD) ⚠️ MUST COMPLETE BEFORE 3.3

**CRITICAL**: These tests MUST be written and MUST FAIL before ANY implementation

### Contract Tests (Services)

- [ ] **T004** [P] Contract test for BroadcastService in tests/contract/broadcast-service.test.ts
  - Test: `emitPhaseChanged()` only emits to tournament room (not global)
  - Test: Event deduplication (same event within 5s ignored)
  - Test: Failed emission retries 2x with exponential backoff
  - Mock Socket.IO `io.to()` and `io.emit()` to verify room targeting
  - **Files**: `tests/contract/broadcast-service.test.ts`
  - **Expected**: All tests FAIL (service not implemented)
  - **Dependencies**: T003
  - **Verification**: Run `npm test tests/contract/broadcast-service.test.ts` → all FAIL

- [ ] **T005** [P] Contract test for DraftConfigService in tests/contract/draft-config-service.test.ts
  - Test: `getDraftConfig()` loads from DraftSession when tournamentId exists
  - Test: `getDraftConfig()` throws error when cubeId AND setMix both missing
  - Test: `ensureConfigLoaded()` forces hydration before returning
  - Mock Prisma client with test DraftSession data
  - **Files**: `tests/contract/draft-config-service.test.ts`
  - **Expected**: All tests FAIL (service not implemented)
  - **Dependencies**: T003
  - **Verification**: Run `npm test tests/contract/draft-config-service.test.ts` → all FAIL

- [ ] **T006** [P] Contract test for StandingsService in tests/contract/standings-service.test.ts
  - Test: `recordMatchResult()` updates both players atomically
  - Test: Draw increments both players' draws and match points by 1
  - Test: Win increments winner's wins and match points by 3, loser's losses by 1
  - Test: Transaction rolls back on error (neither player updated)
  - Mock Prisma with transaction spy
  - **Files**: `tests/contract/standings-service.test.ts`
  - **Expected**: All tests FAIL (service not implemented)
  - **Dependencies**: T003
  - **Verification**: Run `npm test tests/contract/standings-service.test.ts` → all FAIL

### Integration Tests (End-to-End Flows)

- [ ] **T007** [P] Integration test: Phase transition without reload
  - Location: `tests/integration/tournament/phase-transition.test.ts`
  - Flow: Create tournament → Register players → Start tournament → Verify PHASE_CHANGED event
  - Assert: Client receives event without page reload
  - Assert: Only 1 event received (no duplicates)
  - Assert: Event contains correct tournamentId and newPhase
  - Use real Socket.IO client connection
  - **Files**: `tests/integration/tournament/phase-transition.test.ts`
  - **Expected**: Test FAILS (global broadcasts still present)
  - **Dependencies**: T003
  - **Verification**: Run test → FAIL with "expected 1 event, received 2"

- [ ] **T008** [P] Integration test: Cube draft configuration loading
  - Location: `tests/integration/tournament/cube-draft-flow.test.ts`
  - Flow: Create cube → Create tournament draft → Start → Verify cube packs generated
  - Assert: `draftState.currentPacks[0]` contains cube cards (not Beta/Unlimited)
  - Assert: Pack size is 15 cards
  - Assert: All players receive packs
  - **Files**: `tests/integration/tournament/cube-draft-flow.test.ts`
  - **Expected**: Test FAILS (cubeId undefined, wrong packs generated)
  - **Dependencies**: T003
  - **Verification**: Run test → FAIL with "expected cube cards, got Beta"

- [ ] **T009** [P] Integration test: Concurrent standings updates
  - Location: `tests/integration/tournament/concurrent-standings.test.ts`
  - Flow: Create 4-player tournament → Create 2 matches → Complete both simultaneously
  - Assert: All 4 players have correct wins/losses/matchPoints
  - Assert: No data loss (e.g., P1 wins not overwritten by P2's match)
  - Use `Promise.all()` to submit match results in parallel
  - **Files**: `tests/integration/tournament/concurrent-standings.test.ts`
  - **Expected**: Test FAILS (race condition causes data loss)
  - **Dependencies**: T003
  - **Verification**: Run test 10 times → at least 1 failure

- [ ] **T010** [P] Integration test: Draft join without retry loops
  - Location: `tests/integration/tournament/draft-join-retry.test.ts`
  - Flow: Start draft → Monitor server logs → Join draft → Count join requests
  - Assert: Client sends ≤3 join requests (initial + 2 retries max)
  - Assert: Join acknowledged within 1 second
  - Mock server to delay acknowledgment, verify exponential backoff
  - **Files**: `tests/integration/tournament/draft-join-retry.test.ts`
  - **Expected**: Test FAILS (10+ join requests, no backoff)
  - **Dependencies**: T003
  - **Verification**: Run test → FAIL with "expected ≤3 requests, got 15"

- [ ] **T011** [P] Integration test: Environment validation script
  - Location: `tests/integration/env-validation.test.ts`
  - Flow: Unset `SOCKET_SERVER_URL` → Run validation script → Assert exit code 1
  - Flow: Set wrong URL → Run script → Assert detects unreachable server
  - Flow: Set correct config → Run script → Assert exit code 0
  - **Files**: `tests/integration/env-validation.test.ts`
  - **Expected**: Test FAILS (script doesn't exist yet)
  - **Dependencies**: T002
  - **Verification**: Run test → FAIL with "script not found"

### Performance Tests

- [ ] **T012** [P] Performance test: Broadcast latency <100ms
  - Location: `tests/performance/broadcast-latency.test.ts`
  - Measure: Time from `broadcastPhaseChanged()` call to client receipt
  - Assert: p50 latency <50ms, p95 latency <100ms
  - Run 100 iterations, calculate percentiles
  - **Files**: `tests/performance/broadcast-latency.test.ts`
  - **Expected**: Test FAILS (baseline measurement, may pass or fail)
  - **Dependencies**: T003
  - **Verification**: Run test → records latency metrics

- [ ] **T013** [P] Performance test: Standings update <10ms
  - Location: `tests/performance/standings-update.test.ts`
  - Measure: Time for `recordMatchResult()` database transaction
  - Assert: p50 latency <5ms, p95 latency <10ms
  - Run 100 iterations with real database
  - **Files**: `tests/performance/standings-update.test.ts`
  - **Expected**: Test FAILS (non-transactional version slower)
  - **Dependencies**: T003
  - **Verification**: Run test → records transaction times

---

## Phase 3.3: Critical Bug Fixes (Priority 1) - ONLY after tests are failing

**Goal**: Fix production-blocking bugs that cause request loops, data loss, and draft failures

- [ ] **T014** Remove global broadcasts from server/index.js (Lines 4129-4190)
  - **File**: `server/index.js`
  - Change: Line 4138 `io.emit("PHASE_CHANGED", payload)` → DELETE this line
  - Change: Line 4157 `io.emit("TOURNAMENT_UPDATED", payload)` → DELETE
  - Change: Line 4168 `io.emit("ROUND_STARTED", payload)` → DELETE
  - Change: Line 4181 `io.emit("MATCHES_READY", payload)` → DELETE
  - Change: Line 4190 `io.emit("DRAFT_READY", payload)` → DELETE
  - Keep: All `io.to(`tournament:${tournamentId}`).emit(...)` calls
  - Add logging: `console.log('[Broadcast]', eventType, 'to room:', roomName)`
  - **Dependencies**: T007 (integration test must exist and FAIL first)
  - **Verification**: Run T007 → should now PASS (only 1 event received)

- [ ] **T015** Add transaction wrapper to standings updates (Lines 2370-2382)
  - **File**: `server/index.js`
  - Wrap lines 2370-2382 in `await prisma.$transaction([...])`
  - Change draw update to use separate `update` calls (not `updateMany`)
  - Remove empty catch block, add error logging
  - Retry once on transaction conflict (Prisma error P2034)
  - **Code**:
    ```javascript
    try {
      await prisma.$transaction([
        prisma.playerStanding.update({
          where: { tournamentId_playerId: { tournamentId: t, playerId: winnerId } },
          data: { wins: { increment: 1 }, matchPoints: { increment: 3 }, currentMatchId: null }
        }),
        prisma.playerStanding.update({
          where: { tournamentId_playerId: { tournamentId: t, playerId: loserId } },
          data: { losses: { increment: 1 }, currentMatchId: null }
        })
      ]);
    } catch (err) {
      if (err.code === 'P2034') {
        await new Promise(resolve => setTimeout(resolve, 100));
        return recordMatchResult(tournamentId, winnerId, loserId, isDraw);
      }
      console.error('[Standings] Transaction failed:', err.message);
      throw err;
    }
    ```
  - **Dependencies**: T009 (integration test must exist and FAIL first)
  - **Verification**: Run T009 10 times → all PASS (no data loss)

- [ ] **T016** Fix draft config hydration timing (Lines 3647-3676, 543-544)
  - **File**: `server/index.js`
  - Add function call at line 527 (start of `leaderStartDraft`):
    ```javascript
    async function leaderStartDraft(matchId, requestingPlayerId = null, overrideDraftConfig = null, requestingSocketId = null) {
      const match = await getOrLoadMatch(matchId);

      // NEW: Force hydration before draft starts
      if (match.tournamentId && match.matchType === 'draft') {
        await hydrateMatchFromDatabase(matchId, match);
      }

      // ... rest of function
    }
    ```
  - Add logging: `console.log('[Draft] Config loaded:', { matchId, cubeId: match.draftConfig?.cubeId })`
  - **Dependencies**: T008 (integration test must exist and FAIL first)
  - **Verification**: Run T008 → should now PASS (cube cards generated)

- [ ] **T017** Make environment validation script executable
  - **File**: `scripts/validate-socket-env.sh`
  - Add shebang: `#!/bin/bash`
  - Add checks for required variables
  - Add connectivity test: `curl -f "$SOCKET_SERVER_URL/health"`
  - Set executable: `chmod +x scripts/validate-socket-env.sh`
  - **Code**:
    ```bash
    #!/bin/bash
    if [ -z "$SOCKET_SERVER_URL" ]; then
      echo "ERROR: SOCKET_SERVER_URL not set"
      exit 1
    fi
    if ! curl -f "$SOCKET_SERVER_URL/health" > /dev/null 2>&1; then
      echo "ERROR: Socket server not reachable at $SOCKET_SERVER_URL"
      exit 1
    fi
    echo "✓ Socket environment valid"
    ```
  - **Dependencies**: T011 (integration test must exist and FAIL first)
  - **Verification**: Run T011 → should now PASS

---

## Phase 3.4: Module Extraction (Priority 2)

**Goal**: Extract broadcast, draft config, and standings modules from monolithic server file

- [ ] **T018** Extract broadcast module to server/modules/tournament/broadcast.js
  - **File**: Create `server/modules/tournament/broadcast.js`
  - Extract functions from `server/index.js`:
    - `broadcastPhaseChanged` (Line 4129)
    - `broadcastTournamentUpdate` (Line 4146)
    - `broadcastRoundStarted` (Line 4160)
    - `broadcastMatchesReady` (Line 4173)
    - `broadcastDraftReady` (Line 4184)
  - Implement event deduplication (Map of eventId → timestamp)
  - Add JSDoc comments for all functions
  - Export all functions: `module.exports = { emitPhaseChanged, emitTournamentUpdate, ... }`
  - **Dependencies**: T014 (global broadcasts removed first)
  - **Verification**: Run T004 contract tests → all PASS

- [ ] **T019** Update server/index.js to import broadcast module
  - **File**: `server/index.js`
  - Add import at top: `const broadcast = require('./modules/tournament/broadcast');`
  - Replace function calls:
    - `broadcastPhaseChanged(...)` → `broadcast.emitPhaseChanged(...)`
    - `broadcastTournamentUpdate(...)` → `broadcast.emitTournamentUpdate(...)`
    - (etc. for all 5 functions)
  - Delete old function definitions (Lines 4129-4190)
  - **Dependencies**: T018
  - **Verification**: Start server → no errors, broadcasts still work

- [ ] **T020** Extract draft config service to server/modules/draft/config.js
  - **File**: Create `server/modules/draft/config.js`
  - Implement `getDraftConfig(matchId)`:
    - Query DraftSession if match.tournamentId exists
    - Merge DraftSession.settings into match.draftConfig
    - Validate cubeId XOR setMix present
  - Implement `ensureConfigLoaded(matchId)`:
    - Call `hydrateMatchFromDatabase` if not already loaded
    - Return DraftConfiguration object
  - Add JSDoc comments
  - Export: `module.exports = { getDraftConfig, ensureConfigLoaded }`
  - **Dependencies**: T016 (hydration fix in place first)
  - **Verification**: Run T005 contract tests → all PASS

- [ ] **T021** Update server/index.js to use draft config service
  - **File**: `server/index.js`
  - Add import: `const draftConfig = require('./modules/draft/config');`
  - Update `leaderStartDraft` (Line 543):
    - Replace inline config logic with `await draftConfig.ensureConfigLoaded(matchId)`
  - Remove hydration code from `getOrLoadMatch` (now handled by service)
  - **Dependencies**: T020
  - **Verification**: Start server, create tournament draft → cube ID loads correctly

- [ ] **T022** Extract standings service to server/modules/tournament/standings.js
  - **File**: Create `server/modules/tournament/standings.js`
  - Extract `recordMatchResult()` with transaction wrapper from T015
  - Implement `getStandings(tournamentId)`:
    - Query PlayerStanding, order by matchPoints DESC
    - Calculate ranks
  - Implement `recalculateTiebreakers(tournamentId)`:
    - Query all matches, calculate GWP and OWP
    - Batch update all PlayerStanding records
  - Add JSDoc comments
  - Export: `module.exports = { recordMatchResult, getStandings, recalculateTiebreakers }`
  - **Dependencies**: T015 (transaction wrapper in place first)
  - **Verification**: Run T006 contract tests → all PASS

- [ ] **T023** Update server/index.js to use standings service
  - **File**: `server/index.js`
  - Add import: `const standings = require('./modules/tournament/standings');`
  - Update `finalizeMatch` (Line 2370):
    - Replace inline standings update with `await standings.recordMatchResult(...)`
  - Delete old standings update code (Lines 2370-2382)
  - **Dependencies**: T022
  - **Verification**: Start server, complete match → standings update in transaction

---

## Phase 3.5: Client-Side Improvements (Priority 3)

**Goal**: Add event deduplication, fix retry loops, add monitoring

- [ ] **T024** [P] Add event deduplication to useTournamentSocket hook
  - **File**: `src/hooks/useTournamentSocket.ts`
  - Add `useRef` for tracking last 100 event IDs (Set)
  - Update `handlePhaseChanged` callback:
    - Generate eventId: `${tournamentId}:${newPhase}:${timestamp}`
    - Check if in Set → skip if duplicate
    - Add to Set, remove oldest if size > 100
  - Add logging: `console.debug('[useTournamentSocket] Ignoring duplicate event:', eventId)`
  - **Code**:
    ```typescript
    const lastEventIds = useRef<Set<string>>(new Set());

    const handlePhaseChanged = useCallback((data: PhaseChangedEvent) => {
      const eventId = `${data.tournamentId}:${data.newPhase}:${data.timestamp}`;
      if (lastEventIds.current.has(eventId)) {
        console.debug('[useTournamentSocket] Ignoring duplicate:', eventId);
        return;
      }
      lastEventIds.current.add(eventId);
      if (lastEventIds.current.size > 100) {
        const first = lastEventIds.current.values().next().value;
        lastEventIds.current.delete(first);
      }
      onPhaseChanged?.(data);
    }, [onPhaseChanged]);
    ```
  - **Dependencies**: None (independent client change)
  - **Verification**: Trigger duplicate event → only 1 callback invocation

- [ ] **T025** [P] Fix draft join retry loop in TournamentDraft3DScreen
  - **File**: `src/components/game/TournamentDraft3DScreen.tsx`
  - Remove: 500ms polling interval (Lines 152-259)
  - Add: Exponential backoff retry (100ms, 200ms, 400ms, 800ms, 1600ms)
  - Add: Max 5 retry attempts
  - Update join logic:
    ```typescript
    const tryJoin = (attempt: number = 0) => {
      if (attempt >= 5) {
        console.error('[TournamentDraft3D] Max join attempts exceeded');
        return;
      }
      transport.emit("draft:session:join", { sessionId, playerId, playerName });

      const backoff = Math.min(100 * Math.pow(2, attempt), 1600);
      joinTimeoutRef.current = setTimeout(() => {
        if (!joinSentRef.current) tryJoin(attempt + 1);
      }, backoff);
    };
    ```
  - **Dependencies**: T010 (integration test must pass after)
  - **Verification**: Run T010 → should now PASS (≤5 join requests)

- [ ] **T026** [P] Add broadcast health monitoring to tournament-broadcast.ts
  - **File**: `src/lib/services/tournament-broadcast.ts`
  - Add health check logging after each broadcast:
    ```typescript
    const start = Date.now();
    try {
      await fetch(`${SOCKET_SERVER_URL}/tournament/broadcast`, { ... });
      const latency = Date.now() - start;
      console.log('[Broadcast] Success:', { event, latency });
    } catch (err) {
      const latency = Date.now() - start;
      console.error('[Broadcast] Failed:', { event, latency, error: err.message });
      // TODO: Record to SocketBroadcastHealth table
    }
    ```
  - Add retry logic (max 2 retries with 100ms, 200ms backoff)
  - **Dependencies**: None (independent enhancement)
  - **Verification**: Disconnect socket server → see retry logs

---

## Phase 3.6: Database Schema Enhancements (Priority 4 - Optional)

**Goal**: Add audit logging and monitoring tables

- [ ] **T027** [P] Create Prisma migration for TournamentBroadcastEvent table
  - **File**: `prisma/migrations/XXX_add_tournament_broadcast_event/migration.sql`
  - Create table:
    ```sql
    CREATE TABLE "TournamentBroadcastEvent" (
      "id" TEXT PRIMARY KEY,
      "tournamentId" TEXT NOT NULL,
      "eventType" TEXT NOT NULL,
      "payload" JSONB NOT NULL,
      "timestamp" TIMESTAMP NOT NULL DEFAULT NOW(),
      "emittedBy" TEXT,
      "roomTarget" TEXT NOT NULL
    );
    CREATE INDEX "TournamentBroadcastEvent_tournamentId_timestamp_idx"
      ON "TournamentBroadcastEvent"("tournamentId", "timestamp" DESC);
    ```
  - Update Prisma schema: `prisma/schema.prisma`
  - Run: `npx prisma migrate dev --name add_tournament_broadcast_event`
  - **Dependencies**: None (database only)
  - **Verification**: Run migration → table created

- [ ] **T028** [P] Create Prisma migration for SocketBroadcastHealth table
  - **File**: `prisma/migrations/XXX_add_socket_broadcast_health/migration.sql`
  - Create table:
    ```sql
    CREATE TABLE "SocketBroadcastHealth" (
      "id" TEXT PRIMARY KEY,
      "timestamp" TIMESTAMP NOT NULL DEFAULT NOW(),
      "eventType" TEXT NOT NULL,
      "tournamentId" TEXT,
      "targetUrl" TEXT NOT NULL,
      "success" BOOLEAN NOT NULL,
      "statusCode" INTEGER,
      "errorMessage" TEXT,
      "retryCount" INTEGER NOT NULL DEFAULT 0,
      "latencyMs" INTEGER NOT NULL
    );
    CREATE INDEX "SocketBroadcastHealth_timestamp_idx"
      ON "SocketBroadcastHealth"("timestamp" DESC);
    CREATE INDEX "SocketBroadcastHealth_success_idx"
      ON "SocketBroadcastHealth"("success") WHERE "success" = false;
    ```
  - Update Prisma schema
  - Run: `npx prisma migrate dev --name add_socket_broadcast_health`
  - **Dependencies**: None (database only)
  - **Verification**: Run migration → table created

- [ ] **T029** [P] Add check constraint to PlayerStanding for matchPoints validation
  - **File**: `prisma/migrations/XXX_add_standing_check_constraint/migration.sql`
  - Add constraint:
    ```sql
    ALTER TABLE "PlayerStanding"
      ADD CONSTRAINT "PlayerStanding_matchPoints_check"
      CHECK ("matchPoints" = ("wins" * 3) + "draws");
    ```
  - **Dependencies**: T015 (transaction wrapper ensures this constraint always met)
  - **Verification**: Try inserting invalid standing → constraint violation error

- [ ] **T030** Update broadcast module to log events to TournamentBroadcastEvent
  - **File**: `server/modules/tournament/broadcast.js`
  - Add Prisma client import
  - After each successful emission, insert audit record:
    ```javascript
    await prisma.tournamentBroadcastEvent.create({
      data: {
        id: generateId(),
        tournamentId,
        eventType,
        payload,
        timestamp: new Date(),
        emittedBy: process.env.SERVER_ID || 'unknown',
        roomTarget: `tournament:${tournamentId}`
      }
    });
    ```
  - **Dependencies**: T027, T018
  - **Verification**: Emit event → verify row in database

- [ ] **T031** Update broadcast service to log health to SocketBroadcastHealth
  - **File**: `src/lib/services/tournament-broadcast.ts`
  - Add Prisma client import (server-side only)
  - After each broadcast attempt (success or failure), insert health record
  - **Dependencies**: T028, T026
  - **Verification**: Trigger broadcast → verify health row in database

---

## Phase 3.7: Validation & Testing (Priority 5)

**Goal**: Verify all fixes work end-to-end, run performance tests

- [ ] **T032** Run all quickstart scenarios from quickstart.md
  - **Scenarios**:
    1. Phase Transition Without Reload
    2. Cube Draft in Production Mode
    3. Concurrent Match Completions (Standings Race)
    4. Draft Join Without Retry Loops
    5. Environment Variable Validation
  - **Files**: `specs/009-audit-transport-and/quickstart.md`
  - **Dependencies**: T014-T025 (all critical fixes and modules)
  - **Verification**: All 5 scenarios PASS

- [ ] **T033** [P] Run contract test suite
  - **Tests**: T004 (BroadcastService), T005 (DraftConfigService), T006 (StandingsService)
  - **Command**: `npm test tests/contract/`
  - **Dependencies**: T018, T020, T022 (all modules extracted)
  - **Verification**: All contract tests PASS

- [ ] **T034** [P] Run integration test suite
  - **Tests**: T007-T011 (phase transition, cube draft, concurrent standings, retry loops, env validation)
  - **Command**: `npm test tests/integration/tournament/`
  - **Dependencies**: T014-T025 (all fixes and improvements)
  - **Verification**: All integration tests PASS

- [ ] **T035** [P] Run performance test suite
  - **Tests**: T012 (broadcast latency), T013 (standings update)
  - **Command**: `npm test tests/performance/`
  - **Benchmarks**:
    - Broadcast latency: p50 <50ms, p95 <100ms
    - Standings update: p50 <5ms, p95 <10ms
  - **Dependencies**: T014-T023 (all optimizations in place)
  - **Verification**: All benchmarks meet targets

- [ ] **T036** [P] Update CLAUDE.md with module architecture changes
  - **File**: `CLAUDE.md`
  - Add section: "Server Module Architecture"
  - Document extracted modules:
    - `server/modules/tournament/broadcast.js` - Event emission layer
    - `server/modules/draft/config.js` - Draft configuration service
    - `server/modules/tournament/standings.js` - Standings management
  - Update Recent Changes section with tournament flow fixes
  - **Dependencies**: T018-T023 (all modules extracted)
  - **Verification**: CLAUDE.md reflects new architecture

---

## Dependencies

**Setup Phase**:
- T001-T003 have no dependencies (can run in parallel)

**Test Phase** (MUST complete before implementation):
- T004-T006 depend on T003 (test utilities)
- T007-T011 depend on T003 (test utilities)
- T012-T013 depend on T003 (test utilities)
- All tests MUST FAIL before proceeding to Phase 3.3

**Critical Fixes**:
- T014 depends on T007 (test must exist first)
- T015 depends on T009 (test must exist first)
- T016 depends on T008 (test must exist first)
- T017 depends on T011 (test must exist first)

**Module Extraction**:
- T018 depends on T014 (global broadcasts removed first)
- T019 depends on T018 (module exists before import)
- T020 depends on T016 (hydration fix in place)
- T021 depends on T020 (module exists before import)
- T022 depends on T015 (transaction wrapper in place)
- T023 depends on T022 (module exists before import)

**Client Improvements**:
- T024-T026 have no dependencies (can run in parallel with server work)

**Database Schema**:
- T027-T029 have no dependencies (can run in parallel)
- T030 depends on T027 and T018 (table + module exist)
- T031 depends on T028 and T026 (table + health monitoring exist)

**Validation**:
- T032 depends on T014-T025 (all fixes implemented)
- T033 depends on T018, T020, T022 (all modules extracted)
- T034 depends on T014-T025 (all fixes implemented)
- T035 depends on T014-T023 (all optimizations in place)
- T036 depends on T018-T023 (all modules extracted)

---

## Parallel Execution Examples

### Example 1: Test Suite (After T003 complete)

Launch all contract and integration tests in parallel:

```bash
# Contract tests
npm test tests/contract/broadcast-service.test.ts &
npm test tests/contract/draft-config-service.test.ts &
npm test tests/contract/standings-service.test.ts &

# Integration tests
npm test tests/integration/tournament/phase-transition.test.ts &
npm test tests/integration/tournament/cube-draft-flow.test.ts &
npm test tests/integration/tournament/concurrent-standings.test.ts &
npm test tests/integration/tournament/draft-join-retry.test.ts &
npm test tests/integration/env-validation.test.ts &

# Performance tests
npm test tests/performance/broadcast-latency.test.ts &
npm test tests/performance/standings-update.test.ts &

wait
```

All should FAIL (no implementation yet).

### Example 2: Client Improvements (After server fixes)

Launch all client-side improvements in parallel:

```bash
# T024: Event deduplication
# Edit src/hooks/useTournamentSocket.ts

# T025: Fix retry loops
# Edit src/components/game/TournamentDraft3DScreen.tsx

# T026: Broadcast health monitoring
# Edit src/lib/services/tournament-broadcast.ts

# All edits are to different files, no conflicts
```

### Example 3: Database Migrations (Anytime)

Run all schema migrations in parallel:

```bash
# T027: TournamentBroadcastEvent table
npx prisma migrate dev --name add_tournament_broadcast_event &

# T028: SocketBroadcastHealth table
npx prisma migrate dev --name add_socket_broadcast_health &

# T029: PlayerStanding check constraint
npx prisma migrate dev --name add_standing_check_constraint &

wait
```

### Example 4: Validation Suite (Final step)

Run all validation tests in parallel:

```bash
# T033: Contract tests
npm test tests/contract/ &

# T034: Integration tests
npm test tests/integration/tournament/ &

# T035: Performance tests
npm test tests/performance/ &

wait

# T032: Manual quickstart scenarios (sequential)
# Follow steps in quickstart.md
```

---

## TDD Commit Strategy

**RED Phase** (Tests fail):
```
commit 1: Add failing contract test for BroadcastService (T004)
commit 2: Add failing integration test for phase transition (T007)
commit 3: Add failing contract test for DraftConfigService (T005)
commit 4: Add failing integration test for cube draft (T008)
commit 5: Add failing contract test for StandingsService (T006)
commit 6: Add failing integration test for concurrent standings (T009)
```

**GREEN Phase** (Fix bugs, implement modules):
```
commit 7: Remove global broadcasts (T014) - T007 now passes
commit 8: Fix draft config hydration (T016) - T008 now passes
commit 9: Add standings transaction (T015) - T009 now passes
commit 10: Extract broadcast module (T018) - T004 now passes
commit 11: Extract draft config module (T020) - T005 now passes
commit 12: Extract standings module (T022) - T006 now passes
```

**REFACTOR Phase** (Clean up):
```
commit 13: Update server/index.js imports (T019, T021, T023)
commit 14: Add event deduplication (T024)
commit 15: Fix retry loops (T025)
commit 16: Update documentation (T036)
```

---

## Notes

- **[P] Tasks**: Different files, no shared state → can run in parallel
- **Sequential Tasks**: Same file (server/index.js) → must run one at a time
- **TDD Order**: All tests (T004-T013) MUST fail before fixes (T014-T023)
- **Verification**: After each task, run corresponding test to verify
- **Rollback**: If test doesn't pass after fix, revert and debug
- **Commit Cadence**: Commit after each GREEN task (test passes)

---

## Validation Checklist
*GATE: Verify before marking feature complete*

- [ ] All contract tests have implementations (T004-T006 → T018, T020, T022)
- [ ] All integration tests pass (T007-T011 → T014-T017, T024-T025)
- [ ] All performance tests meet benchmarks (T012-T013 → <100ms, <10ms)
- [ ] All quickstart scenarios pass (T032)
- [ ] TypeScript build passes with 0 errors (`npm run build`)
- [ ] ESLint passes with 0 errors (`npm run lint`)
- [ ] Server file reduced from 6,329 lines to <5,000 lines
- [ ] No global broadcasts remain in server/index.js
- [ ] All standings updates wrapped in transactions
- [ ] Draft config hydration runs before pack generation
- [ ] Client retry loops use exponential backoff
- [ ] Documentation updated (CLAUDE.md)

---

## Task Execution Summary

**Total Tasks**: 36
**Estimated Timeline**: 2-3 weeks

**Week 1** (Priority 1):
- T001-T003: Setup (1 day)
- T004-T013: Tests first (2 days)
- T014-T017: Critical bug fixes (2 days)

**Week 2** (Priority 2):
- T018-T023: Module extraction (5 days)

**Week 3** (Priority 3-5):
- T024-T026: Client improvements (2 days)
- T027-T031: Database schema (1 day)
- T032-T036: Validation (2 days)

**Success Criteria**:
- Zero manual reloads required ✅
- Cube drafts work in production ✅
- No standings data loss ✅
- Server codebase modular and testable ✅
