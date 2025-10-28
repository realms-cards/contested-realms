# Rules Engine Architectural Analysis

**Date:** 2025-10-28
**Analyst:** Claude Code
**File Analyzed:** `server/rules/index.js` (727 lines)
**Context:** Post-revert analysis at commit `74ad52c` after fixing tap state issues

---

## Executive Summary

The current rules engine (`server/rules/index.js`) implements basic Sorcery game rules with minimal validation. It works well for casual play but has several architectural gaps that would need addressing for competitive/strict rule enforcement.

**Current State:** ✅ **FUNCTIONAL** for basic gameplay
**Strict Enforcement:** ⚠️ **NEEDS ENHANCEMENT** for competitive play

---

## Detailed Findings

### 1. ✅ WORKING CORRECTLY

#### 1.1 Turn Start Mechanics (Lines 285-353)
**Function:** `applyTurnStart(game)`

**Current Implementation:**
- ✅ Untaps permanents owned by current player
- ✅ Untaps avatar of current player
- ✅ Resets `spentThisTurn` resource counter
- ✅ Clears summoning sickness (`summonedThisTurn` flag)
- ✅ **RECENTLY FIXED:** Turn tracking prevents spurious untaps

**Code Quality:** EXCELLENT
**Blocker Status:** NO BLOCKER

**Recent Fix Applied:**
```javascript
// Track turn numbers per player to detect actual turn changes
const turnTracking = game.turnTracking || { p1: 0, p2: 0 };
const currentTurn = game.turn || 1;
const lastTurnForPlayer = turnTracking[playerKey] || 0;

// Only untap if the turn actually incremented
if (currentTurn <= lastTurnForPlayer) {
  return null; // Prevents untapping on every patch!
}
```

**Recommendation:** No changes needed. System is robust after turn tracking fix.

---

#### 1.2 Site Placement Rules (Lines 379-416)
**Function:** `validateAction()` - Board.sites validation

**Rules Enforced:**
1. ✅ **First Site Rule:** Must be placed at avatar position
2. ✅ **Adjacency Rule:** Subsequent sites must be adjacent to owned sites
3. ✅ **Ownership Validation:** Cannot place sites owned by opponent
4. ✅ **Spatial Validation:** Coordinates must be in bounds

**Code Example:**
```javascript
// First site must be placed at the avatar's position
if (sitesOwned === 0 && meKey) {
  const av = avatars[meKey] || {};
  const pos = Array.isArray(av.pos) ? av.pos : null;
  if (pos) {
    const atKey = `${pos[0]},${pos[1]}`;
    if (key !== atKey) {
      return { ok: false, error: `First site must be played at your avatar's ${cellRef}` };
    }
  }
}

// Subsequent sites must be adjacent
if (sitesOwned > 0 && !isAdjacentToOwnedSite(game, meNum, key)) {
  return { ok: false, error: `New sites must be adjacent to your existing sites` };
}
```

**Blocker Status:** NO BLOCKER
**Recommendation:** Working as designed. No changes needed.

---

#### 1.3 Mana & Cost System (Lines 540-608)
**Function:** `ensureCosts()` - Resource validation

**Current Model:** Per-turn spend tracking (not tap-based)

**Rules Enforced:**
1. ✅ **Cost Calculation:** Cards have costs from metadata
2. ✅ **Available Mana:** Owned sites + mana-providing permanents
3. ✅ **Spend Tracking:** `spentThisTurn` counter prevents overspending
4. ✅ **Avatar Tap Cost:** Playing a site requires untapped avatar
5. ✅ **Auto-patch Generation:** Automatically taps avatar and updates `spentThisTurn`

**Code Example:**
```javascript
// Mana spend check
const ownedSiteCount = countOwnedManaSites(game, meNum);
const manaProviders = countManaProvidersFromPermanents(game, meNum);
const spentPrev = game.resources[meKey].spentThisTurn || 0;
const available = Math.max(0, ownedSiteCount + manaProviders - spentPrev);

if (totalCost > available) {
  return { ok: false, error: 'Insufficient resources to pay costs' };
}

