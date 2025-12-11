import { NextRequest } from "next/server";
export const dynamic = "force-dynamic";
import { getSetIdByName } from "@/lib/api/cached-lookups";
import { getCached, setCached } from "@/lib/cache/redis-cache";
import { prisma } from "@/lib/prisma";

// ─── In-memory cache for card metadata ───────────────────────────────────────
// Card stats rarely change (only on ingestion), so caching is safe
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const REDIS_CACHE_TTL_SECONDS = 300; // 5 minutes for Redis
const MAX_CACHE_ENTRIES = 500;

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

type CardMetaResult = {
  slug: string;
  cardId: number;
  cost: number | null;
  thresholds: Record<string, number> | null;
  attack: number | null;
  defence: number | null;
};

const cardMetaCache = new Map<string, CacheEntry<CardMetaResult[]>>();

function getCacheKey(setName: string, slugs: string[]): string {
  return `${setName}|${slugs.sort().join(",")}`;
}

function getFromCache(key: string): CardMetaResult[] | null {
  const entry = cardMetaCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cardMetaCache.delete(key);
    return null;
  }
  return entry.data;
}

function setInCache(key: string, data: CardMetaResult[]): void {
  // Evict oldest entries if cache is full
  if (cardMetaCache.size >= MAX_CACHE_ENTRIES) {
    const keysToDelete = Array.from(cardMetaCache.keys()).slice(
      0,
      MAX_CACHE_ENTRIES / 4
    );
    for (const k of keysToDelete) cardMetaCache.delete(k);
  }
  cardMetaCache.set(key, { data, expiresAt: Date.now() + CACHE_TTL_MS });
}

// GET /api/cards/meta-by-variant?set=Alpha&slugs=slug1,slug2,slug3
// Returns: [{ slug, cardId, cost, thresholds, attack, defence }]
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const setName = (searchParams.get("set") || "").trim();
    const slugsParam = (searchParams.get("slugs") || "").trim();

    if (!slugsParam) {
      return new Response(JSON.stringify([]), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    const slugs = Array.from(
      new Set(
        slugsParam
          .split(",")
          .map((s) => s.trim())
          .filter((s) => !!s)
      )
    );

    // Check in-memory cache first (fastest)
    const cacheKey = getCacheKey(setName, slugs);
    const memCached = getFromCache(cacheKey);
    if (memCached) {
      if (process.env.NODE_ENV === "development") {
        console.log(`[card-meta-cache] MEM HIT: ${cacheKey.slice(0, 50)}...`);
      }
      return new Response(JSON.stringify(memCached), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    // Check Redis cache (shared across instances)
    const redisCacheKey = `cards:meta:${cacheKey}`;
    const redisCached = await getCached<CardMetaResult[]>(redisCacheKey);
    if (redisCached) {
      // Populate in-memory cache for next request
      setInCache(cacheKey, redisCached);
      if (process.env.NODE_ENV === "development") {
        console.log(`[card-meta-cache] REDIS HIT: ${cacheKey.slice(0, 50)}...`);
      }
      return new Response(JSON.stringify(redisCached), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    // Resolve set if provided (using cached lookup)
    let setId: number | null = null;
    if (setName) {
      setId = await getSetIdByName(setName);
      if (setId === null) {
        return new Response(
          JSON.stringify({ error: `Unknown set: ${setName}` }),
          { status: 400 }
        );
      }
    }

    // Find variants by slug (optionally constrained by set)
    type VariantRow = {
      id: number;
      cardId: number;
      setId: number;
      slug: string;
    };
    const variants: VariantRow[] = await prisma.variant.findMany({
      where: {
        slug: { in: slugs },
        ...(setId != null ? { setId } : {}),
      },
      select: { id: true, cardId: true, setId: true, slug: true },
    });

    if (!variants.length) {
      return new Response(JSON.stringify([]), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    // If no set constraint, variants may include multiple sets per slug; pick the highest setId per slug
    let effectiveVariants: VariantRow[] = variants;
    if (setId == null) {
      const bestBySlug = new Map<string, VariantRow>();
      for (const v of variants) {
        const cur = bestBySlug.get(v.slug);
        if (!cur || v.setId > cur.setId) bestBySlug.set(v.slug, v);
      }
      effectiveVariants = Array.from(bestBySlug.values());
    }

    // Fetch metadata rows for (cardId,setId) pairs
    const pairs = effectiveVariants.map((v) => ({
      cardId: v.cardId,
      setId: v.setId,
    }));
    const metas = await prisma.cardSetMetadata.findMany({
      where: { OR: pairs },
      select: {
        cardId: true,
        setId: true,
        cost: true,
        thresholds: true,
        attack: true,
        defence: true,
      },
    });

    // Map (cardId,setId) -> meta
    const key = (c: number, s: number) => `${c}:${s}`;
    const metaByPair = new Map<string, (typeof metas)[number]>();
    for (const m of metas) metaByPair.set(key(m.cardId, m.setId), m);

    // Build output rows keyed by slug
    const out: CardMetaResult[] = effectiveVariants.map((v) => {
      const m = metaByPair.get(key(v.cardId, v.setId));
      return {
        slug: v.slug,
        cardId: v.cardId,
        cost: m?.cost ?? null,
        thresholds:
          (m?.thresholds as unknown as Record<string, number> | null) ?? null,
        attack: m?.attack ?? null,
        defence: m?.defence ?? null,
      };
    });

    // Store in both caches
    setInCache(cacheKey, out);
    // Fire-and-forget Redis cache write
    setCached(redisCacheKey, out, { ttl: REDIS_CACHE_TTL_SECONDS }).catch(
      () => {
        // Ignore Redis errors - in-memory cache is still working
      }
    );
    if (process.env.NODE_ENV === "development") {
      console.log(
        `[card-meta-cache] MISS: ${cacheKey.slice(0, 50)}... (cached ${
          out.length
        } items)`
      );
    }

    return new Response(JSON.stringify(out), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  } catch (e: unknown) {
    const message =
      e instanceof Error
        ? e.message
        : typeof e === "string"
        ? e
        : "Unknown error";
    return new Response(JSON.stringify({ error: message }), { status: 500 });
  }
}
