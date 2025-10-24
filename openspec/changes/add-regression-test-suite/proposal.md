# Add Comprehensive Regression Test Suite

**Change ID**: `add-regression-test-suite`
**Type**: Enhancement
**Status**: Proposed
**Priority**: High

## Why

A critical bug was discovered where cards in the tournament draft "Your Picks" panel displayed with fallback hash IDs (1618760037) instead of proper cardIds. This caused:
- Metadata lookup failures (metadata stored by proper ID, looked up by fallback hash)
- Incorrect categorization (creatures showing as spells because `meta = undefined`)
- Broken card stacking and mana cost display

The bug was fixed by removing fallback ID generation, but there are no tests to prevent this regression. The tournament draft system is now stable and ready for comprehensive test coverage.

## Context

The tournament draft system, card metadata fetching, and sorting logic have stabilized after recent fixes. A recent bug (cards not being recognized in "Your Picks" panel due to fallback ID generation) highlighted the need for comprehensive regression tests to prevent similar issues in the future.

## Problem Statement

Currently, the codebase has:
- **Good coverage** for unit logic (pairing, standings, rules)
- **Good coverage** for integration flows (draft sync, socket messaging)
- **Limited coverage** for UI-critical data flow regressions that occur at component boundaries

Recent regression: Cards displayed with fallback hash IDs (1618760037) instead of proper cardIds, causing metadata lookup failures and incorrect categorization. This wasn't caught by existing tests because:
1. No tests verified the complete metadata fetch → cardId resolution → categorization pipeline
2. No tests verified UI state after card picks with realistic metadata scenarios
3. No tests covered the interaction between `draftCardToBoosterCard`, `slugToCardId mapping`, and `categorizeCard`

## Proposed Solution

Add targeted regression test suites focusing on:

1. **Card Metadata Pipeline Tests**: Verify end-to-end flow from card slug → cardId resolution → metadata lookup → categorization
2. **Draft UI State Tests**: Test TournamentDraft3DScreen's metadata-dependent computations (picksByType, categorization)
3. **Card Sorting Regression Tests**: Ensure `categorizeCard` and stack positioning remain stable
4. **Fallback Prevention Tests**: Explicitly test scenarios where cards might get temporary IDs

## Success Criteria

- ✅ 100% coverage of `categorizeCard` edge cases (missing metadata, null attack/defence, type variations)
- ✅ Integration tests for `TournamentDraft3DScreen` metadata fetch → display flow
- ✅ Regression tests for the fallback ID bug (verify cards use proper IDs, not hash fallbacks)
- ✅ Tests run in <5s (fast feedback for regression detection)
- ✅ Tests fail immediately if categorization or ID resolution regresses

## Impact

- **Prevents regressions** in tournament draft card recognition (major user-facing bug)
- **Documents expected behavior** for card metadata pipeline
- **Enables confident refactoring** of card sorting and categorization logic
- **Fast CI feedback** for breaking changes in metadata flow

## Alternatives Considered

1. **E2E tests only**: Too slow, won't catch unit-level regressions
2. **Manual testing**: Not scalable, doesn't prevent regressions
3. **Snapshot tests**: Brittle, don't explain why failures occur

## Dependencies

- Existing test infrastructure (Vitest, React Testing Library)
- Mock data for card metadata (can reuse existing fixtures)
- No new dependencies required

## Rollout Plan

1. Add unit tests for `categorizeCard` (tests/unit/card-categorization.test.ts)
2. Add integration tests for TournamentDraft3DScreen (tests/integration/tournament-draft-metadata.test.tsx)
3. Add regression tests for specific bug scenarios (tests/regression/fallback-id-prevention.test.ts)
4. Run all tests in CI pipeline (already configured)

## Open Questions

- Should we add visual regression tests for card stacking layout? (Probably not - too brittle)
- Should we test metadata fetch failure scenarios? (Yes - add to integration tests)
- Should we test performance of categorization with 40+ cards? (Optional - add if needed)
