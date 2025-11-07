# Game Store Cross-Slice Notes

## Domains

- **Core state** – players, turn/phase, setup flow, match end resolution.
- **Board state** – grid layout, sites, tapping, board overlays/pings.
- **Zone state** – hand/spellbook/atlas/graveyard/banished management plus mulligans.
- **Avatar state** – avatar cards, positioning, tap status.
- **Permanent state** – battlefield permanents, counters, attachments, control changes.
- **Combat state** – attack declaration, intercept/defence, resolution.
- **Resource state** – life, mana, thresholds, derived resource calculators.
- **Interaction state** – cross-turn interaction requests/responses and guides.
- **Network state** – transport wiring, patch application/queues, server echo filtering.
- **UI state** – selections, hover/drag/camera, preview card state.
- **Dialog state** – context/placement/search/peek dialogs.
- **Game actions** – card play/movement orchestration across zones, board, permanents.
- **Position state** – burrow/submerge, permanent/site/player positioning.
- **History & undo** – serialized snapshots, per-player history stacks.
- **Events & logging** – textual log with capped history and sequence numbers.
- **Remote cursors** – multiplayer cursor telemetry, pruning, highlight colors.
- **Snapshots** – auto/manual state snapshots persisted per match.

## Cross-Slice Dependencies (selected)

- **Game actions** orchestrate `zones`, `permanents`, `board`, `events`, and `history` in a single mutation. Most action helpers should continue to rely on the pure utilities extracted in Phase 0.
- **Combat state** reads from `permanents`, `avatars`, and `resources` (life/mana) and emits `events`. When refactoring, keep combat mutations co-located to avoid circular slice references.
- **Network state** needs access to `zones`, `board`, `permanents`, `events`, and `history` serializers. The patch helper utilities now provide reusable clone/merge logic to keep the slice lean.
- **Resource state** powers both `core state` (turn advancement) and `game actions` (available mana/threshold checks). The new `resourceHelpers.ts` centralizes threshold/mana math so it can be shared without re-computing.
- **Snapshots/history** rely on the serialization of `core`, `zones`, `permanents`, `board`, `resources`, and `ui` metadata. Snapshot persistence helpers now live under `utils/snapshotHelpers.ts` to keep the slice ergonomic.
- **UI/dialog state** read/write selection metadata that other slices (e.g., `game actions`, `board state`) consume. When slicing, wire them via Zustand selectors to avoid direct property reach-ins.

## Utility Modules (Phase 0)

- `utils/idHelpers.ts` – deterministic per-session IDs for cards/permanents.
- `utils/cardHelpers.ts` – card normalization, instance ID enforcement, seat-aware cloning.
- `utils/permanentHelpers.ts` – permanent normalization, movement, attachment handling, version bumps.
- `utils/zoneHelpers.ts` – zone cloning/removal helpers plus patch scaffolding.
- `utils/patchHelpers.ts` – deep merge utilities, permanents delta builders, patch cloning.
- `utils/resourceHelpers.ts` – threshold/mana calculators, phase ordering, cache helpers.
- `utils/snapshotHelpers.ts` – local snapshot storage load/save/clear helpers.
- `utils/eventHelpers.ts` – event log merging with MAX_EVENTS enforcement.

These modules are pure and shared across slices; future slice extraction should prefer importing from these helpers instead of duplicating logic.

## Phase 1 Status

- ✅ `eventState.ts` now owns `events`, `eventSeq`, and the synchronized `log` action.
- ✅ `dialogState.ts` encapsulates context menus plus placement/search/peek dialogs (including their open/close helpers and logging side-effects).
- ✅ `uiState.ts` contains camera mode, selection state, hover/drag flags, preview/mouse hand state, and their helper actions.
- ✅ `boardUiState.ts` manages grid/playmat toggles, board pings, and pointer tracking helpers.
- ✅ `historyState.ts` handles history stacks plus `pushHistory`/`undo`, including online snapshot broadcast logic.
- ✅ `coreState.ts` now owns players, life changes, turn/phase transitions, setup flow (d20 + order), and match-end detection.
- ✅ `resourceState.ts` centralizes resource selectors (sites, mana, thresholds) plus mana/threshold mutation helpers.
- ✅ `zoneState.ts` manages hand/spellbook/atlas/graveyard/banished state, shuffles/draws/scry, token creation, and mulligan workflows.
- ✅ `permanentState.ts` handles the battlefield permanents record (tapping, counters, attachments, avatar links, damage tracking).
- ✅ `positionState.ts` owns burrow/submerge/site/player positioning plus related helpers.
- ✅ `avatarState.ts` manages avatar data (cards, placement/movement, tapping, offsets, artifact hauling).
- ✅ `boardState.ts` owns the board grid (site placement/removal, control transfers, tap note).
- ✅ `gameActions.ts` covers card play/move actions (hand/pile plays, permanent transfers, board zone moves).
- ✅ `preferenceState.ts` keeps interaction guide preferences (localStorage-backed toggle).
- ✅ `cardMetaState.ts` caches fetched card metadata (`metaByCardId`) with the existing `/api/cards/meta` endpoint.
- ✅ `sessionState.ts` centralizes match/session metadata (matchId, actor/local IDs) and snapshot persistence helpers.
- ✅ `remoteCursorState.ts` isolates remote cursor telemetry (set/prune/highlight color) away from gameplay logic.
- ✅ `transportState.ts` now owns the transport handle, subscriptions, and pending patch queue helpers (`setTransport`, `trySendPatch`, `flushPendingPatches`).
- ✅ `interactionState.ts` wraps the consent/interaction workflow (log, request/response handlers, network envelopes).
- ⏩ Next: with the lightweight slices wrapped up, begin carving out the larger gameplay domains (zones, permanents, combat) per the refactor plan.
- As new slices are extracted, hook them into `createGameStoreState` via `...createXSlice(set, get, store)` to keep composition incremental.
