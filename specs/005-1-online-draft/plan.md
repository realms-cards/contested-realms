# Implementation Plan: Online Draft Flow Improvements

**Branch**: `005-1-online-draft` | **Date**: 2025-09-09 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/005-1-online-draft/spec.md`

## Execution Flow (/plan command scope)
```
1. Load feature spec from Input path
   → SUCCESS: Feature spec loaded from /specs/005-1-online-draft/spec.md
2. Fill Technical Context (scan for NEEDS CLARIFICATION)
   → Found 3 clarifications: disconnection handling, timeout duration, player count
   → Project Type: web (Next.js + Socket.io)
   → Structure Decision: Existing Next.js structure
3. Evaluate Constitution Check section below
   → Strong typing requirement emphasized from user input
   → Modularization requirement noted
   → Linting requirement noted
   → Update Progress Tracking: Initial Constitution Check PASS
4. Execute Phase 0 → research.md
   → Resolving disconnection handling strategies
   → Researching timeout best practices
   → Determining scalability limits
5. Execute Phase 1 → contracts, data-model.md, quickstart.md, CLAUDE.md
6. Re-evaluate Constitution Check section
   → Verify strong typing in all new components
   → Update Progress Tracking: Post-Design Constitution Check PASS
7. Plan Phase 2 → Task generation approach documented
8. STOP - Ready for /tasks command
```

**IMPORTANT**: The /plan command STOPS at step 7. Phases 2-4 are executed by other commands:
- Phase 2: /tasks command creates tasks.md
- Phase 3-4: Implementation execution (manual or via tools)

## Summary
Improve the online draft experience by implementing synchronized pick-and-pass mechanics where all players must complete their picks before the next pack rotates, fixing deck editor persistence to preserve drafted cards when adding Standard Cards, implementing a proper waiting overlay for deck submission that shows progress of all players, and ensuring the system scales to support more than two players efficiently.

## Technical Context
**Language/Version**: TypeScript 5.x with Next.js 15.5.0  
**Primary Dependencies**: React 18, Socket.io 4.x, Zustand, React Three Fiber  
**Storage**: In-memory state with Socket.io session persistence  
**Testing**: Jest + React Testing Library with strong TypeScript typing  
**Target Platform**: Web browsers (Chrome, Firefox, Safari, Edge)
**Project Type**: web - Next.js application with real-time Socket.io backend  
**Performance Goals**: <100ms pick synchronization latency, 60fps UI updates  
**Constraints**: Must support graceful degradation on network issues, <500ms deck submission  
**Scale/Scope**: Support 2-8 players per draft session (expandable to 16+)

**User Input Requirements**:
- MUST use strong typing for all new components and edits
- MUST modularize code to keep files manageable
- MUST run lint after code changes
- Tests must be properly typed and not introduce more errors than implementation

## Constitution Check
*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

**Simplicity**:
- Projects: 1 (Next.js web application with integrated Socket.io)
- Using framework directly? YES (React hooks, Socket.io events)
- Single data model? YES (shared TypeScript interfaces)
- Avoiding patterns? YES (no unnecessary abstractions)

**Architecture**:
- EVERY feature as library? YES (modular components and hooks)
- Libraries listed:
  - draft-sync: Synchronization logic for pick-and-pass mechanics
  - deck-persistence: State management for preserving deck edits
  - waiting-overlay: UI component and state for submission waiting
- CLI per library: N/A (web components, not CLI tools)
- Library docs: TypeScript interfaces and JSDoc comments

**Testing (NON-NEGOTIABLE)**:
- RED-GREEN-Refactor cycle enforced? YES (tests written first)
- Git commits show tests before implementation? YES
- Order: Contract→Integration→E2E→Unit strictly followed? YES
- Real dependencies used? YES (actual Socket.io connections)
- Integration tests for: draft synchronization, deck persistence, overlay states
- FORBIDDEN: Implementation before test - ACKNOWLEDGED

**Observability**:
- Structured logging included? YES (console with context objects)
- Frontend logs → backend? YES (via Socket.io debug events)
- Error context sufficient? YES (player ID, session ID, action, timestamp)

**Versioning**:
- Version number assigned? 005.1.0
- BUILD increments on every change? YES
- Breaking changes handled? N/A (new features, backwards compatible)

## Project Structure

### Documentation (this feature)
```
specs/005-1-online-draft/
├── plan.md              # This file (/plan command output)
├── research.md          # Phase 0 output (/plan command)
├── data-model.md        # Phase 1 output (/plan command)
├── quickstart.md        # Phase 1 output (/plan command)
├── contracts/           # Phase 1 output (/plan command)
│   ├── draft-sync.ts    # Socket event contracts
│   ├── deck-submission.ts # Submission state contracts
│   └── waiting-overlay.ts # UI state contracts
└── tasks.md             # Phase 2 output (/tasks command - NOT created by /plan)
```

### Source Code (repository root)
```
# Existing Next.js structure with modular additions
src/
├── lib/
│   ├── draft/
│   │   ├── sync/              # Draft synchronization logic
│   │   │   ├── types.ts       # Strong TypeScript interfaces
│   │   │   ├── DraftSyncManager.ts
│   │   │   └── DraftSyncStore.ts
│   │   ├── persistence/       # Deck state persistence
│   │   │   ├── types.ts
│   │   │   └── DeckPersistenceManager.ts
│   │   └── waiting/           # Waiting overlay logic
│   │       ├── types.ts
│   │       └── WaitingStateManager.ts
│   ├── net/
│   │   └── handlers/
│   │       └── draft-sync-handlers.ts
│   └── hooks/
│       ├── useDraftSync.ts
│       └── useWaitingOverlay.ts
├── components/
│   ├── draft/
│   │   ├── DraftWaitingOverlay.tsx
│   │   └── DraftPlayerStatus.tsx
│   └── online/
│       └── OnlineDraftSyncIndicator.tsx
└── app/
    └── online/
        └── play/
            └── [id]/
                └── page.tsx (modifications)

