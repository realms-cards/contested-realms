# Implementation Tasks

## Phase 1: Unit Tests for Card Categorization (T001-T003)

### T001: Create `tests/unit/card-categorization.test.ts`
**Description**: Comprehensive unit tests for `categorizeCard` function covering all edge cases.

**Test Cases**:
- ✅ Categorizes cards with `attack !== null` as creatures
- ✅ Categorizes cards with `defence !== null` as creatures
- ✅ Categorizes cards with both attack and defence as creatures
- ✅ Categorizes cards with no metadata as spells (fallback)
- ✅ Categorizes cards with metadata but null attack/defence as spells
- ✅ Categorizes cards with type="Site" as sites (regardless of metadata)
- ✅ Categorizes cards with type="Avatar" as avatars
- ✅ Handles case-insensitive type matching ("SITE", "site", "Site")
- ✅ Handles compound types ("Magic Site", "Minion - Site")
- ✅ Prioritizes type over metadata (Site with attack still categorized as site)

**Validation**: All tests pass in <100ms

---

### T002: Create `tests/unit/card-id-resolution.test.ts`
**Description**: Test cardId resolution from slugs and fallback scenarios.

**Test Cases**:
- ✅ Resolves cardId from `slugToCardId` mapping
- ✅ Falls back to `card.id` if slug mapping unavailable
- ✅ Uses 0 if no valid cardId available (NOT fallback hash)
- ✅ Updates cardId when metadata fetch completes
- ✅ Handles numeric string IDs correctly (Number(card.id))
- ✅ Handles invalid IDs gracefully (NaN, undefined, negative)

**Validation**: All tests pass, no fallback hash generation occurs

---

### T003: Create `tests/unit/card-sorting-stability.test.ts`
**Description**: Test `computeStackPositions` for consistent output.

**Test Cases**:
- ✅ Same inputs produce same outputs (deterministic)
- ✅ Sort mode "mana" groups by mana cost correctly
- ✅ Sort mode "element" groups by thresholds correctly
- ✅ Handles missing metadata gracefully (default cost=0)
- ✅ Handles cards with null thresholds
- ✅ Stack positions increase monotonically (no overlaps)

**Validation**: Position calculations remain stable across runs

---

## Phase 2: Integration Tests for Tournament Draft (T004-T007)

### T004: Create `tests/integration/tournament/draft-metadata-pipeline.test.tsx`
**Description**: End-to-end test of metadata fetch → categorization → display in TournamentDraft3DScreen.

**Test Scenario**:
```typescript
// Given: User picks 3 cards during tournament draft
// - 1 creature (Azuridge Caravan: atk=1, def=1)
// - 1 spell (Fireball: atk=null, def=null)
// - 1 site (Mountain)
// When: Metadata fetch completes
// Then: picksByType shows { creatures: 1, spells: 1, sites: 1, avatars: 0 }
```

**Validation**:
- ✅ API fetch called with correct slugs
- ✅ cardIds resolved from API response
- ✅ Metadata stored in metaByCardId state
- ✅ picksByType computed correctly
- ✅ UI displays "C 1 S 1 Sites 1"

---

### T005: Create `tests/integration/tournament/draft-metadata-failure.test.tsx`
**Description**: Test graceful handling when metadata fetch fails.

**Test Scenario**:
```typescript
// Given: API returns 500 error or empty response
// When: User picks cards
// Then: Cards still display but categorized as spells (fallback)
// And: No crashes or console errors
```

**Validation**:
- ✅ No uncaught exceptions
- ✅ UI remains functional
- ✅ Cards displayed with basic info (slug, name)

---

### T006: Create `tests/integration/tournament/draft-picks-panel.test.tsx`
**Description**: Test "Your Picks" panel displays correct mana costs and thresholds.

**Test Scenario**:
```typescript
// Given: User has picked 5 cards with varying costs/thresholds
// When: Metadata fetched successfully
// Then: Each card in panel shows:
//   - Correct mana cost badge
//   - Correct threshold icons (fire, water, etc.)
//   - Correct quantity (x1, x2, etc.)
```

**Validation**:
- ✅ Mana cost badges render for each card
- ✅ Threshold icons display correctly
- ✅ Card quantities calculated correctly

---

### T007: Create `tests/integration/tournament/draft-auto-stacking.test.tsx`
**Description**: Test auto-stacking toggle and sort mode changes.

**Test Scenario**:
```typescript
// Given: User has 10 picked cards
// When: Toggle "Auto-stack: On"
// Then: Cards rearrange into sorted stacks
// When: Toggle sort mode "Element"
// Then: Cards regroup by element thresholds
// When: Toggle "Auto-stack: Off"
// Then: Cards remain in current positions (no auto-sort)
```

**Validation**:
- ✅ Stack positions recomputed on toggle
- ✅ Sort mode switch triggers reflow
- ✅ Disabling auto-stack preserves manual positions

---

## Phase 3: Regression Tests for Specific Bugs (T008-T010)

### T008: Create `tests/regression/fallback-id-prevention.test.ts`
**Description**: Prevent regression of the fallback hash ID bug.

