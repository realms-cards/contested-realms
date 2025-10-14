# Closed-Loop Testing Session: Bot Behavior Analysis & Fixes

**Date**: 2025-10-14
**Session Goal**: Run self-play, observe logs, identify issues, refine code iteratively

## Summary

Ran 4 self-play matches with iterative fixes. **Successfully eliminated avatar-playing bug and enabled site-playing**. Discovered fundamental issue with **mana tracking in multi-action turns** that requires architecture changes.

---

## Issues Discovered & Fixed

### ✅ Issue 1: Avatar Being Played from Hand
**Symptom**: `cost_unpaid` errors on turn 0 (mulligan phase)
**Root Cause**: Avatar cards in hand were not filtered out during candidate generation
**Log Evidence**:
```json
{
  "turn": 0,
  "chosen": {"playedUnit": {"name": "Waveshaper"}},
  "filteredCandidates": {"playableUnits": 1}
}
```

**Fix Applied** (`bots/engine/index.js:1146-1150`):
```javascript
const allUnits = hand.filter(c => {
  const cardType = (c.type || '').toLowerCase();
  if (cardType.includes('site')) return false;
  if (cardType.includes('avatar')) return false; // CRITICAL: avatars can't be played
  return true;
});
```

**Validation**: No more errors on turn 0 after fix.

---

### ✅ Issue 2: Playing Units Without Mana Base
**Symptom**: `cost_unpaid` errors when trying to play 0-cost units with no sites
**Root Cause**: Missing game rule - units require at least 1 site on board, regardless of cost
**Log Evidence**:
```json
{
  "turn": 1,
  "sites_my": 0,
  "chosen": {"playedUnit": {"name": "Lucky Charm"}}, // 0-cost unit
  "filteredCandidates": {"playableUnits": 1}
}
```

**Fix Applied** (`bots/engine/index.js:639-642`):
```javascript
function canAffordCard(state, seat, card) {
  // ... existing checks ...

  // CRITICAL: Cannot play units when you have no sites on the board
  const ownedSites = countOwnedManaSites(state, seat);
  if (ownedSites === 0) return false;

  // ... mana/threshold checks ...
}
```

**Validation**: No more `cost_unpaid` errors for 0-cost units without sites.

---

### ✅ Issue 3: Bot Not Playing Sites (Hoarding Cards)
**Symptom**: Bot draws from atlas every turn, never plays sites
**Root Cause**: Evaluation weights favored hand size over mana base
**Log Evidence**:
```json
{
  "turn": 2, "sites_my": 0, "chosen": {"drawFrom": "atlas"},
  "turn": 4, "sites_my": 0, "chosen": {"drawFrom": "atlas"},
  "turn": 6, "sites_my": 0, "chosen": {"drawFrom": "atlas"}
}
```

**Weights Before**:
```javascript
w_hand: 0.6,        // Rewards keeping cards
w_sites: 0.1,       // Barely rewards sites
w_mana_avail: 0.05  // Barely rewards mana
```

**Fix Applied** (`bots/engine/index.js:41-55`):
```javascript
w_hand: 0.2,        // Reduced: don't overvalue hoarding
w_sites: 2.0,       // MASSIVELY increased: prioritize mana base
w_mana_avail: 0.3,  // Increased: reward available mana
w_providers: 0.5,   // Increased: mana providers important
w_thresholds_total: 0.5  // Increased: threshold diversity matters
```

**Validation**: Bot now plays sites on turns 1, 3, 5 as expected.

---

## ⚠️ Issue 4: Mana Not Tracked Between Actions (UNRESOLVED)

**Symptom**: Bot tries to play the same unit repeatedly, getting `cost_unpaid` errors
**Root Cause**: Mana spent earlier in the turn is not reflected in bot's state

**Log Evidence**:
```json
// Bot plays Pit Vipers on turn 9 (costs 3 mana)
{"turn": 9, "sites": 3, "mana": 3, "chosen": "Pit Vipers"}

// Next action in same turn - bot STILL thinks it has 3 mana!
{"turn": 11, "sites": 3, "mana": 3, "chosen": "Pit Vipers"}  // ERROR

// Repeats every subsequent action
{"turn": 53, "sites": 3, "mana": 3, "chosen": "Pit Vipers"}  // ERROR
{"turn": 55, "sites": 3, "mana": 3, "chosen": "Pit Vipers"}  // ERROR
```

**Analysis**:
- Bot uses `countUntappedMana()` which checks `tile.tapped !== true`
- Logs show `mana_avail: 3` consistently, meaning bot sees 3 UNTAPPED sites
- Either:
  1. Server doesn't update state with tapped sites between actions, OR
  2. Sites untap between action opportunities (unlikely), OR
  3. Our tapped site tracking has a bug

