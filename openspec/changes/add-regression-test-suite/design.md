# Design: Comprehensive Regression Test Suite

## Architecture Overview

The regression test suite is organized into 4 layers, each building on the previous:

```
┌─────────────────────────────────────────────────────────────┐
│  Phase 4: Performance & Edge Cases (T011-T012)              │
│  - Bulk categorization performance                          │
│  - Rare edge case coverage                                  │
└─────────────────────────────────────────────────────────────┘
                          ▲
┌─────────────────────────────────────────────────────────────┐
│  Phase 3: Regression Tests (T008-T010)                      │
│  - Fallback ID prevention                                   │
│  - Creature categorization fix                              │
│  - Metadata lookup after pick                               │
└─────────────────────────────────────────────────────────────┘
                          ▲
┌─────────────────────────────────────────────────────────────┐
│  Phase 2: Integration Tests (T004-T007)                     │
│  - Tournament draft metadata pipeline                       │
│  - Metadata failure handling                                │
│  - Picks panel display                                      │
│  - Auto-stacking behavior                                   │
└─────────────────────────────────────────────────────────────┘
                          ▲
┌─────────────────────────────────────────────────────────────┐
│  Phase 1: Unit Tests (T001-T003)                            │
│  - Card categorization logic                                │
│  - CardId resolution                                        │
│  - Stack position calculation                               │
└─────────────────────────────────────────────────────────────┘
```

## Design Principles

### 1. Test Pyramid Structure
- **Unit tests (60%)**: Fast, isolated, test pure functions
- **Integration tests (30%)**: Test component interactions with mocked APIs
- **Regression tests (10%)**: Test specific bug scenarios end-to-end

### 2. Test Naming Convention
```typescript
describe("Feature: Card Categorization", () => {
  describe("Given a card with attack stats", () => {
    it("should categorize as creature", () => { ... });
  });

  describe("Given a card with no metadata", () => {
    it("should categorize as spell (fallback)", () => { ... });
  });
});
```

**Pattern**: `describe(Feature) → describe(Given context) → it(should behavior)`

### 3. Test Data Strategy

**Shared Fixtures** (`tests/fixtures/card-data.ts`):
```typescript
export const MOCK_CARDS = {
  creature: {
    slug: "bet_azuridge_caravan_a",
    cardId: 232,
    cardName: "Azuridge Caravan",
    type: "Minion",
    meta: { cost: 1, attack: 1, defence: 1, thresholds: { water: 1 } }
  },
  spell: {
    slug: "bet_fireball_a",
    cardId: 150,
    cardName: "Fireball",
    type: "Magic",
    meta: { cost: 3, attack: null, defence: null, thresholds: { fire: 2 } }
  },
  site: {
    slug: "bet_mountain_a",
    cardId: 45,
    cardName: "Mountain",
    type: "Site",
    meta: { cost: 0, attack: null, defence: null, thresholds: { fire: 1 } }
  },
  avatar: {
    slug: "bet_nyx_a",
    cardId: 10,
    cardName: "Nyx, Spirit of Chaos",
    type: "Avatar",
    meta: { cost: 0, attack: null, defence: null, thresholds: null }
  }
};
```

**Reusable across all test phases** to maintain consistency.

---

## Test Implementation Patterns

### Pattern 1: Pure Function Unit Tests

**File**: `tests/unit/card-categorization.test.ts`

```typescript
import { describe, it, expect } from "vitest";
import { categorizeCard } from "@/lib/game/cardSorting";
import { MOCK_CARDS } from "../fixtures/card-data";

describe("Feature: Card Categorization", () => {
  describe("Given a card with attack or defence", () => {
    it("should categorize as creature when attack is non-null", () => {
      const result = categorizeCard(
        MOCK_CARDS.creature,
        MOCK_CARDS.creature.meta
      );
      expect(result).toBe("creatures");
    });

    it("should categorize as creature when defence is non-null", () => {
      const card = { ...MOCK_CARDS.creature };
      const meta = { ...MOCK_CARDS.creature.meta, attack: null, defence: 1 };
      expect(categorizeCard(card, meta)).toBe("creatures");
    });
  });

  describe("Given a card with no metadata", () => {
    it("should categorize as spell (fallback)", () => {
      const result = categorizeCard(MOCK_CARDS.spell, undefined);
      expect(result).toBe("spells");
    });
  });

  describe("Given a card with type Site", () => {
    it("should categorize as site regardless of metadata", () => {
      const result = categorizeCard(
        MOCK_CARDS.site,
        MOCK_CARDS.site.meta
      );
      expect(result).toBe("sites");
    });
  });
});
```