**Test Scenario**:
```typescript
// Given: Card picked before metadata fetch completes
// When: Card converted via draftCardToBoosterCard()
// Then: cardId is 0 (NOT 1618760037 or other hash)
// And: After metadata fetch, cardId updated to proper value (e.g., 232)
```

**Validation**:
- ✅ No cardIds > 1,000,000,000 (fallback range)
- ✅ Cards with cardId=0 updated after metadata fetch
- ✅ Metadata lookup succeeds after update

---

### T009: Create `tests/regression/creature-categorization-fix.test.ts`
**Description**: Ensure creatures are never misclassified as spells.

**Test Scenario**:
```typescript
// Given: Cards with attack or defence stats
// When: categorizeCard() called with proper metadata
// Then: All return "creatures" (not "spells")
// And: picksByType.creatures count matches actual creature cards
```

**Validation**:
- ✅ Test with attack=1, defence=null → "creatures"
- ✅ Test with attack=null, defence=1 → "creatures"
- ✅ Test with attack=0, defence=0 → "spells" (0 is not null)

---

### T010: Create `tests/regression/metadata-lookup-after-pick.test.tsx`
**Description**: Verify metadata lookup works immediately after picking a card.

**Test Scenario**:
```typescript
// Given: User picks a card (Azuridge Caravan)
// When: Card added to pick3D state with cardId=0
// And: Metadata fetch triggered
// Then: slugToCardId updated with {"bet_azuridge_caravan_a": 232}
// And: pick3D updated with cardId=232
// And: metaByCardId updated with {232: {cost: 1, attack: 1, defence: 1, ...}}
// And: picksByType immediately reflects correct categorization
```

**Validation**:
- ✅ Metadata fetch triggered on pick
- ✅ State updates occur in correct order
- ✅ UI updates immediately (no manual refresh needed)

---

## Phase 4: Performance and Edge Cases (T011-T012)

### T011: Create `tests/performance/card-categorization-bulk.test.ts`
**Description**: Ensure categorization remains fast with many cards.

**Test Scenario**:
```typescript
// Given: 40 picked cards (typical draft completion)
// When: picksByType computed
// Then: Computation completes in <10ms
```

**Validation**:
- ✅ Benchmark passes with 40 cards
- ✅ Benchmark passes with 100 cards (stress test)
- ✅ No memory leaks or excessive allocations

---

### T012: Create `tests/unit/edge-cases-categorization.test.ts`
**Description**: Test rare edge cases in categorization.

**Test Cases**:
- ✅ Card with type=null → categorized as spell
- ✅ Card with type="" (empty string) → categorized as spell
- ✅ Card with attack=0, defence=0 → categorized as spell (0 != null)
- ✅ Card with attack=-1 (invalid) → categorized as creature (non-null)
- ✅ Card with metadata missing cost field → defaults to cost=0
- ✅ Card with thresholds=null → works without errors

---

## Validation & CI Integration (T013)

### T013: Update CI Pipeline
**Description**: Ensure all new tests run in CI and block merges on failure.

**Changes**:
- ✅ Add test files to Vitest configuration
- ✅ Run `npm run test` in CI (already configured)
- ✅ Add test coverage reporting (optional)
- ✅ Document test patterns in TESTING.md

**Validation**:
- ✅ All tests run in CI pipeline
- ✅ CI fails if any test fails
- ✅ Test results visible in PR checks

---

## Testing the Tests (Meta-validation)

### Verify Regression Detection
1. **Reintroduce the fallback ID bug**: Restore `stableIdFromString()` call in `draftCardToBoosterCard`
2. **Run regression tests**: Tests T008, T009, T010 should FAIL
3. **Fix the bug**: Remove fallback ID call
4. **Run regression tests**: Tests should PASS

### Verify Categorization Coverage
1. **Break categorization logic**: Change `meta.attack !== null` to `meta.attack > 0`
2. **Run unit tests**: Test T001 should FAIL (edge case: attack=0)
3. **Fix the logic**: Restore `!== null` check
4. **Run unit tests**: Test should PASS

---

## Dependencies Between Tasks

```
T001, T002, T003 (Unit tests - can run in parallel)
    ↓
T004, T005, T006, T007 (Integration tests - depend on T001-T003 patterns)
    ↓
T008, T009, T010 (Regression tests - depend on integration test setup)
    ↓
T011, T012 (Performance & edge cases - can run anytime)
    ↓
T013 (CI integration - requires all tests to exist)
```

## Estimated Effort

- **Phase 1** (Unit tests): 2-3 hours
- **Phase 2** (Integration tests): 3-4 hours
- **Phase 3** (Regression tests): 2 hours
- **Phase 4** (Performance): 1 hour
- **Total**: 8-10 hours

## Success Metrics

- ✅ 100% of new tests passing
- ✅ No decrease in existing test coverage
- ✅ CI pipeline runs all tests successfully
- ✅ Regression tests detect reintroduced bugs
- ✅ All tests complete in <30s total
