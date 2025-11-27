import { NextRequest } from "next/server";
import { getServerAuthSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// POST /api/collection/decks/[id]/export
// Export collection deck to regular deck for simulator use
export async function POST(
  req: NextRequest,
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

    // Find the collection deck
    const deck = await prisma.deck.findUnique({
      where: { id },
      include: {
        cards: true,
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

    // Parse optional name from body
    const body = await req.json().catch(() => ({}));
    const name = body?.name
      ? String(body.name).trim()
      : `${deck.name} (exported)`;

    // Create a copy as a regular Constructed deck
    const exportedDeck = await prisma.$transaction(async (tx) => {
      // Create new deck
      const newDeck = await tx.deck.create({
        data: {
          name,
          format: "Constructed",
          userId,
          isPublic: false,
        },
      });

      // Copy all cards
      if (deck.cards.length > 0) {
        await tx.deckCard.createMany({
          data: deck.cards.map((c) => ({
            deckId: newDeck.id,
            cardId: c.cardId,
            setId: c.setId,
            variantId: c.variantId,
            zone: c.zone,
            count: c.count,
          })),
        });
      }

      return newDeck;
    });

    return new Response(
      JSON.stringify({
        exportedDeckId: exportedDeck.id,
        name: exportedDeck.name,
        format: exportedDeck.format,
        cardCount: deck.cards.reduce((sum, c) => sum + c.count, 0),
        message: "Deck exported successfully. Use it in any game mode.",
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
