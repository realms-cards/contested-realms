import { NextRequest } from "next/server";
export const dynamic = "force-dynamic";
import { prisma } from "@/lib/prisma";

// GET /api/cards/search?q=apprentice&set=Alpha&type=site|avatar|spell
// Returns a list of variants for the chosen set that match the query.
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const q = (searchParams.get("q") || "").trim();
    const setName = (searchParams.get("set") || "").trim();
    const typeFilt = (searchParams.get("type") || "").trim().toLowerCase();

    if (!q && !typeFilt) {
      return new Response(JSON.stringify([]), { status: 200, headers: { "content-type": "application/json" } });
    }

    // Resolve setId if provided
    let setId: number | null = null;
    if (setName) {
      const set = await prisma.set.findUnique({ where: { name: setName } });
      if (!set) return new Response(JSON.stringify({ error: `Unknown set: ${setName}` }), { status: 400 });
      setId = set.id;
    }

    // Find matching variants by card name and set (if provided)
    const whereVariant: { setId?: number } = {};
    if (setId != null) whereVariant.setId = setId;

    const variants = await prisma.variant.findMany({
      where: {
        ...whereVariant,
        // NOTE: Some providers/types may not expose QueryMode in generated types; omit for compatibility
        card: q ? { name: { contains: q } } : undefined,
      },
      select: {
        id: true,
        cardId: true,
        setId: true,
        slug: true,
        finish: true,
        product: true,
        typeText: true,
        card: { select: { name: true } },
        set: { select: { name: true } },
      },
      take: 60,
    });

    if (!variants.length) {
      return new Response(JSON.stringify([]), { status: 200, headers: { "content-type": "application/json" } });
    }

    // Fetch type/rarity for (cardId,setId)
    type VariantRow = {
      id: number;
      cardId: number;
      setId: number;
      slug: string;
      finish: unknown;
      product: string;
      typeText: string | null;
      card: { name: string };
      set: { name: string };
    };
    const pairs = variants.map((v: VariantRow) => ({ cardId: v.cardId, setId: v.setId }));
    const metas = await prisma.cardSetMetadata.findMany({
      where: { OR: pairs },
      select: { cardId: true, setId: true, type: true, rarity: true },
    });
    const metaKey = (c: number, s: number) => `${c}:${s}`;
    const metaMap = new Map<string, { type: string | null; rarity: string | null }>();
    for (const m of metas) metaMap.set(metaKey(m.cardId, m.setId), { type: m.type || null, rarity: m.rarity || null });

    type SearchOut = {
      variantId: number;
      slug: string;
      finish: string;
      product: string;
      cardId: number;
      cardName: string;
      set: string;
      type: string | null;
      rarity: string | null;
    };
    const out: SearchOut[] = variants
      .map((v: VariantRow): SearchOut => {
        const meta = metaMap.get(metaKey(v.cardId, v.setId));
        const type = v.typeText || meta?.type || null;
        const rarity = meta?.rarity || null;
        return {
          variantId: v.id,
          slug: v.slug.startsWith("dra_") ? ("drl_" + v.slug.slice(4)) : v.slug,
          finish: String(v.finish),
          product: v.product,
          cardId: v.cardId,
          cardName: v.card.name,
          set: v.set.name,
          type,
          rarity,
        };
      })
      .filter((it: SearchOut) => {
        if (!typeFilt) return true;
        const t = (it.type || "").toLowerCase();
        if (typeFilt === "site") return t.includes("site");
        if (typeFilt === "avatar") return t.includes("avatar");
        if (typeFilt === "spell") return !t.includes("site"); // treat non-site as spellbook bucket
        return true;
      })
      .slice(0, 60);

    return new Response(JSON.stringify(out), { status: 200, headers: { "content-type": "application/json" } });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : typeof e === "string" ? e : "Unknown error";
    return new Response(JSON.stringify({ error: message }), { status: 500 });
  }
}
