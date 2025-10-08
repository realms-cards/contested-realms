# Feature Specification: Tournament Flow Audit and Server Architecture Refactoring

**Feature Branch**: `009-audit-transport-and`
**Created**: 2025-01-11
**Status**: Draft
**Input**: User description: "Audit transport and the server and check for inconsistencies in the flows between phases of tournaments. Two things are bothering me on production: I need to reload the window manually to get a draft to start, for some reason tournament cube drafts are broken in production they work fine locally, sometimes it seems standings are not recorded with a tournament. We have a very huge server file in index.js - we should start factoring out things and making the architecture of it more modular"

## Execution Flow (main)
```
1. Parse user description from Input
   → If empty: ERROR "No feature description provided"
2. Extract key concepts from description
   → Identify: actors, actions, data, constraints
3. For each unclear aspect:
   → Mark with [NEEDS CLARIFICATION: specific question]
4. Fill User Scenarios & Testing section
   → If no clear user flow: ERROR "Cannot determine user scenarios"
5. Generate Functional Requirements
   → Each requirement must be testable
   → Mark ambiguous requirements
6. Identify Key Entities (if data involved)
7. Run Review Checklist
   → If any [NEEDS CLARIFICATION]: WARN "Spec has uncertainties"
   → If implementation details found: ERROR "Remove tech details"
8. Return: SUCCESS (spec ready for planning)
```

---

## ⚡ Quick Guidelines
- ✅ Focus on WHAT users need and WHY
- ❌ Avoid HOW to implement (no tech stack, APIs, code structure)
- 👥 Written for business stakeholders, not developers

---

## User Scenarios & Testing *(mandatory)*

### Primary User Story
A tournament organizer creates and runs tournaments with draft or sealed formats. Players join tournaments, participate in drafting when required, play matches, and view standings. The system must reliably transition between tournament phases (registration → preparation → active rounds → completion) without requiring manual intervention, maintain accurate standings throughout, and support both regular and cube draft formats consistently across all environments.

### Acceptance Scenarios

**Scenario 1: Tournament Draft Initialization**
1. **Given** a tournament in preparation phase with draft format configured, **When** the organizer starts the tournament, **Then** all registered players automatically receive draft lobby access and can begin drafting without page reload

**Scenario 2: Cube Draft Consistency**
2. **Given** a tournament configured with cube draft format, **When** deployed to production environment, **Then** the draft functions identically to local development with correct cube card distribution

**Scenario 3: Phase Transition Reliability**
3. **Given** a tournament transitioning from preparation to active phase, **When** the phase change is triggered, **Then** all connected clients receive the update and display the correct tournament state within 2 seconds

**Scenario 4: Standings Persistence**
4. **Given** match results are submitted during tournament rounds, **When** standings are calculated, **Then** all player records, match points, and tiebreakers persist correctly to the database

**Scenario 5: Real-time Synchronization**
5. **Given** multiple players connected to the same tournament, **When** any tournament state changes (phase, match creation, standings update), **Then** all clients reflect the change without requiring refresh

### Edge Cases
- What happens when a player loses connection during a critical phase transition?
- How does the system handle phase transitions if some players haven't completed required actions (e.g., deck submission)?
- What happens if standings calculation fails partway through a round?
- How does the system recover if draft initialization fails for some but not all players?
- What happens when cube configuration differs between environments?
- How does the system handle concurrent phase change requests?
- What happens if the socket connection drops during draft distribution?

## Requirements *(mandatory)*

### Functional Requirements

**Phase Transition & State Management**
- **FR-001**: System MUST automatically transition clients to the correct tournament phase without requiring manual page reload
- **FR-002**: System MUST broadcast phase changes to all connected tournament participants within 2 seconds
- **FR-003**: System MUST maintain consistent tournament state across all clients during phase transitions
- **FR-004**: System MUST validate that prerequisite conditions are met before allowing phase transitions
- **FR-005**: System MUST provide clear error messages when phase transitions fail, indicating the specific blocking condition

