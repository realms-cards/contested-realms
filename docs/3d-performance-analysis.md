# 3D Views Performance Analysis

## Executive Summary

This document provides a deep analysis of performance issues in the 3D views, focusing on memory and CPU operations. Users on older hardware experience performance problems even with the "enhanced 3D view" setting disabled.

## Implemented Optimizations (Jan 2026)

The following optimizations have been implemented to improve drag performance and reduce CPU/GPU load:

### 1. Reduced Default Anisotropy (Global)

**File**: `src/lib/game/textures/useCardTexture.ts`

- Changed from 16x to **4x anisotropy** by default
- Configurable via `NEXT_PUBLIC_MAX_ANISOTROPY` env var
- Applies to all cards, not just when lite mode is on

### 2. Throttled Mousemove Handlers (Global)

**Files**: `Hand3D.tsx`, `MouseTracker.tsx`, `DraftPackHand3D.tsx`

- Added `throttle()` utility (`src/lib/utils/throttle.ts`)
- All mousemove handlers now throttled to **30ms** (~33fps)
- Significantly reduces CPU usage during drag operations

### 3. Smart TextureCache Default

**File**: `src/lib/game/components/TextureCache.tsx`

- Changed default mode from `"all"` to `"smart"`
- Only preloads avatars, hand cards, and top N of draw piles
- Reduces initial texture memory by 50-70%

### 4. New Performance Settings

**File**: `src/hooks/useGraphicsSettings.ts`

- **`preferRaster`**: Skip KTX2 transcoding, use WebP/PNG directly

### 5. Settings UI

**File**: `src/components/auth/UserBadge.tsx`

- Added "Lite Textures" toggle (preferRaster)

### 6. Optimized Physics Engine (Session 2)

**File**: `src/lib/game/physics.tsx`

- Reduced physics timestep from **1/60 to 1/30** (50% less physics calculations)
- Enabled interpolation for smooth visuals despite lower physics rate
- Set `updatePriority={-50}` to run physics after other updates

### 7. Eliminated HandPeekDialog Canvas (Session 3)

**File**: `src/components/game/HandPeekDialog.tsx`

- Replaced Canvas + CardPlane 3D rendering with simple 2D `<img>` tags
- Each card was creating a separate WebGL context - now uses zero WebGL
- Cards load via `/api/images/{slug}` with lazy loading
- Site cards use CSS `transform: rotate(-90deg)` instead of 3D rotation

**Impact**: Eliminates N WebGL contexts (one per card in peek dialog) when viewing opponent's hand or pile contents.

### Known Limitations

**Dice rolling dialogs** (`GameToolbox.tsx`, `OnlineD20Screen.tsx`, `HarbingerPortalScreen.tsx`):

- Still use separate Canvas instances for 3D dice animation
- These are temporary overlays (open briefly, then close)
- Converting to View API portals is complex and previously caused rendering issues
- Acceptable trade-off: short-lived additional context vs. implementation risk

---

## Current Architecture Overview

### Graphics Settings (`src/hooks/useGraphicsSettings.ts`)

The `enhanced3DCards` setting controls:

- **Lit Materials**: `MeshStandardMaterial` with roughness, metalness, envMap → expensive
- **Unlit Materials**: `MeshBasicMaterial` with flat colors → cheaper
- **Shadows**: Casting and receiving shadows (enabled when `lit=true`)
- **Table Model**: 3D mahogany table model

**Problem**: Disabling `enhanced3DCards` only switches materials and shadows. Many other expensive operations remain active.

---

## Performance Issues Identified

### 1. Multiple WebGL Contexts (Critical - High Impact)

**Location**: Each page creates its own Canvas

```
/online/play/[id] → Canvas #1
/play → Canvas #2
/draft-3d → Canvas #3
/replay/[id] → Canvas #4
/decks/editor-3d → Canvas #5
/admin/replays/[matchId] → Canvas #6
```

**Impact**:

- Browser WebGL context limit is ~8-16
- Each context consumes GPU memory independently
- Context switching is expensive
- Can cause WebGL context loss on low-end devices

**Recommendation**: Implement global shared Canvas using R3F's View API (already documented in `TEXTURE_OPTIMIZATION.md` but not implemented).

---

### 2. Texture Loading & Memory (Critical - High Impact)

**Location**: `src/lib/game/textures/useCardTexture.ts`

**Current Settings**:

- Cache size: 150 textures max (`NEXT_PUBLIC_TEXTURE_CACHE_MAX_SIZE`)
- TTL: 30 seconds (`NEXT_PUBLIC_TEXTURE_CACHE_TTL_MS`)
- Anisotropic filtering: max (up to 16x)

