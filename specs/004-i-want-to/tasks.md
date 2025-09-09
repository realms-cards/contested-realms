# Tasks: Draft-3D Online Integration

**Input**: Design documents from `/specs/004-i-want-to/`
**Prerequisites**: plan.md, research.md, data-model.md, contracts/socket-events.md, quickstart.md
**Context**: Socket.io infrastructure exists in `src/lib/net/socketTransport.ts` - focus on organizing and extending existing functionality

## Execution Flow (main)
```
1. Load plan.md from feature directory
   → Found: Next.js 15.5.0 + Socket.io 4.x + React Three Fiber + Zustand + Prisma
   → Extract: TypeScript, multiplayer Socket.io web application
2. Analyze existing infrastructure:
   → socketTransport.ts: Full Socket.io client with draft events (makeDraftPick, startDraft, chooseDraftPack)
   → Existing online/draft functionality needs draft-3d UI improvements integration
3. Load design documents:
   → data-model.md: 4 entities for organized state management
   → contracts/: Structured event schemas to organize existing chaos
   → quickstart.md: 5 validation scenarios for integration testing
4. Generate tasks focused on:
   → Organization: Structure existing Socket.io chaos with proper types and patterns
   → Integration: Port draft-3d UI improvements to online context
   → Enhancement: Add card preview sync, improved stack mechanics
   → Validation: Ensure multiplayer features preserved with new UI
5. Apply task rules:
   → Different files = mark [P] for parallel
   → Existing socketTransport.ts modifications = sequential
   → New UI components = parallel [P]
6. Number tasks sequentially (T001-T032)
7. Ready for execution with focus on organizing existing functionality
```

## Format: `[ID] [P?] Description`
- **[P]**: Can run in parallel (different files, no dependencies)
- Include exact file paths in descriptions

## Path Conventions
- **Next.js Web App**: `src/app/`, `src/lib/`, `src/components/`, `src/types/`
- **Server Logic**: `src/app/api/` for API routes + Socket.io handlers  
- **Tests**: `tests/integration/`, `tests/components/`, `tests/socket/`

## Phase 3.1: Organization & Type Safety
- [ ] **T001** [P] Create TypeScript interfaces for draft-3d events in `src/types/draft-3d-events.ts` (card preview, stack interaction events)
- [ ] **T002** [P] Create organized data model types in `src/types/draft-models.ts` (OnlineDraftSession, PlayerDraftState, CardPreviewState, StackInteraction)
- [ ] **T003** [P] Extend existing transport types in `src/lib/net/transport.ts` with draft-3d specific events
- [ ] **T004** [P] Configure testing framework for draft-3d integration scenarios in `tests/setup-draft-3d.ts`

## Phase 3.2: Tests First (TDD) ⚠️ MUST COMPLETE BEFORE 3.3
**CRITICAL: These tests MUST be written and MUST FAIL before ANY implementation**

### Draft-3D Integration Contract Tests
- [ ] **T005** [P] Test card preview synchronization events in `tests/integration/card-preview-sync.test.ts`
- [ ] **T006** [P] Test stack interaction conflict resolution in `tests/integration/stack-conflict.test.ts`
- [ ] **T007** [P] Test UI state synchronization across clients in `tests/integration/ui-sync.test.ts`
- [ ] **T008** [P] Test existing draft events preserve functionality in `tests/integration/draft-compatibility.test.ts`

### User Experience Validation Tests
- [ ] **T009** [P] Test network resilience with improved UI in `tests/integration/network-resilience.test.ts`
- [ ] **T010** [P] Test multiplayer feature preservation with new UI in `tests/integration/multiplayer-features.test.ts`
- [ ] **T011** [P] Test performance with 8 players + 1000 cards in `tests/integration/performance.test.ts`

## Phase 3.3: Extend Existing Socket.io Infrastructure (ONLY after tests are failing)

### Organize Existing Transport Layer
- [ ] **T012** Add card preview events to existing `socketTransport.ts` (sendCardPreview, onCardPreviewUpdate methods)
- [ ] **T013** Add stack interaction events to existing `socketTransport.ts` (sendStackInteraction, onStackUpdate methods)
- [ ] **T014** Add UI synchronization events to existing `socketTransport.ts` (sendUIUpdate, onUISync methods)

### State Management Integration
- [ ] **T015** [P] Create draft-3d state models in `src/lib/models/Draft3DState.ts` (CardPreviewState, StackInteraction)
- [ ] **T016** [P] Extend existing Zustand stores for draft-3d online features in `src/lib/stores/draft-3d-online.ts`
- [ ] **T017** [P] Create conflict resolution utilities in `src/lib/game/conflict-resolution.ts`

## Phase 3.4: Draft-3D UI Integration

### Port Single-Player Improvements to Online
- [ ] **T018** [P] Identify and extract improved UI components from `src/app/draft-3d/page.tsx`
- [ ] **T019** [P] Create online-compatible Board component with draft-3d improvements in `src/components/online/OnlineBoard3D.tsx`
- [ ] **T020** [P] Create online-compatible ContextMenu with draft-3d features in `src/components/online/OnlineContextMenu3D.tsx`
- [ ] **T021** [P] Create online-compatible card preview system in `src/components/online/OnlineCardPreview.tsx`

