import { NextRequest } from 'next/server';
import { getServerAuthSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

// GET /api/decks
// Returns: {
//   myDecks: [{ id, name, format, isPublic, imported, avatarName? }],
//   publicDecks: [{ id, name, format, imported, userName, avatarName? }]
// }
export async function GET() {
  const session = await getServerAuthSession();
  if (!session?.user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }
  try {
    // Get user's own decks (both public and private)
    const myDecks = await prisma.deck.findMany({
      where: { userId: session.user.id },
      orderBy: { updatedAt: 'desc' },
      select: { id: true, name: true, format: true, isPublic: true, imported: true },
    });

    // Get public decks from other users
    const publicDecks = await prisma.deck.findMany({
      where: {
        isPublic: true,
        userId: { not: session.user.id }
      },
      orderBy: { createdAt: 'desc' },
      take: 50, // Limit to recent 50 public decks
      select: {
        id: true,
        name: true,
        format: true,
        imported: true,
        user: { select: { name: true } }
      },
    });

    // Compute avatar names for all decks in a single pass
    const allIds = [...myDecks.map(d => d.id), ...publicDecks.map(d => d.id)];
    const avatarNameByDeckId = new Map<string, string>();
    if (allIds.length) {
      // Fetch candidate cards for avatar detection (main deck zones only)
      const deckCards = await prisma.deckCard.findMany({
        where: { deckId: { in: allIds }, zone: { in: ['Spellbook', 'Atlas'] } },
        select: {
          deckId: true,
          cardId: true,
          setId: true,
          variant: { select: { typeText: true } },
          card: { select: { name: true } },
        },
      });

      // If some rows lack variant.typeText, fall back to CardSetMetadata.type via (cardId, setId)
      const pairs = deckCards
        .filter((dc) => dc.setId != null)
        .map((dc) => ({ cardId: dc.cardId, setId: dc.setId as number }));
      const metaMap = new Map<string, string>(); // key: `${cardId}:${setId}` -> type
      if (pairs.length) {
        const metas = await prisma.cardSetMetadata.findMany({
          where: { OR: pairs },
          select: { cardId: true, setId: true, type: true },
        });
        for (const m of metas) metaMap.set(`${m.cardId}:${m.setId}`, m.type);
      }

      for (const dc of deckCards) {
        const type = dc.variant?.typeText || (dc.setId != null ? metaMap.get(`${dc.cardId}:${dc.setId}`) : undefined) || null;
        const isAvatar = typeof type === 'string' && type.toLowerCase().includes('avatar');
        if (isAvatar && !avatarNameByDeckId.has(dc.deckId)) {
          avatarNameByDeckId.set(dc.deckId, dc.card.name);
        }
      }
    }

    const response = {
      myDecks: myDecks.map((d) => ({ ...d, avatarName: avatarNameByDeckId.get(d.id) || null })),
      publicDecks: publicDecks.map((deck) => ({
        id: deck.id,
        name: deck.name,
        format: deck.format,
        imported: deck.imported,
        userName: deck.user.name || 'Unknown Player',
        avatarName: avatarNameByDeckId.get(deck.id) || null,
      })),
    };

    return new Response(JSON.stringify(response), { status: 200, headers: { 'content-type': 'application/json' } });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : typeof e === 'string' ? e : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), { status: 500 });
  }
}

// POST /api/decks
// Body: { name: string, format?: string, set?: string, isPublic?: boolean, cards: [{ cardId, zone: 'Spellbook'|'Atlas'|'Sideboard', count: number, variantId?: number }] }
// Notes:
// - For backward compatibility, a top-level 'set' may be provided; if present, it will be used as the default set for cards that do not specify a variantId.
// - If a card has a variantId, its set will be inferred from that variant, overriding the top-level 'set' for that card.
export async function POST(req: NextRequest) {
  const session = await getServerAuthSession();
  if (!session?.user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }
  try {
    const body = await req.json();
    const name = String(body?.name || '').trim();
    const format = (body?.format && String(body.format)) || 'Sealed';
    const isPublic = Boolean(body?.isPublic || false);
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

    // If any items have variantId, prefetch their setIds to infer per-card set
    const variantIds = Array.from(new Set(
      Array.from(agg.values())
        .map(v => v.variantId)
        .filter((id): id is number => id != null)
    ));
    const variants = variantIds.length
      ? await prisma.variant.findMany({ where: { id: { in: variantIds } }, select: { id: true, setId: true } })
      : [];
    const setByVariant = new Map<number, number>();
    for (const v of variants) setByVariant.set(v.id, v.setId);

        const deck = await prisma.deck.create({
      data: { name, format, isPublic, userId: session.user.id },
    });

    for (const { cardId, zone, count, variantId } of agg.values()) {
      await prisma.deckCard.create({
        data: {
          deckId: deck.id,
          cardId,
          // Prefer per-variant setId if available; otherwise fall back to top-level set
          setId: (variantId != null ? (setByVariant.get(variantId) ?? null) : (setId ?? null)),
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