**Problems**:

- **KTX2 transcoding**: CPU-intensive, runs on main thread via WebWorkers
- **Mipmap generation**: `generateMipmaps = true` for raster textures triggers `glGenerateMipmap`
- **Anisotropy**: `Math.min(16, maxAniso)` uses maximum available, very expensive on integrated GPUs
- **TextureCache component** (`src/lib/game/components/TextureCache.tsx`) preloads ALL cards in both players' zones by default - can be 100+ textures

**Recommendations**:

1. Add a "low quality" mode that:
   - Caps anisotropy at 2x or disables it
   - Uses smaller texture sizes (512px instead of 1024px)
   - Disables mipmaps entirely
2. Reduce default cache size for low-end mode (50-75 textures)
3. Use `preferRaster: true` globally in low-end mode (skip KTX2 transcoding)
4. Make TextureCache use `mode="smart"` by default instead of `mode="all"`

---

### 3. Physics Engine (High Impact)

**Location**: `src/lib/game/physics.tsx`, `src/lib/game/components/BoardEnvironment.tsx`

**Problems**:

- Rapier3D physics runs even when not needed
- 5 wall colliders + ground collider created for every board
- Physics simulation runs every frame

**Recommendations**:

1. Disable physics entirely in a "lite" mode - cards don't need realistic physics
2. Use simpler collision detection or none at all for card placement

---

### 4. useFrame Animation Loops (High Impact)

**Locations** (47+ matches):

- `Hand3D.tsx` - Hand fan animations, hover effects
- `DraftPackHand3D.tsx` - Draft hand animations
- `BoardCursorLayer.tsx` - Cursor tracking
- `BoardPingLayer.tsx` - Ping animations
- `D20Dice.tsx`, `D6Dice.tsx` - Dice roll animations
- `CardOutline.tsx` - Outline animations
- Multiple overlay components

**Problems**:

- Many `useFrame` hooks run EVERY frame (60fps)
- No throttling or frame skipping for low-end devices
- Animation smoothness prioritized over battery/CPU

**Recommendations**:

1. Add a global `frameloop` setting: `"demand"` (only render on change) vs `"always"`
2. Implement frame rate limiting (30fps cap option)
3. Use CSS animations for UI elements instead of Three.js where possible
4. Throttle animation-only components in low-end mode

---

### 5. Zustand Store Selector Patterns (Medium Impact)

**Location**: 665+ `useGameStore(` calls across 83 files

**Problems in key files**:

- `ContextMenu.tsx` - 65 individual selector calls
- `online/play/[id]/page.tsx` - 44 selector calls
- `GameToolbox.tsx` - 40 selector calls
- `CombatHudOverlay.tsx` - 28 selector calls

**Pattern Example** (inefficient):

```tsx
const dragFromHand = useGameStore((s) => s.dragFromHand);
const setDragFromHand = useGameStore((s) => s.setDragFromHand);
const dragFromPile = useGameStore((s) => s.dragFromPile);
// ... 40 more individual selectors
```

**Impact**: Each selector creates a subscription. When store updates, all selectors re-evaluate.

**Recommendations**:

1. Group related selectors with shallow equality checks
2. Use `useShallow` from Zustand for multi-value selects
3. Memoize computed values outside of render

---

### 6. Event Listeners Without Throttling (Medium Impact)

**Locations**:

- `Hand3D.tsx` - `mousemove` listener on window
- `DraftPackHand3D.tsx` - `mousemove` listener on window
- `MouseTracker.tsx` - `mousemove` listener on canvas
- `Board.tsx` - Multiple pointer event handlers
- `GemToken3D.tsx` - `pointermove` listener

**Problems**:

- `mousemove` fires 60+ times per second
- No throttling/debouncing
- Each move triggers state updates and re-renders

**Recommendations**:

1. Throttle mousemove handlers to 30-60ms minimum
2. Use `{ passive: true }` for event listeners (already done in some places)
3. Batch state updates using `flushSync` sparingly

---

### 7. Environment & Lighting (Medium Impact)

**Location**: `src/lib/game/components/BoardEnvironment.tsx`

**Current**:

```tsx
<Environment preset="apartment" background={false} environmentIntensity={0.3} />
<MahoganyTable scale={0.95} />
```

**Problems**:

- HDRI environment map loading and processing
- 3D table model loading (GLTF)
- Environment reflection calculations on all materials

**Recommendations**:

1. In lite mode: disable Environment entirely
2. Skip table model loading (`showTable={false}`)
3. Use flat ambient lighting only

---

### 8. Material Creation in Render (Medium Impact)

**Location**: `src/lib/game/components/CardPlane.tsx`

