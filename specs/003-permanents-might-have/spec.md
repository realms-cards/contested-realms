# Feature Specification: Permanent Burrow/Submerge Mechanics

**Feature Branch**: `003-permanents-might-have`  
**Created**: 2025-01-09  
**Status**: Draft  
**Input**: User description: "Permanents might have an ability to burrow or submerge. It means they go 'under' the site they are on. It would be great to add a function to the right click menu of permanents that can burrow/submerge (again - put them 'under' the site in 3D-space). Also we should not place sites right in the middle of a cell/tile, but more towards the edge of the tile facing the placer owning the site"

## Execution Flow (main)

```
1. Parse user description from Input
   → ✅ COMPLETED: Description parsed successfully
2. Extract key concepts from description
   → ✅ COMPLETED: Identified actors (players, permanents), actions (burrow/submerge, right-click), data (permanent state, site positioning), constraints (3D positioning)
3. For each unclear aspect:
   → Which permanent cards have burrow/submerge abilities? Burrow and Submerge are keywords that should be available via the card data API
   → Does burrowing affect game mechanics beyond visual positioning? Yes! But we do not need to concern ourselves with that for now, except that the permanent should also be able to surface from under the site it is burrowed or submerged under
4. Fill User Scenarios & Testing section
   → ✅ COMPLETED: Clear user flow identified
5. Generate Functional Requirements
   → ✅ COMPLETED: Each requirement is testable
6. Identify Key Entities (if data involved)
   → ✅ COMPLETED: Permanents, Sites, Player positions identified
7. Run Review Checklist
   → ⚠️ WARN "Spec has uncertainties" - Contains [NEEDS CLARIFICATION] markers
8. Return: SUCCESS (spec ready for planning with clarifications needed)
```

---

## ⚡ Quick Guidelines

- ✅ Focus on WHAT users need and WHY
- ❌ Avoid HOW to implement (no tech stack, APIs, code structure)
- 👥 Written for business stakeholders, not developers

---

## User Scenarios & Testing _(mandatory)_

### Primary User Story

As a player during a game, when I have permanents with burrow or submerge abilities on the battlefield, I want to activate these abilities through a right-click context menu so that my permanents visually move "under" their current site in 3D space, reflecting their hidden or protected state according to game rules.

### Acceptance Scenarios

1. **Given** I have a permanent with burrow ability on a site, **When** I right-click on the permanent and select "Burrow" from the context menu, **Then** the permanent moves visually underneath the site in 3D space while remaining functionally present
2. **Given** I have a permanent with submerge ability on a water site, **When** I right-click and select "Submerge", **Then** the permanent disappears below the water surface visually but remains active in gameplay
3. **Given** I am placing a new site on a game tile, **When** the site is positioned, **Then** the site appears toward the edge of the tile facing my player position rather than in the center
4. **Given** a permanent is currently burrowed/submerged, **When** I right-click on its location, **Then** I can see an option to "Surface" or "Emerge" to return it to normal positioning

### Edge Cases

- What happens when a burrowed permanent needs to be targeted by spells or abilities?
- How does the system handle multiple permanents burrowing under the same site?
- What occurs if a site is destroyed while permanents are burrowed underneath it?
- How are burrowed permanents represented when the 3D view changes perspective?

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: System MUST provide a right-click context menu option for permanents that have burrow or submerge abilities
- **FR-002**: System MUST visually move burrowed/submerged permanents to a position "under" their current site in 3D space
- **FR-003**: Players MUST be able to return burrowed/submerged permanents to surface level through the same context menu system
- **FR-004**: System MUST position newly placed sites toward the edge of their tile facing the owning player's position rather than in the tile center
- **FR-005**: System MUST maintain the functional game state of burrowed/submerged permanents (they remain active unless rules specify otherwise)
- **FR-006**: System MUST clearly indicate which permanents have [NEEDS CLARIFICATION: specific visual or textual indicators for burrow/submerge abilities not specified]
- **FR-007**: System MUST handle burrow/submerge state persistence during [NEEDS CLARIFICATION: save/load behavior, game state transitions not specified]
- **FR-008**: System MUST validate that only eligible permanents can use burrow/submerge abilities based on [NEEDS CLARIFICATION: card rules, site types, or other game conditions not specified]

### Key Entities _(include if feature involves data)_

- **Permanent**: Game card with positional state (surface/burrowed/submerged), ability flags for burrow/submerge eligibility, current site association
- **Site**: Game location with 3D positioning, ownership information, tile placement with edge-based positioning relative to owning player
- **Player Position**: Spatial reference point used to determine site placement orientation on tiles
- **Context Menu**: Interactive element showing available actions for permanents, dynamically populated based on permanent abilities and current state

---

## Review & Acceptance Checklist

_GATE: Automated checks run during main() execution_

### Content Quality

- [x] No implementation details (languages, frameworks, APIs)
- [x] Focused on user value and business needs
- [x] Written for non-technical stakeholders
- [x] All mandatory sections completed

### Requirement Completeness

- [ ] No [NEEDS CLARIFICATION] markers remain
- [x] Requirements are testable and unambiguous (where specified)
- [x] Success criteria are measurable
- [x] Scope is clearly bounded
- [x] Dependencies and assumptions identified

---

## Execution Status

_Updated by main() during processing_

- [x] User description parsed
- [x] Key concepts extracted
- [x] Ambiguities marked
- [x] User scenarios defined
- [x] Requirements generated
- [x] Entities identified
- [ ] Review checklist passed (pending clarifications)

---
