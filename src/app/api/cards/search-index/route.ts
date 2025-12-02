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
    // Fetch all variants with card and set info
    const variants = await prisma.variant.findMany({
      select: {
        id: true,
        cardId: true,
        setId: true,
        slug: true,
        finish: true,
        card: { select: { name: true } },
        set: { select: { name: true } },
      },
      orderBy: { card: { name: "asc" } },
    });

    // Build compact index
    // Format: { entries: [[cardId, variantId, setId, cardName, slug, setName, isfoil], ...] }
    type VariantRow = (typeof variants)[number];
    const entries = variants.map((v: VariantRow) => [
      v.cardId,
      v.id,
      v.setId,
      v.card.name,
      v.slug,
      v.set.name,
      v.finish === "Foil" ? 1 : 0,
    ]);

    const index = { v: 1, entries };
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
    console.error("Failed to build search index:", e);
    return NextResponse.json(
      { error: "Failed to build index" },
      { status: 500 }
    );
  }
}