// Auto-tap avatar when placing site
if (placingNewSite) {
  if (tappedPrev) {
    return { ok: false, error: 'Avatar must be untapped to play a site' };
  }
  auto.avatars[meKey] = { ...avPrev, tapped: true };
}
```

**Blocker Status:** NO BLOCKER
**Recommendation:** Working as designed. Matches Sorcery's per-turn resource model.

---

#### 1.4 Combat Resolution (Lines 675-725)
**Function:** `applyMovementAndCombat()`

**Current Implementation:**
- ✅ Detects when both players have units on same cell
- ✅ Calculates total damage dealt by each side
- ✅ Simultaneous damage (not first-strike)
- ✅ Removes units with `damage >= life`
- ✅ Generates combat events for logging

**Code Example:**
```javascript
// Resolve simultaneous damage
const dmgToMine = theirs.reduce((s, u) => s + getCardStats(u.card).power, 0);
const dmgToTheirs = mine.reduce((s, u) => s + getCardStats(u.card).power, 0);

const survivorsMine = mine.filter((u) => getCardStats(u.card).life > dmgToMine);
const survivorsTheirs = theirs.filter((u) => getCardStats(u.card).life > dmgToTheirs);

result.permanents[k] = [...survivorsMine, ...survivorsTheirs];
```

**Blocker Status:** NO BLOCKER
**Recommendation:** Basic combat works. See "Future Enhancements" for advanced features.

---

### 2. ⚠️ ARCHITECTURAL GAPS (Strict Mode Needed)

#### 2.1 🔴 CRITICAL: Summoning Sickness Disabled (Lines 598-600)

**Status:** DEFERRED DUE TO REGRESSION

**Code Comment:**
```javascript
// T057/T070: Summoning sickness DEFERRED
// All implementations cause "Insufficient resources" regressions
// Root cause: Unknown interaction between WeakSet tracking and cost validation
```

**Impact:**
- Units can attack/move immediately when played
- Breaks competitive balance
- Game-breaking for tournament play

**Root Cause:** Unknown interaction between:
- `markAndCountNewPlacements()` using `WeakSet` to track new cards
- `ensureCosts()` mana validation
- Results in false "Insufficient resources" errors

**Blocker Level:** 🔴 **CRITICAL** for strict mode
**Priority:** HIGH

**Recommended Investigation:**
1. Add detailed logging to `markAndCountNewPlacements()`
2. Check if WeakSet references are lost during deep merge
3. Consider switching to `instanceId`-based tracking instead of WeakSet
4. Test summoning sickness separately from cost validation

**Recommended Fix Approach:**
```javascript
// Option 1: Track by instanceId instead of WeakSet
function wasJustPlayed(permanent, game) {
  const instanceId = permanent.card?.instanceId;
  if (!instanceId) return false;

  // Check if instanceId exists in zones but not in previous permanents
  const inZones = checkZonesForInstanceId(game.zones, instanceId);
  const inPrevPermanents = checkPermanentsForInstanceId(game.permanents, instanceId);

  return inZones && !inPrevPermanents;
}

