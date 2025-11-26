/**
 * Cached database lookups for API routes.
 * These caches reduce repeated DB queries for rarely-changing data.
 */

import { prisma } from "@/lib/prisma";

// ─── Set Name → ID Cache ─────────────────────────────────────────────────────
// Sets rarely change (only on ingestion), so caching is safe
const SET_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

interface SetCacheEntry {
  id: number;
  expiresAt: number;
}

const setIdCache = new Map<string, SetCacheEntry>();

/**
 * Get set ID by name with caching.
 * Returns null if set doesn't exist.
 */
export async function getSetIdByName(setName: string): Promise<number | null> {
  const normalizedName = setName.trim();
  if (!normalizedName) return null;

  // Check cache
  const cached = setIdCache.get(normalizedName);
  if (cached && Date.now() < cached.expiresAt) {
    if (process.env.NODE_ENV === "development") {
      console.log(`[set-cache] HIT: ${normalizedName} -> ${cached.id}`);
    }
    return cached.id;
  }

  // Query database
  const set = await prisma.set.findUnique({
    where: { name: normalizedName },
    select: { id: true },
  });

  if (!set) {
    if (process.env.NODE_ENV === "development") {
      console.log(`[set-cache] MISS (not found): ${normalizedName}`);
    }
    return null;
  }

  // Cache result
  setIdCache.set(normalizedName, {
    id: set.id,
    expiresAt: Date.now() + SET_CACHE_TTL_MS,
  });

  if (process.env.NODE_ENV === "development") {
    console.log(`[set-cache] MISS (cached): ${normalizedName} -> ${set.id}`);
  }

  return set.id;
}

/**
 * Pre-warm the set cache with all sets.
 * Call this on server startup for optimal performance.
 */
export async function preWarmSetCache(): Promise<void> {
  try {
    const sets = await prisma.set.findMany({
      select: { id: true, name: true },
    });
    const expiresAt = Date.now() + SET_CACHE_TTL_MS;
    for (const set of sets) {
      setIdCache.set(set.name, { id: set.id, expiresAt });
    }
    if (process.env.NODE_ENV === "development") {
      console.log(`[set-cache] Pre-warmed ${sets.length} sets`);
    }
  } catch (e) {
    console.error("[set-cache] Failed to pre-warm:", e);
  }
}

/**
 * Clear the set cache. Useful after card ingestion.
 */
export function clearSetCache(): void {
  setIdCache.clear();
}
