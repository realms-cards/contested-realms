# Tasks: optimize-frontend-performance

## Phase 1: Dependency Cleanup

- [x] 1.1 Remove `boardgame.io` from `package.json` dependencies
- [x] 1.2 Verified no boardgame.io imports in codebase
- [x] 1.3 Verify build succeeds with `npm run build`

## Phase 2: Card Metadata Caching

- [x] 2.1 Add in-memory cache with 5-minute TTL to `/api/cards/meta-by-variant` route
- [x] 2.2 Cache invalidation on server restart (automatic with in-memory)
- [x] 2.3 Add cache hit/miss logging in development mode
- [x] 2.4 Create shared `src/lib/api/cached-lookups.ts` with `getSetIdByName()` (10-min TTL)
- [x] 2.5 Apply cached set lookup to `/api/cards/search`
- [x] 2.6 Apply cached set lookup to `/api/cards/meta`
- [x] 2.7 Apply cached set lookup to `/api/cards/meta-by-variant`
- [ ] 2.8 Test cache behavior with repeated requests (manual verification)

## Phase 3: Dynamic Imports for 3D Components

- [x] 3.1 Create `src/components/game/dynamic-3d.tsx` barrel file
- [x] 3.2 Define DynamicBoard with `next/dynamic` and `ssr: false`
- [x] 3.3 Define DynamicHand3D with dynamic import
- [x] 3.4 Define DynamicPiles3D with dynamic import
- [x] 3.5 Define DynamicHud3D with dynamic import
- [x] 3.6 Define DynamicTokenPile3D with dynamic import
- [x] 3.7 Integrate dynamic imports into `/online/play/[id]`
- [x] 3.8 Integrate dynamic imports into `/play`
- [x] 3.9 Integrate dynamic imports into `/replay/[id]`
- [x] 3.10 Integrate dynamic imports into `/draft-3d`
- [x] 3.11 Integrate dynamic imports into `/admin/replays/[matchId]`
- [x] 3.12 Integrate dynamic imports into `/decks/editor-3d`
- [x] 3.13 Integrate dynamic imports into `EnhancedOnlineDraft3DScreen`
- [x] 3.14 Integrate dynamic imports into `OnlineDraft3DScreen`
- [x] 3.15 Integrate dynamic imports into `TournamentDraft3DScreen`

## Phase 4: Verification

- [x] 4.1 Build passes with all changes
- [ ] 4.2 Manual smoke test of online play page
- [x] 4.3 Verified code splitting working across all pages
- [ ] 4.4 Verify no console errors in production build
