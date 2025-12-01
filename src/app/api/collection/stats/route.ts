import { getServerAuthSession } from "@/lib/auth";
import type { CollectionStats } from "@/lib/collection/types";
import { withCache, CacheKeys } from "@/lib/cache/redis-cache";
import { logPerformance } from "@/lib/monitoring/performance";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// GET /api/collection/stats
// Returns collection statistics including set completion
export async function GET() {
  const startTime = performance.now();
  const session = await getServerAuthSession();
  if (!session?.user) {
    return new Response(
      JSON.stringify({ error: "Unauthorized", code: "UNAUTHORIZED" }),
      { status: 401, headers: { "content-type": "application/json" } }
    );
  }

  try {
    const userId = session.user.id;

    // Generate cache key for this user's collection stats
    const cacheKey = CacheKeys.collection.stats(userId);

    // Wrap stats query with Redis cache (30 second TTL - balances freshness with performance)
    const response = await withCache(
      cacheKey,
      async () => {
        // Get total cards and unique cards
        const [totalAgg, uniqueCards] = await Promise.all([
      prisma.collectionCard.aggregate({
        where: { userId },
        _sum: { quantity: true },
      }),
      prisma.collectionCard.groupBy({
        by: ["cardId"],
        where: { userId },
      }),
    ]);

    // Get cards by set for completion tracking
    const cardsBySet = await prisma.collectionCard.groupBy({
      by: ["setId"],
      where: { userId, setId: { not: null } },
      _count: { cardId: true },
    });

    // Get all sets with their card counts
    const sets = await prisma.set.findMany({
      select: {
        id: true,
        name: true,
        _count: {
          select: { variants: true },
        },
      },
    });

    // Also get unique card count per set (via CardSetMetadata)
    const setCardCounts = await prisma.cardSetMetadata.groupBy({
      by: ["setId"],
      _count: { cardId: true },
    });
    const cardCountBySet = new Map(
      setCardCounts.map((s) => [s.setId, s._count.cardId])
    );

    // Build set completion data
    const ownedBySet = new Map(
      cardsBySet
        .filter((s) => s.setId !== null)
        .map((s) => [s.setId as number, s._count.cardId])
    );

    const bySet = sets
      .map((set) => {
        const owned = ownedBySet.get(set.id) || 0;
        const total = cardCountBySet.get(set.id) || 0;
        return {
          setId: set.id,
          setName: set.name,
          owned,
          total,
          completion: total > 0 ? owned / total : 0,
          value: null, // Pricing to be added later
        };
      })
      .filter((s) => s.total > 0);

    // Optimized: Fetch collection once with both elements and metadata
    // This reduces 2 separate queries (1000 rows) to 1 query (500 rows)
    const collectionWithDetails = await prisma.collectionCard.findMany({
      where: { userId },
      select: {
        quantity: true,
        setId: true,
        card: {
          select: {
            elements: true,
            meta: {
              select: { rarity: true, setId: true },
            },
          },
        },
      },
    });

    // Process both element and rarity aggregations in single pass
    const byElement: Record<string, number> = {};
    const byRarity: Record<string, number> = {};

    for (const entry of collectionWithDetails) {
      // Aggregate by element
      const elements = entry.card.elements;
      if (elements) {
        const elementList = elements.split(",").map((e) => e.trim());
        for (const el of elementList) {
          if (el) {
            byElement[el] = (byElement[el] || 0) + entry.quantity;
          }
        }
      }

      // Aggregate by rarity
      const meta = entry.setId
        ? entry.card.meta.find((m) => m.setId === entry.setId)
        : entry.card.meta[0];

      if (meta?.rarity) {
        byRarity[meta.rarity] = (byRarity[meta.rarity] || 0) + entry.quantity;
      }
    }

        return {
          summary: {
            totalCards: totalAgg._sum.quantity || 0,
            uniqueCards: uniqueCards.length,
            totalValue: null, // Pricing to be computed later
            currency: "USD",
          },
          bySet,
          byElement,
          byRarity,
        } as CollectionStats;
      },
      { ttl: 30 } // 30 second cache - balances freshness with performance
    );

    logPerformance('GET /api/collection/stats', performance.now() - startTime);
    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    logPerformance('GET /api/collection/stats', performance.now() - startTime);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
}
