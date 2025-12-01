## Context

The Sorcery TCG "Gothic" expansion releases next week with a new avatar called "Harbinger" that has a unique setup ability: at game start, the Harbinger player rolls 3 D20 to designate portal tiles on the board. This is the first avatar-specific ability in the game client and establishes patterns for future avatar abilities.

**Constraints:**

- The card doesn't exist in the database yet, so detection must be name-based
- Must work in both online (synced) and offline (local) play modes
- Visual effect should be subtle but clear, not interfering with card visibility

## Goals / Non-Goals

**Goals:**

- Support Harbinger's portal roll mechanic before the card is in the database
- Establish a reusable pattern for avatar-specific abilities
- Provide clear visual feedback for portal tiles without obstructing gameplay
- Sync portal state between players in online matches

**Non-Goals:**

- Implementing the actual portal teleportation mechanic (game rules enforcement)
- Supporting other Gothic avatar abilities (scope creep)
- Creating a generic "avatar ability" framework (premature abstraction)

## Decisions

### Decision 1: Name-based avatar detection

Detect Harbinger by matching `avatar.card.name.toLowerCase().includes('harbinger')`. This allows the feature to work before the card exists in the database and follows the pattern used for Dragonlord champion detection.

**Alternatives considered:**

- Card ID lookup: Requires database entry, blocks pre-release testing
- Card type/subtype: Harbinger-specific, not general enough

### Decision 2: Portal state structure

```typescript
type PortalState = {
  harbingerSeat: PlayerKey | null; // Which player has Harbinger
  rolls: number[]; // Raw D20 results (1-20)
  tileNumbers: number[]; // 3 unique tile numbers (1-25)
  rollPhase: "pending" | "rolling" | "complete";
};
```

Store in `GameState.portalState` and include in `ServerPatchT` for sync.

**Alternatives considered:**

- Per-avatar ability objects: Over-engineered for single use case
- Storing as board markers: Couples state to rendering

### Decision 3: D20 roll UI component

Create `HarbingerPortalScreen` similar to existing `OnlineD20Screen`:

- 3 green D20 dice rendered in R3F Canvas
- Harbinger player can click to roll, opponent watches
- Automatic duplicate detection with reroll prompt
- Results map directly to tile numbers 1-20 (top-left = 1, bottom-right = 20, row-major order)

### Decision 4: Portal visual overlay

Use a simple animated shader ring on the tile plane:

- Player-colored glow (blue for p1, red for p2)
- Pulsing animation (0.5s period)
- Rendered at elevation 0.001 (above playmat, below cards)
- Semi-transparent (alpha ~0.3)

Implemented as `PortalOverlay` component rendered per-tile in `BoardTile`.

**Alternatives considered:**

- Full shader on playmat: Complex, may affect performance
- Particle system: Too visually noisy
- Static decal: Lacks the "magical portal" feel

### Decision 5: Phase integration

Insert portal setup between D20 roll completion and mulligan phase:

```
D20 Roll -> [Harbinger Portal Setup] -> Mulligan -> Start
```

Only triggers if either player's avatar name contains "harbinger".

## Risks / Trade-offs

| Risk                            | Mitigation                                    |
| ------------------------------- | --------------------------------------------- |
| Name matching false positives   | Use exact toLowerCase().includes('harbinger') |
| Performance impact from overlay | Use instanced geometry, single draw call      |
| Sync issues in online play      | Include portalState in authoritative patches  |
| Mobile touch for dice           | Reuse existing D20Dice touch handling         |

## Migration Plan

1. No database migration required
2. Feature is additive - existing games unaffected
3. Graceful degradation: if portalState undefined, no portals shown

## Resolved Questions

1. **Portal tile calculation**: D20 rolls (1-20) map directly to tiles 1-20. Tile 1 is top-left, tile 20 is bottom-right (row-major order). Tiles 21-25 (bottom row right side) cannot be portals.
2. **Multiple Harbingers**: Yes, each player rolls their own 3 D20 separately. P1 rolls first, then P2.
3. **Visual distinction**: Portals use player colors (blue for p1, red for p2) to distinguish ownership.
