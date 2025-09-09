# Implementation Plan: Permanent Burrow/Submerge Mechanics

**Branch**: `003-permanents-might-have` | **Date**: 2025-01-09 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/Users/geleeroyale/CascadeProjects/sorcery-client/specs/003-permanents-might-have/spec.md`

## Execution Flow (/plan command scope)
```
1. Load feature spec from Input path
   → ✅ COMPLETED: Feature spec loaded successfully
2. Fill Technical Context (scan for NEEDS CLARIFICATION)
   → ✅ COMPLETED: Technical context identified from existing Next.js/React/Three.js codebase
   → ✅ COMPLETED: Project type detected as web application with 3D components
   → ✅ COMPLETED: Structure decision set to Option 2 (Web application)
3. Evaluate Constitution Check section below
   → ✅ COMPLETED: No constitutional violations identified
   → ✅ COMPLETED: Progress Tracking: Initial Constitution Check PASS
4. Execute Phase 0 → research.md
   → ✅ COMPLETED: Research phase complete with clarifications resolved
5. Execute Phase 1 → contracts, data-model.md, quickstart.md, CLAUDE.md
   → ✅ COMPLETED: Design artifacts generated
6. Re-evaluate Constitution Check section
   → ✅ COMPLETED: Post-design constitution check PASS
   → ✅ COMPLETED: Progress Tracking: Post-Design Constitution Check PASS
7. Plan Phase 2 → Task generation approach described
   → ✅ COMPLETED: Task strategy defined
8. STOP - Ready for /tasks command
   → ✅ READY for next phase
```

**IMPORTANT**: The /plan command STOPS at step 7. Phases 2-4 are executed by other commands:
- Phase 2: /tasks command creates tasks.md
- Phase 3-4: Implementation execution (manual or via tools)

## Summary
Primary requirement: Enable permanents with burrow/submerge abilities to visually move "under" their current site in 3D space through right-click context menus, plus improve site placement to be edge-oriented toward owning players.

Technical approach: Extend existing 3D game components (CardPlane, Board, ContextMenu) to support depth-based positioning and visual state transitions while maintaining game state consistency through the existing Zustand store architecture.

## Technical Context
**Language/Version**: TypeScript 5.x, React 19.1.0, Next.js 15.5.0  
**Primary Dependencies**: @react-three/fiber 9.3.0, @react-three/drei 10.7.3, @react-three/rapier 2.1.0, three 0.179.1, zustand 5.0.8  
**Storage**: Prisma ORM with database, Zustand for client state management  
**Testing**: Vitest 2.0.5, @testing-library/react 16.3.0  
**Target Platform**: Web browsers with WebGL support  
**Project Type**: web - Next.js application with 3D game components  
**Performance Goals**: 60 fps for 3D interactions, <100ms response time for context menu actions  
**Constraints**: Must maintain existing game state consistency, WebGL performance limitations  
**Scale/Scope**: Single-player and multiplayer game sessions, ~50-100 permanent cards per game

## Constitution Check
*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

**Simplicity**:
- Projects: 1 (single Next.js web application)
- Using framework directly? ✅ (React Three Fiber, Next.js directly)
- Single data model? ✅ (Zustand store with permanent state extensions)
- Avoiding patterns? ✅ (no Repository/UoW, direct store mutations)

**Architecture**:
- EVERY feature as library? ⚠️ DEVIATION (Adding to existing 3D game components)
- Libraries listed: N/A (extending existing component architecture)
- CLI per library: N/A (web application feature)
- Library docs: N/A (web application feature)

**Testing (NON-NEGOTIABLE)**:
- RED-GREEN-Refactor cycle enforced? ✅ (contract tests first, then implementation)
- Git commits show tests before implementation? ✅ (planned workflow)
- Order: Contract→Integration→E2E→Unit strictly followed? ✅ (test strategy defined)
- Real dependencies used? ✅ (actual Three.js components, Zustand store)
- Integration tests for: new abilities, context menu changes, 3D positioning? ✅
- FORBIDDEN: Implementation before test, skipping RED phase ✅

**Observability**:
- Structured logging included? ✅ (console logging for 3D interactions)
- Frontend logs → backend? N/A (client-side feature primarily)
- Error context sufficient? ✅ (3D positioning errors, state validation)

**Versioning**:
- Version number assigned? 0.2.0 (minor feature addition)
- BUILD increments on every change? ✅
- Breaking changes handled? N/A (additive feature)

## Project Structure

### Documentation (this feature)
```
specs/003-permanents-might-have/
├── plan.md              # This file (/plan command output)
├── research.md          # Phase 0 output (/plan command)
├── data-model.md        # Phase 1 output (/plan command)
├── quickstart.md        # Phase 1 output (/plan command)
├── contracts/           # Phase 1 output (/plan command)
└── tasks.md             # Phase 2 output (/tasks command - NOT created by /plan)
```

### Source Code (repository root)
```
# Option 2: Web application (current Next.js structure)
src/
├── app/                 # Next.js app router
├── components/          # React components
├── lib/                 # Shared libraries
│   ├── game/           # Game-specific logic
│   │   ├── components/ # 3D game components (CardPlane, Board, etc.)
│   │   └── store.ts    # Zustand game state store
│   └── types.ts        # TypeScript definitions
└── tests/               # Test files

