# Tasks: Permanent Burrow/Submerge Mechanics

**Input**: Design documents from `/Users/geleeroyale/CascadeProjects/sorcery-client/specs/003-permanents-might-have/`
**Prerequisites**: plan.md (required), research.md, data-model.md, contracts/

## Execution Flow (main)
```
1. Load plan.md from feature directory
   → ✅ COMPLETED: TypeScript 5.x, React 19.1.0, Next.js 15.5.0, Three.js stack identified
   → ✅ COMPLETED: Zustand store, React Three Fiber component architecture extracted
2. Load optional design documents:
   → ✅ COMPLETED: data-model.md: 4 core entities identified → model tasks generated
   → ✅ COMPLETED: contracts/: 3 contract files → contract test tasks generated
   → ✅ COMPLETED: research.md: Y-axis positioning, context menu decisions → setup tasks
3. Generate tasks by category:
   → ✅ COMPLETED: Setup, Tests, Core, Integration, Polish phases defined
4. Apply task rules:
   → ✅ COMPLETED: Different files marked [P] for parallel execution
   → ✅ COMPLETED: Same file dependencies identified as sequential
   → ✅ COMPLETED: TDD ordering enforced (tests before implementation)
5. Number tasks sequentially (T001, T002...)
   → ✅ COMPLETED: 24 tasks generated and numbered
6. Generate dependency graph
   → ✅ COMPLETED: Phase dependencies and parallel execution mapped
7. Create parallel execution examples
   → ✅ COMPLETED: Multi-task execution examples provided
8. Validate task completeness:
   → ✅ COMPLETED: All contracts have tests, all entities have models, all scenarios covered
9. Return: SUCCESS (tasks ready for execution)
   → ✅ READY for implementation phase
```

## Format: `[ID] [P?] Description`
- **[P]**: Can run in parallel (different files, no dependencies)
- Include exact file paths in descriptions

## Path Conventions
- **Web app**: Next.js structure with `src/` at repository root
- Paths follow existing Next.js project structure from plan.md

## Phase 3.1: Setup
- [ ] T001 Create TypeScript type definitions in src/lib/game/types.ts for burrow/submerge mechanics
- [ ] T002 [P] Install react-spring dependency for smooth 3D position animations
- [ ] T003 [P] Configure ESLint rules for Three.js/React Three Fiber best practices

## Phase 3.2: Tests First (TDD) ⚠️ MUST COMPLETE BEFORE 3.3
**CRITICAL: These tests MUST be written and MUST FAIL before ANY implementation**
- [ ] T004 [P] Contract test permanent position state management in tests/contract/position-state.test.ts
- [ ] T005 [P] Contract test site edge placement calculations in tests/contract/site-placement.test.ts
- [ ] T006 [P] Contract test context menu action generation in tests/contract/context-menu.test.ts
- [ ] T007 [P] Integration test burrow functionality workflow in tests/integration/burrow-workflow.test.tsx
- [ ] T008 [P] Integration test submerge at water sites in tests/integration/submerge-workflow.test.tsx
- [ ] T009 [P] Integration test site edge placement orientation in tests/integration/site-placement.test.tsx
- [ ] T010 [P] Integration test multiple permanents under one site in tests/integration/multi-burrow.test.tsx
- [ ] T011 [P] Integration test state transition validation in tests/integration/state-transitions.test.tsx

## Phase 3.3: Core Implementation (ONLY after tests are failing)
- [ ] T012 [P] PermanentPositionState interface and validation in src/lib/game/types.ts
- [ ] T013 [P] SitePositionData interface and edge calculation utilities in src/lib/game/types.ts
- [ ] T014 [P] BurrowAbility interface and capability metadata in src/lib/game/types.ts
- [ ] T015 [P] ContextMenuAction interface and pre-defined actions in src/lib/game/types.ts
- [ ] T016 Extend Zustand game store with PermanentPositionSlice in src/lib/game/store.ts
- [ ] T017 Extend Zustand game store with SitePlacementSlice in src/lib/game/store.ts
- [ ] T018 Modify CardPlane component for Y-axis depth positioning in src/lib/game/components/CardPlane.tsx
- [ ] T019 Extend ContextMenu component with burrow/submerge actions in src/components/game/ContextMenu.tsx
- [ ] T020 Modify Board component for edge-based site placement in src/lib/game/Board.tsx

