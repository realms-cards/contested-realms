# Tasks: Fix Card Preview Issues in Editor-3D

**Input**: Design documents from `/Users/geleeroyale/CascadeProjects/sorcery-client/specs/001-fix-card-preview/`
**Prerequisites**: plan.md ✓, research.md ✓, data-model.md ✓, contracts/ ✓, quickstart.md ✓

## Execution Flow (main)
```
1. Loaded plan.md: TypeScript/React with Next.js, React Three Fiber 3D components
2. Loaded data-model.md: CardPreviewData, CardHoverState, MouseTrackingData entities
3. Loaded contracts/: Component interfaces and behavior test contracts
4. Loaded research.md: Root cause = disabled raycasting in DraggableCard3D
5. Loaded quickstart.md: Manual testing scenarios and implementation steps
6. Generated tasks by category: Tests → Core fixes → Integration → Polish
7. Applied TDD rules: All tests before implementation, parallel tasks marked [P]
8. SUCCESS: 23 tasks ready for execution
```

## Format: `[ID] [P?] Description`
- **[P]**: Can run in parallel (different files, no dependencies)
- All paths are absolute from repository root

## Phase 3.1: Setup
- [ ] T001 Verify existing Next.js TypeScript project structure for editor-3d
- [ ] T002 [P] Check React Three Fiber dependencies are available (@react-three/fiber 9.3.0+)
- [ ] T003 [P] Verify Vitest testing framework is configured and working

## Phase 3.2: Tests First (TDD) ⚠️ MUST COMPLETE BEFORE 3.3
**CRITICAL: These tests MUST be written and MUST FAIL before ANY implementation**

### Contract Tests (Component Interfaces)
- [ ] T004 [P] Component interface validation tests in `tests/unit/card-preview-interfaces.test.ts`
- [ ] T005 [P] DraggableCard3D raycast behavior tests in `tests/unit/draggable-card-raycast.test.ts`
- [ ] T006 [P] MouseTracker hover detection tests in `tests/unit/mouse-tracker-hover.test.ts`
- [ ] T007 [P] Card hover state management tests in `tests/unit/hover-state-management.test.ts`

### Integration Tests (User Scenarios)
- [ ] T008 [P] Card preview display integration test in `tests/integration/card-preview-display.test.tsx`
- [ ] T009 [P] Hover timing and debouncing integration test in `tests/integration/hover-timing.test.tsx`
- [ ] T010 [P] Multi-card hover behavior integration test in `tests/integration/multi-card-hover.test.tsx`

## Phase 3.3: Core Implementation (ONLY after tests are failing)

### Critical Fix (Root Cause)
- [ ] T011 Enable raycasting in `src/app/decks/editor-3d/DraggableCard3D.tsx` (remove `raycast={() => []}`)
- [ ] T012 Add userData to hitbox mesh in `src/app/decks/editor-3d/DraggableCard3D.tsx`

### Hover State Management
- [ ] T013 [P] Create hover state manager utility in `src/lib/game/hooks/useCardHover.ts`
- [ ] T014 Implement showCardPreview/hideCardPreview functions in `src/app/decks/editor-3d/page.tsx`
- [ ] T015 Add hover timer cleanup effects in `src/app/decks/editor-3d/page.tsx`

### Component Enhancements
- [ ] T016 [P] Add hover callback props to DraggableCard3D interface in `src/app/decks/editor-3d/DraggableCard3D.tsx`
- [ ] T017 Update MouseTracker usage with enhanced hover callbacks in `src/app/decks/editor-3d/page.tsx`
- [ ] T018 Add onPointerEnter/Leave handlers to DraggableCard3D hitbox mesh

## Phase 3.4: Integration
- [ ] T019 Connect DraggableCard3D hover events to preview system
- [ ] T020 Coordinate MouseTracker and individual card hover systems
- [ ] T021 Add proper error handling for missing card data or assets
- [ ] T022 Implement performance optimizations for many-card scenes

## Phase 3.5: Polish
- [ ] T023 [P] Performance tests for hover with 100+ cards in `tests/performance/many-cards-hover.test.ts`

## Dependencies
- Setup (T001-T003) before all other tasks
- Tests (T004-T010) MUST complete before implementation (T011-T022)
- T011 (enable raycasting) blocks T012 (add userData)
- T013 (hover state utility) blocks T014-T015 (page-level implementation)
- T016 (interface) blocks T018 (implementation)
- T011-T018 before integration (T019-T022)
- Everything before polish (T023)

