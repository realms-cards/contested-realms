# Deep Analysis: store.ts Refactoring Strategy

## Current State

- **File**: `src/lib/game/store.ts`
- **Lines**: 8,198 (larger than initially estimated)
- **Structure**: Single monolithic `createGameStoreState` function
- **Type Definition**: Already extracted to `src/lib/game/store/types.ts` (512 lines)

## Domain Analysis

After analyzing the codebase, I've identified **17 distinct functional domains**:

### 1. **Core Game State** (~200 lines)

- Players, turn, phase management
- Setup phase (D20 rolls, player order)
- Match end detection
- `setPhase`, `rollD20`, `choosePlayerOrder`, `checkMatchEnd`, `tieGame`

### 2. **Board State** (~400 lines)

- Board grid (sites, size)
- Site tapping
- Board pings (telemetry)
- Grid overlay, playmat visibility
- `board`, `showGridOverlay`, `showPlaymat`, `toggleTapSite`, `pushBoardPing`

### 3. **Zone State** (~800 lines)

- Hand, spellbook, atlas, graveyard, banished
- Drawing, shuffling, scrying
- Mulligans
- `zones`, `drawFrom`, `shuffleSpellbook`, `scryTop`, `mulligan`, `finalizeMulligan`

### 4. **Avatar State** (~400 lines)

- Avatar positioning and movement
- Avatar card assignment
- Tapping avatars
- `avatars`, `setAvatarCard`, `moveAvatarTo`, `placeAvatarAtStart`, `toggleTapAvatar`

### 5. **Permanent State** (~1,200 lines)

- Permanent positioning on board
- Tapping, counters, attachments
- Token management
- Control transfer
- Movement between zones
- `permanents`, `toggleTapPermanent`, `addCounterOnPermanent`, `attachTokenToPermanent`, `movePermanentToZone`

### 6. **Combat State** (~600 lines)

- Attack declaration
- Blocking/intercept
- Damage assignment
- Combat resolution
- `declareAttack`, `offerIntercept`, `commitDefenders`, `resolveCombat`, `applyDamageToPermanent`

### 7. **Mana & Resources** (~300 lines)

- Mana tracking
- Threshold management
- Life management
- Derived selectors (available mana, threshold totals)
- `addMana`, `addThreshold`, `addLife`, `getAvailableMana`, `getThresholdTotals`

### 8. **Interaction System** (~700 lines)

- Cross-turn interaction requests/responses
- Interaction grants
- Server-executed outcomes
- `sendInteractionRequest`, `respondToInteraction`, `receiveInteractionEnvelope`, `receiveInteractionResult`

### 9. **Network & Sync** (~800 lines)

- Transport management
- Server patch application
- Patch queueing and flushing
- Transport subscriptions
- `transport`, `applyServerPatch`, `trySendPatch`, `flushPendingPatches`

### 10. **UI State** (~600 lines)

- Camera mode
- Selection (card, permanent, avatar)
- Drag state (from hand, from pile)
- Hover state (cell, hand zone)
- Preview card
- `cameraMode`, `selectedCard`, `dragFromHand`, `hoverCell`, `previewCard`

### 11. **Dialog State** (~400 lines)

- Context menu
- Placement dialog
- Search dialog
- Peek dialog
- `contextMenu`, `placementDialog`, `searchDialog`, `peekDialog`

### 12. **Game Actions** (~1,000 lines)

- Playing cards to board
- Moving cards between zones
- Moving permanents
- Card selection and placement
- `playSelectedTo`, `moveCardFromHandToPile`, `moveSelectedPermanentTo`

### 13. **Position Management** (~500 lines)

- Burrow/submerge system
- Permanent positions
- Site positions
- Player positions
- State transitions
- `permanentPositions`, `setPermanentPosition`, `updatePermanentState`, `canTransitionState`

### 14. **History & Undo** (~300 lines)

- History snapshots
- Per-player history
- Undo functionality
- `history`, `historyByPlayer`, `pushHistory`, `undo`

### 15. **Events & Logging** (~200 lines)

- Event log
- Event sequencing
- `events`, `eventSeq`, `log`

### 16. **Remote Cursors** (~200 lines)

- Multiplayer cursor telemetry
- Cursor pruning
- Highlight color calculation
- `remoteCursors`, `setRemoteCursor`, `pruneRemoteCursors`, `getRemoteHighlightColor`

### 17. **Snapshots** (~300 lines)

- Auto/manual snapshots
- Snapshot storage/retrieval
- `snapshots`, `createSnapshot`, `hydrateSnapshotsFromStorage`