**Draft Functionality**
- **FR-006**: System MUST support cube draft format with identical behavior across development and production environments
- **FR-007**: System MUST automatically initialize draft sessions for all tournament participants when transitioning to draft phase
- **FR-008**: System MUST distribute cube cards correctly according to tournament draft configuration
- **FR-009**: System MUST handle draft session creation failures gracefully without blocking tournament progress for unaffected players
- **FR-010**: System MUST notify tournament organizer if draft initialization fails for any participant

**Standings & Match Recording**
- **FR-011**: System MUST persist all match results to the database immediately upon submission
- **FR-012**: System MUST update tournament standings within 5 seconds of match result submission
- **FR-013**: System MUST recalculate tiebreakers whenever standings change
- **FR-014**: System MUST maintain historical record of all standings updates for audit purposes
- **FR-015**: System MUST prevent standings data loss during phase transitions or server restarts

**Real-time Communication Reliability**
- **FR-016**: System MUST detect and log all failed socket message deliveries
- **FR-017**: System MUST implement retry logic for critical tournament state updates (phase changes, match creation, standings)
- **FR-018**: System MUST maintain message ordering for tournament events to prevent state inconsistencies
- **FR-019**: System MUST handle player reconnection by synchronizing current tournament state
- **FR-020**: System MUST identify and report communication bottlenecks that could cause state desynchronization

**Server Architecture & Maintainability**
- **FR-021**: Server codebase MUST be organized into logical, cohesive modules with clear boundaries
- **FR-022**: Tournament-related functionality MUST be isolated from match-related functionality
- **FR-023**: System MUST provide clear audit trails for all tournament phase transitions and state changes
- **FR-024**: Server modules MUST have well-defined interfaces to enable independent testing
- **FR-025**: System MUST document all socket event handlers and their expected behavior

### Key Entities

- **Tournament**: Represents a competitive event with multiple players, progressing through phases (registration, preparation, active, completed), containing configuration for format type and match structure
- **Tournament Phase**: State of tournament lifecycle - each phase has entry conditions, allowed actions, and exit criteria
- **Draft Session**: Instance of a drafting process for tournament participants, containing pack configuration, cube selection, and player draft state
- **Match**: Individual game between tournament participants, linked to tournament round, containing result data and player assignments
- **Standings Record**: Player's current tournament standing including match points, game win percentage, opponent win percentage, and placement
- **Socket Transport Event**: Real-time message communicating tournament state changes, phase transitions, or match updates to connected clients
- **Phase Transition**: Event marking change from one tournament phase to another, with validation of completion criteria and broadcasting to participants

---

## Review & Acceptance Checklist

### Content Quality
- [x] No implementation details (languages, frameworks, APIs)
- [x] Focused on user value and business needs
- [x] Written for non-technical stakeholders
- [x] All mandatory sections completed

### Requirement Completeness
- [x] No [NEEDS CLARIFICATION] markers remain
- [x] Requirements are testable and unambiguous
- [x] Success criteria are measurable
- [x] Scope is clearly bounded
- [x] Dependencies and assumptions identified

---

## Execution Status

- [x] User description parsed
- [x] Key concepts extracted
- [x] Ambiguities marked
- [x] User scenarios defined
- [x] Requirements generated
- [x] Entities identified
- [x] Review checklist passed

---

## Notes

**Known Issues Identified**:
1. **Draft Start Requires Reload** - Phase transition to draft does not automatically update client state
2. **Cube Draft Production Failure** - Environment-specific issue causing cube drafts to fail only in production
3. **Standings Persistence Issues** - Intermittent failure to record tournament standings in database
4. **Server File Size** - Single 6,329-line server file indicates architectural debt requiring modularization

**Investigation Priorities**:
- Socket event broadcasting reliability for phase changes
- Environment configuration differences affecting cube draft
- Database transaction handling for standings updates
- Server code organization and separation of concerns
