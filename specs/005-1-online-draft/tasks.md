# Tasks: Online Draft Flow Improvements

**Input**: Design documents from `/specs/005-1-online-draft/`
**Prerequisites**: plan.md (required), research.md, data-model.md, contracts/
**Principle**: Harden existing code before adding new features

## Execution Flow (main)
```
1. Load plan.md from feature directory
   → SUCCESS: TypeScript + Next.js + Socket.io stack
   → Extract: modular structure, strong typing requirements
2. Load optional design documents:
   → data-model.md: DraftSession, PlayerDraftState, DeckSubmission entities
   → contracts/: draft-sync.ts, deck-submission.ts, types.ts
   → research.md: 30s grace period, 60s pick timer, 8 player optimal
3. Generate tasks by category:
   → Audit: Review existing draft code for hardening
   → Tests: Contract tests for Socket events
   → Core: Sync manager, persistence, waiting overlay
   → Integration: Socket handlers, React hooks
   → Polish: Integration tests, linting
4. Apply task rules:
   → Different files = mark [P] for parallel
   → Same file = sequential (no [P])
   → Tests before implementation (TDD)
5. Number tasks sequentially (T001-T030)
6. Return: SUCCESS (tasks ready for execution)
```

## Format: `[ID] [P?] Description`
- **[P]**: Can run in parallel (different files, no dependencies)
- Include exact file paths in descriptions

## Phase 3.1: Audit & Harden Existing Code

- [ ] T001 Audit existing draft code in src/components/game/OnlineDraft3DScreen.tsx for type safety issues
- [ ] T002 Audit src/lib/stores/draft-3d-online.ts for synchronization issues
- [ ] T003 Audit src/lib/hooks/useDraft3DTransport.ts for memory leaks and dependency issues
- [ ] T004 [P] Add strong typing to src/types/draft-models.ts - replace any types
- [ ] T005 [P] Add strong typing to src/types/draft-3d-events.ts - ensure all events typed
- [ ] T006 Harden src/lib/net/socketTransport.ts with reconnection logic and error handling

## Phase 3.2: Tests First (TDD) ⚠️ MUST COMPLETE BEFORE 3.3

**CRITICAL: These tests MUST be written and MUST FAIL before ANY implementation**

- [ ] T007 [P] Contract test for draft:pick_card event in tests/integration/draft-sync-pick.test.ts
- [ ] T008 [P] Contract test for draft:sync_state event in tests/integration/draft-sync-state.test.ts
- [ ] T009 [P] Contract test for draft:deck_submit event in tests/integration/deck-submission.test.ts
- [ ] T010 [P] Contract test for draft:waiting_overlay events in tests/integration/waiting-overlay.test.ts
- [ ] T011 [P] Integration test for pick synchronization flow in tests/integration/pick-sync-flow.test.ts
- [ ] T012 [P] Integration test for deck persistence in tests/integration/deck-persistence-flow.test.ts
- [ ] T013 [P] Integration test for reconnection handling in tests/integration/reconnection.test.ts

## Phase 3.3: Core Implementation (ONLY after tests are failing)

### Synchronization Logic
- [ ] T014 Create src/lib/draft/sync/types.ts with DraftSession and PlayerDraftState interfaces
- [ ] T015 Implement src/lib/draft/sync/DraftSyncManager.ts with pick coordination logic
- [ ] T016 Implement src/lib/draft/sync/DraftSyncStore.ts with Zustand state management

### Deck Persistence
- [ ] T017 [P] Create src/lib/draft/persistence/types.ts with DeckSubmission interfaces
- [ ] T018 [P] Implement src/lib/draft/persistence/DeckPersistenceManager.ts to preserve deck state

### Waiting Overlay
- [ ] T019 [P] Create src/lib/draft/waiting/types.ts with WaitingOverlayState interface
- [ ] T020 [P] Implement src/lib/draft/waiting/WaitingStateManager.ts for submission tracking

## Phase 3.4: Integration

### Socket Handlers
- [ ] T021 Extend src/lib/net/socketTransport.ts with draft synchronization event handlers
- [ ] T022 Create src/lib/net/handlers/draft-sync-handlers.ts for pick/pass coordination

