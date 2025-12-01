"use client";

/**
 * Texture Memory Monitoring Utilities
 *
 * Provides observability into texture cache performance and memory usage.
 * Use these utilities to debug texture-related issues and optimize cache settings.
 */

import type { Texture } from "three";

export interface TextureCacheStats {
  /** Total number of textures in cache */
  totalTextures: number;
  /** Number of textures currently referenced by components */
  activeTextures: number;
  /** Number of textures in soft-cache (unreferenced but not evicted) */
  cachedTextures: number;
  /** Estimated GPU memory usage in MB */
  estimatedMemoryMB: number;
  /** Number of pending texture loads */
  pendingLoads: number;
  /** Breakdown by texture type (ktx2 vs raster) */
  byType: {
    ktx2: number;
    raster: number;
    unknown: number;
  };
  /** Top 10 most referenced textures */
  topTextures: Array<{
    url: string;
    refs: number;
    lastUsed: number;
    ageSeconds: number;
  }>;
}

/**
 * Estimate texture memory usage based on dimensions and format
 */
function estimateTextureMemory(texture: Texture): number {
  const image = texture.image;
  if (!image) return 0;

  const width = image.width || 1024;
  const height = image.height || 1024;

  // Estimate based on format
  // KTX2 compressed: ~1-2 bits per pixel
  // Uncompressed RGBA: 4 bytes per pixel
  const isCompressed = texture.format !== undefined && texture.format >= 1000; // Compressed formats start at 1000
  const bytesPerPixel = isCompressed ? 0.125 : 4; // 1 bit for compressed, 4 bytes for RGBA

  return (width * height * bytesPerPixel) / (1024 * 1024); // Convert to MB
}

/**
 * Get comprehensive texture cache statistics
 *
 * @returns Current cache statistics including memory usage and top textures
 *
 * @example
 * ```typescript
 * const stats = getTextureCacheStats();
 * console.log(`Cache size: ${stats.totalTextures} textures`);
 * console.log(`Memory usage: ${stats.estimatedMemoryMB.toFixed(1)}MB`);
 * console.log(`Active: ${stats.activeTextures}, Cached: ${stats.cachedTextures}`);
 * ```
 */
export function getTextureCacheStats(): TextureCacheStats {
  // Access internal cache via window global (set by useCardTexture)
  const cache = (globalThis as unknown as { __textureCache?: Map<string, {
    texture: Texture;
    refs: number;
    lastUsed: number;
  }> }).__textureCache;

  const pendingLoads = (globalThis as unknown as { __texturePendingLoads?: Map<string, Promise<Texture>> }).__texturePendingLoads;

  if (!cache) {
    return {
      totalTextures: 0,
      activeTextures: 0,
      cachedTextures: 0,
      estimatedMemoryMB: 0,
      pendingLoads: pendingLoads?.size ?? 0,
      byType: { ktx2: 0, raster: 0, unknown: 0 },
      topTextures: [],
    };
  }

  let activeCount = 0;
  let cachedCount = 0;
  let totalMemory = 0;
  const byType = { ktx2: 0, raster: 0, unknown: 0 };
  const allTextures: Array<{ url: string; refs: number; lastUsed: number; memory: number }> = [];

  const now = Date.now();

  for (const [url, entry] of cache.entries()) {
    if (entry.refs > 0) {
      activeCount++;
    } else {
      cachedCount++;
    }

    const memory = estimateTextureMemory(entry.texture);
    totalMemory += memory;

    // Categorize by type based on URL
    if (url.includes('ktx2') || url.includes('?ktx2=1')) {
      byType.ktx2++;
    } else if (url.match(/\.(png|jpg|jpeg|webp)/i)) {
      byType.raster++;
    } else {
      byType.unknown++;
    }

    allTextures.push({
      url,
      refs: entry.refs,
      lastUsed: entry.lastUsed,
      memory,
    });
  }

  // Sort by reference count (descending) and take top 10
  const topTextures = allTextures
    .sort((a, b) => b.refs - a.refs)
    .slice(0, 10)
    .map(({ url, refs, lastUsed, memory }) => ({
      url: url.length > 50 ? '...' + url.slice(-47) : url,
      refs,
      lastUsed,
      ageSeconds: Math.floor((now - lastUsed) / 1000),
    }));

  return {
    totalTextures: cache.size,
    activeTextures: activeCount,
    cachedTextures: cachedCount,
    estimatedMemoryMB: totalMemory,
    pendingLoads: pendingLoads?.size ?? 0,
    byType,
    topTextures,
  };
}

