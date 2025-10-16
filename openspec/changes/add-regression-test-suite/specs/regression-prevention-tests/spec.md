# Spec: Regression Prevention Test Suite

## ADDED Requirements

### REQ-REG-001: Fallback ID Prevention
The test suite MUST prevent regression of the fallback hash ID bug where cards received temporary IDs instead of proper cardIds.

#### Scenario: Cards do not generate fallback hash IDs
**Given** a card is picked before metadata fetch completes
**And** `slugToCardId` mapping is empty (no metadata yet)
**When** `draftCardToBoosterCard()` converts the DraftCard to BoosterCard
**Then** the returned BoosterCard has `cardId = 0` (NOT a hash value)
**And** `cardId` is LESS THAN 1,000,000,000 (outside fallback ID range)

#### Scenario: CardId is updated when metadata arrives
**Given** a picked card initially has `cardId = 0`
**When** metadata fetch completes and updates `slugToCardId = {"bet_azuridge_caravan_a": 232}`
**And** the `pick3D` state update effect runs
**Then** the card's `cardId` is updated from 0 to 232
**And** subsequent categorization uses the correct cardId

#### Scenario: Metadata lookup succeeds after cardId update
**Given** a card with `slug = "bet_azuridge_caravan_a"` and initial `cardId = 0`
**When** metadata fetch updates `metaByCardId = {232: {cost: 1, attack: 1, ...}}`
**And** the card's `cardId` is updated to 232
**Then** `metaByCardId[card.cardId]` returns the correct metadata
**And** `categorizeCard(card, meta)` returns "creatures"

---

### REQ-REG-002: Creature Categorization Correctness
The test suite MUST prevent regression where creatures were misclassified as spells due to metadata lookup failures.

#### Scenario: Creatures with attack stat are never categorized as spells
**Given** a card with `attack = 1` and `defence = null`
**And** metadata is available in `metaByCardId`
**When** `categorizeCard()` is called
**Then** the function returns "creatures" (not "spells")

#### Scenario: Creatures with defence stat are never categorized as spells
**Given** a card with `attack = null` and `defence = 1`
**And** metadata is available in `metaByCardId`
**When** `categorizeCard()` is called
**Then** the function returns "creatures" (not "spells")

#### Scenario: PicksByType counts match actual creature cards
**Given** user picks 3 creatures, 2 spells, 1 site
**And** all metadata has been fetched
**When** `picksByType` is computed
**Then** the result is `{creatures: 3, spells: 2, sites: 1, avatars: 0}`
**And** the UI displays "C 3 S 2 Sites 1"

---

### REQ-REG-003: Metadata Lookup After Pick
The test suite MUST verify that metadata lookup works immediately after picking a card, without requiring manual page refresh.

#### Scenario: Metadata fetch is triggered on card pick
**Given** user picks a card "Azuridge Caravan" during tournament draft
**When** the card is added to `pick3D` state
**Then** the metadata fetch effect is triggered
**And** API is called with `/api/cards/meta-by-variant?slugs=bet_azuridge_caravan_a&set=Beta`

#### Scenario: State updates occur in correct order
**Given** metadata fetch returns `{slug: "bet_azuridge_caravan_a", cardId: 232, cost: 1, attack: 1, defence: 1}`
**When** the fetch promise resolves
**Then** `slugToCardId` is updated FIRST with `{"bet_azuridge_caravan_a": 232}`
**And** `metaByCardId` is updated SECOND with `{232: {cost: 1, attack: 1, defence: 1, ...}}`
**And** `pick3D` cards are patched THIRD with updated cardIds
**And** `layoutMetaByCardId` is updated FOURTH with re-keyed metadata

#### Scenario: UI updates immediately without manual refresh
**Given** user picks a creature card
**When** metadata fetch completes
**Then** the "Your Picks" panel immediately shows correct categorization
**And** creature count increments from 0 to 1
**And** mana cost badge displays immediately
**And** no manual page refresh is required

---

### REQ-REG-004: Global Broadcast Antipattern Prevention
The test suite MUST prevent regression where global socket broadcasts caused request loops.

#### Scenario: Tournament events are room-scoped
**Given** a tournament draft event (e.g., `draftUpdate`)
**When** the event is broadcast via Socket.IO
**Then** the event is sent ONLY to `io.to(tournamentRoom)` (not `io.emit()`)
**And** only players in that tournament receive the event

#### Scenario: No reload loops occur on phase transitions
**Given** tournament phase changes from "waiting" to "picking"
**When** `PHASE_CHANGED` event is broadcast
**Then** clients receive the event exactly once
**And** no request loops or duplicate phase transitions occur
**And** draft UI updates without reload

---

### REQ-REG-005: Standings Race Condition Prevention
The test suite MUST prevent regression where concurrent match completions caused data loss in standings.

#### Scenario: Concurrent match results update atomically
**Given** two matches complete simultaneously in a tournament
**When** both call `recordMatchResult()` to update standings
**Then** both updates are wrapped in `prisma.$transaction([])`
**And** both updates complete without data loss
**And** final standings reflect both match results

#### Scenario: Transaction retry on conflict
**Given** a standings update encounters a transaction conflict
**When** Prisma throws a transaction error
**Then** the update retries automatically with 100ms backoff
**And** the update succeeds on retry

---

### REQ-REG-006: Cube Draft Production Consistency
The test suite MUST prevent regression where cube drafts failed in production but worked locally.

#### Scenario: Cube draft configuration is hydrated before pack generation
**Given** a cube draft match in a tournament
**When** the draft session starts
**Then** `DraftSession.cubeId` is loaded from database BEFORE pack generation
**And** pack generation uses the correct cube configuration
**And** draft works identically in local and production environments

#### Scenario: Fallback to match config for casual drafts
**Given** a casual (non-tournament) draft without `DraftSession` record
**When** draft configuration is loaded
**Then** the system falls back to match config
**And** the draft proceeds without errors

---

## Cross-References

- Depends on: `card-categorization-tests` (categorization logic)
- Depends on: `tournament-draft-integration-tests` (end-to-end flows)
- Prevents: Issues documented in `specs/009-audit-transport-and` (T014-T016)

## Acceptance Criteria

- ✅ All known regression scenarios have corresponding tests
- ✅ Tests fail when the original bug is reintroduced (meta-validation)
- ✅ Tests include clear comments explaining what regression they prevent
- ✅ Tests run in <5 seconds total
- ✅ Regression test failure messages are actionable (explain what broke)

## Meta-Validation Plan

To verify these regression tests work:

1. **Reintroduce fallback ID bug**: Restore `stableIdFromString()` call
   - **Expected**: REQ-REG-001 tests FAIL
2. **Break categorization**: Change `!== null` to `> 0`
   - **Expected**: REQ-REG-002 tests FAIL
3. **Remove metadata fetch**: Comment out fetch effect
   - **Expected**: REQ-REG-003 tests FAIL

If all three validations fail as expected, the regression test suite is working correctly.
