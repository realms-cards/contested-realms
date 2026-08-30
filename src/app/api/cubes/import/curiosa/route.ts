import { NextRequest } from "next/server";
import { getServerAuthSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  fetchCuriosatrpc,
  extractDeckId,
} from "@/lib/services/curiosa-deck";

export const dynamic = "force-dynamic";

// POST /api/cubes/import/curiosa
// Imports a Curiosa (sorcerytcg.com) deck as a cube (all cards go into main zone, no validation)
export async function POST(req: NextRequest) {
  const session = await getServerAuthSession();
  if (!session?.user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
    });
    if (!user) {
      return new Response(
        JSON.stringify({
          error:
            "Your account could not be found in the database. Please sign out, clear cookies, and sign back in.",
        }),
        { status: 401, headers: { "content-type": "application/json" } }
      );
    }

    if (process.env.NEXT_PUBLIC_ENABLE_CURIOSA_IMPORT !== "true") {
      return new Response(
        JSON.stringify({ error: "Curiosa import is disabled" }),
        { status: 403, headers: { "content-type": "application/json" } }
      );
    }

    const body = await req.json().catch(() => ({}));
    const rawUrl = String(body?.url || "").trim();
    const overrideName = body?.name ? String(body.name).trim() : "";

    if (!rawUrl) {
      return new Response(
        JSON.stringify({ error: "Provide a sorcerytcg.com deck URL" }),
        { status: 400, headers: { "content-type": "application/json" } }
      );
    }

    const deckId = extractDeckId(rawUrl);
    const trpcData = await fetchCuriosatrpc(deckId);
    if (!trpcData) {
      return new Response(
        JSON.stringify({
          error:
            "Failed to fetch deck. Make sure the URL points to a deck on sorcerytcg.com and that the deck still exists.",
        }),
        { status: 400, headers: { "content-type": "application/json" } }
      );
    }

    const finalName =
      overrideName || trpcData.deckName || `Curiosa Cube ${deckId}`;
    const importResult = await importFromTrpcData(
      trpcData.deckList,
      trpcData.sideboardList,
      session.user.id,
      finalName
    );
    if (importResult.error || !importResult.cube) {
      return new Response(
        JSON.stringify({
          error: importResult.error ?? "Failed to create cube",
          unresolved: importResult.unresolved,
        }),
        { status: 400, headers: { "content-type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        id: importResult.cube.id,
        name: importResult.cube.name,
        cardCount: importResult.cube.cardCount,
        sideboardCount: importResult.cube.sideboardCount,
      }),
      { status: 201, headers: { "content-type": "application/json" } }
    );
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


// Import from tRPC data (using CuriosatrpcDeck type - variant ids are strings)
async function importFromTrpcData(
  deckList: Array<{
    card: { name: string; slug: string; variants: { id: string; slug: string }[] };
    variantId: string;
    quantity: number;
  }>,
  sideboardList: Array<{
    card: { name: string; slug: string; variants: { id: string; slug: string }[] };
    variantId: string;
    quantity: number;
  }>,
  userId: string,
  cubeName: string
): Promise<{
  error?: string;
  unresolved?: { name: string; count: number }[];
  cube?: { id: string; name: string; cardCount: number; sideboardCount: number };
}> {
  // Combine main deck and sideboard as cube cards
  const entries: { name: string; slug: string; quantity: number; zone: "main" | "sideboard" }[] = [];

  for (const entry of deckList) {
    const { card, variantId, quantity } = entry;
    const variant = card.variants.find((v) => v.id === variantId) || card.variants[0];
    const slug = variant?.slug || card.slug;
    entries.push({ name: card.name, slug, quantity, zone: "main" });
  }

  for (const entry of sideboardList) {
    const { card, variantId, quantity } = entry;
    const variant = card.variants.find((v) => v.id === variantId) || card.variants[0];
    const slug = variant?.slug || card.slug;
    entries.push({ name: card.name, slug, quantity, zone: "sideboard" });
  }

  if (entries.length === 0) {
    return { error: "No cards found in Curiosa deck" };
  }

  // Batch lookup variants by slug
  const allSlugs = entries.map((e) => e.slug);
  const variants = await prisma.variant.findMany({
    where: { slug: { in: allSlugs } },
    select: { id: true, cardId: true, setId: true, slug: true },
  });
  const variantBySlug = new Map(variants.map((v) => [v.slug, v]));

  // Fallback for unresolved slugs
  const needsNameLookup = entries.filter((e) => !variantBySlug.has(e.slug));
  let cardByNameLower = new Map<
    string,
    { id: number; variants: { id: number; setId: number | null }[] }
  >();

  if (needsNameLookup.length > 0) {
    const names = [...new Set(needsNameLookup.map((e) => e.name))];
    const cards = await prisma.card.findMany({
      where: { name: { in: names, mode: "insensitive" } },
      select: {
        id: true,
        name: true,
        variants: { select: { id: true, setId: true }, take: 1 },
      },
    });
    cardByNameLower = new Map(cards.map((c) => [c.name.toLowerCase(), c]));
  }

  type Mapped = {
    cardId: number;
    variantId: number | null;
    setId: number | null;
    count: number;
    zone: "main" | "sideboard";
  };

  const mapped: Mapped[] = [];
  const unresolved: { name: string; count: number }[] = [];

  for (const entry of entries) {
    const variant = variantBySlug.get(entry.slug);
    if (!variant) {
      const card = cardByNameLower.get(entry.name.toLowerCase());
      if (!card) {
        unresolved.push({ name: entry.name, count: entry.quantity });
        continue;
      }
      const v = card.variants[0];
      mapped.push({
        cardId: card.id,
        variantId: v?.id ?? null,
        setId: v?.setId ?? null,
        count: entry.quantity,
        zone: entry.zone,
      });
    } else {
      mapped.push({
        cardId: variant.cardId,
        variantId: variant.id,
        setId: variant.setId,
        count: entry.quantity,
        zone: entry.zone,
      });
    }
  }

  if (unresolved.length > 0) {
    return { error: `Could not map some cards`, unresolved };
  }

  // Create cube
  const cube = await prisma.cube.create({
    data: {
      name: cubeName,
      imported: true,
      isPublic: false,
      user: { connect: { id: userId } },
    },
  });

  // Aggregate by cardId+variantId+zone
  const agg = new Map<
    string,
    { cardId: number; variantId: number | null; setId: number | null; count: number; zone: string }
  >();
  for (const m of mapped) {
    const key = `${m.cardId}:${m.variantId ?? "x"}:${m.zone}`;
    const prev = agg.get(key);
    if (prev) prev.count += m.count;
    else agg.set(key, { ...m });
  }

  const createRows = Array.from(agg.values()).map((v) => ({
    cubeId: cube.id,
    cardId: v.cardId,
    setId: v.setId,
    variantId: v.variantId,
    count: v.count,
    zone: v.zone,
  }));

  if (createRows.length) {
    await prisma.cubeCard.createMany({ data: createRows });
  }

  const mainCount = createRows
    .filter((r) => r.zone === "main")
    .reduce((sum, r) => sum + r.count, 0);
  const sideboardCount = createRows
    .filter((r) => r.zone === "sideboard")
    .reduce((sum, r) => sum + r.count, 0);

  return {
    cube: {
      id: cube.id,
      name: cube.name,
      cardCount: mainCount,
      sideboardCount,
    },
  };
}