**Key aspects**:
- No mocks needed (pure functions)
- Tests run in <1ms each
- Clear Given-When-Then structure

---

### Pattern 2: Component Integration Tests with Mock API

**File**: `tests/integration/tournament/draft-metadata-pipeline.test.tsx`

```typescript
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import TournamentDraft3DScreen from "@/components/game/TournamentDraft3DScreen";
import { MOCK_CARDS } from "../../fixtures/card-data";

// Mock the metadata fetch API
global.fetch = vi.fn();

describe("Feature: Tournament Draft Metadata Pipeline", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Mock successful metadata API response
    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => [
        { slug: "bet_azuridge_caravan_a", cardId: 232, cost: 1, attack: 1, defence: 1, thresholds: { water: 1 } },
        { slug: "bet_fireball_a", cardId: 150, cost: 3, attack: null, defence: null, thresholds: { fire: 2 } }
      ]
    });
  });

  describe("Given user picks cards during draft", () => {
    it("should fetch metadata and categorize correctly", async () => {
      // Arrange: Mock draft state with picked cards
      const mockDraftState = {
        phase: "picking",
        picks: [
          [{ slug: "bet_azuridge_caravan_a", id: "1", cardName: "Azuridge Caravan", type: "Minion" }],
          [{ slug: "bet_fireball_a", id: "2", cardName: "Fireball", type: "Magic" }]
        ]
      };

      // Act: Render component
      render(<TournamentDraft3DScreen {...mockProps} />);

      // Assert: Verify metadata fetch called
      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          expect.stringContaining("/api/cards/meta-by-variant"),
          expect.any(Object)
        );
      });

      // Assert: Verify UI shows correct categorization
      await waitFor(() => {
        expect(screen.getByText(/C 1 S 1/)).toBeInTheDocument();
      });
    });
  });
});
```

**Key aspects**:
- Mock fetch API for controlled testing
- Wait for async effects to complete
- Verify both API calls and UI updates

---

### Pattern 3: Regression Tests for Specific Bugs

**File**: `tests/regression/fallback-id-prevention.test.ts`

```typescript
import { describe, it, expect } from "vitest";
import { draftCardToBoosterCard } from "@/components/game/TournamentDraft3DScreen";

describe("Regression: Fallback ID Bug Prevention", () => {
  describe("Given a card picked before metadata fetch", () => {
    it("should NOT generate fallback hash IDs", () => {
      const card = {
        id: "draft_card_123",
        slug: "bet_azuridge_caravan_a",
        cardName: "Azuridge Caravan",
        type: "Minion"
      };

      const slugToCardId = {}; // Empty map (metadata not loaded yet)

      const result = draftCardToBoosterCard(card, slugToCardId);

      // CRITICAL: cardId should be 0 (awaiting metadata), NOT > 1,000,000,000
      expect(result.cardId).toBe(0);
      expect(result.cardId).toBeLessThan(1_000_000_000);
    });

    it("should update cardId when metadata arrives", () => {
      const card = {
        id: "draft_card_123",
        slug: "bet_azuridge_caravan_a",
        cardName: "Azuridge Caravan",
        type: "Minion"
      };

      const slugToCardId = { "bet_azuridge_caravan_a": 232 };

      const result = draftCardToBoosterCard(card, slugToCardId);

      // After metadata fetch, cardId should be proper DB id
      expect(result.cardId).toBe(232);
    });
  });
});
```

**Key aspects**:
- Tests the exact bug scenario that occurred
- Explicit assertions on cardId ranges
- Documents why the test exists (regression prevention)

---

## Test Execution Strategy

### Local Development
```bash
# Run all tests
npm run test

# Run only unit tests (fast feedback)
npm run test tests/unit

# Run only regression tests
npm run test tests/regression

# Watch mode for TDD
npm run test -- --watch tests/unit/card-categorization.test.ts
```

### CI Pipeline
```yaml
# .github/workflows/test.yml (existing, no changes needed)
- name: Run Tests
  run: npm run test -- --coverage

- name: Check Coverage
  run: |
    if [ $(cat coverage/coverage-summary.json | jq '.total.lines.pct') -lt 80 ]; then
      echo "Coverage below 80%"
      exit 1
    fi
```

---

## Mocking Strategy