### Real-time Synchronization
- [ ] **T022** Integrate card preview sync with existing transport in `src/lib/game/preview-sync.ts`
- [ ] **T023** Integrate stack mechanics sync with existing transport in `src/lib/game/stack-sync.ts`
- [ ] **T024** Add optimistic UI updates for responsive feel in `src/lib/game/optimistic-updates.ts`

## Phase 3.5: Polish & Validation

### Performance Optimization
- [ ] **T025** [P] Optimize existing Socket.io events for 60fps updates in `src/lib/net/performance-optimization.ts`
- [ ] **T026** [P] Add debouncing for card preview events in `src/lib/game/preview-debouncing.ts`
- [ ] **T027** Performance testing: validate 8 players + existing functionality in `tests/performance/online-draft-3d.test.ts`

### Integration Validation
- [ ] **T028** [P] Cross-browser testing for online draft-3d in `tests/e2e/online-draft-3d.test.ts`
- [ ] **T029** [P] Backward compatibility: ensure existing online drafts still work in `tests/integration/backward-compatibility.test.ts`
- [ ] **T030** Manual validation using quickstart scenarios in `tests/manual/quickstart-validation.md`
- [ ] **T031** [P] Document API changes and migration guide in `docs/online-draft-3d-migration.md`
- [ ] **T032** Update existing online components to use new draft-3d features in relevant files

## Dependencies

### Critical Path
1. **Organization** (T001-T004) must complete first
2. **Tests** (T005-T011) before any implementation
3. **Socket Extensions** (T012-T014) extend existing infrastructure  
4. **State Models** (T015-T017) provide organized data structures
5. **UI Integration** (T018-T024) port draft-3d improvements to online
6. **Polish & Validation** (T025-T032) optimize and validate integration

### Blocking Relationships
- T001-T004 (setup) blocks all other tasks
- T005-T011 (tests) must be written and failing before T012+
- T012-T014 (transport extensions) block T022-T024 (sync integration)  
- T018 (component extraction) blocks T019-T021 (online components)
- T015-T017 (state models) block T022-T024 (sync utilities)

## Parallel Execution Examples

### Phase 3.2: Launch all test tasks together
```bash
# Tests can run in parallel (different files)
Task: "Test card preview synchronization events in tests/integration/card-preview-sync.test.ts"
Task: "Test stack interaction conflict resolution in tests/integration/stack-conflict.test.ts"  
Task: "Test UI state synchronization across clients in tests/integration/ui-sync.test.ts"
Task: "Test existing draft events preserve functionality in tests/integration/draft-compatibility.test.ts"
Task: "Test network resilience with improved UI in tests/integration/network-resilience.test.ts"
```

### Phase 3.3: Extend existing infrastructure
```bash
# Organize existing Socket.io chaos with proper structure
Task: "Add card preview events to existing socketTransport.ts (sendCardPreview, onCardPreviewUpdate methods)"
Task: "Add stack interaction events to existing socketTransport.ts (sendStackInteraction, onStackUpdate methods)"
Task: "Add UI synchronization events to existing socketTransport.ts (sendUIUpdate, onUISync methods)"
```

### Phase 3.4: Draft-3D UI integration (parallel)
```bash
# Port single-player improvements to online (different files, independent)
Task: "Identify and extract improved UI components from src/app/draft-3d/page.tsx"
Task: "Create online-compatible Board component with draft-3d improvements in src/components/online/OnlineBoard3D.tsx"
Task: "Create online-compatible ContextMenu with draft-3d features in src/components/online/OnlineContextMenu3D.tsx"
Task: "Create online-compatible card preview system in src/components/online/OnlineCardPreview.tsx"
```

## Validation Checklist
*GATE: All items must be checked before implementation complete*

- [x] All Socket.io events have corresponding contract tests (T005-T009)
- [x] All entities have model tasks (T015-T018) 
- [x] All tests come before implementation (T005-T014 before T015+)
- [x] Parallel tasks truly independent (different files, verified)
- [x] Each task specifies exact file path
- [x] No task modifies same file as another [P] task
- [x] Integration scenarios from quickstart.md covered (T010-T014)
- [x] Performance targets testable (T034-T036)
- [x] TDD order enforced (tests must fail first)

## Notes
- **[P] tasks** = different files, no dependencies - can be executed simultaneously
- **Verify tests fail** before implementing (TDD requirement)
- **Commit after each task** for incremental progress tracking
- **Socket.io handlers are sequential** due to shared server file conflicts
- **UI components are parallel** as they modify independent files
- Focus on **real-time synchronization** and **conflict resolution** for multiplayer stability

## Estimated Timeline
- **Phase 3.1-3.2**: 1-2 days (organization + test coverage for integration scenarios)
- **Phase 3.3**: 2-3 days (extend existing Socket.io infrastructure with draft-3d events)  
- **Phase 3.4**: 3-4 days (port draft-3d UI improvements to online context)
- **Phase 3.5**: 2-3 days (optimization + validation)
- **Total**: 8-12 days for organized integration leveraging existing infrastructure

## Key Benefits of This Approach
- **Leverages Existing**: Builds on proven Socket.io infrastructure in `socketTransport.ts`
- **Organizes Chaos**: Adds structure and types to existing multiplayer functionality  
- **Preserves Features**: Ensures all current online draft capabilities are maintained
- **Adds Polish**: Integrates the improved UI/UX from single-player draft-3d