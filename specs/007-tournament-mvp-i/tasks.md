# Tasks: Tournament MVP

**Input**: Design documents from `/specs/007-tournament-mvp-i/`
**Prerequisites**: plan.md (required), research.md, data-model.md, contracts/

## Execution Flow (main) ✅
```
1. Load plan.md from feature directory ✅
   → Tech stack: TypeScript 5.x, Next.js 15.5.0, React 19.1.0, Prisma, Socket.io
   → Structure: Next.js fullstack (src/ containing frontend + API routes)
2. Load design documents ✅
   → data-model.md: 5 entities (Tournament, TournamentRegistration, TournamentRound, TournamentMatch, TournamentStatistics)
   → contracts/: tournaments-api.ts + tournament-endpoints.md (15+ endpoints)
   → research.md: Swiss pairing, 2-32 players, real-time coordination
3. Generate tasks by category ✅
4. Apply TDD rules: Tests before implementation ✅
5. Number tasks sequentially (T001-T058) ✅
6. User context: Support 2-player and 4-player tournaments ✅
```

## Format: `[ID] [P?] Description`
- **[P]**: Can run in parallel (different files, no dependencies)
- Include exact file paths in descriptions

## Phase 3.1: Setup & Configuration

- [ ] **T001** Update data model validation: Change `maxPlayers` constraint from "8-32" to "2-32" in `/specs/007-tournament-mvp-i/data-model.md` to support 2-player and 4-player tournaments
- [ ] **T002** [P] Add tournament feature flag to configuration system in `src/lib/config/features.ts`
- [ ] **T003** [P] Create tournament constants file in `src/lib/tournament/constants.ts` (min/max players: 2-32, timeout values)
- [ ] **T004** [P] Install additional dependencies for tournament features (`npm install uuid @types/uuid`)

## Phase 3.2: Database Schema & Validation (TDD Setup)

- [ ] **T005** [P] Update Prisma schema in `prisma/schema.prisma` - add tournament enums and extend existing Tournament model with new fields
- [ ] **T006** [P] Create Zod validation schemas in `src/lib/tournament/validation.ts` based on contracts
- [ ] **T007** Generate Prisma client and run migrations (`npm run prisma:generate && npm run prisma:migrate`)

## Phase 3.3: Contract Tests (TDD - MUST FAIL FIRST) ⚠️

**CRITICAL: These tests MUST be written and MUST FAIL before ANY implementation**

- [ ] **T008** [P] Contract test for POST `/api/tournaments` in `tests/contract/tournaments-create.test.ts`
- [ ] **T009** [P] Contract test for GET `/api/tournaments` in `tests/contract/tournaments-list.test.ts`
- [ ] **T010** [P] Contract test for GET `/api/tournaments/[id]` in `tests/contract/tournaments-get.test.ts`
- [ ] **T011** [P] Contract test for POST `/api/tournaments/[id]/join` in `tests/contract/tournaments-join.test.ts`
- [ ] **T012** [P] Contract test for POST `/api/tournaments/[id]/preparation` in `tests/contract/tournaments-preparation.test.ts`
- [ ] **T013** [P] Contract test for GET `/api/tournaments/[id]/statistics` in `tests/contract/tournaments-statistics.test.ts`
- [ ] **T014** [P] Contract test for POST `/api/tournaments/[id]/start-preparation` in `tests/contract/tournaments-admin.test.ts`

## Phase 3.4: Integration Tests (TDD - MUST FAIL FIRST)

- [ ] **T015** [P] Integration test for sealed tournament flow in `tests/integration/sealed-tournament.test.ts`
- [ ] **T016** [P] Integration test for draft tournament flow in `tests/integration/draft-tournament.test.ts`
- [ ] **T017** [P] Integration test for constructed tournament flow in `tests/integration/constructed-tournament.test.ts`
- [ ] **T018** [P] Integration test for 2-player tournament support in `tests/integration/small-tournaments.test.ts`
- [ ] **T019** [P] Integration test for Socket.io tournament events in `tests/integration/tournament-realtime.test.ts`
- [ ] **T020** [P] Integration test for tournament statistics calculation in `tests/integration/tournament-statistics.test.ts`