## Refined Module Structure

Based on this analysis, here's my recommended structure:

```
src/lib/game/store/
├── baseTypes.ts              ✅ (19 lines - exists)
├── constants.ts              ✅ (3 lines - exists)
├── remoteCursor.ts           ✅ (33 lines - exists)
├── types.ts                  ✅ (512 lines - exists)
│
├── coreState.ts              🆕 Core game state, turn/phase (~250 lines)
├── boardState.ts             🆕 Board, sites, grid (~450 lines)
├── zoneState.ts              🆕 Zones, drawing, shuffling (~900 lines)
├── avatarState.ts            🆕 Avatar management (~450 lines)
├── permanentState.ts         🆕 Permanents, tokens, attachments (~1,400 lines)
├── combatState.ts            🆕 Combat system (~700 lines)
├── resourceState.ts          🆕 Mana, thresholds, life (~350 lines)
├── interactionState.ts       🆕 Interaction system (~800 lines)
├── networkState.ts           🆕 Transport, patches, sync (~900 lines)
├── uiState.ts                🆕 Camera, selection, drag, hover (~700 lines)
├── dialogState.ts            🆕 All dialogs (~450 lines)
├── gameActions.ts            🆕 Core game actions (~1,100 lines)
├── positionState.ts          🆕 Burrow/submerge system (~550 lines)
├── historyState.ts           🆕 History and undo (~350 lines)
├── eventState.ts             🆕 Events and logging (~250 lines)
├── snapshotState.ts          🆕 Snapshots (~350 lines)
│
├── utils/                    🆕 Pure helper functions
│   ├── cardHelpers.ts        Card normalization, instance IDs
│   ├── permanentHelpers.ts   Permanent movement, versioning
│   ├── zoneHelpers.ts        Zone cloning, patching
│   └── patchHelpers.ts      Patch merging, serialization
│
└── index.ts                  🆕 Main store composition (~200 lines)
```

## Key Insights & Refinements

### 1. **Combat is Larger Than Expected**

Your original estimate was ~400 lines, but it's actually ~600-700 lines including:

- Attack declaration and targeting
- Intercept system
- Damage assignment logic
- Combat resolution
- Cross-move revert requests

**Recommendation**: Keep `combatState.ts` as a separate module, but be aware it's more complex.

### 2. **Position Management is a Distinct Domain**

The burrow/submerge system is substantial (~500 lines) and has its own state:

- `permanentPositions`, `permanentAbilities`
- `sitePositions`, `playerPositions`
- State transition validation
- Edge position calculations

**Recommendation**: Extract to `positionState.ts` as you suggested.

### 3. **Helpers Should Be Extracted First**

There are many pure helper functions scattered throughout:

- `normalizeCardRefEntry`, `ensureCardInstanceId`
- `movePermanentCore`, `ensurePermanentVersion`
- `cloneSeatZones`, `createZonesPatchFor`
- `mergeEvents`

**Recommendation**: Extract helpers to `utils/` **before** slicing the store. This reduces complexity and makes slices cleaner.

### 4. **Dialog State is Cohesive**

All four dialog types (context menu, placement, search, peek) are tightly related and share similar patterns.

**Recommendation**: Keep them together in `dialogState.ts` as a single slice.

### 5. **Network State Has Complex Dependencies**

The network slice needs access to:

- Zones (for patching)
- Board (for patching)
- Permanents (for patching)
- Events (for merging)

**Recommendation**: Use Zustand's slice pattern with proper typing to allow cross-slice access via `get()`.

### 6. **Type Duplication Issue**

I noticed `GameState` is defined in both:

- `store.ts` (lines 386-796)
- `store/types.ts` (lines 186-511)

**Recommendation**: Consolidate to `store/types.ts` and remove from `store.ts` before refactoring.

## Migration Strategy (Refined)

### Phase 0: Preparation (Low Risk)

1. ✅ Consolidate `GameState` type to `store/types.ts` only
2. ✅ Extract pure helper functions to `utils/`
3. ✅ Document cross-slice dependencies

### Phase 1: Extract Low-Dependency Slices (Low Risk)

Start with slices that have minimal dependencies:

1. `eventState.ts` - Events/logging (isolated)
2. `remoteCursor.ts` - Already extracted, just needs integration
3. `dialogState.ts` - UI-only, no game logic
4. `uiState.ts` - Selection, drag, hover (UI-only)

### Phase 2: Extract Core Game Slices (Medium Risk)

1. `coreState.ts` - Turn/phase management
2. `resourceState.ts` - Mana/thresholds/life
3. `boardState.ts` - Board and sites
4. `zoneState.ts` - Zones and drawing