/**
 * Log texture cache statistics to console
 * Useful for debugging and performance monitoring
 *
 * @example
 * ```typescript
 * // Call periodically to monitor cache health
 * setInterval(() => logTextureCacheStats(), 10000); // Every 10 seconds
 * ```
 */
export function logTextureCacheStats(): void {
  const stats = getTextureCacheStats();

  console.group('[Texture Cache Stats]');
  console.log(`Total: ${stats.totalTextures} textures (${stats.estimatedMemoryMB.toFixed(1)}MB)`);
  console.log(`Active: ${stats.activeTextures} | Cached: ${stats.cachedTextures} | Pending: ${stats.pendingLoads}`);
  console.log(`By Type: KTX2=${stats.byType.ktx2}, Raster=${stats.byType.raster}, Unknown=${stats.byType.unknown}`);

  if (stats.topTextures.length > 0) {
    console.log('\nTop Referenced Textures:');
    stats.topTextures.forEach(({ url, refs, ageSeconds }) => {
      console.log(`  ${refs}x refs | ${ageSeconds}s ago | ${url}`);
    });
  }

  console.groupEnd();
}

/**
 * Clear all unreferenced textures from cache immediately
 * Useful for debugging or freeing memory in low-memory situations
 *
 * @returns Number of textures evicted
 *
 * @example
 * ```typescript
 * const evicted = forceClearUnreferencedTextures();
 * console.log(`Cleared ${evicted} textures from cache`);
 * ```
 */
export function forceClearUnreferencedTextures(): number {
  const cache = (globalThis as unknown as { __textureCache?: Map<string, {
    texture: Texture;
    refs: number;
    lastUsed: number;
    evictTimer?: number;
  }> }).__textureCache;

  if (!cache) return 0;

  let evicted = 0;

  for (const [url, entry] of cache.entries()) {
    if (entry.refs <= 0) {
      // Cancel eviction timer if active
      if (entry.evictTimer) {
        try {
          window.clearTimeout(entry.evictTimer);
        } catch {}
      }

      // Dispose texture and remove from cache
      try {
        entry.texture.dispose();
      } catch {}

      cache.delete(url);
      evicted++;
    }
  }

  if (process.env.NODE_ENV === 'development') {
    console.log(`[texture-cache] Force cleared ${evicted} unreferenced textures`);
  }

  return evicted;
}

/**
 * React hook for texture cache statistics
 * Updates every `updateInterval` milliseconds
 *
 * @param updateInterval - Update frequency in milliseconds (default: 1000)
 * @returns Current texture cache statistics
 *
 * @example
 * ```typescript
 * function TextureDebugPanel() {
 *   const stats = useTextureCacheStats(1000);
 *
 *   return (
 *     <div>
 *       <p>Textures: {stats.totalTextures}</p>
 *       <p>Memory: {stats.estimatedMemoryMB.toFixed(1)}MB</p>
 *       <p>Active: {stats.activeTextures}</p>
 *     </div>
 *   );
 * }
 * ```
 */
export function useTextureCacheStats(updateInterval = 1000): TextureCacheStats {
  if (typeof window === 'undefined') {
    return {
      totalTextures: 0,
      activeTextures: 0,
      cachedTextures: 0,
      estimatedMemoryMB: 0,
      pendingLoads: 0,
      byType: { ktx2: 0, raster: 0, unknown: 0 },
      topTextures: [],
    };
  }

  const [stats, setStats] = (
    typeof window !== 'undefined'
      ? require('react').useState<TextureCacheStats>(() => getTextureCacheStats())
      : [{
          totalTextures: 0,
          activeTextures: 0,
          cachedTextures: 0,
          estimatedMemoryMB: 0,
          pendingLoads: 0,
          byType: { ktx2: 0, raster: 0, unknown: 0 },
          topTextures: [],
        }, () => {}]
  ) as [TextureCacheStats, (stats: TextureCacheStats) => void];

  if (typeof window !== 'undefined') {
    const { useEffect } = require('react');
    useEffect(() => {
      const interval = setInterval(() => {
        setStats(getTextureCacheStats());
      }, updateInterval);

      return () => clearInterval(interval);
    }, [updateInterval]);
  }

  return stats;
}

/**
 * Expose cache to global for monitoring utilities
 * Called automatically by useCardTexture
 */
export function exposeTextureCache(
  cache: Map<string, unknown>,
  pendingLoads: Map<string, Promise<Texture>>
): void {
  if (typeof globalThis !== 'undefined') {
    (globalThis as unknown as { __textureCache: Map<string, unknown> }).__textureCache = cache;
    (globalThis as unknown as { __texturePendingLoads: Map<string, Promise<Texture>> }).__texturePendingLoads = pendingLoads;
  }
}
