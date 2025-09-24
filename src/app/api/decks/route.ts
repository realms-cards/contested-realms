import { NextRequest } from 'next/server';
import { getServerAuthSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

// Cache avatar names for a short time to improve performance
const avatarCache = new Map<string, { avatarName: string | null; timestamp: number }>();
const AVATAR_CACHE_TTL = 60 * 1000; // 1 minute

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

    // Compute avatar names with caching to improve performance
    const allIds = [...myDecks.map(d => d.id), ...publicDecks.map(d => d.id)];
    const avatarNameByDeckId = new Map<string, string>();
    const now = Date.now();

    // Check cache first
    const uncachedIds: string[] = [];
    for (const id of allIds) {
      const cached = avatarCache.get(id);
      if (cached && (now - cached.timestamp) < AVATAR_CACHE_TTL) {
        if (cached.avatarName) {
          avatarNameByDeckId.set(id, cached.avatarName);
        }
      } else {
        uncachedIds.push(id);
      }
    }

    // Only fetch avatar info for uncached decks
    if (uncachedIds.length > 0) {
      // Use more efficient query - only get avatars directly
      const avatarCards = await prisma.deckCard.findMany({
        where: {
          deckId: { in: uncachedIds },
          zone: { in: ['Spellbook', 'Atlas'] },
          OR: [
            { variant: { typeText: { contains: 'Avatar', mode: 'insensitive' } } },
            {
              AND: [
                { setId: { not: null } },
                { card: { meta: { some: { type: { contains: 'Avatar', mode: 'insensitive' } } } } }
              ]
            }
          ]
        },
        select: {
          deckId: true,
          card: { select: { name: true } },
        },
        distinct: ['deckId'], // Only get one avatar per deck
      });

      // Update cache and results
      for (const deckId of uncachedIds) {
        const avatarCard = avatarCards.find(ac => ac.deckId === deckId);
        const avatarName = avatarCard?.card.name || null;

        // Cache the result
        avatarCache.set(deckId, { avatarName, timestamp: now });

        if (avatarName) {
          avatarNameByDeckId.set(deckId, avatarName);
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
    // Ensure the authenticated user exists in the database (useful after local DB resets)
    const user = await prisma.user.findUnique({ where: { id: session.user.id } });
    if (!user) {
      return new Response(
        JSON.stringify({
          error:
            'Your account could not be found in the database. If you already have a user account, please sign out, clear your browser cookies and sign back in',
        }),
        { status: 401, headers: { 'content-type': 'application/json' } },
      );
    }
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
