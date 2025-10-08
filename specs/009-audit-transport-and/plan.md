# Implementation Plan: Tournament Flow Audit and Server Architecture Refactoring

**Branch**: `009-audit-transport-and` | **Date**: 2025-01-11 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/009-audit-transport-and/spec.md`

## Execution Flow (/plan command scope)
```
1. Load feature spec from Input path ✅
2. Fill Technical Context ✅
3. Evaluate Constitution Check ✅
4. Execute Phase 0 → research.md ✅
5. Execute Phase 1 → contracts, data-model.md, quickstart.md ✅
6. Re-evaluate Constitution Check ✅
7. Plan Phase 2 → Describe task generation approach ✅
8. STOP - Ready for /tasks command ✅
```

**IMPORTANT**: The /plan command STOPS at step 7. Phases 2-4 are executed by other commands:
- Phase 2: /tasks command creates tasks.md
- Phase 3-4: Implementation execution (manual or via tools)

## Summary

**Primary Requirement**: Fix critical production bugs in tournament system caused by architectural debt:
1. Manual reload required to start drafts (phase transition events not reaching clients)
2. Cube drafts broken in production but working locally (configuration hydration timing issue)
3. Standings intermittently not recorded (race conditions in concurrent match completions)
4. 6,329-line server file requiring modularization

**Technical Approach** (from research):
- **Surgical Refactoring**: Extract modules incrementally without behavioral changes
- **Fix Root Causes First**: Remove global broadcasts, add transaction wrappers, fix draft config loading
- **Maintain Compatibility**: All changes backward-compatible with existing API/socket contracts
- **Test Before Extract**: Add integration tests before extracting modules to prevent regressions

**Success Metrics**:
- Zero manual reloads required during tournament flow
- Cube drafts work identically in production and development
- No standings data loss in concurrent match completions
- Server codebase organized into testable modules (<2000 lines per module)

---

## Technical Context

**Language/Version**: TypeScript 5.x, Node.js 18.x
**Primary Dependencies**: Socket.IO 4.x, Prisma 5.x, Next.js 15.x, React 19.x
**Storage**: PostgreSQL (via Prisma ORM), Redis (optional for caching)
**Testing**: Vitest 2.0.5 for unit/integration tests, React Testing Library for components
**Target Platform**: Vercel (Next.js app), separate Socket.IO server (Node.js)
**Project Type**: Web application (Next.js frontend + API routes + Socket.IO server)
**Performance Goals**:
  - <100ms broadcast latency (API → Socket.IO → Clients)
  - <10ms standings update (database transaction)
  - <2s phase transition (user-perceived latency)
**Constraints**:
  - Zero downtime deployment (production has active users)
  - Backward compatible socket events (mobile app may be on old version)
  - TypeScript strict mode (no `any` types allowed per constitution)
  - <30s build time (current: ~22s, cannot regress)
**Scale/Scope**:
  - 100+ concurrent users
  - 32-player tournaments (max)
  - 6,329-line server file → extract to 5-7 modules (~1000 lines each)

**User Requirements** (from command args):
- "Feature complete, but bugs from poor architecture"
- "Surgical refactoring only - optimize what exists"
- "Clean factoring and importing where possible"
- "Looking for bugs in logic, especially request/reload loops"

**Constraints from User**:
- No new features (bug fixes only)
- Preserve existing behavior (backward compatibility)
- Focus on logic bugs causing loops/races

---

## Constitution Check
*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### Initial Constitution Check (Pre-Research)

**Simplicity**:
- Projects: 2 (Next.js app + Socket.IO server) ✅ (under limit of 3)
- Using framework directly? ✅ (Socket.IO, Prisma used without wrappers)
- Single data model? ✅ (Prisma schema is source of truth)
- Avoiding patterns? ✅ (No Repository/UoW, direct Prisma usage)

**Architecture**:
- EVERY feature as library? ⚠️ Currently monolithic server file (6,329 lines)
  - **Justification**: Existing codebase, refactoring in progress
  - **Plan**: Extract to modules (broadcast, draft, standings, match, lobby)
- Libraries listed:
  - `server/modules/tournament/broadcast.js` - Event emission layer
  - `server/modules/draft/config.js` - Draft configuration service
  - `server/modules/tournament/standings.js` - Standings management
- CLI per library: N/A (server modules, not CLI tools)
- Library docs: Will add JSDoc to all extracted modules

**Testing (NON-NEGOTIABLE)**:
- RED-GREEN-Refactor cycle enforced? ✅ Plan includes contract tests that fail first
- Git commits show tests before implementation? ✅ Quickstart scenarios = failing tests
- Order: Contract→Integration→E2E→Unit? ⚠️ Will follow for new modules
  - **Existing code**: Extract with existing behavior tests (integration tests)
  - **New contracts**: Follow RED-GREEN for service interfaces
- Real dependencies used? ✅ Tests use actual PostgreSQL (via Prisma)
- Integration tests for: ✅ new libraries, contract changes, shared schemas
- FORBIDDEN: Implementation before test ✅ Acknowledged

**Observability**:
- Structured logging included? ✅ All broadcast/standings operations logged
- Frontend logs → backend? ⚠️ Not in scope (would be new feature)
- Error context sufficient? ✅ Research phase added error logging requirements

**Versioning**:
- Version number assigned? ⚠️ Not applicable (bug fixes, no API version change)
- BUILD increments on every change? N/A (web app, not library)
- Breaking changes handled? ✅ No breaking changes (backward compatible socket events)

**Constitutional Deviations**: None that block implementation
- Server modularization in progress (addresses library architecture requirement)
- Frontend → backend logging out of scope (feature enhancement, not bug fix)

---

### Post-Design Constitution Check (After Phase 1)

**Type Safety Review**:
- ✅ All contracts use explicit TypeScript interfaces
- ✅ No `any` types in contracts (BroadcastService, DraftConfigService, StandingsService)
- ✅ Service methods have explicit return types (Promise<void>, Promise<DraftConfiguration>, etc.)
- ✅ Error types documented (throw Error, not any)

**Architecture Review**:
- ✅ Broadcast module extracts cleanly (10 functions, clear interface)
- ✅ Draft config module isolates hydration logic (3 functions)
- ✅ Standings module wraps transactions (4 functions)
- ✅ All modules have single responsibility

**Testing Review**:
- ✅ Quickstart scenarios cover all bug cases (phase transition, cube draft, standings race)
- ✅ Each scenario has clear success/failure criteria
- ✅ Performance benchmarks defined (<100ms broadcast, <10ms standings)

**No new violations introduced.** Refactoring improves architecture without adding complexity.

---

## Project Structure

### Documentation (this feature)
```
specs/009-audit-transport-and/
├── plan.md              # This file (/plan command output) ✅
├── spec.md              # Feature specification ✅
├── research.md          # Phase 0 output (/plan command) ✅
├── data-model.md        # Phase 1 output (/plan command) ✅
├── quickstart.md        # Phase 1 output (/plan command) ✅
├── contracts/           # Phase 1 output (/plan command) ✅
│   ├── broadcast-service.ts
│   ├── draft-config-service.ts
│   └── standings-service.ts
└── tasks.md             # Phase 2 output (/tasks command - NOT created by /plan)
```

### Source Code (repository root)
```
# Current Structure (Web application - Option 2)
src/
├── app/
│   └── api/
│       └── tournaments/       # API routes
├── components/
│   └── game/                  # Tournament/draft UI
├── hooks/                     # useTournamentSocket, useDraft3DTransport
├── lib/
│   ├── services/              # tournament-broadcast, tournament-socket-service
│   └── tournament/            # pairing, constants
└── contexts/                  # RealtimeTournamentContext