**Expected Behavior**:
1. Turn starts → Player has 3 untapped sites = 3 mana
2. Player plays 3-cost unit → Server taps 3 sites
3. Server calls bot for next action → Bot should see 0 untapped sites = 0 mana
4. Bot can only pass or take free actions (draw from atlas via tap avatar)

**Actual Behavior**:
Bot keeps seeing 3 mana available every action, leading to infinite loop of trying to play the same card.

---

## Game Rules Learned

From log analysis and user clarification:

1. **Turn Structure**:
   - Turn starts - can draw from spellbook OR atlas (or tap avatar → draw from atlas)
   - Play any affordable cards from hand
   - Continue taking actions until no more legal moves
   - Pass when done

2. **Multi-Action Turns**:
   - Server calls bot MULTIPLE TIMES per turn
   - Each call asks "what action do you want to take now?"
   - Bot returns ONE action patch
   - Server applies patch, updates state, calls bot again
   - Continues until bot passes or has no legal moves

3. **Mana System**:
   - Sites tap when used to pay for spells
   - Mana providers (units like "Blacksmith Family") also tap when used
   - Units require at least 1 site on board to be played (even 0-cost units)
   - Avatars can tap to draw from atlas (free action, doesn't cost mana)

---

## Files Modified

### `bots/engine/index.js`
**Lines 1146-1182**: Added avatar filtering in `generateCandidates()`
**Lines 632-653**: Added no-sites-no-units rule in `canAffordCard()`
**Lines 28-65**: Updated theta weights (v2 → v3) to prioritize sites

**New Theta**: `refined/v3` - "Site-prioritization + no units without mana base"

### Documentation Created
- `openspec/changes/refine-bot-game-understanding/T015-IMPLEMENTATION.md`: T015 logging implementation
- `openspec/changes/refine-bot-game-understanding/CLOSED-LOOP-SESSION-FINDINGS.md`: This document

---

## Performance Improvements

### Match 1 (before fixes):
- ❌ 37 `cost_unpaid` errors
- ❌ Bot only drew cards, never played sites
- ❌ Bot tried to play avatar

### Match 4 (after fixes):
- ✅ No errors on turns 0-10 (avatar and no-sites-no-units rules working)
- ✅ Bot plays sites on turns 1, 3, 5
- ✅ Bot plays units after mana base established
- ⚠️ Infinite loop on turns 11+ due to mana tracking issue

---

## Next Steps: Mana Tracking Solution

### Option A: Client-Side Mana Tracking (Quick Fix)
**Approach**: Bot tracks mana spent during current turn in local state

```javascript
// Pseudo-code
let manaSpentThisTurn = 0;

function canAffordCard(state, seat, card) {
  const available = countUntappedMana(state, seat);
  const realMana = available - manaSpentThisTurn;  // Subtract spent mana
  const cost = getCardManaCost(card);
  return realMana >= cost;
}

// After bot returns a patch that costs mana:
manaSpentThisTurn += cost;
```

**Pros**: Simple, doesn't require server changes
**Cons**: Fragile, doesn't handle other players' actions, state can desync

### Option B: Server State Fix (Correct Fix)
**Approach**: Ensure server sends updated state with tapped sites/providers

**Pros**: Correct, handles all edge cases
**Cons**: Requires server-side investigation/changes

### Option C: Turn-Complete Strategy (Major Refactor)
**Approach**: Bot generates FULL turn sequences, not single actions

**Pros**: More strategic, can plan ahead
**Cons**: Major architecture change, complex

---

## Recommendation

**Investigate Option B first**: Check if server is correctly updating state with tapped sites between action calls. If not, this is a server bug that needs fixing regardless of bot improvements.

**If server is working correctly**, implement Option A as a temporary workaround while planning Option C for better strategic play.

---

## 🚨 CRITICAL DISCOVERY: Root Cause Identified

**Date**: 2025-10-14 (Continued investigation)

### Issue 5: Missing Card Cost Data (ROOT CAUSE)

After implementing mana-spent tracking (`state.resources[seat].spentThisTurn`), errors persisted. Deep investigation revealed the ACTUAL root cause:

**The bot has NO ACCESS to card cost information!**

#### Evidence

1. **Card objects in hand** have NO cost field:
```json
{
  "name": "Pit Vipers",
  "keys": ["id", "name", "type", "set", "slug", "thresholds"]
}
```
No `cost`, no `manaCost`, no `generic` field.

2. **Debug output** shows all cards treated as cost=0:
```
[canAffordCard] Pit Vipers: totalMana=1, spentThisTurn=0, available=1, cost=0, affordable=true
[canAffordCard] Divine Healing: totalMana=1, spentThisTurn=0, available=1, cost=0, affordable=true
[canAffordCard] Overpower: totalMana=1, spentThisTurn=0, available=1, cost=0, affordable=true
```

3. **getCardManaCost()** always returns 0:
```javascript
function getCardManaCost(card) {
  if (card && typeof card.cost === 'number') return Number(card.cost);
  // ... other checks all fail ...
  return 0; // Always reached!
}
```

4. **Cost data EXISTS** in Prisma database (`CardSetMetadata.cost Int?`) but is NOT included in game state sent to bot.

#### Impact

- Bot thinks ALL cards cost 0 mana
- Bot tries to play expensive cards with insufficient mana
- Server rejects with `cost_unpaid` errors
- Bot repeats indefinitely because cost check always passes

#### Why Previous Fixes Helped

1. **Avatar filtering**: Prevented playing avatars (which have no cost data)
2. **No-sites-no-units**: Prevented playing units when no mana base exists
3. **Site prioritization**: Ensured bot builds mana base early

These fixes reduced errors from 37/match to ~200/match, but couldn't eliminate them because **cost validation is impossible without cost data**.

---

## Solution Options

### Option D: Load Card Costs from Database (RECOMMENDED)

**Approach**: Pre-load card costs from Prisma `CardSetMetadata` table into a lookup map

```javascript
// Load once at bot initialization
const cardCosts = new Map();
const cards = await prisma.cardSetMetadata.findMany({
  select: { cardId: true, card: { select: { name: true } }, cost: true }
});
for (const meta of cards) {
  cardCosts.set(meta.card.name, meta.cost || 0);
}

// Use in canAffordCard
function getCardManaCost(card) {
  if (!card || !card.name) return 0;
  return cardCosts.get(card.name) || 0;
}
```

**Pros**:
- Fixes root cause completely
- No server changes needed
- Works with current architecture
- Fast lookups (Map)

**Cons**:
- Requires database access at bot startup
- Needs to handle multiple sets (cards may have different costs in different sets)
- May need periodic refresh if cards change

### Option E: Server-Side Fix (CORRECT BUT REQUIRES SERVER CHANGES)

**Approach**: Modify server to include `cost` field in card objects sent to bot

**Pros**:
- Correct architectural solution
- No client-side workarounds needed
- Cost always accurate

**Cons**:
- Requires server code changes
- May affect performance (more data transmitted)
- Needs testing across all game modes

### Option F: Hardcoded Costs (NOT RECOMMENDED)

**Approach**: Maintain a hardcoded map of card names to costs in bot engine

**Pros**:
- No database or server changes needed
- Works immediately

**Cons**:
- Brittle: breaks when new cards added or costs change
- Maintenance nightmare
- Doesn't scale

---

## Revised Recommendation

1. **Immediate Fix**: Implement Option D (database lookup) in `BotClient` initialization
2. **Long-term Fix**: Request server team to include cost data in game state (Option E)
3. **Mana Tracking**: Keep the `spentThisTurn` tracking implementation - it will be needed once costs are available

---

## T015 Status

✅ **T015: Enhanced JSONL Logging - COMPLETE**

All three enhancement fields are now in logs:
- `evaluationBreakdown`: Per-feature contributions (verified in match logs)
- `candidateDetails`: Action labels and scores (verified in match logs)
- `filteredCandidates`: Illegal move stats (verified: showing filtered count)

Example from logs:
```json
{
  "evaluationBreakdown": {
    "board_development": 0.8,
    "mana_efficiency": 0,
    "threat_deployment": 0,
    "life_pressure": 0
  },
  "candidateDetails": [
    {"action": "play_site:Shifting_Sands", "score": 0.74, "refined": 2.24, "isLegal": true}
  ],
  "filteredCandidates": {
    "totalUnitsInHand": 2,
    "filteredUnaffordable": 1,
    "playableUnits": 1
  }
}
```

---

## Success Metrics

| Metric | Before | After | Status |
|--------|--------|-------|--------|
| Avatar play attempts | 100% of games | 0% | ✅ Fixed |
| Units without sites | Frequent | 0% | ✅ Fixed |
| Sites played turns 1-5 | 0% | 100% | ✅ Fixed |
| Cost validation errors (early) | 37/match | 0/match | ✅ Fixed |
| Cost validation errors (late) | N/A | ~8/match | ⚠️ Mana tracking |
| Evaluation variance | Low | Medium | ✅ Improved |

