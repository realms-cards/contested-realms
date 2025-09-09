# Tasks: Fix TypeScript Build Errors and Strengthen Type Safety

**Input**: Design documents from `/Users/geleeroyale/CascadeProjects/sorcery-client/specs/002-we-have-a/`
**Prerequisites**: plan.md (required), research.md, data-model.md, contracts/, quickstart.md

## Execution Flow (main)
```
1. Load plan.md from feature directory
   → Tech stack: TypeScript 5.x, React 19.1.0, Next.js 15.5.0, ESLint 9.x
   → Structure: Next.js web application with src/ directory
2. Load design documents:
   → research.md: 122 errors across 5 categories, 4 implementation phases
   → data-model.md: Error classification system with TypeScriptError and ESLintViolation entities
   → contracts/: Build validation API for systematic error resolution
3. Generate tasks by error category and implementation phases:
   → Setup: Build validation and error analysis
   → Tests: Verification of current failures
   → Core: Systematic error fixing by category
   → Integration: Build validation and functionality testing
   → Polish: Final cleanup and documentation
4. Apply task rules:
   → Different files = mark [P] for parallel execution
   → Build validation = sequential to prevent conflicts
   → Tests before implementation (TDD: verify failures → fix → validate)
5. Number tasks sequentially (T001, T002...)
6. Generate dependency graph based on error categories and file dependencies
7. Create parallel execution examples for independent file fixes
8. Validate task completeness: All error categories addressed with proper validation
```

## Format: `[ID] [P?] Description`
- **[P]**: Can run in parallel (different files, no dependencies)
- Include exact file paths in descriptions

## Path Conventions
- **Next.js web app**: `src/app/`, `src/lib/`, `src/components/`, `tests/`
- Paths assume Next.js project structure as per plan.md

## Phase 3.1: Setup & Validation
- [ ] T001 Verify current build failure state and document baseline
- [ ] T002 Generate comprehensive error analysis and categorization
- [ ] T003 [P] Create build validation script for systematic error checking

## Phase 3.2: Tests First (TDD) ⚠️ MUST COMPLETE BEFORE 3.3
**CRITICAL: These validations MUST confirm current failures before ANY fixes**
- [ ] T004 [P] Validate explicit `any` type errors in test files (tests/unit/, tests/integration/)
- [ ] T005 [P] Validate unused variable errors in main application files
- [ ] T006 [P] Validate React Hook dependency errors in component files
- [ ] T007 [P] Validate TypeScript ignore comment violations across codebase
- [ ] T008 [P] Validate variable declaration issues (let vs const) across all files

## Phase 3.3: Core Implementation (ONLY after validation complete)

### Critical Build Blockers
- [ ] T009 [P] Fix explicit `any` types in /Users/geleeroyale/CascadeProjects/sorcery-client/tests/unit/card-preview-interfaces.test.ts
- [ ] T010 [P] Fix explicit `any` types in /Users/geleeroyale/CascadeProjects/sorcery-client/tests/unit/draggable-card-raycast.test.ts
- [ ] T011 [P] Fix explicit `any` types in /Users/geleeroyale/CascadeProjects/sorcery-client/tests/unit/hover-state-management.test.ts
- [ ] T012 [P] Fix explicit `any` types in /Users/geleeroyale/CascadeProjects/sorcery-client/tests/unit/mouse-tracker-hover.test.ts
- [ ] T013 [P] Fix explicit `any` types in /Users/geleeroyale/CascadeProjects/sorcery-client/tests/integration/multi-card-hover.test.tsx
- [ ] T014 [P] Fix explicit `any` types in /Users/geleeroyale/CascadeProjects/sorcery-client/tests/integration/hover-timing.test.tsx

### Application Code Fixes
- [ ] T015 Fix unused variables and imports in /Users/geleeroyale/CascadeProjects/sorcery-client/src/app/decks/editor-3d/page.tsx
- [ ] T016 Fix explicit `any` type and unused variables in /Users/geleeroyale/CascadeProjects/sorcery-client/src/app/draft-3d/page.tsx
- [ ] T017 Fix explicit `any` type and unused variables in /Users/geleeroyale/CascadeProjects/sorcery-client/src/app/online/lobby/page.tsx
- [ ] T018 Fix React Hook missing dependencies in /Users/geleeroyale/CascadeProjects/sorcery-client/src/app/online/play/[id]/page.tsx

