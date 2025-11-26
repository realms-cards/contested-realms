# Feature Specification: Collection Tracker

**Feature Branch**: `010-collection-tracker-track`  
**Created**: 2025-11-26  
**Status**: Draft  
**Input**: User description: "Collection Tracker - Track your physical Sorcery card collection, build decks from owned cards, and export to simulator"

---

## Overview

The Collection Tracker is a new top-level feature accessible from the main screen that allows Sorcery: Contested Realms players to manage their **physical card collection** digitally. Users can track which cards they own, in what quantities and finishes, browse their collection visually, build decks from owned cards, and export those decks to use in the simulator.

This feature leverages the existing card database, card art assets, and deck editor infrastructure while providing a dedicated `/collection` route with purpose-built UI.

---

## User Scenarios & Testing

### Primary User Story

As a Sorcery player, I want to track my physical card collection so that I can see what cards I own, discover cards I'm missing, build decks from my actual collection, and export those decks to practice in the simulator.

### Acceptance Scenarios

1. **Given** an authenticated user with no collection data, **When** they navigate to /collection, **Then** they see an empty collection with a prompt to start adding cards and a way to browse all available cards.

2. **Given** a user viewing the card browser, **When** they click "Add to Collection" on a card, **Then** they can specify quantity, finish (Standard/Foil), and optionally which set/variant they own.

3. **Given** a user with cards in their collection, **When** they view their collection, **Then** they see a visual grid of their owned cards with quantities, can filter/search, and see collection statistics.

4. **Given** a user building a collection-based deck, **When** they add cards, **Then** only cards they own (with available quantity) are selectable, and the system prevents exceeding owned quantities.

5. **Given** a user with a completed collection deck, **When** they click "Export to Simulator", **Then** a playable deck is created in their main deck list that they can use in online/offline matches.

6. **Given** a user viewing collection statistics, **When** they view a set breakdown, **Then** they see completion percentage, owned vs total cards, and which cards they're missing.

### Edge Cases

- **Zero-quantity cards**: When a user reduces quantity to 0, the card should be removed from the collection (not kept with 0 count).
- **Exceeding deck limits**: When building a deck, if user owns 2 copies of a card but deck rules allow 4, they can only add 2.
- **Variant tracking**: User may own the same card in multiple variants (different sets/finishes) - each should be tracked separately with combined total shown.
- **Deleted cards from DB**: If a card is removed from the master database, collection entries should gracefully handle this (show "Unknown Card" or similar).
- **Large collections**: System must handle collections with 1000+ cards performantly.

---

## Requirements

### Functional Requirements

#### Collection Management

- **FR-001**: System MUST allow authenticated users to add any card from the database to their collection.
- **FR-002**: System MUST track quantity (1-99) per card/variant combination in a user's collection.
- **FR-003**: System MUST track finish type (Standard, Foil) for each collection entry.
- **FR-004**: System MUST allow users to specify which set/variant of a card they own.
- **FR-005**: System MUST allow users to increment/decrement quantities or remove cards entirely.
- **FR-006**: System MUST persist collection data to the user's account (server-side storage).

#### Collection Browsing & Display

- **FR-007**: System MUST provide a visual grid view of the user's collection showing card images.
- **FR-008**: System MUST display quantity badges on each card in the collection view.
- **FR-009**: System MUST indicate foil cards visually (distinct styling or badge).
- **FR-010**: System MUST allow filtering collection by: element, type, rarity, set, owned/not-owned.
- **FR-011**: System MUST allow searching collection by card name.
- **FR-012**: System MUST provide a "full card browser" mode showing ALL available cards with owned/not-owned status.

#### Collection Statistics

- **FR-013**: System MUST display total cards owned (sum of all quantities).
- **FR-014**: System MUST display unique cards owned (count of distinct cards).
- **FR-015**: System MUST display collection completion percentage per set.
- **FR-016**: System MUST show a "missing cards" view listing cards user doesn't own.

#### Deck Building from Collection

- **FR-017**: System MUST allow users to create "Collection Decks" - decks built only from owned cards.
- **FR-018**: System MUST enforce that collection decks only use cards the user owns.
- **FR-019**: System MUST enforce that card quantities in a deck don't exceed owned quantities.
- **FR-020**: System MUST validate collection decks against standard deck-building rules (40+ spellbook, 12+ atlas, 1 avatar).
- **FR-021**: System MUST provide a deck builder interface similar to the existing editor, but filtered to owned cards.
- **FR-022**: System MUST show remaining available quantity when adding cards to a collection deck.

#### Export to Simulator

- **FR-023**: System MUST allow exporting a valid collection deck to the user's main deck list.
- **FR-024**: Exported decks MUST be usable in all game modes (online, offline, tournaments).
- **FR-025**: Exported decks SHOULD be marked with origin metadata indicating they came from collection.

#### Quick Add Features

- **FR-026**: System SHOULD provide batch import via text list (same format as deck import).
- **FR-027**: System SHOULD provide a "I opened a pack" quick-add flow for common pack configurations. [NEEDS CLARIFICATION: Should this auto-generate pack contents or just provide a quick-add UI?]
- **FR-028**: System SHOULD allow duplicating/copying quantities from one variant to another.

---

### Key Entities

- **CollectionEntry**: Represents a user's ownership of a specific card variant. Contains: user reference, card reference, variant reference (optional), finish type, quantity, and timestamps.

- **CollectionDeck**: A deck specifically built from collection constraints. Extends or mirrors the existing Deck entity but is flagged as collection-based and enforces ownership rules during editing.

- **CollectionStats**: Computed/cached statistics about a user's collection including totals, set completion, and element distribution.

---

## Out of Scope (V1)

- Trading or marketplace features
- Wishlist/want-list functionality
- Price tracking or market values
- Collection sharing/public profiles
- Import from other collection trackers
- Physical card scanning/OCR

---

## Dependencies & Assumptions

- **Existing card database**: Feature depends on the complete card/variant/set data already in the system.
- **Existing deck infrastructure**: Will reuse deck validation logic, deck storage patterns, and deck builder UI patterns.
- **Authentication**: Requires user authentication (already implemented via NextAuth).
- **Card assets**: Assumes all card images are available via existing asset routes.

---

## Review & Acceptance Checklist

### Content Quality

- [x] No implementation details (languages, frameworks, APIs)
- [x] Focused on user value and business needs
- [x] Written for non-technical stakeholders
- [x] All mandatory sections completed

### Requirement Completeness

- [ ] No [NEEDS CLARIFICATION] markers remain (1 remains for pack-add flow)
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
- [ ] Review checklist passed (pending clarification)

---

## Open Questions

1. **FR-027 Pack Add Flow**: Should the "I opened a pack" feature auto-generate realistic pack contents based on set odds, or simply provide a UI optimized for quickly adding the 9-15 cards from a physical pack?

---
