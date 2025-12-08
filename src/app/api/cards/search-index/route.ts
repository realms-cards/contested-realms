import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Cache the index in memory (survives across requests)
let cachedIndex: string | null = null;
let cacheTime = 0;
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

// ISR: Combined with in-memory cache for optimal performance
export const revalidate = 3600; // 1 hour

// GET /api/cards/search-index
// Returns a compact JSON index for client-side search
export async function GET() {
  const now = Date.now();

  // Return cached if fresh
  if (cachedIndex && now - cacheTime < CACHE_TTL) {
    return new NextResponse(cachedIndex, {
      status: 200,
      headers: {
        "content-type": "application/json",
        "cache-control": "public, max-age=3600",
      },
    });
  }

  try {
    // Fetch all variants with card, set, and metadata info
    const variants = await prisma.variant.findMany({
      select: {
        id: true,
        cardId: true,
        setId: true,
        slug: true,
        finish: true,
        card: {
          select: {
            name: true,
            meta: {
              select: {
                setId: true,
                type: true,
              },
            },
          },
        },
        set: { select: { name: true } },
      },
      orderBy: { card: { name: "asc" } },
    });

    // Build compact index
    // Format: { v: 2, entries: [[cardId, variantId, setId, cardName, slug, setName, isfoil, isSite], ...] }
    type VariantRow = (typeof variants)[number];

    // Helper to detect promotional sets
    const isPromoSet = (setName: string) => {
      const lower = setName.toLowerCase();
      return lower === "promotional" || lower === "promo";
    };

    // Sort variants to prioritize non-promo sets and Standard finish
    const sortedVariants = [...variants].sort((a, b) => {
      // First by card name
      const nameCompare = a.card.name.localeCompare(b.card.name);
      if (nameCompare !== 0) return nameCompare;
      // Then non-promo before promo
      const aIsPromo = isPromoSet(a.set.name);
      const bIsPromo = isPromoSet(b.set.name);
      if (aIsPromo !== bIsPromo) return aIsPromo ? 1 : -1;
      // Then Standard before Foil
      if (a.finish !== b.finish) return a.finish === "Standard" ? -1 : 1;
      return 0;
    });

    const entries = sortedVariants.map((v: VariantRow) => {
      // Find the type for this variant's set, or fall back to any available type
      const metaForSet = v.card.meta.find((m) => m.setId === v.setId);
      const cardType = metaForSet?.type || v.card.meta[0]?.type || "";
      const isSite = cardType.toLowerCase().includes("site") ? 1 : 0;

      return [
        v.cardId,
        v.id,
        v.setId,
        v.card.name,
        v.slug,
        v.set.name,
        v.finish === "Foil" ? 1 : 0,
        isSite,
      ];
    });

    const index = { v: 2, entries };
    cachedIndex = JSON.stringify(index);
    cacheTime = now;

    return new NextResponse(cachedIndex, {
      status: 200,
      headers: {
        "content-type": "application/json",
        "cache-control": "public, max-age=3600",
      },
    });
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : String(e);
    const errorStack = e instanceof Error ? e.stack : undefined;
    console.error("Failed to build search index:", errorMessage);
    if (errorStack) console.error("Stack:", errorStack);
    return NextResponse.json(
      { error: "Failed to build index", details: errorMessage },
      { status: 500 }
    );
  }
}