## Parallel Example
```bash
# Launch contract tests together (Phase 3.2):
Task: "Component interface validation tests in tests/unit/card-preview-interfaces.test.ts"
Task: "DraggableCard3D raycast behavior tests in tests/unit/draggable-card-raycast.test.ts"
Task: "MouseTracker hover detection tests in tests/unit/mouse-tracker-hover.test.ts"
Task: "Card hover state management tests in tests/unit/hover-state-management.test.ts"

# Launch integration tests together:
Task: "Card preview display integration test in tests/integration/card-preview-display.test.tsx"
Task: "Hover timing and debouncing integration test in tests/integration/hover-timing.test.tsx"
Task: "Multi-card hover behavior integration test in tests/integration/multi-card-hover.test.tsx"
```

## Detailed Task Specifications

### T004: Component interface validation tests
**File**: `tests/unit/card-preview-interfaces.test.ts`
**Purpose**: Validate CardPreviewData, CardMeshUserData, and DraggableCard3DProps interfaces
**Success Criteria**: Tests fail initially, pass after interface implementations
**Key Tests**: 
- Validate required fields exist and have correct types
- Test interface compatibility with existing components

### T005: DraggableCard3D raycast behavior tests  
**File**: `tests/unit/draggable-card-raycast.test.ts`
**Purpose**: Test that hitbox mesh is raycastable and has proper userData
**Success Criteria**: Test fails with current `raycast={() => []}`, passes after fix
**Key Tests**:
- Verify raycast is not disabled (`raycast !== function`)
- Verify userData contains `{ cardId, slug, type }`

### T011: Enable raycasting in DraggableCard3D
**File**: `src/app/decks/editor-3d/DraggableCard3D.tsx`
**Purpose**: Remove `raycast={() => []}` from hitbox mesh (around line 137)
**Success Criteria**: MouseTracker can detect card hover events
**Implementation**: Delete the raycast prop or set to undefined

### T012: Add userData to hitbox mesh
**File**: `src/app/decks/editor-3d/DraggableCard3D.tsx`  
**Purpose**: Set `userData: { cardId, slug, type }` on hitbox mesh for hover detection
**Success Criteria**: MouseTracker receives card data in hover events
**Dependencies**: T011 (raycasting enabled)

### T014: Implement hover management functions
**File**: `src/app/decks/editor-3d/page.tsx`
**Purpose**: Add showCardPreview/hideCardPreview functions from draft-3d pattern
**Success Criteria**: Stable hover behavior with 400ms hide delay
**Dependencies**: T013 (hover state utility)

## Test Validation Scenarios (from quickstart.md)

### Manual Testing Checklist
- Navigate to `/decks/editor-3d` and add cards
- Hover over cards - preview should appear immediately  
- Quick mouse movements - preview should update smoothly
- Mouse away - preview disappears after ~400ms
- Stacked cards - all cards should be hoverable
- Performance with 50+ cards - no FPS drops

### Success Criteria
✅ Card previews appear when hovering over any part of a card
✅ No flickering during quick mouse movements  
✅ Behavior matches draft-3d preview timing
✅ No performance degradation with many cards
✅ No console errors or memory leaks

## Notes
- **TDD Required**: All tests must fail first, then pass after implementation
- **[P] tasks**: Different files, can run in parallel
- **Critical path**: T011 (enable raycasting) is the core fix that unblocks everything
- **Rollback plan**: Re-add `raycast={() => []}` if issues arise
- Commit after each completed task for clean history

## Task Generation Rules Applied
1. **From Contracts**: Each interface file → test task [P]
2. **From Data Model**: Each entity → utility/hook task [P] 
3. **From Research**: Root cause → critical fix task (T011)
4. **From Quickstart**: Manual steps → integration tests [P]
5. **Ordering**: Setup → Tests → Critical Fix → Enhanced Implementation → Integration → Polish

## Validation Checklist
- [x] All contract interfaces have corresponding tests (T004-T007)
- [x] Critical root cause has dedicated task (T011)
- [x] All tests come before implementation (T004-T010 before T011+)
- [x] Parallel tasks are truly independent (different files)
- [x] Each task specifies exact file path
- [x] No [P] task modifies same file as another [P] task