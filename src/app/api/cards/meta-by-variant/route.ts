import { NextRequest } from "next/server";
export const dynamic = "force-dynamic";
import { prisma } from "@/lib/prisma";

// GET /api/cards/meta-by-variant?set=Alpha&slugs=slug1,slug2,slug3
// Returns: [{ slug, cardId, cost, thresholds, attack, defence }]
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const setName = (searchParams.get("set") || "").trim();
    const slugsParam = (searchParams.get("slugs") || "").trim();

    if (!slugsParam) {
      return new Response(JSON.stringify([]), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    const slugs = Array.from(
      new Set(
        slugsParam
          .split(",")
          .map((s) => s.trim())
          .filter((s) => !!s)
      )
    );

    // Resolve set if provided (prefer set-scoped lookups for accuracy/perf)
    let setId: number | null = null;
    if (setName) {
      const set = await prisma.set.findUnique({ where: { name: setName } });
      if (!set) {
        return new Response(
          JSON.stringify({ error: `Unknown set: ${setName}` }),
          { status: 400 }
        );
      }
      setId = set.id;
    }

    // Find variants by slug (optionally constrained by set)
    type VariantRow = { id: number; cardId: number; setId: number; slug: string };
    const variants: VariantRow[] = await prisma.variant.findMany({
      where: {
        slug: { in: slugs },
        ...(setId != null ? { setId } : {}),
      },
      select: { id: true, cardId: true, setId: true, slug: true },
    });

    if (!variants.length) {
      return new Response(JSON.stringify([]), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    // If no set constraint, variants may include multiple sets per slug; pick the highest setId per slug
    let effectiveVariants: VariantRow[] = variants;
    if (setId == null) {
      const bestBySlug = new Map<string, VariantRow>();
      for (const v of variants) {
        const cur = bestBySlug.get(v.slug);
        if (!cur || v.setId > cur.setId) bestBySlug.set(v.slug, v);
      }
      effectiveVariants = Array.from(bestBySlug.values());
    }

    // Fetch metadata rows for (cardId,setId) pairs
    const pairs = effectiveVariants.map((v) => ({ cardId: v.cardId, setId: v.setId }));
    const metas = await prisma.cardSetMetadata.findMany({
      where: { OR: pairs },
      select: {
        cardId: true,
        setId: true,
        cost: true,
        thresholds: true,
        attack: true,
        defence: true,
      },
    });

    // Map (cardId,setId) -> meta
    const key = (c: number, s: number) => `${c}:${s}`;
    const metaByPair = new Map<string, (typeof metas)[number]>();
    for (const m of metas) metaByPair.set(key(m.cardId, m.setId), m);

    // Build output rows keyed by slug
    const out = effectiveVariants.map((v) => {
      const m = metaByPair.get(key(v.cardId, v.setId));
      return {
        slug: v.slug,
        cardId: v.cardId,
        cost: m?.cost ?? null,
        thresholds: (m?.thresholds as unknown as Record<string, number> | null) ?? null,
        attack: m?.attack ?? null,
        defence: m?.defence ?? null,
      };
    });

    return new Response(JSON.stringify(out), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  } catch (e: unknown) {
    const message =
      e instanceof Error ? e.message : typeof e === "string" ? e : "Unknown error";
    return new Response(JSON.stringify({ error: message }), { status: 500 });
  }
}