## Phase 3.5: Core Data Models (After Tests Are Failing)

- [ ] **T021** [P] Create Tournament model utilities in `src/lib/tournament/models/tournament.ts`
- [ ] **T022** [P] Create TournamentRegistration model utilities in `src/lib/tournament/models/registration.ts`
- [ ] **T023** [P] Create TournamentRound model utilities in `src/lib/tournament/models/round.ts`
- [ ] **T024** [P] Create TournamentMatch model utilities in `src/lib/tournament/models/match.ts`
- [ ] **T025** [P] Create TournamentStatistics model utilities in `src/lib/tournament/models/statistics.ts`

## Phase 3.6: Tournament Services & Logic

- [ ] **T026** Create TournamentService class in `src/lib/tournament/services/tournament-service.ts` (depends on T021)
- [ ] **T027** Create Swiss pairing algorithm service in `src/lib/tournament/services/pairing-service.ts` (extends existing pairing.ts)
- [ ] **T028** Create tournament statistics service in `src/lib/tournament/services/statistics-service.ts` (depends on T025)
- [ ] **T029** Create tournament phase manager in `src/lib/tournament/services/phase-manager.ts` (depends on T026)
- [ ] **T030** Create tournament validation service in `src/lib/tournament/services/validation-service.ts` (depends on T006)

## Phase 3.7: API Endpoints Implementation

- [ ] **T031** Implement POST `/api/tournaments` in `src/app/api/tournaments/route.ts` (depends on T026)
- [ ] **T032** Implement GET `/api/tournaments` in `src/app/api/tournaments/route.ts` (depends on T026)
- [ ] **T033** Implement GET `/api/tournaments/[id]/route.ts` (depends on T026)
- [ ] **T034** Implement PATCH `/api/tournaments/[id]/route.ts` (depends on T026)
- [ ] **T035** Implement DELETE `/api/tournaments/[id]/route.ts` (depends on T026)
- [ ] **T036** Implement POST `/api/tournaments/[id]/join/route.ts` (depends on T027)
- [ ] **T037** Implement DELETE `/api/tournaments/[id]/leave/route.ts` (depends on T027)
- [ ] **T038** Implement POST `/api/tournaments/[id]/preparation/route.ts` (depends on T029)
- [ ] **T039** Implement GET `/api/tournaments/[id]/statistics/route.ts` (depends on T028)
- [ ] **T040** Implement GET `/api/tournaments/[id]/rounds/route.ts` (depends on T027)
- [ ] **T041** Implement POST `/api/tournaments/[id]/start-preparation/route.ts` (depends on T029)
- [ ] **T042** Implement POST `/api/tournaments/[id]/start-matches/route.ts` (depends on T029)
- [ ] **T043** Implement POST `/api/tournaments/[id]/next-round/route.ts` (depends on T027)

## Phase 3.8: Frontend State Management

- [ ] **T044** [P] Create tournament Zustand store in `src/lib/tournament/store/tournament-store.ts`
- [ ] **T045** [P] Create tournament Socket.io client in `src/lib/tournament/socket/tournament-socket.ts`
- [ ] **T046** [P] Create tournament hooks in `src/lib/tournament/hooks/use-tournament.ts`
- [ ] **T047** [P] Create tournament API client in `src/lib/tournament/api/tournament-client.ts`

## Phase 3.9: UI Components

- [ ] **T048** [P] Create tournament list component in `src/components/tournament/TournamentList.tsx`
- [ ] **T049** [P] Create tournament card component in `src/components/tournament/TournamentCard.tsx`
- [ ] **T050** [P] Create create tournament form in `src/components/tournament/CreateTournamentForm.tsx`
- [ ] **T051** [P] Create tournament details component in `src/components/tournament/TournamentDetails.tsx`
- [ ] **T052** [P] Create tournament statistics overlay in `src/components/tournament/TournamentStatistics.tsx` (pleasing UI/UX as requested)
- [ ] **T053** [P] Create tournament preparation component in `src/components/tournament/TournamentPreparation.tsx`

## Phase 3.10: Pages & Navigation

