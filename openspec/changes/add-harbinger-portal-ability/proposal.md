## Why

The Gothic expansion releases next week and introduces the **Harbinger** avatar with a unique portal mechanic. At game start (after main setup), the Harbinger player rolls 3 green D20 to determine which tiles become "portals" that the Harbinger can use throughout the game. This requires avatar-specific ability detection, a new D20 rolling UI, and visual tile overlays.

## What Changes

- **Avatar ability detection**: Add a system to detect avatar-specific abilities by name matching (e.g., "Harbinger")
- **Harbinger portal roll screen**: After setup completes, if either player has Harbinger, show a modal with 3 green D20 dice for the Harbinger player to roll (opponent sees but cannot interact)
- **Duplicate roll handling**: If any two rolls produce the same number, the Harbinger player must reroll the duplicate(s) until all 3 results are unique
- **Portal state in game store**: Store portal tile numbers as part of game state, synced via server patches
- **Portal tile overlay**: Render a subtle "portal" visual effect on cells with portal markers, under cards but visible on the playmat (animated ring/glow shader)
- **Database-independent avatar detection**: Use name-based matching so the feature works before the card exists in the database

## Impact

- **Affected specs**: avatar-abilities (new capability)
- **Affected code**:
  - `src/lib/game/store/types.ts` - Add portal state types
  - `src/lib/game/store/` - New portalState slice
  - `src/components/game/` - New HarbingerPortalScreen component
  - `src/lib/game/components/` - New PortalOverlay component for BoardTile
  - `src/lib/game/Board.tsx` - Integrate portal overlay rendering
  - `src/app/online/play/[id]/page.tsx` - Add portal setup phase after D20 roll
  - `server/index.js` - Sync portal state across players