### Phase 3: Extract Complex Slices (High Risk - Test Thoroughly)

1. `avatarState.ts` - Avatar management
2. `permanentState.ts` - Permanents and tokens
3. `positionState.ts` - Burrow/submerge
4. `combatState.ts` - Combat system

### Phase 4: Extract Network & Integration (High Risk)

1. `interactionState.ts` - Interaction system
2. `networkState.ts` - Transport and patches
3. `gameActions.ts` - Core game actions (depends on many slices)
4. `historyState.ts` - History (depends on serialization)
5. `snapshotState.ts` - Snapshots (depends on history)

### Phase 5: Finalize (Low Risk)

1. Update `index.ts` to compose all slices
2. Remove old `store.ts` implementation
3. Update all imports across codebase
4. Run full test suite

## Zustand Slice Pattern Implementation

Here's the recommended pattern for each slice:

```typescript
// store/zoneState.ts
import type { StateCreator } from "zustand";
import type { GameState } from "./types";

export interface ZoneSlice {
  zones: GameState["zones"];
  drawFrom: (
    who: PlayerKey,
    from: "spellbook" | "atlas",
    count?: number
  ) => void;
  shuffleSpellbook: (who: PlayerKey) => void;
  // ... other zone methods
}

export const createZoneSlice: StateCreator<
  GameState,
  [], // No middleware
  [], // No partialize
  ZoneSlice
> = (set, get) => ({
  zones: {
    p1: {
      spellbook: [],
      atlas: [],
      hand: [],
      graveyard: [],
      battlefield: [],
      banished: [],
    },
    p2: {
      spellbook: [],
      atlas: [],
      hand: [],
      graveyard: [],
      battlefield: [],
      banished: [],
    },
  },

  drawFrom: (who, from, count = 1) => {
    set((state) => {
      // Implementation using state.zones
      // Can access other slices via get() if needed
      return {
        /* updated state */
      };
    });
  },

  // ... other implementations
});
```

## Critical Considerations

### 1. **Cross-Slice Dependencies**

Some actions need to update multiple slices:

- Playing a card: updates `zones`, `permanents`, `board`, `events`
- Combat resolution: updates `permanents`, `players` (life), `events`

**Solution**: Use `get()` to access other slices, but keep updates atomic within a single `set()` call.

### 2. **Server Patch Serialization**

`ServerPatchT` needs to remain a single type that covers all patchable fields.

**Solution**: Keep `ServerPatchT` in `types.ts` and ensure all slices contribute to it correctly.

### 3. **History Serialization**

`SerializedGame` needs to capture state from multiple slices.

**Solution**: `historyState.ts` can use `get()` to serialize the entire state, or each slice can provide a `serialize()` method.

### 4. **Testing Strategy**

After each phase:

1. Run the simulator
2. Test critical game flows (draw, play, combat)
3. Test multiplayer sync
4. Test undo/redo
5. Test snapshots

## Benefits of This Approach

1. **Agent-Friendly**: Each module <1,500 lines, fits in context windows
2. **Domain Separation**: Clear boundaries make reasoning easier
3. **Incremental**: Can refactor one domain at a time
4. **Testable**: Each slice can be unit tested independently
5. **Maintainable**: New features go in the right place
6. **Type-Safe**: Full TypeScript support with Zustand's typing

## Risks & Mitigations

### Risk: Breaking Changes During Migration

**Mitigation**:

- Keep old `store.ts` until all slices are extracted and tested
- Use feature flags if needed
- Comprehensive testing after each phase

### Risk: Circular Dependencies

**Mitigation**:

- Document slice dependencies upfront
- Use `get()` for cross-slice access (Zustand handles this)
- Keep slices focused on their domain

### Risk: Performance Regression

**Mitigation**:

- Zustand slices don't add overhead
- Test with profiler after each phase
- Keep atomic updates where possible

## Conclusion

Your original analysis is **excellent** and well-thought-out. The main refinements I'd suggest:

1. **Extract helpers first** (Phase 0) - reduces complexity
2. **Consolidate types** - remove duplication
3. **Start with low-dependency slices** - build confidence
4. **Combat is larger** - budget ~700 lines
5. **Position management is distinct** - separate slice makes sense
6. **Dialog state is cohesive** - keep together

The phased approach you outlined is solid. The key is being **surgical** and **testing thoroughly** after each phase, which you've already emphasized.

Would you like me to start with Phase 0 (extracting helpers) or Phase 1 (low-dependency slices)?
