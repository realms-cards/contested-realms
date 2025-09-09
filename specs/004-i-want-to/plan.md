# Implementation Plan: Draft-3D Online Integration

**Branch**: `004-i-want-to` | **Date**: 2025-01-09 | **Spec**: `/specs/004-i-want-to/spec.md`
**Input**: Feature specification from `/specs/004-i-want-to/spec.md`

## Execution Flow (/plan command scope)
```
1. Load feature spec from Input path
   → Found at /specs/004-i-want-to/spec.md
2. Fill Technical Context (scan for NEEDS CLARIFICATION)
   → Detected Project Type: web (Socket.io multiplayer application)
   → Set Structure Decision: Next.js web application structure
3. Evaluate Constitution Check section below
   → Checking simplicity and architecture principles
   → Update Progress Tracking: Initial Constitution Check
4. Execute Phase 0 → research.md
   → Researching Socket.io integration patterns for React Three Fiber
   → Researching multiplayer state synchronization best practices
5. Execute Phase 1 → contracts, data-model.md, quickstart.md, agent-specific template file (e.g., `CLAUDE.md` for Claude Code, `.github/copilot-instructions.md` for GitHub Copilot, or `GEMINI.md` for Gemini CLI).
6. Re-evaluate Constitution Check section
   → If new violations: Refactor design, return to Phase 1
   → Update Progress Tracking: Post-Design Constitution Check
7. Plan Phase 2 → Describe task generation approach (DO NOT create tasks.md)
8. STOP - Ready for /tasks command
```

**IMPORTANT**: The /plan command STOPS at step 7. Phases 2-4 are executed by other commands:
- Phase 2: /tasks command creates tasks.md
- Phase 3-4: Implementation execution (manual or via tools)

## Summary
Integrate the improved UI, stack mechanics, and card preview system from single-player draft-3d into the online multiplayer draft-3d mode, ensuring real-time synchronization via Socket.io while maintaining all existing online capabilities.

## Technical Context
**Language/Version**: TypeScript 5.x, Node.js 20.x  
**Primary Dependencies**: Next.js 15.5.0, Socket.io 4.x, React Three Fiber, Zustand, Prisma  
**Storage**: SQLite (Prisma ORM) for card data, in-memory for session state  
**Testing**: Jest + React Testing Library for components, Socket.io client testing  
**Target Platform**: Web browsers (Chrome, Firefox, Safari latest versions)  
**Project Type**: web - Socket.io real-time multiplayer application  
**Performance Goals**: <100ms UI response time, <200ms network round-trip for actions  
**Constraints**: Maintain backward compatibility with existing online sessions  
**Scale/Scope**: Support 8 concurrent players per draft session, ~1000 cards rendered

## Constitution Check
*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

**Simplicity**:
- Projects: 2 (frontend UI integration, backend Socket.io sync)
- Using framework directly? Yes (Socket.io, React Three Fiber)
- Single data model? Yes (shared draft state model)
- Avoiding patterns? Yes (no unnecessary abstractions)

**Architecture**:
- EVERY feature as library? Core mechanics in /src/lib/game/
- Libraries listed: 
  - draft-3d-sync: Real-time state synchronization
  - card-preview-system: Unified preview triggers
  - stack-mechanics: New stack interaction system
- CLI per library: N/A (web application)
- Library docs: Component documentation in JSDoc format

**Testing (NON-NEGOTIABLE)**:
- RED-GREEN-Refactor cycle enforced? Yes
- Git commits show tests before implementation? Yes
- Order: Contract→Integration→E2E→Unit strictly followed? Yes
- Real dependencies used? Yes (actual Socket.io connections)
- Integration tests for: Socket.io events, state sync, UI updates
- FORBIDDEN: Implementation before test, skipping RED phase

**Observability**:
- Structured logging included? Yes (via existing logging)
- Frontend logs → backend? Yes (error reporting exists)
- Error context sufficient? Yes (player ID, session ID, action type)

**Versioning**:
- Version number assigned? Using existing app version
- BUILD increments on every change? Yes
- Breaking changes handled? Backward compatibility maintained

## Project Structure

### Documentation (this feature)
```
specs/[###-feature]/
├── plan.md              # This file (/plan command output)
├── research.md          # Phase 0 output (/plan command)
├── data-model.md        # Phase 1 output (/plan command)
├── quickstart.md        # Phase 1 output (/plan command)
├── contracts/           # Phase 1 output (/plan command)
└── tasks.md             # Phase 2 output (/tasks command - NOT created by /plan)
```

