## 1. State Infrastructure

- [ ] 1.1 Add `PortalState` type to `src/lib/game/store/types.ts`
- [ ] 1.2 Add `portalState` field to `GameState` type
- [ ] 1.3 Add `portalState` to `ServerPatchT` for sync
- [ ] 1.4 Create `src/lib/game/store/portalState.ts` slice with actions:
  - `setHarbingerSeat(seat: PlayerKey | null)`
  - `setPortalRolls(rolls: number[])`
  - `setPortalTileNumbers(tiles: number[])`
  - `setPortalRollPhase(phase: 'pending' | 'rolling' | 'complete')`
- [ ] 1.5 Integrate portal slice into main store (`src/lib/game/store/index.ts`)

## 2. Avatar Detection

- [ ] 2.1 Create `src/lib/game/avatarAbilities.ts` with:
  - `isHarbinger(avatarName: string | null): boolean`
  - `getAvatarAbility(avatarName: string | null): 'harbinger' | 'dragonlord' | null`
- [ ] 2.2 Add detection hook in game setup flow to identify Harbinger players

## 3. Harbinger Portal Roll Screen

- [ ] 3.1 Create `src/components/game/HarbingerPortalScreen.tsx`:
  - Props: `harbingerSeat`, `myPlayerKey`, `playerNames`, `onRollComplete`
  - 3 green D20 dice in R3F Canvas (reuse D20Dice component with color prop)
  - Roll button for Harbinger player, "Watching..." for opponent
- [ ] 3.2 Add duplicate detection logic:
  - After all 3 rolled, check for duplicates
  - Highlight duplicate dice, show reroll prompt
  - Allow selective reroll of duplicate dice
- [ ] 3.3 Add roll-to-tile conversion (D20 result 1-20 -> tile number)
- [ ] 3.4 Emit portal state patch on completion

## 4. Game Flow Integration

- [ ] 4.1 Update `src/app/online/play/[id]/page.tsx`:
  - After D20 setup winner chosen, check for Harbinger
  - If Harbinger present, show `HarbingerPortalScreen` before mulligan
  - Skip portal phase if no Harbinger
- [ ] 4.2 Add `harbingerSetupComplete` flag to prevent re-showing on reconnect
- [ ] 4.3 Update offline play flow (`src/app/play/page.tsx`) similarly

## 5. Portal Visual Overlay

- [ ] 5.1 Create `src/lib/game/components/PortalOverlay.tsx`:
  - Props: `tileNumber`, `portalState`, `playerColors` (blue for p1, red for p2)
  - Render animated ring/glow if tile is a portal
  - Use `useFrame` for pulse animation
  - Color based on portal ownership (p1 = blue, p2 = red)
- [ ] 5.2 Integrate `PortalOverlay` into `BoardTile.tsx`:
  - Pass portal state to each tile
  - Render overlay below permanents/sites
- [ ] 5.3 Create portal shader/material:
  - Semi-transparent animated ring
  - Subtle glow effect
  - Elevation 0.001 (above mat, below cards)

## 6. Server Sync

- [ ] 6.1 Update `server/index.js` to handle portal state in patches
- [ ] 6.2 Include `portalState` in match snapshot for reconnection
- [ ] 6.3 Broadcast portal rolls to both players in real-time

## 7. Testing & Polish

- [ ] 7.1 Test with mock Harbinger avatar (name-based detection)
- [ ] 7.2 Test duplicate roll → reroll flow
- [ ] 7.3 Test online sync between players
- [ ] 7.4 Test reconnection restores portal overlay
- [ ] 7.5 Verify overlay doesn't obstruct card interactions
- [ ] 7.6 Add game log entries for portal rolls

## 8. Documentation

- [ ] 8.1 Update AGENTS.md or README with Harbinger ability notes
- [ ] 8.2 Add inline code comments explaining avatar ability detection pattern