tests/
├── contract/            # API contract tests
├── integration/         # Integration tests (3D interactions)
└── unit/               # Unit tests (state management)
```

**Structure Decision**: Option 2 (Web application) - matches existing Next.js structure with 3D game components

## Phase 0: Outline & Research
1. **Extract unknowns from Technical Context** above:
   - Research Three.js depth/layering for "under site" positioning
   - Investigate React Three Fiber object positioning best practices
   - Study existing context menu implementation patterns
   - Analyze current site placement logic for edge-positioning algorithms

2. **Generate and dispatch research agents**:
   ```
   Task: "Research Three.js Y-axis positioning for layered object placement in game contexts"
   Task: "Find best practices for React Three Fiber object depth management with visual states"
   Task: "Analyze existing ContextMenu.tsx implementation for extensibility patterns"
   Task: "Study current Board.tsx site placement logic for modification approach"
   ```

3. **Consolidate findings** in `research.md` using format:
   - Decision: Three.js Y-axis negative positioning for "under" visual effect
   - Rationale: Maintains performance while providing clear visual feedback
   - Alternatives considered: Opacity/scale transitions, separate scene layers

**Output**: ✅ research.md with all technical approach decisions resolved

## Phase 1: Design & Contracts
*Prerequisites: research.md complete*

1. **Extract entities from feature spec** → `data-model.md`:
   - PermanentPositionState (surface/burrowed/submerged)
   - SitePositionData (edge-based placement coordinates)
   - BurrowAbility (permanent capability metadata)
   - ContextMenuAction (dynamic menu options)

2. **Generate API contracts** from functional requirements:
   - PermanentPositionUpdate: {permanentId, newState, position}
   - SitePlacement: {siteId, playerId, edgePosition}
   - AbilityCheck: {permanentId} → {canBurrow, canSubmerge}
   - ContextMenuQuery: {permanentId} → {availableActions[]}

3. **Generate contract tests** from contracts:
   - Test permanent position state transitions
   - Test site edge placement calculations
   - Test context menu dynamic option generation
   - Tests written to fail before implementation

4. **Extract test scenarios** from user stories:
   - Integration test: Right-click burrow workflow
   - Integration test: Site placement orientation
   - Integration test: Multiple permanents under same site
   - E2E test: Complete burrow → surface cycle

5. **Update agent file incrementally**:
   - Updated CLAUDE.md with burrow/submerge mechanics
   - Added Three.js positioning context
   - Preserved existing 3D game development patterns

**Output**: ✅ data-model.md, /contracts/*, failing tests, quickstart.md, updated CLAUDE.md

## Phase 2: Task Planning Approach
*This section describes what the /tasks command will do - DO NOT execute during /plan*

**Task Generation Strategy**:
- Load `/templates/tasks-template.md` as base
- Generate tasks from Phase 1 design docs (contracts, data model, quickstart)
- Each contract → contract test task [P]
- Each entity → model/interface creation task [P] 
- Each user story → integration test task
- 3D positioning implementation tasks to make tests pass
- Context menu extension tasks
- Site placement algorithm modification tasks

**Ordering Strategy**:
- TDD order: Tests before implementation 
- Dependency order: Data models → Store extensions → 3D components → UI components
- Mark [P] for parallel execution (independent files)

**Estimated Output**: 20-25 numbered, ordered tasks in tasks.md focusing on:
- Position state management (3 tasks)
- Context menu enhancement (3 tasks)
- 3D visual positioning (4 tasks)
- Site placement logic (3 tasks)
- Integration testing (5 tasks)
- E2E validation (3 tasks)

**IMPORTANT**: This phase is executed by the /tasks command, NOT by /plan

## Phase 3+: Future Implementation
*These phases are beyond the scope of the /plan command*

**Phase 3**: Task execution (/tasks command creates tasks.md)  
**Phase 4**: Implementation (execute tasks.md following constitutional principles)  
**Phase 5**: Validation (run tests, execute quickstart.md, performance validation)

## Complexity Tracking
*Constitution check passed - no violations to justify*

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| Feature not library-based | Extending existing 3D game components | Creating separate library would break game state consistency and require complex integration |

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
- [x] Complexity deviations documented

---
*Based on Constitution v2.1.1 - See `/memory/constitution.md`*