tests/
├── integration/
│   ├── draft-sync.test.ts
│   ├── deck-persistence.test.ts
│   └── waiting-overlay.test.ts
└── unit/
    ├── DraftSyncManager.test.ts
    ├── DeckPersistenceManager.test.ts
    └── WaitingStateManager.test.ts
```

**Structure Decision**: Existing Next.js structure - integrating into current src/ directory

## Phase 0: Outline & Research
1. **Extract unknowns from Technical Context**:
   - Player disconnection handling strategy
   - Optimal timeout durations for slow players
   - Maximum player count scalability limits

2. **Research tasks executed**:
   - Socket.io room-based synchronization patterns
   - React state persistence across route changes
   - Overlay patterns in multiplayer waiting states
   - Scalability limits for real-time card drafting

3. **Consolidate findings** in `research.md`:
   - Disconnection: 30-second grace period with reconnection
   - Timeouts: 60 seconds per pick, escalating warnings
   - Player count: 8 players optimal, 16 maximum

**Output**: research.md with all NEEDS CLARIFICATION resolved

## Phase 1: Design & Contracts
*Prerequisites: research.md complete*

1. **Extract entities from feature spec** → `data-model.md`:
   - DraftSession: session state with player sync status
   - PlayerDraftState: individual draft progress and deck
   - DeckSubmission: submission status and timestamp
   - PackState: current pack rotation state

2. **Generate Socket.io event contracts**:
   - draft:pick_card - Player picks a card
   - draft:pass_pack - Player passes remaining pack
   - draft:sync_state - Server broadcasts sync state
   - draft:deck_submit - Player submits deck
   - draft:waiting_update - Waiting status updates
   - Output TypeScript interfaces to `/contracts/`

3. **Generate contract tests** from contracts:
   - Test socket event schemas with strong typing
   - Test state synchronization logic
   - Tests must fail initially (TDD)

4. **Extract test scenarios** from user stories:
   - All players must pick before pack rotation
   - Deck persists when adding Standard Cards
   - Waiting overlay shows/hides correctly
   - Reconnection preserves draft state

5. **Update CLAUDE.md incrementally**:
   - Add draft synchronization patterns
   - Add strong typing requirements
   - Add modularization guidelines
   - Keep under 150 lines

**Output**: data-model.md, /contracts/*, failing tests, quickstart.md, CLAUDE.md

## Phase 2: Task Planning Approach
*This section describes what the /tasks command will do - DO NOT execute during /plan*

**Task Generation Strategy**:
- TypeScript interfaces for all entities [P]
- Socket event contract tests [P]
- Draft sync manager with tests
- Deck persistence manager with tests
- Waiting overlay component with tests
- Socket handler implementations
- Hook implementations for React components
- UI component implementations
- Integration tests for full flow
- Lint all new code

**Ordering Strategy**:
- Types and interfaces first (foundation)
- Tests before implementation (TDD)
- Backend sync before frontend UI
- Integration tests last
- Lint after each component group

**Estimated Output**: 20-25 numbered, ordered tasks in tasks.md

**IMPORTANT**: This phase is executed by the /tasks command, NOT by /plan

## Phase 3+: Future Implementation
*These phases are beyond the scope of the /plan command*

**Phase 3**: Task execution (/tasks command creates tasks.md)  
**Phase 4**: Implementation (execute tasks.md following constitutional principles)  
**Phase 5**: Validation (run tests, execute quickstart.md, performance validation)

## Complexity Tracking
*No violations - following constitutional principles and user requirements*

All implementation follows:
- Strong typing (TypeScript interfaces for everything)
- Modularization (small, focused files)
- Linting (ESLint after each component group)
- TDD (tests written before implementation)


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
- [x] Complexity deviations documented (none)

---
*Based on user requirements for strong typing, modularization, and linting*