**Problem**: Materials created inside `useMemo` can still recreate on dependency changes:

```tsx
const materials = useMemo(() => {
  // Creates 3-6 new Material objects
  return createBoxMaterials(...);
}, [frontMap, backMap, lit, ...]);
```

**Impact**: Material creation triggers GPU shader compilation.

**Recommendations**:

1. Create a shared material pool/cache
2. Reuse materials across cards when textures are the same
3. Use `material.clone()` with shared properties where possible

---

### 9. Geometry Recreation (Low-Medium Impact)

**Location**: `src/lib/game/components/CardPlane.tsx`, `useCardGeometry.tsx`

```tsx
const geometry = useMemo(() => {
  if (cardGeometry) return cardGeometry;
  return getBoxGeometry(width, height, thickness); // Creates new BoxGeometry
}, [cardGeometry, width, height, thickness]);
```

**Recommendations**:

1. Cache geometries by dimension key
2. Share geometry instances across cards of same size

---

### 10. Shadow Map Configuration (Low Impact)

**Problem**: Shadow maps consume GPU memory and require additional render passes.

**Current**: 2048x2048 shadow maps based on memory fix.

**Recommendations for lite mode**:

1. Disable shadows entirely
2. Or reduce to 512x512

---

## Proposed "Lite Mode" Implementation

### New Graphics Settings

```typescript
interface GraphicsSettings {
  // Existing
  enhanced3DCards: boolean;
  lightingIntensity: number;
  showTable: boolean;

  // New proposed settings
  performanceMode: "high" | "balanced" | "lite";
  maxTextureSize: 1024 | 512 | 256;
  shadowQuality: "high" | "low" | "off";
  physicsEnabled: boolean;
  frameRateLimit: 60 | 30 | "unlimited";
  anisotropyLevel: 16 | 4 | 1;
}
```

### Lite Mode Profile

```typescript
const LITE_MODE_SETTINGS = {
  enhanced3DCards: false,
  showTable: false,
  performanceMode: "lite",
  maxTextureSize: 512,
  shadowQuality: "off",
  physicsEnabled: false,
  frameRateLimit: 30,
  anisotropyLevel: 1,
};
```

---

## Priority Implementation Order

### Phase 1: Quick Wins (1-2 days)

1. Add `anisotropyLevel` setting and cap at 2x for balanced, 1x for lite
2. Default TextureCache to `mode="smart"`
3. Add `preferRaster` global toggle for KTX2 skip
4. Add shadow disable option

### Phase 2: Frame Rate & Animation (2-3 days)

1. Add Canvas `frameloop="demand"` option
2. Implement 30fps frame rate cap
3. Throttle mousemove handlers to 30ms

### Phase 3: Memory Optimization (3-5 days)

1. Reduce texture cache size in lite mode
2. Add lower-resolution texture tier
3. Implement geometry caching/pooling

### Phase 4: Architecture (1-2 weeks)

1. Implement global shared Canvas with View API
2. Remove/disable physics in lite mode
3. Consolidate Zustand selectors

---

## Monitoring & Debugging

### Existing Tools

- `src/lib/game/textures/textureMonitoring.ts` - Texture cache stats
- `getTextureCacheStats()` - Returns cache size, memory usage
- `useTextureCacheStats(interval)` - React hook for monitoring
- `forceClearUnreferencedTextures()` - Manual cache clear

### Recommended Additions

1. FPS counter component (dev mode)
2. GPU memory monitor
3. Render call counter
4. Performance profiling mode

---

## Environment Variables for Tuning

```bash
# Existing
NEXT_PUBLIC_TEXTURE_CACHE_TTL_MS=30000
NEXT_PUBLIC_TEXTURE_CACHE_MAX_SIZE=150
NEXT_PUBLIC_KTX2_RETRY_MS=60000

# Proposed new
NEXT_PUBLIC_DEFAULT_PERFORMANCE_MODE=balanced
NEXT_PUBLIC_MAX_ANISOTROPY=4
NEXT_PUBLIC_DISABLE_PHYSICS=false
NEXT_PUBLIC_FRAME_RATE_LIMIT=60
```

---

## Conclusion

The main performance issues for older hardware are:

1. **Multiple WebGL contexts** - Architecture issue requiring significant refactor
2. **Texture memory & KTX2 transcoding** - Quick win with settings
3. **Physics engine overhead** - Can disable for lite mode
4. **60fps animation loops** - Frame rate limiting helps
5. **Excessive store subscriptions** - Gradual refactoring needed

The proposed "Lite Mode" implementation would address most issues with minimal code changes, while the global Canvas refactor remains a longer-term solution for context exhaustion.
