import { Finish } from '@prisma/client';
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

// GET /api/cards/by-id?ids=1,2,3
// Returns: [{ cardId, name, slug, setName, type }]
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const idsParam = (searchParams.get('ids') || '').trim();
    if (!idsParam) {
      return new Response(JSON.stringify([]), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    const ids = Array.from(new Set(idsParam.split(',').map(s => Number(s)).filter(n => Number.isFinite(n) && n > 0)));
    if (!ids.length) {
      return new Response(JSON.stringify([]), { status: 200, headers: { 'content-type': 'application/json' } });
    }

    // Prefer Standard finish variants when available
    const variants = await prisma.variant.findMany({
      where: { cardId: { in: ids }, finish: Finish.Standard },
      select: {
        cardId: true,
        slug: true,
        typeText: true,
        setId: true,
        set: { select: { name: true } },
        card: {
          select: {
            name: true,
            meta: {
              select: {
                cost: true,
                thresholds: true,
                setId: true,
                type: true,
              }
            }
          }
        },
      },
    });
    const byCard = new Map<number, { cardId: number; name: string; slug: string; setName: string; type: string | null; cost: number | null; thresholds: Record<string, number> | null }>();
    for (const v of variants) {
      if (!byCard.has(v.cardId)) {
        // Find metadata for this set
        const metadata = v.card.meta.find(m => m.setId === v.setId);
        byCard.set(v.cardId, {
          cardId: v.cardId,
          name: v.card.name,
          slug: v.slug,
          setName: v.set.name,
          // Prefer per-set metadata.type (authoritative) then fall back to variant.typeText
          type: (metadata?.type as string | undefined) || v.typeText || null,
          cost: metadata?.cost ?? null,
          thresholds: metadata?.thresholds as Record<string, number> | null ?? null,
        });
      }
    }
    // Fill missing with any variant
    const missing = ids.filter(id => !byCard.has(id));
    if (missing.length) {
      const anyVariants = await prisma.variant.findMany({
        where: { cardId: { in: missing } },
        select: {
          cardId: true,
          slug: true,
          typeText: true,
          setId: true,
          set: { select: { name: true } },
          card: {
            select: {
              name: true,
              meta: {
                select: {
                  cost: true,
                  thresholds: true,
                  setId: true,
                  type: true,
                }
              }
            }
          },
        },
        orderBy: { id: 'asc' },
      });
      for (const v of anyVariants) {
        if (!byCard.has(v.cardId)) {
          // Find metadata for this set
          const metadata = v.card.meta.find(m => m.setId === v.setId);
          byCard.set(v.cardId, {
            cardId: v.cardId,
            name: v.card.name,
            slug: v.slug,
            setName: v.set.name,
            type: (metadata?.type as string | undefined) || v.typeText || null,
            cost: metadata?.cost ?? null,
            thresholds: metadata?.thresholds as Record<string, number> | null ?? null,
          });
        }
      }
    }

    const out = ids.map(id => byCard.get(id)).filter(Boolean);
    return new Response(JSON.stringify(out), { status: 200, headers: { 'content-type': 'application/json' } });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : typeof e === 'string' ? e : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), { status: 500 });
  }
}