server/
├── index.js                   # 6,329 lines (TO BE REFACTORED)
└── modules/                   # NEW: Extracted modules
    ├── tournament/
    │   ├── broadcast.js       # Event emission layer
    │   └── standings.js       # Standings management
    ├── draft/
    │   └── config.js          # Configuration service
    ├── match/
    │   └── lifecycle.js       # Match state management
    └── shared/
        └── presence.js        # Player presence tracking

tests/
├── contract/                  # Service contract tests
│   ├── broadcast-service.test.ts
│   ├── draft-config-service.test.ts
│   └── standings-service.test.ts
├── integration/               # End-to-end flow tests
│   ├── tournament-phase-transition.test.ts
│   ├── cube-draft-flow.test.ts
│   └── concurrent-standings.test.ts
└── unit/                      # Module unit tests
    ├── broadcast-deduplication.test.ts
    └── standings-transaction.test.ts
```

**Structure Decision**: Web application (Option 2) - Next.js frontend + API backend + Socket.IO server

---

## Phase 0: Outline & Research ✅

**Status**: COMPLETE

**Output**: [research.md](./research.md)

### Key Findings

1. **Dual Broadcasting Pattern** (Lines 4129-4138 in server/index.js):
   - All events emitted to tournament room AND globally
   - Causes request loops (clients receive unrelated tournament events)
   - Fix: Remove all `io.emit()` calls, use `io.to(room)` only

2. **Draft Configuration Hydration** (Lines 3647-3676, 543-544):
   - Tournament drafts store `cubeId` in `DraftSession.settings`
   - Match drafts expect `match.draftConfig.cubeId`
   - Hydration only runs when match loaded from database
   - Production uses in-memory state → hydration skipped → `cubeId` undefined
   - Fix: Force hydration before draft start, or query DraftSession directly

3. **Standings Race Conditions** (Lines 2370-2382):
   - Winner and loser updates are separate queries (not transactional)
   - Concurrent match completions can overwrite each other's updates
   - Empty catch block swallows errors
   - Fix: Wrap in `prisma.$transaction([...])`, add error logging

4. **Server Architecture** (6,329 lines in single file):
   - Mixed responsibilities: lobbies, matches, drafts, tournaments, leaderboard
   - Code duplication: 10+ broadcast functions with identical pattern
   - Poor testability: Cannot unit test individual components
   - Fix: Extract modules (broadcast, draft, standings, match, lobby)

### Technology Decisions

- **Refactoring Approach**: Surgical (extract modules without behavior changes)
- **Transaction Strategy**: Prisma `$transaction` (native, ACID guarantees)
- **Event Deduplication**: Client-side with request ID (prevents loops)
- **Environment Validation**: Bash script in CI/CD (catches config errors pre-deploy)

### Alternatives Considered

- ❌ Full server rewrite (too risky)
- ❌ Redis locks for standings (adds dependency)
- ❌ Server-side event deduplication (doesn't fix root cause)
- ✅ Incremental module extraction (safe, testable)

---

## Phase 1: Design & Contracts ✅

**Status**: COMPLETE

**Outputs**:
- [data-model.md](./data-model.md)
- [contracts/broadcast-service.ts](./contracts/broadcast-service.ts)
- [contracts/draft-config-service.ts](./contracts/draft-config-service.ts)
- [contracts/standings-service.ts](./contracts/standings-service.ts)
- [quickstart.md](./quickstart.md)

### Contracts Generated

**BroadcastService**:
- `emitPhaseChanged(tournamentId, newPhase, additionalData)` - Phase transition events
- `emitTournamentUpdate(tournamentId, tournamentData)` - Full tournament state
- `emitDraftReady(tournamentId, draftSessionId, totalPlayers)` - Draft initialization
- `emitRoundStarted(tournamentId, roundNumber, matches)` - Round creation
- `emitMatchesReady(tournamentId, matches)` - Match assignments

**Guarantees**:
- All emissions target tournament room only (no global broadcasts)
- Events deduplicated within 5-second window
- All events logged to `TournamentBroadcastEvent` table
- Failed emissions retried 2x with exponential backoff

**DraftConfigService**:
- `getDraftConfig(matchId)` - Load complete draft configuration
- `loadCubeConfiguration(cubeId)` - Load cube card list
- `ensureConfigLoaded(matchId)` - Force hydration from DraftSession

**Guarantees**:
- Tournament drafts always load from DraftSession
- Configuration validated (cubeId XOR setMix required)
- Hydration runs before pack generation
- Missing configuration throws error (no silent failures)

**StandingsService**:
- `recordMatchResult(tournamentId, winnerId, loserId, isDraw)` - Atomic standings update
- `getStandings(tournamentId)` - Query current standings
- `recalculateTiebreakers(tournamentId)` - Batch update after round
- `validateStandings(tournamentId)` - Integrity check

**Guarantees**:
- Winner and loser updates are atomic (both succeed or both fail)
- Match points always equal `(wins * 3) + draws`
- Transaction conflicts retry once with 100ms delay
- All failures logged to monitoring

### Data Model Enhancements

**New Entities**:
- `TournamentBroadcastEvent` - Audit log for socket events (debugging, deduplication)
- `SocketBroadcastHealth` - Monitor broadcast failures (alerting, metrics)

**Enhanced Entities**:
- `PlayerStanding` - Add constraints: `matchPoints = (wins * 3) + draws`
- `DraftConfiguration` - Unified model (replaces DraftSession vs Match.draftConfig split)

**Integrity Constraints**:
1. Atomic standings updates (transaction wrapper)
2. Draft configuration completeness (cubeId XOR setMix)
3. Event deduplication (5-second window)

### Test Scenarios (from quickstart.md)

1. **Phase Transition Without Reload**: Start tournament → verify `PHASE_CHANGED` reaches clients
2. **Cube Draft in Production**: Create cube draft → verify cube packs generated (not sets)
3. **Concurrent Match Completions**: Submit 2 match results simultaneously → verify both standings correct
4. **Draft Join Without Loops**: Join draft → verify ≤3 join requests (no retry spam)
5. **Environment Validation**: Run validation script → verify catches missing variables

Each scenario has:
- Step-by-step instructions (curl commands, browser actions)
- Success criteria (expected behavior)
- Failure indicators (what to check if broken)
- Performance benchmarks (<100ms broadcast, <10ms standings)

---

## Phase 2: Task Planning Approach
*This section describes what the /tasks command will do - DO NOT execute during /plan*

### Task Generation Strategy

**Input Sources**:
1. Research findings (4 critical bugs identified)
2. Service contracts (3 new modules to extract)
3. Quickstart scenarios (5 integration test suites)
4. Data model (2 new tables, 1 enhanced table)

**Task Categories**:

**A. Critical Bug Fixes** (immediate production impact):
1. Remove global broadcasts from server/index.js
2. Add transaction wrapper to standings updates
3. Fix draft config hydration timing
4. Add environment variable validation script

**B. Module Extraction** (architectural improvement):
5. Extract broadcast module (server/modules/tournament/broadcast.js)
6. Extract draft config module (server/modules/draft/config.js)
7. Extract standings module (server/modules/tournament/standings.js)

**C. Client-Side Improvements** (prevent symptoms):
8. Add event deduplication to useTournamentSocket hook
9. Fix draft join retry loop (exponential backoff)
10. Add broadcast health monitoring

**D. Testing** (prevent regressions):
11. Add contract tests (broadcast, draft, standings)
12. Add integration tests (phase transition, cube draft, concurrent standings)
13. Add performance tests (broadcast latency, standings update timing)

**E. Database Schema** (optional enhancements):
14. Add TournamentBroadcastEvent table (audit logging)
15. Add SocketBroadcastHealth table (monitoring)
16. Add check constraint to PlayerStanding (matchPoints validation)

### Ordering Strategy

**Priority 1** (Production Blockers):
- Task 1: Remove global broadcasts (fixes request loops)
- Task 2: Add standings transaction (fixes data loss)
- Task 3: Fix draft config hydration (fixes cube drafts)
- Task 4: Environment validation (prevents deployment failures)

**Priority 2** (Architecture Refactoring):
- Task 5: Extract broadcast module
- Task 6: Extract draft config module
- Task 7: Extract standings module

**Priority 3** (Client Improvements):
- Task 8: Event deduplication
- Task 9: Fix retry loops
- Task 10: Health monitoring

**Priority 4** (Testing):
- Task 11-13: Contract, integration, performance tests

**Priority 5** (Optional Enhancements):
- Task 14-16: Database schema improvements

**Dependencies**:
- Task 5 depends on Task 1 (extract broadcast after fixing global emissions)
- Task 7 depends on Task 2 (extract standings after adding transactions)
- Task 11 depends on Tasks 5-7 (contract tests after modules extracted)
- Task 12 depends on Tasks 1-3 (integration tests after bugs fixed)

**Parallelization**:
- Tasks 1-4 can run in parallel [P] (independent bug fixes)
- Tasks 5-7 can run in parallel [P] after Tasks 1-4 complete (independent extractions)
- Tasks 8-10 can run in parallel [P] (client-side changes)
- Tasks 11-13 can run in parallel [P] (independent test suites)
- Tasks 14-16 can run in parallel [P] (database migrations)

### TDD Order

Following RED-GREEN-Refactor:

1. **RED**: Write failing contract test for BroadcastService
2. **GREEN**: Extract broadcast module to pass test
3. **Refactor**: Remove old broadcast functions from server/index.js
4. Repeat for draft config and standings modules

**Commit Order**:
```
commit 1: Add failing contract test for BroadcastService
commit 2: Implement broadcast module (test passes)
commit 3: Refactor server/index.js to use new module
commit 4: Add failing integration test for phase transition
commit 5: Fix global broadcast bug (integration test passes)
commit 6: Performance test for broadcast latency
```

### Estimated Output

**Total Tasks**: ~30-35 numbered tasks in tasks.md

**Breakdown**:
- Critical fixes: 8-10 tasks (remove broadcasts, add transactions, fix hydration, validation)
- Module extraction: 10-12 tasks (extract 3 modules + update imports)
- Client improvements: 6-8 tasks (deduplication, retry logic, monitoring)
- Testing: 10-12 tasks (contract, integration, performance tests)
- Schema changes: 3-5 tasks (new tables, constraints, migrations)

**Estimated Timeline**: 2-3 weeks
- Week 1: Critical fixes (Tasks 1-4) + initial tests
- Week 2: Module extraction (Tasks 5-7) + contract tests
- Week 3: Client improvements (Tasks 8-10) + integration tests

**IMPORTANT**: This phase is executed by the /tasks command, NOT by /plan

---

## Phase 3+: Future Implementation
*These phases are beyond the scope of the /plan command*

**Phase 3**: Task execution (/tasks command creates tasks.md)
**Phase 4**: Implementation (execute tasks.md following constitutional principles)
**Phase 5**: Validation (run tests, execute quickstart.md, performance validation)

**Validation Criteria**:
- All quickstart scenarios pass ✅
- All contract tests pass ✅
- All integration tests pass ✅
- Performance benchmarks met (<100ms broadcast, <10ms standings) ✅
- TypeScript build passes with 0 errors ✅
- ESLint passes with 0 errors (warnings acceptable) ✅

**Deployment Strategy**:
1. Deploy critical fixes first (Tasks 1-4) → hotfix release
2. Deploy module extraction (Tasks 5-7) → minor version bump
3. Deploy client improvements (Tasks 8-10) → patch release
4. Monitor production metrics for 1 week
5. If stable, proceed with optional schema changes (Tasks 14-16)

---

## Complexity Tracking
*Fill ONLY if Constitution Check has violations that must be justified*

**No violations requiring justification.**

Server modularization (library architecture principle) is in progress and documented as part of this feature.

---

## Progress Tracking
*This checklist is updated during execution flow*

**Phase Status**:
- [x] Phase 0: Research complete (/plan command)
- [x] Phase 1: Design complete (/plan command)
- [x] Phase 2: Task planning complete (/plan command - describe approach only)
- [ ] Phase 3: Tasks generated (/tasks command)
- [ ] Phase 4: Implementation complete
- [ ] Phase 5: Validation passed

**Gate Status**:
- [x] Initial Constitution Check: PASS
- [x] Post-Design Constitution Check: PASS
- [x] All NEEDS CLARIFICATION resolved
- [x] Complexity deviations documented (none required)

**Artifact Status**:
- [x] research.md created
- [x] data-model.md created
- [x] contracts/ directory created (3 files)
- [x] quickstart.md created
- [x] plan.md created (this file)
- [ ] tasks.md created (by /tasks command)

---

## Next Steps

**Ready for /tasks command** ✅

The /tasks command will:
1. Load this plan.md and all Phase 1 artifacts
2. Generate ~30-35 numbered tasks following TDD order
3. Mark dependencies and parallelization opportunities
4. Create tasks.md with full implementation checklist

**User Action Required**:
Run `/tasks` to generate the implementation task list.

---

*Based on Constitution v2.2.0 - See `/memory/constitution.md`*
