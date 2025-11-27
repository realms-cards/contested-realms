import { NextRequest } from "next/server";
export const dynamic = "force-dynamic";
import { getSetIdByName } from "@/lib/api/cached-lookups";
import { prisma } from "@/lib/prisma";

// GET /api/cards/search?q=apprentice&set=Alpha&type=site|avatar|spell
// Returns a list of variants for the chosen set that match the query.
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const q = (searchParams.get("q") || "").trim();
    const setName = (searchParams.get("set") || "").trim();
    const typeFilt = (searchParams.get("type") || "").trim().toLowerCase();

    // Allow browsing by set even without a search query
    if (!q && !typeFilt && !setName) {
      return new Response(JSON.stringify([]), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    // Resolve setId if provided (using cached lookup)
    let setId: number | null = null;
    if (setName) {
      setId = await getSetIdByName(setName);
      // Be forgiving: if set is unknown, return empty list instead of a hard error so editor UX isn't blocked
      if (setId === null) {
        return new Response(JSON.stringify([]), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
    }

    // Find matching variants by card name and set (if provided)
    const whereVariant: { setId?: number } = {};
    if (setId != null) whereVariant.setId = setId;

    // Limit results for faster response
    const SEARCH_LIMIT = 50;

    const variants = await prisma.variant.findMany({
      where: {
        ...whereVariant,
        // Search by card name OR slug; make it case-insensitive for friendlier UX
        ...(q
          ? {
              OR: [
                { card: { name: { contains: q, mode: "insensitive" } } },
                { slug: { contains: q, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      select: {
        id: true,
        cardId: true,
        setId: true,
        slug: true,
        finish: true,
        product: true,
        typeText: true,
        card: { select: { name: true, subTypes: true } },
        set: { select: { name: true } },
      },
      take: SEARCH_LIMIT,
    });

    if (!variants.length) {
      return new Response(JSON.stringify([]), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    // Fetch type/rarity for (cardId,setId) using IN clauses (faster than OR)
    type VariantRow = {
      id: number;
      cardId: number;
      setId: number;
      slug: string;
      finish: unknown;
      product: string;
      typeText: string | null;
      card: { name: string; subTypes: string | null };
      set: { name: string };
    };
    const cardIds = [...new Set(variants.map((v: VariantRow) => v.cardId))];
    const setIds = [...new Set(variants.map((v: VariantRow) => v.setId))];
    const metas = await prisma.cardSetMetadata.findMany({
      where: {
        cardId: { in: cardIds },
        setId: { in: setIds },
      },
      select: { cardId: true, setId: true, type: true, rarity: true },
    });
    const metaKey = (c: number, s: number) => `${c}:${s}`;
    const metaMap = new Map<
      string,
      { type: string | null; rarity: string | null }
    >();
    for (const m of metas)
      metaMap.set(metaKey(m.cardId, m.setId), {
        type: m.type || null,
        rarity: m.rarity || null,
      });

    type SearchOut = {
      variantId: number;
      slug: string;
      finish: string;
      product: string;
      cardId: number;
      cardName: string;
      set: string;
      setId: number;
      type: string | null;
      subTypes: string | null;
      rarity: string | null;
    };
    const out: SearchOut[] = variants
      .map((v: VariantRow): SearchOut => {
        const meta = metaMap.get(metaKey(v.cardId, v.setId));
        // Prefer metadata.type over typeText (flavor text)
        const type = meta?.type || v.typeText || null;
        const rarity = meta?.rarity || null;
        const subTypes = v.card.subTypes || null;
        return {
          variantId: v.id,
          slug: v.slug.startsWith("dra_") ? "drl_" + v.slug.slice(4) : v.slug,
          finish: String(v.finish),
          product: v.product,
          cardId: v.cardId,
          cardName: v.card.name,
          set: v.set.name,
          setId: v.setId,
          type,
          subTypes,
          rarity,
        };
      })
      .filter((it: SearchOut) => {
        if (!typeFilt) return true;
        const t = (it.type || "").toLowerCase();
        if (typeFilt === "site") return t.includes("site");
        if (typeFilt === "avatar") return t.includes("avatar");
        if (typeFilt === "spell")
          return !t.includes("site") && !t.includes("avatar"); // exclude avatars from spells
        return true;
      })
      .slice(0, 200);

    return new Response(JSON.stringify(out), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  } catch (e: unknown) {
    const message =
      e instanceof Error
        ? e.message
        : typeof e === "string"
        ? e
        : "Unknown error";
    return new Response(JSON.stringify({ error: message }), { status: 500 });
  }
}
