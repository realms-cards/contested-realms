import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

// GET /api/decks/[id]
// Returns: { id, name, format, spellbook: CardRef[], atlas: CardRef[], sideboard: CardRef[] }
// CardRef shape matches client store expectations.
type ApiCardRef = {
  cardId: number;
  variantId?: number | null;
  name: string;
  type: string | null;
  slug?: string | null;
  thresholds?: Record<string, number> | null;
};

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (!id) return new Response(JSON.stringify({ error: 'Missing id' }), { status: 400 });

    const deck = await prisma.deck.findUnique({
      where: { id },
      include: {
        cards: {
          include: {
            card: true,
            variant: true,
            set: true,
          },
        },
      },
    });

    if (!deck) return new Response(JSON.stringify({ error: 'Not found' }), { status: 404 });

    // Gather metas for thresholds/type per (cardId, setId)
    type DeckCardRow = {
      cardId: number;
      setId: number | null;
      zone: string;
      count: number;
      variantId: number | null;
      variant: { typeText: string | null; slug: string | null } | null;
      card: { name: string };
    };
    const cards = deck.cards as DeckCardRow[];

    const pairs = cards
      .filter((dc) => dc.setId != null)
      .map((dc) => ({ cardId: dc.cardId, setId: dc.setId! }));

    const metaMap = new Map<string, { type: string | null; thresholds: Record<string, number> | null }>();
    if (pairs.length) {
      const metas = await prisma.cardSetMetadata.findMany({
        where: { OR: pairs },
        select: { cardId: true, setId: true, type: true, thresholds: true },
      });
      for (const m of metas) metaMap.set(`${m.cardId}:${m.setId}`, { type: m.type, thresholds: (m.thresholds as unknown as Record<string, number> | null) });
    }

    const spellbook: ApiCardRef[] = [];
    const atlas: ApiCardRef[] = [];
    const sideboard: ApiCardRef[] = [];

    for (const dc of cards) {
      const key = dc.setId ? `${dc.cardId}:${dc.setId}` : null;
      const meta = key ? metaMap.get(key) : undefined;
      const type = dc.variant?.typeText || meta?.type || null;
      const thresholds = meta?.thresholds ?? null;
      const ref: ApiCardRef = {
        cardId: dc.cardId,
        variantId: dc.variantId ?? null,
        name: dc.card.name,
        type,
        slug: dc.variant?.slug ?? null,
        thresholds,
      };
      const pushMany = <T,>(arr: T[], count: number, value: T) => {
        for (let i = 0; i < count; i++) arr.push(value);
      };
      if (dc.zone === 'Atlas') pushMany(atlas, dc.count, ref);
      else if (dc.zone === 'Spellbook') pushMany(spellbook, dc.count, ref);
      else pushMany(sideboard, dc.count, ref);
    }

    return new Response(
      JSON.stringify({ id: deck.id, name: deck.name, format: deck.format, spellbook, atlas, sideboard }),
      { status: 200, headers: { 'content-type': 'application/json' } }
    );
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : typeof e === 'string' ? e : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), { status: 500 });
  }
}
