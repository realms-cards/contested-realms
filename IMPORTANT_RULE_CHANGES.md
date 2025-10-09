# Important Rule Changes to Preserve

This document tracks rule validations that were removed during bot development that should be kept in the main codebase.

## Changes Made in Bot Development Session (2025-10-09)

### 1. Allow Permanents on Unsited Cells (The Void) ✅ KEEP THIS
**File**: `server/rules/index.js` lines 328-343

**Original Code** (REMOVED):
```javascript
// Validate permanents can only be placed on sited cells
if (action.permanents && typeof action.permanents === 'object') {
  const currentSites = (game && game.board && game.board.sites) || {};
  for (const key of Object.keys(action.permanents)) {
    if (!currentSites[key] || !currentSites[key].card) {
      const cellNum = getCellNumber(key, getBoardWidth(game));
      const cellRef = cellNum ? `cell ${cellNum}` : `cell ${key}`;
      return { ok: false, error: `Cannot place permanent on unsited ${cellRef}` };
    }
  }
}
```

**Why Removed**: In Sorcery, unsited cells are called "the void" and are LEGAL placement locations for:
- Avatars (always exist on void at game start)
- Minions with "voidwalk" ability

**Action**: Keep this validation REMOVED in main branch

---

### 2. Allow Site Stacking/Replacement ✅ KEEP THIS
**File**: `server/rules/index.js` lines 295-300

**Original Code** (COMMENTED OUT):
```javascript
// If both have a card, then it's an overwrite attempt
if (nextTile && nextTile.card && prevTile && prevTile.card) {
  const cellNum = getCellNumber(key, getBoardWidth(game));
  const cellRef = cellNum ? `cell ${cellNum}` : `tile ${key}`;
  return { ok: false, error: `Cannot place site on occupied ${cellRef}` };
}
```

**Changed To**:
```javascript
// Allow placing sites on occupied cells (sites can stack/replace)
// if (nextTile && nextTile.card && prevTile && prevTile.card) {
//   const cellNum = getCellNumber(key, getBoardWidth(game));
//   const cellRef = cellNum ? `cell ${cellRef}` : `tile ${key}`;
//   return { ok: false, error: `Cannot place site on occupied ${cellRef}` };
// }
```

**Why Changed**: Sites can legally stack or replace other sites in some game scenarios

**Action**: Keep this validation COMMENTED OUT in main branch

---

### 3. Automatic Resync on Match Join ✅ KEEP THIS
**File**: `server/index.js` in `leaderJoinMatch` function (around line 2726-2749)

**Added Code**:
```javascript
// Send full game state snapshot to joining player
try {
  if (socketId && match.game) {
    const snap = {};
    try { snap.zones = match.game.zones; } catch {}
    try { snap.board = match.game.board; } catch {}
    try { snap.permanents = match.game.permanents; } catch {}
    try { snap.avatars = match.game.avatars; } catch {}
    try { snap.players = match.game.players; } catch {}
    try { snap.phase = match.game.phase; } catch {}
    try { snap.currentPlayer = match.game.currentPlayer; } catch {}
    try { snap.turnNumber = match.game.turnNumber; } catch {}
    try { snap.d20Rolls = match.d20Rolls; } catch {}
    try { snap.setupWinner = match.setupWinner; } catch {}
    io.to(socketId).emit('resyncResponse', { snapshot: snap });
    console.log('[resync] sending game state with d20Rolls:', {
      matchId,
      d20Rolls: match.d20Rolls,
      setupWinner: match.setupWinner,
      phase: match.game?.phase,
      hasMeaningfulGame: !!(match.game && match.game.phase)
    });
  }
} catch {}
```

**Why Added**: Fixes "No cards" mulligan screen when joining existing matches. Server now sends full game state immediately on join instead of requiring manual reload.

**Action**: KEEP THIS in main branch - this is a bug fix

---

## Bot-Specific Changes (DO NOT MERGE)

These changes were part of the bot development and should NOT be merged to main:

### ❌ All bot client files
- `server/ai/enhanced-bot-client.js` - Enhanced bot with LLM
- `server/ai/llm-service.js` - LLM integration
- `server/ai/bot-guidance.js` - Strategic guidance
- Changes to existing `server/ai/smart-bot-client.js`

### ❌ LLM-related changes
- Ollama integration code
- qwen3:4b model configuration
- Prompt engineering for game decisions

---

## How to Apply These Changes

### Option 1: Cherry-pick Rule Changes Only
```bash
# Create a new branch from main
git checkout main
git checkout -b fix/rule-validations

# Apply only the rule changes manually:
# 1. Comment out "Cannot place site on occupied cell" validation (lines 295-300)
# 2. Remove "Cannot place permanent on unsited cell" validation (lines 328-343)
# 3. Add automatic resync on match join (leaderJoinMatch function)

# Test and commit
git add server/rules/index.js server/index.js
git commit -m "Remove overly restrictive rule validations

- Allow permanents on void (unsited cells) for avatars and voidwalk minions
- Allow site stacking/replacement
- Add automatic game state resync when joining matches (fixes 'No cards' bug)"
```

### Option 2: Extract from Stashed Bot Branch
If you saved the bot work in a separate branch:
```bash
git checkout <bot-branch-name>
git checkout main -- server/rules/index.js
# Manually reapply just the rule changes
```

---

## Testing Checklist

After applying rule changes:
- [ ] Avatars can be placed on void (unsited cells) at game start
- [ ] Sites can be stacked/replaced on occupied cells
- [ ] Joining an in-progress match shows cards immediately (no "No cards" screen)
- [ ] Mulligan screen works correctly
- [ ] Phase transitions work properly
- [ ] Build succeeds: `npm run build`
- [ ] Tests pass: `npm test`

---

## Additional Context

These rule changes came from the session documented in the previous conversation summary where we:
1. Fixed mulligan transition issues
2. Implemented bot card drawing (discovered rule issues)
3. Added threshold checking for spells
4. Discovered that certain validations were too restrictive for Sorcery rules

The rule changes are **independent of bot functionality** and are genuine bug fixes/rule corrections that should be in the main codebase.