// Option 2: Explicit summonedThisTurn flag (already partially implemented)
// Just need to enforce it:
function canUnitMove(permanent) {
  if (permanent.summonedThisTurn) {
    return { ok: false, error: 'Unit has summoning sickness' };
  }
  return { ok: true };
}
```

---

#### 2.2 🟡 MEDIUM: Movement Validation Not Enforced (Lines 418-475)

**Status:** WARNS BUT DOES NOT BLOCK

**Current Code:**
```javascript
// Detect invalid movement
if (isMove && !validMove) {
  console.warn('[Rules] Invalid movement detected:', { from: k1, to: k2 });
  // ⚠️ NO RETURN HERE - validation continues!
}
```

**Impact:**
- Players can move units to non-adjacent cells
- Diagonal movement allowed (should be orthogonal only)
- Exploitable in PvP if players know about it

**Blocker Level:** 🟡 **MEDIUM** for strict mode
**Priority:** MEDIUM

**Recommended Fix:**
```javascript
// Lines 418-475 - Add enforcement
if (isMove && !validMove) {
  return {
    ok: false,
    error: 'Units can only move to orthogonally adjacent cells'
  };
}
```

**Additional Validation Needed:**
```javascript
// Enforce movement rules
function validateMovement(game, action, playerId) {
  const permanent = /* extract moving permanent */;

  // Check summoning sickness
  if (permanent.summonedThisTurn) {
    return { ok: false, error: 'Unit has summoning sickness' };
  }

  // Check if unit is tapped
  if (permanent.tapped) {
    return { ok: false, error: 'Tapped units cannot move' };
  }

  // Check distance
  if (!isOrthogonalStep(game, fromKey, toKey)) {
    return { ok: false, error: 'Units move one cell orthogonally' };
  }

  return { ok: true };
}
```

---

#### 2.3 🟡 MEDIUM: No Tap-to-Attack Enforcement

**Status:** NOT IMPLEMENTED

**Current Behavior:**
- Units can attack without tapping
- No validation that attacking unit is untapped
- Units could theoretically attack multiple times per turn

**Impact:**
- Players could attack, untap (via effects), and attack again
- Breaks action economy

**Blocker Level:** 🟡 **MEDIUM** for strict mode
**Priority:** MEDIUM

**Recommended Fix:**
```javascript
function applyMovementAndCombat(prevGame, action, playerId, context) {
  // ... existing code ...

  // Before combat, verify units are untapped and tap them
  const combatPatch = { permanents: {} };

  for (const k of keys) {
    const mine = /* units engaging in combat */;

    // Tap attacking units
    const tappedUnits = mine.map(unit => {
      if (unit.tapped) {
        // Error: cannot attack with tapped unit
        throw new Error('Cannot attack with tapped units');
      }
      return { ...unit, tapped: true };
    });

    combatPatch.permanents[k] = tappedUnits;
  }

  // Merge combat patch with damage resolution
  return deepMerge(combatPatch, damageResolution);
}
```

---

#### 2.4 🟢 LOW: Combat Assumes Owner-Based Teams (Lines 697-706)

**Status:** WORKS FOR 1v1, LIMITED FOR ADVANCED SCENARIOS

**Current Code:**
```javascript
// Assumes ALL owner=1 cards fight ALL owner=2 cards
if (Number(it.owner) === 1) mine.push(it);
else theirs.push(it);
```

**Impact:**
- Works perfectly for standard 1v1 matches
- Already handles control effects correctly (owner field updates)
- Would break for:
  - 2v2 team matches
  - Free-for-all multiplayer
  - Temporary alliance effects

**Blocker Level:** 🟢 **LOW** - Not needed for current architecture
**Priority:** LOW

**Future Enhancement (if needed):**
```javascript
// Add alliance/team tracking
function getCombatTeams(permanents, teamSystem) {
  if (teamSystem === 'owner-based') {
    // Current implementation
    return { team1: owner1Units, team2: owner2Units };
  }

  if (teamSystem === 'alliance-based') {
    // Group by alliance field instead of owner
    return groupByAlliance(permanents);
  }
}
```

---

#### 2.5 🟢 LOW: No Stack/Instant-Speed Interaction

**Status:** NOT IMPLEMENTED (Out of scope for current architecture)

**Missing Features:**
- No priority system
- No stack for resolving effects
- No instant-speed responses
- All actions resolve immediately

**Impact:**
- Cannot interrupt opponent's actions
- No "combat tricks" or instant-speed removal
- Simplified but functional for basic gameplay

**Blocker Level:** 🟢 **LOW** - Not part of current design goals
**Priority:** LOW (Future Phase)

**If Implementing:**
Would require major architectural changes:
- Client-server round-trip for each stack action
- Priority passing system
- Action windows (beginning of combat, end of turn, etc.)
- Timing rules enforcement

---

### 3. 🔵 CODE QUALITY OBSERVATIONS

#### 3.1 Cost Validation Order (Lines 540-608)
**Observation:** Cost validation happens BEFORE auto-patch generation

**Current Flow:**
1. Calculate total cost of action
2. Check if player can afford it
3. Generate auto-patch (update `spentThisTurn`, tap avatar)
4. Return success + auto-patch

**Assessment:** ✅ **WORKS CORRECTLY**
This is actually the correct order - validate first, then modify.

**Code Smell Level:** VERY LOW (just documentation)

---

#### 3.2 Error Handling Consistency
**Observation:** Try-catch blocks return `{ ok: true }` on errors

**Code Pattern:**
```javascript
function validateAction(game, action, playerId, context) {
  try {
    // ... validation logic ...
    return { ok: true };
  } catch {
    return { ok: true }; // ⚠️ Fails open, not closed
  }
}
```

**Impact:**
- Errors in validation logic don't block invalid actions
- "Fail-open" security model
- Could allow exploits if validation code crashes

**Recommendation for Strict Mode:**
```javascript
} catch (error) {
  console.error('[Rules] Validation error:', error);
  return {
    ok: false,
    error: 'Internal validation error - action rejected for safety'
  };
}
```

---

#### 3.3 Card Stats Fallback Chain
**Observation:** Multiple fallback sources for card stats

**Chain:**
1. Check card ref object (`card.power`, `card.life`)
2. Check database by slug
3. Check database by name
4. Default to `{ power: 1, life: 1 }`

**Assessment:** ✅ **ROBUST**
Good defensive programming.

---

## Priority Recommendations for Strict Mode

### 🔴 CRITICAL (Must Fix)
1. **Summoning Sickness Regression**
   - Investigate WeakSet interaction with cost validation
   - Implement robust `summonedThisTurn` enforcement
   - Add comprehensive tests

### 🟡 HIGH (Should Fix)
2. **Movement Validation Enforcement**
   - Change warnings to hard blocks
   - Add `return { ok: false }` for invalid moves
   - Enforce tap-to-move rules

3. **Tap-to-Attack Enforcement**
   - Verify units are untapped before combat
   - Auto-tap attacking units
   - Prevent multi-attack exploits

### 🟢 MEDIUM (Nice to Have)
4. **Error Handling**
   - Change try-catch to fail-closed
   - Add detailed error logging
   - Return validation errors instead of silent success

5. **Movement Rules Enhancement**
   - Add terrain effects (if applicable)
   - Add unit-specific movement patterns (flying, etc.)
   - Add range-based attacks vs melee

### 🔵 LOW (Future Phases)
6. **Advanced Combat**
   - First-strike mechanics
   - Defender assignment
   - Combat damage prevention/redirection

7. **Stack System**
   - Priority passing
   - Instant-speed responses
   - Triggered abilities

---

## Testing Recommendations

### Test Suite Needed for Strict Mode:

```javascript
describe('Rules Engine - Strict Mode', () => {
  describe('Summoning Sickness', () => {
    it('prevents newly played units from moving');
    it('prevents newly played units from attacking');
    it('allows units to move/attack on next turn');
    it('does not trigger false "insufficient resources" errors');
  });

  describe('Movement Validation', () => {
    it('allows orthogonal movement to adjacent cells');
    it('blocks diagonal movement');
    it('blocks movement to non-adjacent cells');
    it('blocks movement by tapped units');
  });

  describe('Combat Enforcement', () => {
    it('taps units when they attack');
    it('blocks attacks by already-tapped units');
    it('prevents multiple attacks by same unit');
  });

  describe('Error Handling', () => {
    it('rejects actions when validation crashes');
    it('provides clear error messages');
    it('logs validation failures for debugging');
  });
});
```

---

## Conclusion

**Current State:** The rules engine provides a solid foundation for basic Sorcery gameplay. Core mechanics (turn structure, mana system, site placement, basic combat) work correctly and reliably.

**For Competitive Play:** Three main gaps need addressing:
1. **Summoning sickness enforcement** (game-breaking if missing)
2. **Movement validation** (exploitable)
3. **Tap-to-attack enforcement** (breaks action economy)

**Effort Estimate:**
- 🔴 Critical fixes: ~2-3 days of development + testing
- 🟡 High priority: ~1-2 days
- Total for strict mode: ~1 week

**Risk Assessment:** LOW - Fixes are well-scoped and don't require architectural changes. The biggest unknown is the summoning sickness WeakSet interaction, which needs investigation.

---

**Document Version:** 1.0
**Last Updated:** 2025-10-28
**Next Review:** After summoning sickness fix is implemented