### React Hooks & Components
- [ ] T023 Create src/lib/hooks/useDraftSync.ts to connect components to sync state
- [ ] T024 Create src/lib/hooks/useWaitingOverlay.ts for overlay state management
- [ ] T025 [P] Create src/components/draft/DraftWaitingOverlay.tsx component
- [ ] T026 [P] Create src/components/draft/DraftPlayerStatus.tsx for player indicators
- [ ] T027 Update src/app/online/play/[id]/page.tsx to integrate new synchronization

## Phase 3.5: Polish & Validation

- [ ] T028 [P] Run ESLint on all new draft code: `npm run lint -- src/lib/draft/`
- [ ] T029 [P] Run ESLint on modified components: `npm run lint -- src/components/draft/`
- [ ] T030 [P] Unit tests for DraftSyncManager in tests/unit/DraftSyncManager.test.ts
- [ ] T031 [P] Unit tests for DeckPersistenceManager in tests/unit/DeckPersistenceManager.test.ts
- [ ] T032 Run full integration test suite: `npm test -- --testPathPattern=draft`
- [ ] T033 Performance validation: verify <100ms sync and 60fps UI
- [ ] T034 Execute quickstart.md scenarios for manual validation

## Dependencies

- Audit tasks (T001-T006) can start immediately
- Tests (T007-T013) must complete before implementation (T014-T027)
- T014-T016 (sync logic) blocks T021-T022 (socket handlers)
- T017-T018 (persistence) independent of sync
- T019-T020 (waiting) independent of sync and persistence
- T023-T024 (hooks) require T015-T016 and T020
- T025-T027 (UI) require hooks (T023-T024)
- Polish (T028-T034) after all implementation

## Parallel Execution Examples

```bash
# Phase 3.1: Parallel hardening tasks
Task: "Add strong typing to src/types/draft-models.ts"
Task: "Add strong typing to src/types/draft-3d-events.ts"

# Phase 3.2: Launch all test creation together
Task: "Contract test for draft:pick_card event"
Task: "Contract test for draft:sync_state event"
Task: "Contract test for draft:deck_submit event"
Task: "Contract test for draft:waiting_overlay events"
Task: "Integration test for pick synchronization flow"
Task: "Integration test for deck persistence"
Task: "Integration test for reconnection handling"

# Phase 3.3: Parallel module creation
Task: "Create src/lib/draft/persistence/types.ts"
Task: "Implement DeckPersistenceManager.ts"
Task: "Create src/lib/draft/waiting/types.ts"
Task: "Implement WaitingStateManager.ts"

# Phase 3.5: Parallel linting and unit tests
Task: "Run ESLint on all new draft code"
Task: "Run ESLint on modified components"
Task: "Unit tests for DraftSyncManager"
Task: "Unit tests for DeckPersistenceManager"
```

## Implementation Notes

### Strong Typing Requirements
- Every new file MUST use TypeScript with NO `any` types
- All Socket.io events MUST have typed interfaces
- All Zustand stores MUST have typed state interfaces
- All React props MUST have explicit type definitions

### Modularization Requirements
- Keep files under 200 lines
- One responsibility per file
- Separate types, logic, and UI
- Use barrel exports for clean imports

### Testing Requirements
- Tests MUST fail before implementation
- Use actual Socket.io connections, not mocks
- Test reconnection scenarios thoroughly
- Verify deck persistence across route changes

### Performance Requirements
- Pick synchronization < 100ms p95
- UI updates at 60fps minimum
- Memory usage < 50MB per session
- Support 8 concurrent players

## Validation Checklist

- [x] All contracts have corresponding tests (T007-T010)
- [x] All entities have type definitions (T014, T017, T019)
- [x] All tests come before implementation (Phase 3.2 before 3.3)
- [x] Parallel tasks truly independent (verified file separation)
- [x] Each task specifies exact file path
- [x] No [P] task modifies same file as another [P] task
- [x] Existing code hardening prioritized (T001-T006)
- [x] Linting included after implementation (T028-T029)

## Success Criteria

Upon completion:
1. All players must pick before packs rotate
2. Deck editor preserves drafted cards when adding Standard Cards
3. Waiting overlay shows real-time submission progress
4. System handles 8+ players smoothly
5. Disconnection/reconnection works within 30s grace period
6. All TypeScript compilation passes with zero errors
7. ESLint passes with zero errors
8. All tests pass (unit, integration, e2e)

## Next Steps After Task Completion

1. Run `npm run build` to verify production build
2. Deploy to staging environment
3. Execute quickstart.md test scenarios
4. Create PR with implementation
5. Update CLAUDE.md with new patterns