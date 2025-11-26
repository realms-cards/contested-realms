# Implementation Plan: Collection Tracker

**Branch**: `010-collection-tracker-track` | **Date**: 2025-11-26 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/010-collection-tracker-track/spec.md`

---

## Summary

The Collection Tracker enables Sorcery players to digitally manage their physical card collection. Users can track owned cards with quantities and finishes, browse their collection visually, view TCGPlayer affiliate pricing links, build decks constrained to owned cards, and export those decks to the simulator for play.

**Technical Approach**: Extend existing Prisma schema with `CollectionCard` model following `DeckCard` patterns. Create `/collection` route with React components reusing deck editor patterns. Implement pricing as abstraction layer starting with affiliate links (TCGPlayer API currently restricted for new access).

---

## Technical Context

**Language/Version**: TypeScript 5.x, React 19, Next.js 15 App Router  
**Primary Dependencies**: Prisma, NextAuth, TailwindCSS, Three.js (existing)  
**Storage**: PostgreSQL via Prisma; Redis for price caching  
**Testing**: Vitest for unit/integration tests  
**Target Platform**: Web (desktop + mobile responsive), PWA  
**Project Type**: Web (Next.js monorepo - frontend + API routes)  
**Performance Goals**: <200ms API response, 60fps card grid scroll  
**Constraints**: Collection queries must handle 1000+ cards; pricing cache 1-hour TTL  
**Scale/Scope**: ~500 unique cards per collection typical; ~10 pages/components

---

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

Constitution uses placeholder template - no specific gates defined.
Proceeding with standard best practices:

- ✅ Reuse existing patterns (DeckCard → CollectionCard)
- ✅ No unnecessary new dependencies
- ✅ Test coverage required for API contracts
- ✅ Minimal schema changes (1 new model)

## Project Structure

### Documentation (this feature)

```
specs/010-collection-tracker-track/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   ├── api-collection.md
│   ├── api-collection-decks.md
│   └── api-pricing.md
└── tasks.md             # Phase 2 output (/tasks command)
```

### Source Code (this feature)

```
prisma/
└── schema.prisma           # Add CollectionCard model

src/app/
├── collection/             # NEW: Collection route
│   ├── page.tsx            # Main collection page
│   ├── layout.tsx          # Collection layout
│   ├── CardBrowser.tsx     # Browse all cards
│   ├── CollectionGrid.tsx  # Display owned cards
│   ├── CollectionStats.tsx # Statistics panel
│   ├── QuickAdd.tsx        # Rapid card entry
│   └── decks/              # Collection deck building
│       ├── page.tsx
│       └── [id]/
│           └── page.tsx    # Deck editor
└── api/
    ├── collection/         # NEW: Collection APIs
    │   ├── route.ts        # GET/POST collection
    │   ├── [id]/
    │   │   └── route.ts    # PATCH/DELETE entry
    │   ├── stats/
    │   │   └── route.ts    # Collection stats
    │   ├── missing/
    │   │   └── route.ts    # Missing cards
    │   ├── import/
    │   │   └── route.ts    # Batch import
    │   └── decks/
    │       └── ...         # Collection deck APIs
    └── pricing/            # NEW: Pricing APIs
        ├── card/
        │   └── [cardId]/
        │       └── route.ts
        └── bulk/
            └── route.ts

src/lib/
├── collection/             # NEW: Collection utilities
│   ├── types.ts
│   ├── validation.ts
│   └── pricing-provider.ts

tests/
├── contract/
│   ├── collection-api.test.ts
│   └── pricing-api.test.ts
└── unit/
    └── collection-validation.test.ts