### What to Mock
- ✅ **API fetch calls**: Always mock in unit/integration tests
- ✅ **Socket.IO transport**: Mock for integration tests
- ✅ **React Three Fiber Canvas**: Use `vi.mock("@react-three/fiber")`
- ✅ **LocalStorage**: Mock with in-memory implementation

### What NOT to Mock
- ❌ **Pure functions** (`categorizeCard`, `computeStackPositions`)
- ❌ **Type definitions** (use real types)
- ❌ **Test utilities** (use real `@testing-library/react`)

### Mock Implementation Pattern

```typescript
// tests/mocks/api.ts
import { vi } from "vitest";

export const mockMetadataAPI = (cards: Array<{slug: string, cardId: number, ...}>) => {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => cards
  });
};

export const mockMetadataAPIFailure = () => {
  global.fetch = vi.fn().mockResolvedValue({
    ok: false,
    status: 500
  });
};
```

Usage in tests:
```typescript
import { mockMetadataAPI } from "../../mocks/api";

beforeEach(() => {
  mockMetadataAPI([
    { slug: "bet_azuridge_caravan_a", cardId: 232, cost: 1, attack: 1, defence: 1 }
  ]);
});
```

---

## Performance Considerations

### Test Execution Speed

**Target**: All tests complete in <30 seconds total

| Test Phase | Count | Time Budget | Actual (estimated) |
|------------|-------|-------------|-------------------|
| Unit tests | ~30   | <5s         | ~2s               |
| Integration tests | ~10 | <15s    | ~10s              |
| Regression tests | ~6  | <5s       | ~3s               |
| Performance tests | ~2 | <5s      | ~4s               |
| **Total** | **~48** | **<30s** | **~19s**         |

### Optimization Techniques

1. **Parallel execution**: Vitest runs tests in parallel by default
2. **Minimal setup**: Use `beforeEach` only when necessary
3. **Avoid real timers**: Use `vi.useFakeTimers()` for time-based tests
4. **Reuse fixtures**: Share mock data across tests

---

## Coverage Goals

### Coverage Targets

| Module | Current Coverage | Target Coverage |
|--------|-----------------|-----------------|
| `cardSorting.ts` | ~70% | **100%** |
| `TournamentDraft3DScreen.tsx` | ~30% | **80%** (focus on metadata logic) |
| `draftCardToBoosterCard` | 0% | **100%** |
| `categorizeCard` | ~50% | **100%** |

### Coverage Strategy

- **Unit tests**: Aim for 100% line coverage of pure functions
- **Integration tests**: Aim for 80% coverage of critical UI paths
- **Regression tests**: Don't aim for coverage %, aim for bug prevention

---

## Maintenance Plan

### When to Update Tests

1. **New card type added**: Update `categorizeCard` tests with new type
2. **Metadata schema changes**: Update mock fixtures
3. **New categorization logic**: Add corresponding unit tests
4. **Bug discovered**: Add regression test before fixing

### Test Review Checklist

- ✅ Test name clearly describes what is being tested
- ✅ Test uses Given-When-Then structure
- ✅ Test has exactly one assertion (or tightly related assertions)
- ✅ Test mocks external dependencies (API, sockets, timers)
- ✅ Test fails when expected (test the test)
- ✅ Test runs in <500ms (unit) or <5s (integration)

---

## Risk Mitigation

### What Could Go Wrong

| Risk | Mitigation |
|------|-----------|
| Tests become flaky | Use `waitFor` with proper timeouts, avoid race conditions |
| Tests break on refactoring | Test behavior, not implementation details |
| Tests run too slowly | Profile slow tests, add parallelization, use mocks |
| Tests don't catch regressions | Add meta-validation (test the tests) |

### Rollback Plan

If tests cause problems:
1. Identify failing tests
2. Skip tests temporarily: `it.skip("...", () => {})`
3. Fix underlying issue
4. Re-enable tests
5. Verify all tests pass

**DO NOT**: Delete tests to make CI green. Fix the root cause.

---

## Success Validation

### How We Know This Works

1. **Reintroduce the bug**: Restore fallback ID generation
   - **Expected**: Regression tests T008, T009, T010 FAIL
   - **Validates**: Tests detect the exact bug we're preventing

2. **Break categorization**: Change attack check from `!== null` to `> 0`
   - **Expected**: Unit test T001 FAILS (edge case: attack=0)
   - **Validates**: Tests catch logic errors

3. **Simulate API failure**: Mock 500 error response
   - **Expected**: Integration test T005 PASSES (graceful handling)
   - **Validates**: Tests verify error scenarios

If all three validations pass, the test suite is working correctly.