### Contract Files Cleanup
- [ ] T019 [P] Fix explicit `any` types in /Users/geleeroyale/CascadeProjects/sorcery-client/specs/001-fix-card-preview/contracts/behavior-tests.ts
- [ ] T020 [P] Fix explicit `any` types in /Users/geleeroyale/CascadeProjects/sorcery-client/specs/001-fix-card-preview/contracts/component-interfaces.ts

### Component Code Quality
- [ ] T021 [P] Fix unused variables in /Users/geleeroyale/CascadeProjects/sorcery-client/src/components/deck-editor/DeckValidation.tsx
- [ ] T022 [P] Fix unused variables in /Users/geleeroyale/CascadeProjects/sorcery-client/src/components/game/CardPreview.tsx
- [ ] T023 [P] Fix unused variables in /Users/geleeroyale/CascadeProjects/sorcery-client/src/components/game/HandPanel.tsx

### System-wide Fixes
- [ ] T024 Replace all `@ts-ignore` comments with `@ts-expect-error` across codebase
- [ ] T025 Fix variable declaration issues (prefer const over let) across all files

## Phase 3.4: Integration & Validation
- [ ] T026 Run comprehensive build validation after all fixes
- [ ] T027 Execute test suite to ensure no functionality regression
- [ ] T028 Perform manual testing of key features (3D editor, draft interface)
- [ ] T029 Validate performance and build time impact

## Phase 3.5: Polish & Cleanup
- [ ] T030 [P] Remove any remaining unused imports across all files
- [ ] T031 [P] Add proper TypeScript interfaces for remaining complex objects
- [ ] T032 Update build configuration to prevent future regressions
- [ ] T033 Update documentation and CLAUDE.md with type safety improvements

## Dependencies
- Setup (T001-T003) before validation (T004-T008)
- Validation (T004-T008) before implementation (T009-T025)
- T009-T014 (test file fixes) can run in parallel
- T015-T018 (application files) must run sequentially due to potential shared dependencies
- T019-T020 (contract files) can run in parallel
- T021-T023 (component files) can run in parallel
- T024-T025 (system-wide fixes) must run after individual file fixes
- Integration (T026-T029) before polish (T030-T033)

## Parallel Execution Examples
```bash
# Phase 1: Test file fixes (can run together)
Task: "Fix explicit any types in tests/unit/card-preview-interfaces.test.ts"
Task: "Fix explicit any types in tests/unit/draggable-card-raycast.test.ts"
Task: "Fix explicit any types in tests/unit/hover-state-management.test.ts"
Task: "Fix explicit any types in tests/unit/mouse-tracker-hover.test.ts"

# Phase 2: Contract file fixes (can run together)
Task: "Fix explicit any types in specs/001-fix-card-preview/contracts/behavior-tests.ts"
Task: "Fix explicit any types in specs/001-fix-card-preview/contracts/component-interfaces.ts"

# Phase 3: Component file fixes (can run together)
Task: "Fix unused variables in src/components/deck-editor/DeckValidation.tsx"
Task: "Fix unused variables in src/components/game/CardPreview.tsx"
Task: "Fix unused variables in src/components/game/HandPanel.tsx"
```

## Notes
- [P] tasks = different files with no shared dependencies
- Verify build failures exist before implementing fixes (TDD approach)
- Commit after each logical group of fixes
- Run `npm run build` after each phase to validate progress
- Maintain functionality - no changes to business logic

## Task Generation Rules
*Applied during main() execution*

1. **From Error Analysis**:
   - Each error category → systematic fix tasks
   - Each problematic file → targeted fix task [P] if independent
   
2. **From Build Validation**:
   - Build failure verification → validation tasks
   - Error categorization → organized fix approach
   
3. **From Quickstart Scenarios**:
   - Manual testing steps → validation tasks
   - Build success criteria → integration tests

4. **Ordering**:
   - Setup → Validation → Critical fixes → Code quality → System-wide → Integration → Polish
   - File dependencies prevent some parallel execution

## Validation Checklist
*GATE: Checked by main() before returning*

- [x] All error categories have corresponding fix tasks
- [x] All problematic files identified in research have fix tasks
- [x] All validation comes before implementation (TDD approach)
- [x] Parallel tasks truly independent (different files, no shared dependencies)
- [x] Each task specifies exact file path
- [x] No task modifies same file as another [P] task
- [x] Build validation and functionality testing included
- [x] Systematic approach covers all 122 identified errors