# T057: Summoning Sickness Implementation

**Status**: Specification - Phase 2 Scope
**Priority**: CRITICAL (affects all unit actions)
**Estimated Complexity**: High (requires turn tracking and state modeling)

---

## Problem Statement

Bot currently does not implement summoning sickness rules, causing:
1. Units with summoning sickness attempting to attack (illegal)
2. Tapped units not untapping at start of turn
3. All units appear as "tapped" after playing (threats_my = 0)
4. No attacks generated (units never become valid attackers)

---

## Official Rules (from SorceryRulebook.txt)

### Summoning Sickness
> "A unit that entered the realm this turn, whether from being cast or from another card's effect, suffers
> from summoning sickness until the end of turn as it prepares for battle. A unit suffering from summoning
> sickness **cannot tap, or be tapped, to pay for costs associated with any ability**."

> "**Note**: When you summon a unit on your turn, it enters play **untapped**, so you may use it to **defend** on your
> opponent's turn."

### Untap Phase
> "**Step 1.** All of your cards that are tapped now **untap**."

---

## Unit Action Rules

| Action | Summoning Sickness? | Requires Untapped? | Taps Unit? |
|--------|---------------------|-------------------|------------|
| **Move** | ✅ CAN | ✅ Yes | ✅ Yes |
| **Attack** | ❌ CANNOT | ✅ Yes | ✅ Yes |
| **Defend** | ✅ CAN | ✅ Yes | ✅ Yes |
| **Activate Ability** | ❌ CANNOT | ✅ Yes | ✅ Yes |

**Key Insight**: Units enter play **untapped** but with summoning sickness. They can move/defend (which taps them) but cannot attack until next turn.

---

## Current Bot Implementation Issues

### Issue 1: No Turn Tracking
**Problem**: Bot doesn't track which turn units were summoned
**Current State**: `unit.item.tapped` is the only state tracked
**Needed**: `unit.summonedTurn` or `unit.hasSummoningSickness` flag

### Issue 2: No Untap Phase
**Problem**: Units never untap
**Current State**: Once tapped, units remain tapped forever
**Needed**: Untap all friendly units at start of turn

### Issue 3: Attack Generation Filters Tapped Units
**Problem**: `myUnits(state, seat).filter(u => !u.item?.tapped)` returns empty array
**Current Code** (`bots/engine/index.js:717`):
```javascript
function generateMoveCandidates(state, seat) {
  const units = myUnits(state, seat).filter(u => !u.item?.tapped);
  if (!units.length) return [];
  // ... no candidates generated if all units tapped
}
```

### Issue 4: Units Played with `tapped: false` But Immediately Tap
**Current Code** (`bots/engine/index.js:534`):
```javascript
function playUnitPatch(state, seat, placedCell, specificCard = null) {
  // ...
  const patch = { zones: {}, permanents: {} };
  patch.zones[seat] = { ...z, hand };
  patch.permanents[cell] = [...existing, { owner: myNum, card: pick.card, tapped: false }];
  return patch;
}
```
Units are created with `tapped: false`, which is correct per rules, but then something taps them immediately.

---

## Required Changes

### 1. State Tracking (Server-Side or Bot-Side)

**Option A: Server Tracks Summoning Sickness** (PREFERRED)
- Server adds `summonedThisTurn: boolean` flag to permanents
- Server resets flag at end of turn
- Bot reads flag from state

**Option B: Bot Tracks Locally** (FALLBACK)
- Bot maintains `Map<unitKey, summonedTurn>`
- Bot compares `state.turnNumber` to determine if summoning sickness applies
- Requires accurate turn tracking

### 2. Untap Phase Implementation

