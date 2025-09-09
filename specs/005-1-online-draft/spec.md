# Feature Specification: Online Draft Flow Improvements

**Feature Branch**: `005-1-online-draft`  
**Created**: 2025-09-09  
**Status**: Draft  
**Input**: User description: "1-Online draft pick and pass is wonky, when a player picks and pass, they should need for all other players to also pick and pass before they get the new hand to pick from. 2-the editor we transition to from online draft still clears the deck when a card from "Standard Cards" is added. 3-After a player sumbits a deck, they should get placed in a waiting overlay (similar to what we do with sealed online) until all other players have submitted their deck (instead of the deck loading screen that is on now, but can be a fallback). 4 - Keep in mind we will add more players than two very soon"

## Execution Flow (main)
```
1. Parse user description from Input
   → If empty: ERROR "No feature description provided"
2. Extract key concepts from description
   → Identified: synchronized draft flow, deck editor persistence, submission waiting overlay, multi-player scalability
3. For each unclear aspect:
   → [NEEDS CLARIFICATION: What happens if a player disconnects during draft phase?]
   → [NEEDS CLARIFICATION: Timeout duration for waiting on other players?]
   → [NEEDS CLARIFICATION: How many total players will be supported in "more than two"?]
4. Fill User Scenarios & Testing section
   → User flow: Draft cards → Edit deck → Submit → Wait for others → Continue
5. Generate Functional Requirements
   → Each requirement must be testable
   → Mark ambiguous requirements
6. Identify Key Entities (draft session, player state, deck submission)
7. Run Review Checklist
   → WARN "Spec has uncertainties - see clarification markers"
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
As a player in an online draft session, I want a fair and synchronized drafting experience where all players pick and pass cards simultaneously, my deck building progress is preserved when adding cards from different sources, and I receive clear feedback about waiting for other players during the submission phase.

### Acceptance Scenarios
1. **Given** I am in an online draft with other players, **When** I select a card and pass the remaining pack, **Then** I must wait for all other players to also pick and pass before receiving the next pack to draft from
2. **Given** I have completed drafting and entered the deck editor, **When** I add cards from "Standard Cards" to my deck, **Then** my previously drafted cards remain in the deck and are not cleared
3. **Given** I have finished building my deck and click submit, **When** I submit my deck, **Then** I see a waiting overlay indicating I'm waiting for other players to submit their decks
4. **Given** I am waiting for other players to submit, **When** all players have submitted their decks, **Then** the waiting overlay disappears and the next phase begins
5. **Given** the system supports multiple players, **When** a draft session starts with more than two players, **Then** the pick-and-pass synchronization works correctly for all participants

### Edge Cases
- What happens when a player disconnects during the draft phase and others are waiting for their pick?
- How does the system handle slow players who take too long to make picks?
- What occurs if a player's deck editor crashes while building their deck?
- How does the waiting overlay behave if the connection is lost during submission waiting?

## Requirements *(mandatory)*

### Functional Requirements
- **FR-001**: System MUST synchronize draft picks across all players, preventing any player from receiving the next pack until all players have picked and passed from the current pack
- **FR-002**: System MUST preserve all drafted cards in the deck editor when players add cards from "Standard Cards" or any other card source
- **FR-003**: System MUST display a waiting overlay when a player submits their deck, showing that they are waiting for other players to complete their submissions
- **FR-004**: System MUST transition all players to the next phase only after all players have submitted their decks
- **FR-005**: System MUST support synchronized draft flow for more than two players without degrading performance or user experience
- **FR-006**: System MUST provide clear visual feedback about the current state of each player during the draft (picking, passed, waiting)
- **FR-007**: System MUST handle player disconnections gracefully during draft phases [NEEDS CLARIFICATION: Should there be a timeout mechanism? Should the draft pause or continue?]
- **FR-008**: System MUST maintain draft session state persistence to allow players to rejoin if disconnected [NEEDS CLARIFICATION: How long should sessions be maintained?]
- **FR-009**: Waiting overlay MUST show progress indicators for how many players have submitted vs. total players in the session
- **FR-010**: System MUST fall back to the existing deck loading screen if the waiting overlay encounters errors

### Key Entities
- **Draft Session**: Represents an active drafting game with multiple players, tracks current pack, pick phase, and player states
- **Player Draft State**: Tracks individual player progress including drafted cards, current pack, pick status, and submission status
- **Deck Submission**: Represents a completed deck submission with timestamp and validation status
- **Pack State**: Represents the current state of card packs being passed between players, including which cards have been picked

---

## Review & Acceptance Checklist
*GATE: Automated checks run during main() execution*

### Content Quality
- [x] No implementation details (languages, frameworks, APIs)
- [x] Focused on user value and business needs
- [x] Written for non-technical stakeholders
- [x] All mandatory sections completed

### Requirement Completeness
- [ ] No [NEEDS CLARIFICATION] markers remain - **3 clarifications needed**
- [x] Requirements are testable and unambiguous  
- [x] Success criteria are measurable
- [x] Scope is clearly bounded
- [x] Dependencies and assumptions identified

---

## Execution Status
*Updated by main() during processing*

- [x] User description parsed
- [x] Key concepts extracted
- [x] Ambiguities marked
- [x] User scenarios defined
- [x] Requirements generated
- [x] Entities identified
- [ ] Review checklist passed - **Pending clarifications**

---