```

**Structure Decision**: Next.js monorepo pattern (existing)

## Phase 0: Outline & Research

1. **Extract unknowns from Technical Context** above:

   - For each NEEDS CLARIFICATION → research task
   - For each dependency → best practices task
   - For each integration → patterns task

2. **Generate and dispatch research agents**:

   ```
   For each unknown in Technical Context:
     Task: "Research {unknown} for {feature context}"
   For each technology choice:
     Task: "Find best practices for {tech} in {domain}"
   ```

3. **Consolidate findings** in `research.md` using format:
   - Decision: [what was chosen]
   - Rationale: [why chosen]
   - Alternatives considered: [what else evaluated]

**Output**: research.md with all NEEDS CLARIFICATION resolved

## Phase 1: Design & Contracts

_Prerequisites: research.md complete_

1. **Extract entities from feature spec** → `data-model.md`:

   - Entity name, fields, relationships
   - Validation rules from requirements
   - State transitions if applicable

2. **Generate API contracts** from functional requirements:

   - For each user action → endpoint
   - Use standard REST/GraphQL patterns
   - Output OpenAPI/GraphQL schema to `/contracts/`

3. **Generate contract tests** from contracts:

   - One test file per endpoint
   - Assert request/response schemas
   - Tests must fail (no implementation yet)

4. **Extract test scenarios** from user stories:

   - Each story → integration test scenario
   - Quickstart test = story validation steps

5. **Update agent file incrementally** (O(1) operation):
   - Run `.specify/scripts/bash/update-agent-context.sh windsurf`
     **IMPORTANT**: Execute it exactly as specified above. Do not add or remove any arguments.
   - If exists: Add only NEW tech from current plan
   - Preserve manual additions between markers
   - Update recent changes (keep last 3)
   - Keep under 150 lines for token efficiency
   - Output to repository root

**Output**: data-model.md, /contracts/\*, failing tests, quickstart.md, agent-specific file

## Phase 2: Task Planning Approach

_This section describes what the /tasks command will do - DO NOT execute during /plan_

**Task Generation Strategy**:

- Load `.specify/templates/tasks-template.md` as base
- Generate tasks from Phase 1 design docs (contracts, data model, quickstart)
- Each API endpoint → contract test + implementation task
- Prisma schema → migration task
- Each UI component → component task with tests
- Integration tests for user stories

**Task Categories (estimated ~35 tasks)**:

1. **Database Layer** (~5 tasks)

   - Prisma schema update (CollectionCard model)
   - Migration generation and application
   - Relation updates to User, Card, Variant, Set
   - Index creation for performance

2. **API Layer** (~12 tasks)

   - Collection CRUD endpoints (GET/POST/PATCH/DELETE)
   - Collection stats endpoint
   - Missing cards endpoint
   - Import endpoint
   - Collection deck endpoints
   - Pricing endpoints (affiliate link generation)
   - Contract tests for each endpoint

3. **UI Components** (~12 tasks)

   - Collection page layout
   - Collection grid component
   - Card browser component
   - Quick Add component
   - Collection stats component
   - Filtering/search UI
   - Collection deck editor
   - Export functionality

4. **Integration** (~6 tasks)
   - Main page navigation link
   - Deck export to simulator
   - Pricing display integration
   - End-to-end user flow tests

**Ordering Strategy**:

- Database → API → UI (dependency order)
- Tests alongside implementation (TDD-lite)
- [P] marks for parallel-safe tasks

**IMPORTANT**: This phase is executed by the /tasks command, NOT by /plan

## Phase 3+: Future Implementation

_These phases are beyond the scope of the /plan command_

**Phase 3**: Task execution (/tasks command creates tasks.md)  
**Phase 4**: Implementation (execute tasks.md following constitutional principles)  
**Phase 5**: Validation (run tests, execute quickstart.md, performance validation)

## Complexity Tracking

_Fill ONLY if Constitution Check has violations that must be justified_

| Violation                  | Why Needed         | Simpler Alternative Rejected Because |
| -------------------------- | ------------------ | ------------------------------------ |
| [e.g., 4th project]        | [current need]     | [why 3 projects insufficient]        |
| [e.g., Repository pattern] | [specific problem] | [why direct DB access insufficient]  |

## Progress Tracking

_This checklist is updated during execution flow_

**Phase Status**:

- [x] Phase 0: Research complete (/plan command) → research.md
- [x] Phase 1: Design complete (/plan command) → data-model.md, contracts/, quickstart.md
- [x] Phase 2: Task planning complete (/plan command - approach described above)
- [ ] Phase 3: Tasks generated (/tasks command)
- [ ] Phase 4: Implementation complete
- [ ] Phase 5: Validation passed

**Gate Status**:

- [x] Initial Constitution Check: PASS (no specific gates)
- [x] Post-Design Constitution Check: PASS
- [x] All NEEDS CLARIFICATION resolved
- [x] Complexity deviations documented (none needed)

---

_Plan ready for /tasks command_\_
