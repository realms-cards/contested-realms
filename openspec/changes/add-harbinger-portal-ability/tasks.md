## 1. State Infrastructure

- [x] 1.1 Add `PortalState` type to `src/lib/game/store/types.ts`
- [x] 1.2 Add `portalState` field to `GameState` type
- [x] 1.3 Add `portalState` to `ServerPatchT` for sync
- [x] 1.4 Create `src/lib/game/store/portalState.ts` slice with actions:
  - `initPortalState(harbingerSeats: PlayerKey[])`
  - `setPortalCurrentRoller(seat: PlayerKey | null)`
  - `rollPortalDie(seat: PlayerKey, dieIndex: number)`
  - `rerollPortalDie(seat: PlayerKey, dieIndex: number)`
  - `finalizePortalRolls(seat: PlayerKey)`
  - `completePortalSetup()`
- [x] 1.5 Integrate portal slice into main store (`src/lib/game/store.ts`)

## 2. Avatar Detection

- [x] 2.1 Create `src/lib/game/avatarAbilities.ts` with:
  - `isHarbinger(avatarName: string | null): boolean`
  - `getAvatarAbility(avatarName: string | null): 'harbinger' | 'dragonlord' | null`
  - `detectHarbingerSeats(avatars: Record<PlayerKey, AvatarState>): PlayerKey[]`
  - `hasAnyHarbinger(avatars): boolean`
- [x] 2.2 Add detection hook in game setup flow to identify Harbinger players

## 3. Harbinger Portal Roll Screen

- [x] 3.1 Create `src/components/game/HarbingerPortalScreen.tsx`:
  - Props: `myPlayerKey`, `playerNames`, `onSetupComplete`
  - 3 green D20 dice in R3F Canvas (reuses D20Dice component with `customColor` prop)
  - Click-to-roll for Harbinger player, "Watching..." for opponent
- [x] 3.2 Add duplicate detection logic:
  - After all 3 rolled, check for duplicates using `findDuplicateIndices()`
  - Highlight duplicate dice with yellow glow (`isDuplicate` prop on D20Dice)
  - Allow clicking duplicate dice to reroll
- [x] 3.3 Add roll-to-tile conversion (D20 result 1-20 -> tile number via `tileNumberToCoords()`)
- [x] 3.4 Emit portal state patch on completion via `trySendPatch()`

## 4. Game Flow Integration

- [x] 4.1 Update `src/app/online/play/[id]/page.tsx`:
  - After D20 setup winner chosen, check for Harbinger with `hasAnyHarbinger()`
  - If Harbinger present, show `HarbingerPortalScreen` before mulligan
  - Skip portal phase if no Harbinger (auto-sets `portalSetupComplete`)
- [x] 4.2 Add `portalSetupComplete` flag to prevent re-showing on reconnect
- [x] 4.3 Update offline play flow (`src/app/play/page.tsx`) similarly

## 5. Portal Visual Overlay

- [x] 5.1 Create `src/lib/game/components/PortalOverlay.tsx`:
  - Props: `tileX`, `tileY`, `portalState`
  - Render animated ring/glow if tile is a portal using `isPortalTile()` helper
  - Use `useFrame` for pulse animation
  - Color based on portal ownership (p1 = blue, p2 = red)
- [x] 5.2 Integrate `PortalOverlay` into `BoardTile.tsx`:
  - Added `portalState` prop to `BoardTileProps`
  - Render `<PortalOverlay>` below MagicTargetOverlay
- [x] 5.3 Create portal visual effects:
  - Semi-transparent animated ring using THREE.RingGeometry
  - Inner glow circle and outer glow ring
  - Elevation 0.001 (above mat, below cards)

## 6. Server Sync

- [x] 6.1 Server handles portal state via generic patch mechanism (no changes needed)
- [x] 6.2 Added `portalState` handling in `applyServerPatch()` in `networkState.ts`
- [x] 6.3 Portal state synced via existing `trySendPatch()` → server → `statePatch` broadcast

## 7. Testing & Polish

- [ ] 7.1 Test with mock Harbinger avatar (name-based detection)
- [ ] 7.2 Test duplicate roll → reroll flow
- [ ] 7.3 Test online sync between players
- [ ] 7.4 Test reconnection restores portal overlay
- [ ] 7.5 Verify overlay doesn't obstruct card interactions
- [ ] 7.6 Add game log entries for portal rolls (already implemented in slice)

## 8. Documentation

- [x] 8.1 Code comments added explaining avatar ability detection pattern
- [ ] 8.2 Update AGENTS.md or README with Harbinger ability notes (optional)
