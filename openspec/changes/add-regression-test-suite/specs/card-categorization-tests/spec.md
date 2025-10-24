# Spec: Card Categorization Test Suite

## ADDED Requirements

### REQ-CAT-001: Creature Categorization Tests
The test suite MUST verify that cards with attack or defence stats are categorized as creatures.

#### Scenario: Card with attack stat is categorized as creature
**Given** a card with `attack !== null` and any defence value
**When** `categorizeCard()` is called with the card and its metadata
**Then** the function returns `"creatures"`

#### Scenario: Card with defence stat is categorized as creature
**Given** a card with `defence !== null` and any attack value
**When** `categorizeCard()` is called with the card and its metadata
**Then** the function returns `"creatures"`

#### Scenario: Card with both attack and defence is categorized as creature
**Given** a card with both `attack !== null` AND `defence !== null`
**When** `categorizeCard()` is called with the card and its metadata
**Then** the function returns `"creatures"`

---

### REQ-CAT-002: Spell Categorization Tests
The test suite MUST verify that cards without attack/defence stats are categorized as spells.

#### Scenario: Card with no metadata defaults to spell
**Given** a card with no metadata provided
**When** `categorizeCard()` is called with the card and `undefined` metadata
**Then** the function returns `"spells"`

#### Scenario: Card with null attack and defence is categorized as spell
**Given** a card with `attack === null` AND `defence === null`
**When** `categorizeCard()` is called with the card and its metadata
**Then** the function returns `"spells"`

#### Scenario: Card with zero attack and defence is categorized as spell
**Given** a card with `attack === 0` AND `defence === 0`
**When** `categorizeCard()` is called with the card and its metadata
**Then** the function returns `"spells"` (zero is not null, but represents no combat stats)

---

### REQ-CAT-003: Site and Avatar Categorization Tests
The test suite MUST verify that cards with specific types are categorized correctly regardless of metadata.

#### Scenario: Card with type "Site" is categorized as site
**Given** a card with `type` containing the substring "site" (case-insensitive)
**When** `categorizeCard()` is called with the card
**Then** the function returns `"sites"` regardless of attack/defence stats

#### Scenario: Card with type "Avatar" is categorized as avatar
**Given** a card with `type` containing the substring "avatar" (case-insensitive)
**When** `categorizeCard()` is called with the card
**Then** the function returns `"avatars"` regardless of attack/defence stats

#### Scenario: Compound type with "Site" is categorized as site
**Given** a card with `type = "Magic Site"` or `"Minion - Site"`
**When** `categorizeCard()` is called with the card
**Then** the function returns `"sites"` (type check takes precedence over stats)

---

### REQ-CAT-004: Edge Case Handling
The test suite MUST verify that categorization handles edge cases gracefully.

#### Scenario: Card with null type is categorized based on stats
**Given** a card with `type = null` and `attack = 1`
**When** `categorizeCard()` is called with the card and its metadata
**Then** the function returns `"creatures"` (falls back to stat-based categorization)

#### Scenario: Card with empty string type is categorized based on stats
**Given** a card with `type = ""` and `defence = 1`
**When** `categorizeCard()` is called with the card and its metadata
**Then** the function returns `"creatures"` (empty string treated as no type)

#### Scenario: Card with negative attack is categorized as creature
**Given** a card with `attack = -1` (invalid but non-null)
**When** `categorizeCard()` is called with the card and its metadata
**Then** the function returns `"creatures"` (non-null check, not value check)

---

### REQ-CAT-005: CardId Resolution Tests
The test suite MUST verify that cardIds are resolved correctly from slugs.

#### Scenario: CardId resolved from slugToCardId mapping
**Given** a card slug `"bet_azuridge_caravan_a"` and `slugToCardId = {"bet_azuridge_caravan_a": 232}`
**When** `draftCardToBoosterCard()` is called
**Then** the returned BoosterCard has `cardId = 232`

#### Scenario: CardId falls back to card.id if slug mapping unavailable
**Given** a card with `id = "123"` and `slugToCardId = {}` (empty mapping)
**When** `draftCardToBoosterCard()` is called
**Then** the returned BoosterCard has `cardId = 123`

#### Scenario: CardId defaults to 0 if no valid ID available
**Given** a card with no `id` field and `slugToCardId = {}` (empty mapping)
**When** `draftCardToBoosterCard()` is called
**Then** the returned BoosterCard has `cardId = 0` (NOT a fallback hash)

---

### REQ-CAT-006: Stack Position Calculation Tests
The test suite MUST verify that stack positions are calculated consistently.

#### Scenario: Same inputs produce same stack positions
**Given** a list of 10 picked cards and their metadata
**When** `computeStackPositions()` is called twice with identical inputs
**Then** both calls return identical position maps (deterministic)

#### Scenario: Sort mode "mana" groups cards by mana cost
**Given** cards with costs [0, 1, 1, 3, 5] and `sortMode = "mana"`
**When** `computeStackPositions()` is called
**Then** cards are grouped into columns by cost (cost 0, cost 1, cost 3, cost 5)

#### Scenario: Sort mode "element" groups cards by thresholds
**Given** cards with thresholds [fire:2, water:1, fire:1, water:2] and `sortMode = "element"`
**When** `computeStackPositions()` is called
**Then** cards are grouped into columns by primary element (fire group, water group)

---

## Cross-References

- Related to: `tournament-draft-integration-tests` (uses categorization logic)
- Related to: `regression-prevention-tests` (validates categorization doesn't regress)

## Acceptance Criteria

- ✅ All categorization edge cases covered (null, 0, negative values)
- ✅ All cardId resolution scenarios tested
- ✅ Stack position calculations are deterministic
- ✅ Tests run in <5 seconds total
- ✅ Tests use shared fixtures for consistency