**Server-Side** (REQUIRED):
```javascript
// At start of active player's turn (Start Phase Step 1)
function untapPhase(state, seat) {
  const permanents = state.permanents || {};
  for (const cell in permanents) {
    const stack = permanents[cell];
    for (const perm of stack) {
      if (perm.owner === seatNum(seat) && perm.tapped) {
        perm.tapped = false; // Untap all owned permanents
      }
    }
  }

  // Untap avatar
  if (state.avatars && state.avatars[seat]) {
    state.avatars[seat].tapped = false;
  }

  // Untap sites
  const sites = state.board?.sites || {};
  for (const cell in sites) {
    const site = sites[cell];
    if (site.owner === seatNum(seat) && site.tapped) {
      site.tapped = false;
    }
  }
}
```

### 3. Bot Attack Generation Fix

**Update `generateMoveCandidates()`** to consider summoning sickness:
```javascript
function generateMoveCandidates(state, seat) {
  // Get untapped units WITHOUT summoning sickness
  const units = myUnits(state, seat).filter(u => {
    if (u.item?.tapped) return false; // Must be untapped
    if (u.item?.summonedThisTurn) return false; // Cannot attack if summoning sickness
    return true;
  });

  if (!units.length) return [];
  // ... rest of attack generation
}
```

**Separately generate MOVE candidates** (no summoning sickness restriction):
```javascript
function generateMoveOnlyCandidates(state, seat) {
  // Units WITH summoning sickness CAN move (but it taps them)
  const units = myUnits(state, seat).filter(u => !u.item?.tapped);
  // ... movement without attack
}
```

### 4. Defend Generation (New Feature)

Units with summoning sickness CAN defend on opponent's turn:
```javascript
function generateDefendCandidates(state, seat, attackingUnit) {
  // Any untapped unit can defend (even with summoning sickness)
  const defenders = myUnits(state, seat).filter(u => !u.item?.tapped);
  // ... blocking logic
}
```

---

## Testing Plan

### Test Case 1: Unit Summoning
1. Play unit on turn 1
2. Verify: `unit.tapped = false, unit.summonedThisTurn = true`
3. Verify: No attack candidates generated
4. Verify: Move candidates generated (if implemented)

### Test Case 2: Untap Phase
1. Start turn 2
2. Verify: All friendly tapped units → `tapped = false`
3. Verify: `summonedThisTurn = false` for units from turn 1
4. Verify: Attack candidates now generated

### Test Case 3: Defending with Summoning Sickness
1. Player 1 plays unit on turn 1
2. Player 2 attacks on turn 2
3. Verify: Player 1's new unit CAN defend (even though summoning sickness)

### Test Case 4: Move Then Attack
1. Unit without summoning sickness
2. Move to adjacent cell (taps unit)
3. Verify: No attack candidates generated (unit is now tapped)

---

## Implementation Order

1. **Server-Side Changes** (REQUIRED FIRST):
   - Implement untap phase in `server/index.js` Start Phase
   - Add `summonedThisTurn` flag to permanents
   - Reset flag at end of turn

2. **Bot-Side Changes** (AFTER SERVER):
   - Update `generateMoveCandidates()` to check `summonedThisTurn`
   - Separate move-only from attack candidates
   - Add defensive candidate generation (Phase 2)

3. **Testing**:
   - Smoke test with single-player match
   - Verify untap phase working
   - Verify attacks generated after turn 1

---

## Dependencies

**Blocked By**:
- Server untap phase implementation (not in bot engine scope)
- Server `summonedThisTurn` flag (state tracking)

**Blocks**:
- Attack generation
- Strategic combat decisions
- Defensive play
- Proper threat assessment (threats_my metric)

---

## Notes

This is a **fundamental game mechanic** that affects all unit actions. The bot cannot play correctly without this implementation. The current workaround (filtering tapped units) prevents ANY attacks from being generated.

**Priority**: Should be implemented BEFORE Phase 2 card-specific evaluations, as it affects all unit-based strategies.

**Estimated Effort**:
- Server: 4-6 hours (untap phase + state tracking)
- Bot: 2-3 hours (attack generation updates)
- Testing: 2 hours
- **Total**: ~8-11 hours
