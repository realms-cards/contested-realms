import { NextRequest } from 'next/server';
import { getServerAuthSession } from '@/lib/auth';
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
  const session = await getServerAuthSession();
  if (!session?.user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }
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

    if (!deck || deck.userId !== session.user.id) return new Response(JSON.stringify({ error: 'Not found' }), { status: 404 });

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
      .filter((dc): dc is DeckCardRow & { setId: number } => dc.setId != null)
      .map((dc) => ({ cardId: dc.cardId, setId: dc.setId }));

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

// DELETE /api/decks/[id]
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerAuthSession();
  if (!session?.user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }
  try {
    const { id } = await params;
    if (!id) return new Response(JSON.stringify({ error: 'Missing id' }), { status: 400 });

    // First, verify the deck exists and belongs to the user.
    const deck = await prisma.deck.findFirst({ where: { id, userId: session.user.id } });
    if (!deck) return new Response(JSON.stringify({ error: 'Not found' }), { status: 404 });

    // Now, delete it.
    await prisma.deck.delete({ where: { id } });
    return new Response(null, { status: 204 });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : typeof e === 'string' ? e : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), { status: 500 });
  }
}

// PUT /api/decks/[id]
// Body: { name?: string, format?: string, set?: string, cards: [{ cardId, zone: 'Spellbook'|'Atlas'|'Sideboard', count: number, variantId?: number }] }
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerAuthSession();
  if (!session?.user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }
  try {
    const { id } = await params;
    if (!id) return new Response(JSON.stringify({ error: 'Missing id' }), { status: 400 });

    const body = await req.json();
    const name = body?.name ? String(body.name) : undefined;
    const format = body?.format ? String(body.format) : undefined;
    const setName = body?.set ? String(body.set) : undefined;
    const cards = Array.isArray(body?.cards) ? body.cards : [];

    if (!cards.length && !name && !format) {
      return new Response(JSON.stringify({ error: 'Nothing to update' }), { status: 400 });
    }

    const deck = await prisma.deck.findUnique({ where: { id } });
    if (!deck || deck.userId !== session.user.id) return new Response(JSON.stringify({ error: 'Not found' }), { status: 404 });

    let setId: number | undefined = undefined;
    if (setName) {
      const set = await prisma.set.findUnique({ where: { name: setName } });
      if (!set) return new Response(JSON.stringify({ error: `Unknown set: ${setName}` }), { status: 400 });
      setId = set.id;
    }

    // Update name/format if provided
    if (name || format) {
      await prisma.deck.update({ where: { id }, data: { name: name ?? undefined, format: format ?? undefined } });
    }

    if (cards.length) {
      const allowedZones = new Set(['Spellbook', 'Atlas', 'Sideboard']);
      // Aggregate by (cardId, zone, variantId?)
      const agg = new Map<string, { cardId: number; zone: string; count: number; variantId: number | null }>();
      for (const c of cards) {
        const cardId = Number(c.cardId);
        const zone = String(c.zone);
        const count = Math.max(1, Number(c.count || 1));
        const variantId = c.variantId ? Number(c.variantId) : null;
        if (!allowedZones.has(zone)) return new Response(JSON.stringify({ error: `Invalid zone: ${zone}` }), { status: 400 });
        if (!Number.isFinite(cardId) || cardId <= 0) return new Response(JSON.stringify({ error: `Invalid cardId: ${c.cardId}` }), { status: 400 });
        const key = `${cardId}:${zone}:${variantId ?? 'x'}`;
        const prev = agg.get(key);
        if (prev) prev.count += count; else agg.set(key, { cardId, zone, count, variantId });
      }

      // Replace deck cards in a transaction
      await prisma.$transaction(async (tx) => {
        await tx.deckCard.deleteMany({ where: { deckId: id } });
        const createData = Array.from(agg.values()).map(({ cardId, zone, count, variantId }) => ({
          deckId: id,
          cardId,
          setId: setId ?? null,
          variantId: variantId ?? null,
          zone,
          count,
        }));
        if (createData.length) {
          await tx.deckCard.createMany({ data: createData });
        }
      });
    }

    const updated = await prisma.deck.findUnique({ where: { id }, select: { id: true, name: true, format: true } });
    return new Response(JSON.stringify(updated), { status: 200, headers: { 'content-type': 'application/json' } });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : typeof e === 'string' ? e : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), { status: 500 });
  }
}
