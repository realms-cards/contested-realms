# Texture Cache & GPU Memory Optimization

## Problem
The app can experience **WebGL Context Loss** for two main reasons:
1. **Too many textures** loaded at once (GPU VRAM exhaustion)
2. **Too many WebGL contexts** across different pages (browser limit: typically 8-16 contexts)

The current architecture has **6 separate Canvas instances** across different pages (lobby, draft, game, replay, editor, etc.). Each Canvas creates its own WebGL context.

## Solutions Implemented

### 1. Balanced Cache Eviction
- **Old**: 60s TTL for unused textures
- **New**: 30s TTL (configurable via `NEXT_PUBLIC_TEXTURE_CACHE_TTL_MS`)
- Balance between keeping textures available and freeing memory
- ⚠️ **Warning**: Too aggressive (< 20s) causes slowdowns during Hot Module Reload

### 2. LRU Cache Size Limit
- **Default**: 150 textures maximum (configurable via `NEXT_PUBLIC_TEXTURE_CACHE_MAX_SIZE`)
- When cache is full, oldest unused textures are evicted
- Prevents unlimited memory growth during long draft sessions
- ⚠️ **Warning**: Too low (< 100) causes constant reloading

### 3. Reduced Anisotropic Filtering
- **Old**: 8x anisotropy
- **New**: 4x anisotropy
- Maintains good card text readability while using less memory

### 4. WebGL Context Monitoring
- Added listeners for `webglcontextlost` / `webglcontextrestored` events
- Logs warnings when context is lost to help diagnose issues
- **Note**: Forced context disposal was tested but caused worse performance in dev mode due to Hot Module Reload

### 5. Canvas Optimization
- `powerPreference: "high-performance"` - prioritizes GPU over battery
- `dpr: [1, 1.5]` - limits pixel density to reduce memory
- `preserveDrawingBuffer: false` - saves memory by not keeping framebuffer

## Environment Variables

Add these to `.env.local` to tune performance:

```bash
# Texture cache TTL in milliseconds (default: 30000 = 30s)
NEXT_PUBLIC_TEXTURE_CACHE_TTL_MS=30000

# Maximum number of textures to keep in cache (default: 150)
NEXT_PUBLIC_TEXTURE_CACHE_MAX_SIZE=150

# KTX2 retry delay after failure in milliseconds (default: 60000 = 60s)
NEXT_PUBLIC_KTX2_RETRY_MS=60000

# Path to KTX2 transcoder (default: /ktx2/)
NEXT_PUBLIC_KTX2_TRANSCODER_PATH=/ktx2/
```

## Monitoring

In development mode, you'll see console logs:

```
[texture-cache] Evicted 5 textures (cache: 100/100)
[serve-local] ✓ Serving KTX2: ancient_dragon_b_f.ktx2 (189.2KB)
[TournamentDraft3D] WebGL context lost - too many textures in memory
[TournamentDraft3D] WebGL context restored
```

## Performance Tips

### For Low-End GPUs (Integrated Graphics)
- Reduce cache size: `NEXT_PUBLIC_TEXTURE_CACHE_MAX_SIZE=100`
- Faster eviction: `NEXT_PUBLIC_TEXTURE_CACHE_TTL_MS=20000`
- Consider using WebP instead of KTX2 by setting `preferRaster: true` in card components

### For High-End GPUs (Dedicated Graphics)
- Increase cache: `NEXT_PUBLIC_TEXTURE_CACHE_MAX_SIZE=300`
- Longer TTL: `NEXT_PUBLIC_TEXTURE_CACHE_TTL_MS=60000`

### ⚠️ Development Mode Caveat
During dev with Hot Module Reload, aggressive settings cause performance degradation:
- HMR unmounts/remounts components frequently
- Too aggressive eviction means textures reload on every code change
- **Recommended dev settings**: TTL ≥ 30s, Cache Size ≥ 150

### Debugging Context Loss
If you still see context loss:
1. Check browser console for memory warnings
2. Close other GPU-heavy tabs (video, games, etc.)
3. Reduce cache size further
4. Consider using WebP instead of KTX2 (set `preferRaster: true`)

## Production CDN
In production, set `ASSET_CDN_ORIGIN` to serve assets from a CDN instead of local disk. This improves loading speed significantly.

## Long-Term Solution: Global Shared Canvas

### Current Architecture (Multiple Contexts)
```
/lobby → Canvas #1
/draft → Canvas #2 
/game → Canvas #3
/replay → Canvas #4
/editor → Canvas #5
/play → Canvas #6
```
Browser limit: ~8-16 contexts. Navigating between pages creates new contexts.

### Proposed Architecture (Single Global Context)
Use React Three Fiber's **View API** to share ONE WebGL context:

```tsx
// Root layout
<GlobalCanvasProvider>
  <Canvas> {/* Single global canvas */}
    {children} {/* All pages render into this */}
  </Canvas>
</GlobalCanvasProvider>

// Each page uses View instead of Canvas
<View track={divRef}>
  <OrbitControls />
  <Board />
  {/* ... */}
</View>
```

**Benefits:**
- Only 1 WebGL context for entire app
- No context loss from page navigation
- Faster page transitions (context already exists)
- Can have draft + game + preview all visible simultaneously

**See:** `src/components/three/GlobalCanvasProvider.tsx` (started but not integrated)

This requires refactoring all Canvas instances to use View components.
