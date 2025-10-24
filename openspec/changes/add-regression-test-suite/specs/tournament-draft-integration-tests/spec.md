# Spec: Tournament Draft Integration Test Suite

## ADDED Requirements

### REQ-INT-001: Metadata Pipeline Integration
The test suite MUST verify the end-to-end metadata fetch, resolution, and display pipeline in TournamentDraft3DScreen.

#### Scenario: User picks cards and metadata is fetched and displayed
**Given** a user picks 3 cards: 1 creature (Azuridge Caravan), 1 spell (Fireball), 1 site (Mountain)
**And** the metadata API responds with correct data for all cards
**When** the metadata fetch effect completes
**Then** the `picksByType` state shows `{creatures: 1, spells: 1, sites: 1, avatars: 0}`
**And** the "Your Picks" panel UI displays "C 1 S 1 Sites 1"

#### Scenario: CardIds are resolved from API response
**Given** picked cards have slugs `["bet_azuridge_caravan_a", "bet_fireball_a"]`
**When** the metadata API returns `[{slug: "bet_azuridge_caravan_a", cardId: 232}, {slug: "bet_fireball_a", cardId: 150}]`
**Then** the `slugToCardId` state is updated to `{"bet_azuridge_caravan_a": 232, "bet_fireball_a": 150}`
**And** the picked cards' `cardId` fields are updated from 0 to their proper IDs

#### Scenario: Metadata is stored and used for categorization
**Given** a picked card with `cardId = 232`
**When** metadata API returns `{cardId: 232, cost: 1, attack: 1, defence: 1, thresholds: {water: 1}}`
**Then** the `metaByCardId` state contains `{232: {cost: 1, attack: 1, defence: 1, thresholds: {water: 1}}}`
**And** `categorizeCard()` uses this metadata to categorize the card as "creatures"

---

### REQ-INT-002: Metadata Fetch Failure Handling
The test suite MUST verify graceful degradation when metadata fetching fails.

#### Scenario: API returns 500 error
**Given** a user picks cards
**When** the metadata API returns HTTP 500 error
**Then** no uncaught exceptions occur
**And** the UI remains functional
**And** picked cards display with basic info (slug, name) but no mana cost/thresholds

#### Scenario: API returns empty response
**Given** a user picks cards
**When** the metadata API returns `200 OK` with empty array `[]`
**Then** cards are categorized as "spells" (fallback due to no metadata)
**And** the "Your Picks" panel shows all cards under "S" (spells)

#### Scenario: Network timeout during fetch
**Given** a user picks cards
**When** the metadata fetch times out after 5 seconds
**Then** the fetch is aborted gracefully
**And** cards display without metadata (fallback state)
**And** console shows warning but no errors

---

### REQ-INT-003: Picks Panel Display Validation
The test suite MUST verify that the "Your Picks" panel displays correct metadata-derived information.

#### Scenario: Mana cost badges render for each card
**Given** 5 picked cards with costs [1, 2, 3, 4, 5]
**And** metadata has been fetched successfully
**When** the "Your Picks" panel renders
**Then** each card row displays the correct mana cost badge (NumberBadge component)

#### Scenario: Threshold icons display correctly
**Given** a picked card with `thresholds = {fire: 2, water: 1}`
**And** metadata has been fetched successfully
**When** the "Your Picks" panel renders
**Then** the card row displays 2 fire icons and 1 water icon

#### Scenario: Card quantities are calculated correctly
**Given** user picks 3 copies of "Mountain" (same slug)
**When** the "Your Picks" panel renders
**Then** the card row shows "x3" next to the card name
**And** only 1 row is displayed (not 3 separate rows)

---

### REQ-INT-004: Auto-Stacking Integration
The test suite MUST verify that auto-stacking and sort mode changes trigger correct UI updates.

#### Scenario: Toggling auto-stack rearranges cards
**Given** 10 picked cards in random positions
**When** user clicks "Auto-stack: On" button
**Then** `computeStackPositions()` is called
**And** cards animate to sorted stack positions
**And** cards are grouped by mana cost (default sort mode)

#### Scenario: Changing sort mode triggers reflow
**Given** auto-stacking is enabled
**And** cards are sorted by mana cost
**When** user clicks "Sort: Element" button
**Then** `computeStackPositions()` is called with `sortMode = "element"`
**And** cards rearrange into element-based groups
**And** stack positions are recalculated

#### Scenario: Disabling auto-stack preserves manual positions
**Given** auto-stacking is enabled
**And** cards are in sorted positions
**When** user clicks "Auto-stack: Off" button
**Then** cards remain in their current positions
**And** future picks do not trigger auto-sorting

---

### REQ-INT-005: Metadata Fetch Deduplication
The test suite MUST verify that metadata fetches are deduplicated to avoid redundant API calls.

#### Scenario: Same slug is not fetched twice
**Given** a card with slug `"bet_azuridge_caravan_a"` is picked
**And** metadata for that slug has already been fetched
**When** another card with the same slug is picked
**Then** no additional API call is made for that slug
**And** the existing metadata is reused

#### Scenario: Inflight fetches are aborted on state change
**Given** a metadata fetch is in progress
**When** the component unmounts or draft state changes
**Then** the fetch is aborted via `AbortController`
**And** no state updates occur after abort

#### Scenario: Metadata request key prevents duplicate requests
**Given** metadata fetch is triggered for slugs `["slug_a", "slug_b"]`
**And** the same fetch is triggered again before completion
**When** the deduplication logic runs
**Then** the second fetch is skipped (same request key)
**And** only one API call is made

---

## Cross-References

- Depends on: `card-categorization-tests` (categorization logic must work)
- Related to: `regression-prevention-tests` (integration tests verify bug fixes work end-to-end)

## Acceptance Criteria

- ✅ All metadata pipeline scenarios tested end-to-end
- ✅ Failure scenarios handled gracefully (no crashes)
- ✅ UI updates verified with React Testing Library
- ✅ API mocks used consistently across all tests
- ✅ Tests run in <15 seconds total
