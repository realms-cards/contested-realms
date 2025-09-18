import { NextRequest } from 'next/server';
import { getServerAuthSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

// POST /api/decks/[id]/copy
// Creates a private copy of a deck for the authenticated user
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerAuthSession();
  if (!session?.user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  try {
    const { id } = await params;
    if (!id) return new Response(JSON.stringify({ error: 'Missing id' }), { status: 400 });

    // Get the original deck with all its cards
    const originalDeck = await prisma.deck.findUnique({
      where: { id },
      include: {
        cards: true,
        user: { select: { name: true } }
      },
    });

    // Check if deck exists and is either public or owned by the user
    if (!originalDeck || (!originalDeck.isPublic && originalDeck.userId !== session.user.id)) {
      return new Response(JSON.stringify({ error: 'Deck not found or not accessible' }), { status: 404 });
    }

    // Create a new deck copy
    const copyName = originalDeck.userId === session.user.id
      ? `${originalDeck.name} (Copy)`
      : `${originalDeck.name} (by ${originalDeck.user.name || 'Unknown'})`;

    const newDeck = await prisma.deck.create({
      data: {
        name: copyName,
        format: originalDeck.format,
        isPublic: false, // Copies are always private
        userId: session.user.id,
      },
    });

    // Copy all the cards
    if (originalDeck.cards.length > 0) {
      await prisma.deckCard.createMany({
        data: originalDeck.cards.map(card => ({
          deckId: newDeck.id,
          cardId: card.cardId,
          setId: card.setId,
          variantId: card.variantId,
          zone: card.zone,
          count: card.count,
        })),
      });
    }

    return new Response(
      JSON.stringify({
        id: newDeck.id,
        name: newDeck.name,
        format: newDeck.format,
        isPublic: newDeck.isPublic
      }),
      { status: 201, headers: { 'content-type': 'application/json' } }
    );
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : typeof e === 'string' ? e : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), { status: 500 });
  }
}