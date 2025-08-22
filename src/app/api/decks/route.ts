import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

// POST /api/decks
// Body: { name: string, format?: string, set?: string, cards: [{ cardId, zone: 'Spellbook'|'Atlas'|'Sideboard', count: number, variantId?: number }] }
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const name = String(body?.name || '').trim();
    const format = (body?.format && String(body.format)) || 'Sealed';
    const setName = body?.set ? String(body.set) : undefined;
    const cards = Array.isArray(body?.cards) ? body.cards : [];

    if (!name) {
      return new Response(JSON.stringify({ error: 'Missing deck name' }), { status: 400 });
    }
    if (!cards.length) {
      return new Response(JSON.stringify({ error: 'No cards provided' }), { status: 400 });
    }

    let setId: number | undefined = undefined;
    if (setName) {
      const set = await prisma.set.findUnique({ where: { name: setName } });
      if (!set) return new Response(JSON.stringify({ error: `Unknown set: ${setName}` }), { status: 400 });
      setId = set.id;
    }

    // Validate zones and normalize items
    const allowedZones = new Set(['Spellbook', 'Atlas', 'Sideboard']);
    const items: { deckId: string; cardId: number; setId: number | null; variantId: number | null; zone: string; count: number }[] = [];

    // Aggregate by (cardId, zone, variantId?)
    const agg = new Map<string, { cardId: number; zone: string; count: number; variantId: number | null }>();
    for (const c of cards) {
      const cardId = Number(c.cardId);
      const zone = String(c.zone);
      const count = Math.max(1, Number(c.count || 1));
      const variantId = c.variantId ? Number(c.variantId) : null;
      if (!allowedZones.has(zone)) {
        return new Response(JSON.stringify({ error: `Invalid zone: ${zone}` }), { status: 400 });
      }
      if (!Number.isFinite(cardId) || cardId <= 0) {
        return new Response(JSON.stringify({ error: `Invalid cardId: ${c.cardId}` }), { status: 400 });
      }
      const key = `${cardId}:${zone}:${variantId ?? 'x'}`;
      const prev = agg.get(key);
      if (prev) prev.count += count; else agg.set(key, { cardId, zone, count, variantId });
    }

    const deck = await prisma.deck.create({ data: { name, format } });

    for (const { cardId, zone, count, variantId } of agg.values()) {
      await prisma.deckCard.create({
        data: {
          deckId: deck.id,
          cardId,
          setId: setId ?? null,
          variantId: variantId ?? null,
          zone,
          count,
        },
      });
    }

    return new Response(JSON.stringify({ id: deck.id, name: deck.name, format: deck.format }), {
      status: 201,
      headers: { 'content-type': 'application/json' },
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : typeof e === 'string' ? e : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), { status: 500 });
  }
}
