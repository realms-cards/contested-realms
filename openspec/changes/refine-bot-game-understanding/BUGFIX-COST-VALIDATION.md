# Critical Bugfix: Cost Validation Enforcement

**Date**: 2025-10-14
**Issue**: Bot attempting to play cards with insufficient resources
**Error**: `{ message: 'Insufficient resources to pay costs', code: 'cost_unpaid' }`

## Root Cause

The `generateCandidates()` function was filtering `playableUnits` correctly using `canAffordCard()`, but then calling `playUnitPatch(base, seat, null)` WITHOUT passing the specific card. This caused `playUnitPatch` to call `chooseNonSiteFromHand()` which only checked thresholds, not mana costs.

## Fixes Applied

### 1. Updated `playUnitPatch()` Signature
```javascript
// Before
function playUnitPatch(state, seat, placedCell)

// After
function playUnitPatch(state, seat, placedCell, specificCard = null)
```

Added logic to:
- Accept a specific card to play
- Validate affordability BEFORE creating patch
- Return `null` if card is unaffordable

### 2. Updated `chooseNonSiteFromHand()`
```javascript
// Before
if (hasThresholds(state, seat, req)) return { idx: i, card: c };

// After
if (canAffordCard(state, seat, c)) return { idx: i, card: c };
```

Now uses full cost validation instead of just threshold check.

### 3. Updated `generateCandidates()`
```javascript
// Before
const unitPatch = playUnitPatch(base, seat, null);

// After
const unitPatch = playUnitPatch(base, seat, null, unit); // Pass specific card
```

Now passes the specific pre-validated card from `playableUnits` array.

Also added re-validation after drawing cards:
```javascript
const afterDraw = applyPatch(base, drawSpell);
const affordableAfterDraw = newHand.filter(c => canAffordCard(afterDraw, seat, c));
```

## Validation Layers

The bot now has **3 layers** of cost validation:

1. **Candidate Generation**: `playableUnits` filtered by `canAffordCard()`
2. **Patch Creation**: `playUnitPatch()` validates before creating patch
3. **Fallback**: `chooseNonSiteFromHand()` validates when choosing cards

## Expected Behavior After Fix

- **No more cost_unpaid errors** - illegal moves filtered out
- **Units played only when affordable** - mana + threshold checks
- **Proper candidate distribution** - only legal moves generated

## Testing Recommendations

1. Run self-play match
2. Verify no "Insufficient resources" errors in logs
3. Confirm units are played when mana ≥ 3
4. Check that rootEval has non-zero variance