- [ ] **T054** Create tournaments page in `src/app/tournaments/page.tsx` (depends on T048, T049)
- [ ] **T055** Create tournament details page in `src/app/tournaments/[id]/page.tsx` (depends on T051, T052)
- [ ] **T056** Add tournament navigation to main app navigation (depends on T002 feature flag)

## Phase 3.11: Polish & Testing

- [ ] **T057** [P] Add unit tests for pairing algorithm in `tests/unit/pairing-service.test.ts`
- [ ] **T058** [P] Add unit tests for statistics calculation in `tests/unit/statistics-service.test.ts`
- [ ] **T059** [P] Performance testing for 32-player tournaments with <200ms response times
- [ ] **T060** [P] Mobile responsiveness testing for tournament overlay
- [ ] **T061** [P] Update CLAUDE.md with tournament implementation details

## Dependencies

**Critical TDD Dependencies:**
- Tests T008-T020 MUST be completed and failing before any implementation (T021-T043)
- T007 (Prisma migration) blocks all database-dependent tasks

**Model Dependencies:**
- T021-T025 (models) block T026-T030 (services)
- T026-T030 (services) block T031-T043 (API endpoints)

**Frontend Dependencies:**
- T044-T047 (state management) block T048-T053 (UI components)
- T048-T053 (components) block T054-T056 (pages)

**Feature Flag Dependencies:**
- T002 (feature flag) blocks T056 (navigation integration)

## Parallel Execution Examples

### Phase 3.3: Contract Tests (Run Together)
```bash
# All contract tests can run in parallel (different files):
Task: "Contract test POST /api/tournaments in tests/contract/tournaments-create.test.ts"
Task: "Contract test GET /api/tournaments in tests/contract/tournaments-list.test.ts"
Task: "Contract test GET /api/tournaments/[id] in tests/contract/tournaments-get.test.ts"
Task: "Contract test POST /api/tournaments/[id]/join in tests/contract/tournaments-join.test.ts"
```

### Phase 3.4: Integration Tests (Run Together)
```bash
# All integration tests can run in parallel (different files):
Task: "Integration test sealed tournament flow in tests/integration/sealed-tournament.test.ts"
Task: "Integration test draft tournament flow in tests/integration/draft-tournament.test.ts"
Task: "Integration test constructed tournament flow in tests/integration/constructed-tournament.test.ts"
Task: "Integration test 2-player tournament support in tests/integration/small-tournaments.test.ts"
```

### Phase 3.5: Model Creation (Run Together)
```bash
# All model files can be created in parallel:
Task: "Tournament model utilities in src/lib/tournament/models/tournament.ts"
Task: "TournamentRegistration model utilities in src/lib/tournament/models/registration.ts"
Task: "TournamentRound model utilities in src/lib/tournament/models/round.ts"
Task: "TournamentMatch model utilities in src/lib/tournament/models/match.ts"
Task: "TournamentStatistics model utilities in src/lib/tournament/models/statistics.ts"
```

## Tournament Size Support Matrix
Based on user requirements and updated constraints:

| Players | Supported | Rounds | Use Case |
|---------|-----------|---------|----------|
| 2       | ✅        | 1       | Head-to-head matches |
| 4       | ✅        | 2-3     | Small group tournaments |
| 8       | ✅        | 3-4     | Standard tournaments |
| 16      | ✅        | 4-5     | Larger tournaments |
| 32      | ✅        | 5-6     | Maximum supported |

## Notes
- **Strict TypeScript**: No `any` casting allowed per user requirements
- **UI/UX Focus**: Tournament overlay must be pleasing and responsive
- **Feature Flag**: All tournament functionality gated behind feature flag
- **TDD Mandatory**: All tests must fail before implementation begins
- **Socket.io Integration**: Real-time tournament updates throughout
- **Swiss Pairing**: Algorithm supports 2-32 players with proper pairing logic

---

**Task Status**: Ready for execution ✅  
**Total Tasks**: 61 numbered tasks  
**Parallel Tasks**: 31 tasks marked [P] for concurrent execution  
**TDD Compliance**: Contract and integration tests come before all implementation