## Phase 3.4: Integration
- [ ] T021 Add react-spring animations to CardPlane position transitions in src/lib/game/components/CardPlane.tsx
- [ ] T022 Integrate permanent abilities with context menu action validation in src/components/game/ContextMenu.tsx
- [ ] T023 Connect site placement with player position calculations in src/lib/game/Board.tsx

## Phase 3.5: Polish
- [ ] T024 [P] Performance validation tests (60fps, <100ms response) in tests/performance/burrow-performance.test.ts

## Dependencies
- Setup (T001-T003) before tests (T004-T011)
- Tests (T004-T011) before implementation (T012-T023)
- Type definitions (T012-T015) before store extensions (T016-T017)
- Store extensions (T016-T017) before component modifications (T018-T020)
- Core implementation (T012-T020) before integration (T021-T023)
- All implementation before polish (T024)

## Parallel Example
```
# Launch contract tests together (T004-T006):
Task: "Contract test permanent position state management in tests/contract/position-state.test.ts"
Task: "Contract test site edge placement calculations in tests/contract/site-placement.test.ts"  
Task: "Contract test context menu action generation in tests/contract/context-menu.test.ts"

# Launch integration tests together (T007-T011):
Task: "Integration test burrow functionality workflow in tests/integration/burrow-workflow.test.tsx"
Task: "Integration test submerge at water sites in tests/integration/submerge-workflow.test.tsx"
Task: "Integration test site edge placement orientation in tests/integration/site-placement.test.tsx"
Task: "Integration test multiple permanents under one site in tests/integration/multi-burrow.test.tsx"
Task: "Integration test state transition validation in tests/integration/state-transitions.test.tsx"

# Launch type definition tasks together (T012-T015):
Task: "PermanentPositionState interface and validation in src/lib/game/types.ts"
Task: "SitePositionData interface and edge calculation utilities in src/lib/game/types.ts"
Task: "BurrowAbility interface and capability metadata in src/lib/game/types.ts"
Task: "ContextMenuAction interface and pre-defined actions in src/lib/game/types.ts"
```

## Notes
- [P] tasks = different files, no dependencies
- Verify tests fail before implementing (RED phase of TDD)
- Commit after each task completion
- Maintain 60fps performance during 3D position transitions
- Ensure WebGL compatibility across browsers

## Task Generation Rules
*Applied during main() execution*

1. **From Contracts**:
   - position-state.contract.ts → T004 contract test [P]
   - site-placement.contract.ts → T005 contract test [P]  
   - context-menu.contract.ts → T006 contract test [P]
   
2. **From Data Model**:
   - PermanentPositionState entity → T012 model creation [P]
   - SitePositionData entity → T013 model creation [P]
   - BurrowAbility entity → T014 model creation [P]
   - ContextMenuAction entity → T015 model creation [P]
   
3. **From User Stories (Quickstart)**:
   - Scenario 1 (Basic Burrow) → T007 integration test [P]
   - Scenario 2 (Submerge at Water) → T008 integration test [P]
   - Scenario 3 (Site Edge Placement) → T009 integration test [P]
   - Scenario 4 (Multiple Under Site) → T010 integration test [P]
   - Scenario 5 (State Transitions) → T011 integration test [P]

4. **Ordering**:
   - Setup → Tests → Models → Store → Components → Integration → Polish
   - Dependencies block parallel execution

## Validation Checklist
*GATE: Checked by main() before returning*

- [x] All contracts have corresponding tests (T004-T006)
- [x] All entities have model tasks (T012-T015)
- [x] All tests come before implementation (T004-T011 before T012-T023)
- [x] Parallel tasks truly independent ([P] tasks use different files)
- [x] Each task specifies exact file path
- [x] No task modifies same file as another [P] task

## Implementation Notes

**TDD Workflow**:
1. Run failing tests to confirm RED phase
2. Implement minimal code to make tests pass (GREEN phase)
3. Refactor for performance and code quality (REFACTOR phase)

**Performance Requirements**:
- Maintain ≥60fps during 3D position transitions
- Context menu response time <100ms
- Memory usage stable during repeated burrow/surface cycles

**Browser Compatibility**:
- WebGL 2.0 support required
- Test on Chrome 120+, Firefox 115+, Safari 16+, Edge 120+

**File Modification Priority**:
- High impact: CardPlane.tsx, ContextMenu.tsx, Board.tsx (sequential)
- Medium impact: store.ts extensions (sequential within store)
- Low impact: types.ts additions (can be parallel with different sections)