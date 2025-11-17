## 1. Specification & Decisions

- [ ] 1.1 Confirm timing rules for moving cards from Collection to hand (e.g., controlling player's Main phase only vs any time) and document the decision.
- [ ] 1.2 Confirm capability ownership (e.g., `gameplay-zones` plus optional `deck-construction`) and adjust spec deltas if additional capabilities are needed.

## 2. Client: Types & Zone Plumbing

- [ ] 2.1 Extend the `Zones` type to include `collection: CardRef[]` and update zone helpers to initialize and normalize it with safe defaults.
- [ ] 2.2 Update all code that constructs or clones `Zones` (e.g., history snapshots, `Piles3D` empty zones) to include `collection` without runtime errors.

## 3. Client: Store Actions & UI

- [ ] 3.1 Add store actions to set a player's Collection and to move a card from Collection to hand, emitting appropriate server patches.
- [ ] 3.2 Implement UI for viewing the Collection (e.g., via `PileZones` + `PileSearchDialog`) that is visible only to the controlling player.
- [ ] 3.3 Wire selection in the Collection view to the Collection-to-hand store action, including logging and basic error handling on illegal attempts.
- [ ] 3.4 Optionally gate Collection UI and actions behind a feature flag for Gothic launch.

## 4. Server: Zones Normalization & Persistence

- [ ] 4.1 Extend server-side `PlayerZones` and normalization helpers (e.g., `ensurePlayerZones`, `cloneZones`) to include a `collection` list.
- [ ] 4.2 Ensure match snapshots and zone patches correctly persist and restore `collection` alongside other zones, without requiring it to be present.

## 5. Deck Pipeline (Optional / Forward-Looking)

- [ ] 5.1 Allow deck/tournament APIs to emit Collection information for Gothic decks without making it mandatory for existing decks.
- [ ] 5.2 Update client deck loaders to initialize `collection` from deck data when present, preserving behavior when it is absent.

## 6. QA & Rollout

- [ ] 6.1 Add unit and/or integration tests around zone normalization and Collection-to-hand moves on both client and server.
- [ ] 6.2 Manually test offline and online matches with and without Collection decks to confirm visibility, synchronization, and persistence.
- [ ] 6.3 Run `openspec validate add-deck-collection-zone --strict` and update this checklist before requesting review and implementation.
