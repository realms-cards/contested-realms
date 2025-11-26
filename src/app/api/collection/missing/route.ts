import { NextRequest } from "next/server";
import { getServerAuthSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// GET /api/collection/missing
// Query params: setId?, rarity?, page, limit
// Returns cards the user doesn't own
export async function GET(req: NextRequest) {
  const session = await getServerAuthSession();
  if (!session?.user) {
    return new Response(
      JSON.stringify({ error: "Unauthorized", code: "UNAUTHORIZED" }),
      { status: 401, headers: { "content-type": "application/json" } }
    );
  }

  try {
    const { searchParams } = new URL(req.url);
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.min(
      100,
      Math.max(1, parseInt(searchParams.get("limit") || "50", 10))
    );
    const setId = searchParams.get("setId")
      ? parseInt(searchParams.get("setId")!, 10)
      : undefined;
    const rarity = searchParams.get("rarity") || undefined;

    const userId = session.user.id;

    // Get all card IDs the user owns
    const ownedCards = await prisma.collectionCard.findMany({
      where: { userId },
      select: { cardId: true },
    });
    const ownedCardIds = new Set(ownedCards.map((c) => c.cardId));

    // Build filter for cards the user doesn't own
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const metaWhere: any = {};
    if (setId) {
      metaWhere.setId = setId;
    }
    if (rarity) {
      metaWhere.rarity = rarity;
    }

    // Get all cards with metadata matching filters
    const allCards = await prisma.cardSetMetadata.findMany({
      where: metaWhere,
      include: {
        card: true,
        set: { select: { name: true } },
      },
      orderBy: { card: { name: "asc" } },
    });

    // Filter out owned cards
    const missingCards = allCards.filter(
      (meta) => !ownedCardIds.has(meta.cardId)
    );

    // Paginate
    const total = missingCards.length;
    const paginatedCards = missingCards.slice((page - 1) * limit, page * limit);

    const response = {
      cards: paginatedCards.map((meta) => ({
        cardId: meta.cardId,
        name: meta.card.name,
        set: meta.set.name,
        setId: meta.setId,
        rarity: meta.rarity,
        type: meta.type,
        elements: meta.card.elements,
        price: {
          marketPrice: null, // Pricing to be added later
          currency: "USD",
        },
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
}
