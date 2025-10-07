# Server Fix Applied - Tournament Cube Draft

## Issue
When creating a tournament with cube draft enabled, the server was generating packs from Alpha/Beta sets instead of from the selected cube.

## Root Cause
The `hydrateMatchFromDatabase` function in `server/index.js` was not loading the DraftSession settings when creating tournament draft matches. The `cubeId` was stored in the DraftSession but never loaded into the match's `draftConfig`, so the server's `leaderStartDraft` function couldn't access it.

## Fix Applied
Added code to `hydrateMatchFromDatabase` function (after line 3645) to:
1. Load the DraftSession for tournament draft matches
2. Extract `cubeId` from DraftSession settings
3. Build complete `draftConfig` including `cubeId`
4. Assign it to the match object

## File Modified
- `server/index.js` (lines 3646-3677 added)
- Backup created: `server/index.js.backup`

## Code Added
```javascript
// Load DraftSession config for tournament draft matches to get cubeId
if (match.matchType === 'draft' && match.tournamentId) {
  try {
    const draftSession = await prisma.draftSession.findFirst({
      where: { tournamentId: match.tournamentId },
      select: { settings: true, packConfiguration: true },
    });
    if (draftSession) {
      // Extract cubeId from DraftSession settings
      const settings = draftSession.settings || {};
      const cubeId = settings.cubeId;

      // Build draftConfig from DraftSession
      const packConfig = draftSession.packConfiguration || [];
      const packCounts = {};
      for (const entry of packConfig) {
        const setId = entry.setId || 'Beta';
        packCounts[setId] = (packCounts[setId] || 0) + (entry.packCount || 0);
      }

      match.draftConfig = {
        cubeId: cubeId || undefined,
        packCounts,
        packCount: Object.values(packCounts).reduce((a, b) => a + b, 0) || 3,
        packSize: 15,
      };

      console.log('[Tournament Draft] Loaded draftConfig from DraftSession:', { matchId, cubeId, packCount: match.draftConfig.packCount });
    }
  } catch (err) {
    console.warn('[Tournament Draft] Failed to load DraftSession:', err?.message || err);
  }
}
```

## How to Apply

### If using Docker:
```bash
# Restart the socket server container
docker-compose restart socket-server
# OR rebuild if needed
docker-compose up -d --build socket-server
```

### If running locally:
```bash
# Stop the server (Ctrl+C or kill process)
# Then restart:
npm run server
```

## Verification

After restarting, check the server logs when a tournament draft starts. You should see:
```
[Tournament Draft] Loaded draftConfig from DraftSession: { matchId: '...', cubeId: 'cube-id-here', packCount: 3 }
```

Then when draft starts:
```
[Draft] Draft start -> enter pack_selection (round 1)
```

And verify the packs contain cards from your cube, not from Alpha/Beta sets.

## Testing

1. Create a new tournament with format "draft"
2. Check "Use Cube for draft"
3. Select your cube
4. Create tournament
5. Register players
6. Start tournament
7. Join draft as a player
8. Start the draft
9. Verify packs contain cube cards

## Rollback

If issues occur:
```bash
cp server/index.js.backup server/index.js
# Then restart server
```

---

**Date**: 2025-01-11
**Status**: ✅ Fix Applied - Server Restart Required
**Impact**: Tournament cube drafts will now use cube cards correctly
