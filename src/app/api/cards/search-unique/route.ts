import { NextRequest } from "next/server";
import { withCache, CacheKeys } from "@/lib/cache/redis-cache";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type SearchResult = {
  cardId: number;
  variantId: number;
  name: string;
  slug: string;
  type: string | null;
  subTypes: string | null;
  rarity: string | null;
  cost: number | null;
  attack: number | null;
  defence: number | null;
  thresholds: string | null;
  elements: string | null;
  set: string;
};

/**
 * GET /api/cards/search-unique?q=<query>&type=<site|avatar|spell>
 * Returns unique cards (one per card name) for toolbox search.
 * No variant duplicates - returns the Standard finish variant when available.
 * Results are cached in Redis for 5 minutes.
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const q = (searchParams.get("q") || "").trim();
    const typeFilt = (searchParams.get("type") || "").trim().toLowerCase();

    if (!q) {
      return new Response(JSON.stringify([]), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    // Generate cache key for this search
    const cacheKey = CacheKeys.cards.search({
      q,
      type: typeFilt,
      unique: true, // Differentiate from regular search
    });

    // Use Redis cache with 5 minute TTL (card data is stable)
    const results = await withCache<SearchResult[]>(
      cacheKey,
      async () => {
        // Search cards by name (case-insensitive)
        const cards = await prisma.card.findMany({
          where: {
            name: { contains: q, mode: "insensitive" },
          },
          select: {
            id: true,
            name: true,
            elements: true,
            subTypes: true,
            variants: {
              select: {
                id: true,
                slug: true,
                finish: true,
                setId: true,
                set: { select: { name: true } },
              },
              take: 10,
            },
            meta: {
              select: {
                type: true,
                rarity: true,
                cost: true,
                attack: true,
                defence: true,
                thresholds: true,
                rulesText: true,
                setId: true,
              },
              take: 5,
            },
          },
          take: 50,
        });

        if (cards.length === 0) {
          return [];
        }

        const searchResults: SearchResult[] = [];

        for (const card of cards) {
          const cardMeta = card.meta[0];
          const type = cardMeta?.type || null;

          // Apply type filter
          if (typeFilt) {
            const t = (type || "").toLowerCase();
            if (typeFilt === "site" && !t.includes("site")) continue;
            if (typeFilt === "avatar" && !t.includes("avatar")) continue;
            if (
              typeFilt === "spell" &&
              (t.includes("site") || t.includes("avatar"))
            )
              continue;
          }

          // Pick best variant: prefer Standard finish, then non-promo sets
          const variants = card.variants;
          if (variants.length === 0) continue;

          const sortedVariants = [...variants].sort((a, b) => {
            if (a.finish !== b.finish) {
              if (a.finish === "Standard") return -1;
              if (b.finish === "Standard") return 1;
            }
            const aIsPromo = a.set.name.toLowerCase().includes("promo");
            const bIsPromo = b.set.name.toLowerCase().includes("promo");
            if (aIsPromo !== bIsPromo) return aIsPromo ? 1 : -1;
            return 0;
          });

          const bestVariant = sortedVariants[0];

          searchResults.push({
            cardId: card.id,
            variantId: bestVariant.id,
            name: card.name,
            slug: bestVariant.slug.startsWith("dra_")
              ? "drl_" + bestVariant.slug.slice(4)
              : bestVariant.slug,
            type,
            subTypes: card.subTypes,
            rarity: cardMeta?.rarity || null,
            cost: cardMeta?.cost ?? null,
            attack: cardMeta?.attack ?? null,
            defence: cardMeta?.defence ?? null,
            thresholds: cardMeta?.thresholds as string | null,
            elements: card.elements,
            set: bestVariant.set.name,
          });
        }

        // Sort by name
        searchResults.sort((a, b) => a.name.localeCompare(b.name));
        return searchResults;
      },
      { ttl: 300 } // 5 minute cache
    );

    return new Response(JSON.stringify(results), {
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
    console.error("[API /cards/search-unique] Error:", message);
    return new Response(JSON.stringify({ error: message }), { status: 500 });
  }
}
