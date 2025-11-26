import { NextRequest } from "next/server";
import { getServerAuthSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// GET /api/collection/decks
// List user's collection-based decks
export async function GET() {
  const session = await getServerAuthSession();
  if (!session?.user) {
    return new Response(
      JSON.stringify({ error: "Unauthorized", code: "UNAUTHORIZED" }),
      { status: 401, headers: { "content-type": "application/json" } }
    );
  }

  try {
    const userId = session.user.id;

    // Collection decks are stored as regular decks with format 'CollectionConstructed'
    const decks = await prisma.deck.findMany({
      where: {
        userId,
        format: "CollectionConstructed",
      },
      orderBy: { updatedAt: "desc" },
      include: {
        cards: {
          include: {
            card: {
              include: {
                meta: { take: 1 },
              },
            },
            variant: true,
          },
        },
      },
    });

    const response = {
      decks: decks.map((deck) => {
        // Find avatar card
        const avatarCard = deck.cards.find((c) =>
          c.card.meta[0]?.type?.toLowerCase().includes("avatar")
        );

        // Count cards by zone
        const spellbookCount = deck.cards
          .filter((c) => c.zone === "Spellbook")
          .reduce((sum, c) => sum + c.count, 0);
        const atlasCount = deck.cards
          .filter((c) => c.zone === "Atlas")
          .reduce((sum, c) => sum + c.count, 0);

        // Basic validation
        const validationErrors: string[] = [];
        if (!avatarCard) validationErrors.push("Missing avatar");
        if (spellbookCount < 40)
          validationErrors.push("Spellbook needs 40+ cards");
        if (atlasCount < 12) validationErrors.push("Atlas needs 12+ sites");

        return {
          id: deck.id,
          name: deck.name,
          format: deck.format,
          isCollectionDeck: true,
          cardCount: deck.cards.reduce((sum, c) => sum + c.count, 0),
          isValid: validationErrors.length === 0,
          validationErrors,
          avatarCard: avatarCard
            ? {
                name: avatarCard.card.name,
                slug: avatarCard.variant?.slug || null,
              }
            : null,
          updatedAt: deck.updatedAt.toISOString(),
        };
      }),
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

// POST /api/collection/decks
// Create a new collection-based deck
export async function POST(req: NextRequest) {
  const session = await getServerAuthSession();
  if (!session?.user) {
    return new Response(
      JSON.stringify({ error: "Unauthorized", code: "UNAUTHORIZED" }),
      { status: 401, headers: { "content-type": "application/json" } }
    );
  }

  try {
    const userId = session.user.id;

    // Verify user exists
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return new Response(
        JSON.stringify({ error: "User not found", code: "USER_NOT_FOUND" }),
        { status: 401, headers: { "content-type": "application/json" } }
      );
    }

    const body = await req.json();
    const name = String(body?.name || "").trim();

    if (!name) {
      return new Response(
        JSON.stringify({
          error: "Deck name is required",
          code: "INVALID_INPUT",
        }),
        { status: 400, headers: { "content-type": "application/json" } }
      );
    }

    // Create deck with CollectionConstructed format
    const deck = await prisma.deck.create({
      data: {
        name,
        format: "CollectionConstructed",
        userId,
        isPublic: false,
      },
    });

    return new Response(
      JSON.stringify({
        id: deck.id,
        name: deck.name,
        format: deck.format,
        isCollectionDeck: true,
        cards: [],
        createdAt: deck.createdAt.toISOString(),
      }),
      { status: 201, headers: { "content-type": "application/json" } }
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
}
