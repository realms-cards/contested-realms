# Implementation Plan: Fix TypeScript Build Errors and Strengthen Type Safety

**Branch**: `002-we-have-a` | **Date**: 2025-09-09 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/Users/geleeroyale/CascadeProjects/sorcery-client/specs/002-we-have-a/spec.md`

## Execution Flow (/plan command scope)
```
1. Load feature spec from Input path
   → If not found: ERROR "No feature spec at {path}"
2. Fill Technical Context (scan for NEEDS CLARIFICATION)
   → Detect Project Type from context (web=frontend+backend, mobile=app+api)
   → Set Structure Decision based on project type
3. Evaluate Constitution Check section below
   → If violations exist: Document in Complexity Tracking
   → If no justification possible: ERROR "Simplify approach first"
   → Update Progress Tracking: Initial Constitution Check
4. Execute Phase 0 → research.md
   → If NEEDS CLARIFICATION remain: ERROR "Resolve unknowns"
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
Fix 122 TypeScript compilation errors and ESLint violations to ensure clean builds with strong type safety. Replace explicit `any` types with proper type definitions, remove unused variables, fix React Hook dependencies, and maintain existing functionality while improving developer experience.

## Technical Context
**Language/Version**: TypeScript 5.x, React 19.1.0, Next.js 15.5.0  
**Primary Dependencies**: ESLint 9.x, React Three Fiber 9.3.0, Three.js 0.179.1, Vitest 2.0.5  
**Storage**: Prisma ORM with database, local files for assets  
**Testing**: Vitest for unit/integration tests, React Testing Library for components  
**Target Platform**: Web browsers (modern JS/TypeScript), Node.js build environment
**Project Type**: web - Next.js frontend with integrated backend API routes  
**Performance Goals**: Fast build times, no TypeScript compilation errors, clean linting  
**Constraints**: Maintain existing functionality, no breaking changes to user experience  
**Scale/Scope**: 122 current errors across ~15-20 source files, affecting build pipeline

## Constitution Check
*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

**Simplicity**:
- Projects: 1 (Next.js web app with integrated build/test tools)
- Using framework directly? ✅ (Direct TypeScript/ESLint, no wrapper abstractions)
- Single data model? ✅ (Fix existing types, no new DTOs needed)
- Avoiding patterns? ✅ (Direct error fixing, no architectural patterns needed)

**Architecture**:
- EVERY feature as library? ✅ (This is code quality maintenance, not new features)
- Libraries listed: N/A (Fixing existing codebase, no new libraries)
- CLI per library: N/A (Using existing npm scripts and build tools)
- Library docs: N/A (Code quality fixes don't need new documentation)

**Testing (NON-NEGOTIABLE)**:
- RED-GREEN-Refactor cycle enforced? ✅ (Tests must fail → fix types → tests pass)
- Git commits show tests before implementation? ✅ (Will verify build failures first)
- Order: Contract→Integration→E2E→Unit strictly followed? ✅ (Build validation → type fixes)
- Real dependencies used? ✅ (Actual TypeScript compiler and ESLint)
- Integration tests for: Build process validation, type checking verification
- FORBIDDEN: Implementation before test, skipping RED phase ✅ (Build failures are the "red")

**Observability**:
- Structured logging included? N/A (Code quality fixes, not feature development)
- Frontend logs → backend? N/A (Build-time fixes, no runtime logging changes)
- Error context sufficient? ✅ (TypeScript and ESLint provide detailed error context)

**Versioning**:
- Version number assigned? N/A (Patch-level fixes, existing version management)
- BUILD increments on every change? N/A (Internal code quality, not user-facing changes)
- Breaking changes handled? ✅ (No breaking changes - maintaining existing functionality)

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

# Option 2: Web application (when "frontend" + "backend" detected)
backend/
├── src/
│   ├── models/
│   ├── services/
│   └── api/
└── tests/

frontend/
├── src/
│   ├── components/
│   ├── pages/
│   └── services/
└── tests/

# Option 3: Mobile + API (when "iOS/Android" detected)
api/
└── [same as backend above]

ios/ or android/
└── [platform-specific structure]
```

**Structure Decision**: Option 2 (Web application) - Next.js project with src/ directory containing frontend components and pages, with integrated API routes and backend functionality

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
*Prerequisites: research.md complete*

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
   - Run `/scripts/update-agent-context.sh [claude|gemini|copilot]` for your AI assistant
   - If exists: Add only NEW tech from current plan
   - Preserve manual additions between markers
   - Update recent changes (keep last 3)
   - Keep under 150 lines for token efficiency
   - Output to repository root

**Output**: data-model.md, /contracts/*, failing tests, quickstart.md, agent-specific file

## Phase 2: Task Planning Approach
*This section describes what the /tasks command will do - DO NOT execute during /plan*

**Task Generation Strategy**:
- Load `/templates/tasks-template.md` as base
- Generate tasks from build error analysis and research findings
- Group errors by category and file for efficient batch processing
- Each error category → validation test task + fix implementation task
- Build validation tasks to ensure no regressions

**Ordering Strategy**:
- TDD order: Verify build failures → Fix errors → Validate fixes
- Priority order: Critical compilation blockers → Code quality issues → Style improvements
- File-based batching: Group errors by file for efficient context switching
- Mark [P] for parallel execution (independent files that don't affect each other)

**Estimated Output**: 15-20 numbered, ordered tasks focusing on systematic error resolution

**IMPORTANT**: This phase is executed by the /tasks command, NOT by /plan

## Phase 3+: Future Implementation
*These phases are beyond the scope of the /plan command*

**Phase 3**: Task execution (/tasks command creates tasks.md)  
**Phase 4**: Implementation (execute tasks.md following constitutional principles)  
**Phase 5**: Validation (run tests, execute quickstart.md, performance validation)

## Complexity Tracking
*Fill ONLY if Constitution Check has violations that must be justified*

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| [e.g., 4th project] | [current need] | [why 3 projects insufficient] |
| [e.g., Repository pattern] | [specific problem] | [why direct DB access insufficient] |


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