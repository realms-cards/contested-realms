## Why

Performance analysis identified several optimization opportunities: unused dependencies increasing bundle size, missing API-level caching for frequently-accessed card metadata, and synchronous loading of heavy 3D components blocking initial page render.

## What Changes

- **Remove `boardgame.io` dependency** - Unused library adding ~200KB to bundle
- **Add in-memory card metadata cache** - Cache card stats (cost, thresholds, attack, defence) with 5-minute TTL to reduce database round-trips
- **Dynamic import 3D components** - Lazy-load Board, Hand3D, Piles3D to improve initial page load time

## Impact

- Affected specs: frontend-performance (new capability)
- Affected code:
  - `package.json` - Remove dependency
  - `src/app/api/cards/meta-by-variant/route.ts` - Add caching
  - `src/app/online/play/[id]/page.tsx` - Dynamic imports
  - `src/components/game/EnhancedOnlineDraft3DScreen.tsx` - Dynamic imports
