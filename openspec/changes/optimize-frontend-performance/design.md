## Context

Performance analysis revealed:

- `boardgame.io` is listed as a dependency but not actively used
- Card metadata API performs DB queries on every request despite data rarely changing
- Heavy 3D components (Three.js/R3F) are loaded synchronously, blocking render

## Goals / Non-Goals

**Goals:**

- Reduce initial bundle size by removing unused code
- Reduce database load for card metadata lookups
- Improve Time to First Contentful Paint (FCP) on game pages

**Non-Goals:**

- Full global canvas refactor (separate change)
- Server-side rendering of 3D content (not feasible)
- External caching layer (Redis) for card data (overkill for now)

## Decisions

### Decision 1: Remove boardgame.io

- **What:** Remove the dependency entirely
- **Why:** Not used in current codebase; Socket.IO + custom state sync is the transport layer
- **Alternative:** Keep for future use → Rejected (can re-add if needed)

### Decision 2: In-memory cache for card metadata

- **What:** Simple Map-based cache with 5-minute TTL
- **Why:** Card stats (cost, thresholds, attack, defence) change only on ingestion
- **Alternative:** Redis cache → Overkill for read-only metadata; adds operational complexity
- **Alternative:** Long HTTP cache headers → Would require cache busting on data changes

### Decision 3: Dynamic imports with next/dynamic

- **What:** Use `next/dynamic` with `ssr: false` for R3F components
- **Why:** Three.js requires browser APIs; dynamic import allows code splitting
- **Alternative:** React.lazy → Doesn't handle SSR edge case as cleanly

## Implementation Notes

### Cache Structure

```typescript
interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const cardMetaCache = new Map<string, CacheEntry<CardMeta[]>>();
```

### Dynamic Import Pattern

```typescript
import dynamic from "next/dynamic";

const Board = dynamic(() => import("@/lib/game/Board"), {
  ssr: false,
  loading: () => <div className="animate-pulse bg-slate-800 h-full w-full" />,
});
```

## Risks / Trade-offs

| Risk                                | Mitigation                                       |
| ----------------------------------- | ------------------------------------------------ |
| Cache serves stale data             | 5-min TTL is short; card data changes rarely     |
| Loading skeleton visible            | Keep skeleton minimal; cache textures separately |
| Dynamic import increases complexity | Centralize in barrel file                        |

## Migration Plan

1. Remove boardgame.io and verify build
2. Add caching to API route
3. Incrementally add dynamic imports, testing each
4. No rollback needed - all changes are additive optimizations

## Open Questions

- Should we add a cache-control header for card metadata responses?
- Should we pre-warm the cache on server start?