### Source Code (repository root)
```
# Option 1: Single project (DEFAULT)
src/
├── models/
├── services/
├── cli/
└── lib/

tests/
├── contract/
├── integration/
└── unit/

# Current: Next.js application with Socket.io integration
src/
├── app/
│   ├── draft-3d/         # Single-player implementation (source)
│   ├── online/           # Multiplayer implementation (target)
│   └── api/             # API routes + Socket.io handlers
├── lib/
│   ├── game/            # Shared game components
│   │   ├── Board.tsx    # 3D board rendering
│   │   ├── components/  # Card components
│   │   └── hooks/       # Game hooks
│   └── stores/          # Zustand stores
├── components/
│   ├── game/            # Game UI components
│   └── online/          # Online-specific components
└── types/               # TypeScript type definitions

tests/
├── integration/         # Socket.io integration tests
├── components/          # React component tests
└── e2e/                # End-to-end multiplayer tests

# Option 3: Mobile + API (when "iOS/Android" detected)
api/
└── [same as backend above]

ios/ or android/
└── [platform-specific structure]
```

**Structure Decision**: Option 2 (Web application with Socket.io backend)

## Phase 0: Outline & Research
1. **Extract unknowns from Technical Context** above:
   - Socket.io event optimization for 3D updates
   - React Three Fiber state sync strategies
   - Card preview hover state broadcasting
   - Stack mechanics conflict resolution

2. **Generate and dispatch research agents**:
   ```
   Task: "Research Socket.io patterns for React Three Fiber synchronization"
   Task: "Find best practices for multiplayer 3D state management"
   Task: "Research hover state broadcasting optimization techniques"
   Task: "Investigate conflict resolution for simultaneous stack operations"
   ```

3. **Consolidate findings** in `research.md` using format:
   - Decision: Event batching for 3D updates
   - Rationale: Reduces network overhead, maintains 60fps
   - Alternatives considered: Individual events (too chatty), polling (too slow)

**Output**: research.md with Socket.io integration patterns resolved

## Phase 1: Design & Contracts
*Prerequisites: research.md complete*

1. **Extract entities from feature spec** → `data-model.md`:
   - OnlineDraftSession: Multiplayer session state
   - PlayerDraftState: Individual player's draft state
   - CardPreviewState: Shared preview state across players
   - StackInteraction: Stack mechanics synchronization

2. **Generate Socket.io contracts** from functional requirements:
   - Event: `draft:card:preview` - Broadcast card preview state
   - Event: `draft:stack:interact` - Synchronize stack operations
   - Event: `draft:ui:update` - UI state changes
   - Event: `draft:player:action` - Player draft actions
   - Output Socket.io event schemas to `/contracts/`

3. **Generate contract tests** from contracts:
   - Socket.io event emission tests
   - Event handler response tests
   - State synchronization tests
   - Tests must fail (no implementation yet)

4. **Extract test scenarios** from user stories:
   - Multiplayer card preview synchronization
   - Stack interaction conflict resolution
   - UI responsiveness under latency
   - Graceful disconnection handling

5. **Update CLAUDE.md incrementally** (O(1) operation):
   - Add Socket.io event patterns
   - Document multiplayer state sync approach
   - Note React Three Fiber optimization techniques
   - Keep under 150 lines for token efficiency

**Output**: data-model.md, /contracts/*, failing tests, quickstart.md, CLAUDE.md

## Phase 2: Task Planning Approach
*This section describes what the /tasks command will do - DO NOT execute during /plan*

**Task Generation Strategy**:
- Load `/templates/tasks-template.md` as base
- Generate tasks from Phase 1 design docs
- Socket.io event handlers → contract test tasks [P]
- UI component updates → integration tasks
- State synchronization → implementation tasks
- Performance optimization → validation tasks

**Ordering Strategy**:
- TDD order: Tests before implementation
- Dependency order: Socket events → State sync → UI updates
- Mark [P] for parallel execution (independent components)

**Estimated Output**: 30-35 numbered, ordered tasks in tasks.md

**IMPORTANT**: This phase is executed by the /tasks command, NOT by /plan

## Phase 3+: Future Implementation
*These phases are beyond the scope of the /plan command*

**Phase 3**: Task execution (/tasks command creates tasks.md)  
**Phase 4**: Implementation (execute tasks.md following constitutional principles)  
**Phase 5**: Validation (run tests, execute quickstart.md, performance validation)

## Complexity Tracking
*No violations - using existing frameworks directly*


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
*Based on Constitution v2.1.1 - See `/memory/constitution.md`*