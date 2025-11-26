import { NextRequest } from "next/server";
import { getServerAuthSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { CardAvailability } from "@/lib/collection/types";

export const dynamic = "force-dynamic";

// GET /api/collection/decks/[id]/availability
// Real-time availability check for deck cards
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerAuthSession();
  if (!session?.user) {
    return new Response(
      JSON.stringify({ error: "Unauthorized", code: "UNAUTHORIZED" }),
      { status: 401, headers: { "content-type": "application/json" } }
    );
  }

  try {
    const { id } = await params;
    const userId = session.user.id;

    // Find the deck
    const deck = await prisma.deck.findUnique({
      where: { id },
      include: {
        cards: {
          include: {
            card: true,
          },
        },
      },
    });

    if (!deck) {
      return new Response(
        JSON.stringify({ error: "Deck not found", code: "NOT_FOUND" }),
        { status: 404, headers: { "content-type": "application/json" } }
      );
    }

    if (deck.userId !== userId) {
      return new Response(
        JSON.stringify({ error: "Unauthorized", code: "UNAUTHORIZED" }),
        { status: 401, headers: { "content-type": "application/json" } }
      );
    }

    // Get user's collection
    const collection = await prisma.collectionCard.findMany({
      where: { userId },
      select: { cardId: true, quantity: true },
    });

    // Build ownership map
    const ownedByCard = new Map<number, number>();
    for (const c of collection) {
      ownedByCard.set(c.cardId, (ownedByCard.get(c.cardId) || 0) + c.quantity);
    }

    // Calculate availability for each card
    const errors: string[] = [];
    const cards: CardAvailability[] = deck.cards.map((c) => {
      const owned = ownedByCard.get(c.cardId) || 0;
      const available = owned - c.count;

      let status: CardAvailability["status"];
      if (owned === 0) {
        status = "unavailable";
        errors.push(`${c.card.name}: not owned`);
      } else if (available < 0) {
        status = "exceeded";
        errors.push(`${c.card.name}: need ${c.count}, own ${owned}`);
      } else if (available === 0) {
        status = "full";
      } else {
        status = "available";
      }

      return {
        cardId: c.cardId,
        name: c.card.name,
        inDeck: c.count,
        owned,
        available,
        status,
      };
    });

    const isValid = errors.length === 0;

    return new Response(
      JSON.stringify({
        deckId: id,
        cards,
        isValid,
        errors,
      }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
}
