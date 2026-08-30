import { NextRequest } from "next/server";
import { getServerAuthSession } from "@/lib/auth";
import { invalidateCache, CacheKeys } from "@/lib/cache/redis-cache";
import { codexIdForPrinting } from "@/lib/cards/registry";
import {
  formatValidationErrors,
  resolveImportFormat,
} from "@/lib/deck/validation-rules";
import { prisma } from "@/lib/prisma";
import {
  fetchCuriosatrpc,
  extractDeckId,
  type CuriosatrpcDeck,
} from "@/lib/services/curiosa-deck";
import {
  extractFourCoresDeckId,
  fetchFourCoresDeck,
  isFourCoresUrl,
} from "@/lib/services/fourcores-deck";

export const dynamic = "force-dynamic";

// POST /api/decks/import/curiosa
// Body: { url: string, name?: string, format?: string }
// - Accepts a Curiosa (sorcerytcg.com) or Four Cores (fourcores.xyz) deck URL
// - Fetches the structured decklist, maps printings to our variants, creates the deck
// - Validates avatar/site/spellbook counts similar to game loader expectations
export async function POST(req: NextRequest) {
  const session = await getServerAuthSession();
  if (!session?.user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }
  try {
    // Ensure the authenticated user exists in the database (useful after local DB resets)
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
    });
    if (!user) {
      return new Response(
        JSON.stringify({
          error:
            "Your account could not be found in the database. If you already have a user account, please sign out, clear your browser cookies and sign back in",
        }),
        { status: 401, headers: { "content-type": "application/json" } }
      );
    }

    // Feature toggle: disable deck URL import globally unless explicitly enabled
    if (process.env.NEXT_PUBLIC_ENABLE_CURIOSA_IMPORT !== "true") {
      return new Response(
        JSON.stringify({ error: "Deck import is disabled" }),
        { status: 403, headers: { "content-type": "application/json" } }
      );
    }

    const body = await req.json().catch(() => ({}));
    const rawUrl = String(body?.url || "").trim();
    const overrideName = body?.name ? String(body.name).trim() : "";
    // Optional: force a format instead of inferring it from the decklist
    const requestedFormat = body?.format ? String(body.format).trim() : null;

    if (!rawUrl) {
      return new Response(
        JSON.stringify({
          error: "Provide a Curiosa (sorcerytcg.com) or Four Cores deck URL",
        }),
        { status: 400, headers: { "content-type": "application/json" } }
      );
    }

    // Four Cores decks come from a different host with their own list endpoint.
    // Normalized into the Curiosa deck shape, they reuse the same import path.
    if (isFourCoresUrl(rawUrl)) {
      const fourCoresId = extractFourCoresDeckId(rawUrl);
      const fourCoresData = await fetchFourCoresDeck(rawUrl);
      if (!fourCoresData) {
        return new Response(
          JSON.stringify({
            error:
              "Failed to fetch Four Cores deck. Make sure the deck is public and the URL is correct.",
          }),
          { status: 400, headers: { "content-type": "application/json" } }
        );
      }

      const finalName =
        overrideName ||
        fourCoresData.deckName ||
        `Four Cores Import ${fourCoresId ?? "Deck"}`;
      const importResult = await importFromTrpcData(
        fourCoresData.deckList,
        fourCoresData.sideboardList,
        fourCoresData.avatarName,
        session.user.id,
        finalName,
        // Sync only supports Curiosa, so leave curiosaSourceId unset
        null,
        requestedFormat
      );
      if (importResult.error || !importResult.deck) {
        return new Response(
          JSON.stringify({
            error: importResult.error ?? "Failed to create deck",
            unresolved: importResult.unresolved,
          }),
          { status: 400, headers: { "content-type": "application/json" } }
        );
      }

      await invalidateCache(CacheKeys.decks.list(session.user.id));
      return new Response(
        JSON.stringify({
          id: importResult.deck.id,
          name: importResult.deck.name,
          format: importResult.deck.format,
        }),
        { status: 201, headers: { "content-type": "application/json" } }
      );
    }

    // Curiosa: a single tRPC call returns the full structured decklist
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
      overrideName || trpcData.deckName || `Curiosa Import ${deckId}`;
    const importResult = await importFromTrpcData(
      trpcData.deckList,
      trpcData.sideboardList,
      trpcData.avatarName,
      session.user.id,
      finalName,
      deckId, // Pass curiosaSourceId for sync functionality
      requestedFormat
    );
    if (importResult.error || !importResult.deck) {
      return new Response(
        JSON.stringify({
          error: importResult.error ?? "Failed to create deck",
          unresolved: importResult.unresolved,
        }),
        { status: 400, headers: { "content-type": "application/json" } }
      );
    }

    // Invalidate deck list cache for this user
    await invalidateCache(CacheKeys.decks.list(session.user.id));
    return new Response(
      JSON.stringify({
        id: importResult.deck.id,
        name: importResult.deck.name,
        format: importResult.deck.format,
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


// Import directly from Curiosa tRPC response
async function importFromTrpcData(
  deckList: CuriosatrpcDeck[],
  sideboardList: CuriosatrpcDeck[],
  avatarName: string | null,
  userId: string,
  deckName: string,
  curiosaSourceId: string | null = null,
  requestedFormat: string | null = null
): Promise<{
  error?: string;
  unresolved?: { name: string; count: number }[];
  deck?: { id: string; name: string; format: string };
}> {
  // Extract card entries with their variant slugs and zone
  const entries: {
    name: string;
    slug: string;
    printingId: string | null;
    quantity: number;
    category: string;
    type: string;
    zone: "main" | "sideboard";
  }[] = [];

  // Process main deck cards
  // Note: Sideboard/collection cards are treated as ADDITIONAL cards, not duplicates
  // (Important for Imposter decks where collection contains avatars to mask as)
  for (const entry of deckList) {
    const { card, variantId, quantity } = entry;
    const variant =
      card.variants.find((v) => v.id === variantId) || card.variants[0];
    const slug = variant?.slug || `${card.slug}`;

    entries.push({
      name: card.name,
      slug,
      printingId: variant?.printingId ?? null,
      quantity,
      category: card.category,
      type: card.type,
      zone: "main",
    });
  }

  // Process sideboard (Collection zone)
  // The main avatar is handled separately (added to Spellbook later)
  // But additional avatars (for Imposter ability) should go to Collection
  for (const entry of sideboardList) {
    const { card, variantId, quantity } = entry;
    const isAvatar = card.type?.toLowerCase() === "avatar";

    // Skip the main avatar (it's added to Spellbook separately)
    // But keep additional avatars for Collection (Imposter ability)
    if (isAvatar && card.name === avatarName) continue;

    const variant =
      card.variants.find((v) => v.id === variantId) || card.variants[0];
    const slug = variant?.slug || `${card.slug}`;

    entries.push({
      name: card.name,
      slug,
      printingId: variant?.printingId ?? null,
      quantity,
      category: card.category,
      type: card.type,
      zone: "sideboard", // Will become Collection zone
    });
  }

  if (entries.length === 0) {
    return { error: "No cards found in the imported deck" };
  }

  // Group by slug+zone and sum quantities (sideboard cards stay separate)
  const grouped = new Map<
    string,
    {
      name: string;
      slug: string;
      printingId: string | null;
      quantity: number;
      category: string;
      type: string;
      zone: "main" | "sideboard";
    }
  >();
  for (const e of entries) {
    const key = `${e.slug}:${e.zone}`;
    const existing = grouped.get(key);
    if (existing) {
      existing.quantity += e.quantity;
    } else {
      grouped.set(key, { ...e });
    }
  }

  // Map to our DB variants by slug
  type Mapped = {
    cardId: number;
    variantId: number | null;
    setId: number | null;
    zone: string;
    count: number;
    name: string;
  };

  const mapped: Mapped[] = [];
  const unresolved: { name: string; count: number }[] = [];

  // Resolution order, most to least precise:
  //   1. registry printing id  - exact printing, survives upstream renames
  //   2. legacy slug           - printings the registry doesn't cover
  //   3. registry codex id     - a different printing of the same card, for
  //                              alternate art we hold no assets for
  //   4. card name             - last resort
  const groupedEntries = Array.from(grouped.values());
  const allSlugs = groupedEntries.map((e) => e.slug);
  const allPrintingIds = groupedEntries
    .map((e) => e.printingId)
    .filter((id): id is string => !!id);

  const variants = await prisma.variant.findMany({
    where: {
      OR: [
        { slug: { in: allSlugs } },
        ...(allPrintingIds.length
          ? [{ printingId: { in: allPrintingIds } }]
          : []),
      ],
    },
    select: {
      id: true,
      cardId: true,
      setId: true,
      typeText: true,
      slug: true,
      printingId: true,
    },
  });

  const variantBySlug = new Map(variants.map((v) => [v.slug, v]));
  const variantByPrintingId = new Map(
    variants
      .filter((v) => !!v.printingId)
      .map((v) => [v.printingId as string, v])
  );

  type ResolvedVariant = {
    id: number;
    cardId: number;
    setId: number | null;
    typeText: string | null;
  };

  const directHit = (entry: (typeof groupedEntries)[number]) =>
    (entry.printingId ? variantByPrintingId.get(entry.printingId) : undefined) ??
    variantBySlug.get(entry.slug);

  const needsFallback = groupedEntries.filter((e) => !directHit(e));

  // A printing we don't carry still identifies its card, so fall back to any
  // printing of that card rather than failing the whole import
  const variantByCodexId = new Map<string, ResolvedVariant>();
  const codexIds = [
    ...new Set(
      needsFallback
        .map((e) => codexIdForPrinting(e.printingId ?? undefined))
        .filter((id): id is string => !!id)
    ),
  ];
  if (codexIds.length > 0) {
    const cards = await prisma.card.findMany({
      where: { codexId: { in: codexIds } },
      select: {
        id: true,
        codexId: true,
        variants: {
          select: { id: true, setId: true, typeText: true },
          take: 1,
        },
      },
    });
    for (const c of cards) {
      const v = c.variants[0];
      if (c.codexId && v) {
        variantByCodexId.set(c.codexId, {
          id: v.id,
          cardId: c.id,
          setId: v.setId,
          typeText: v.typeText,
        });
      }
    }
  }

  // Batch lookup cards by name for anything still unmatched
  let cardByNameLower = new Map<
    string,
    {
      id: number;
      variants: { id: number; setId: number | null; typeText: string | null }[];
    }
  >();

  const needsNameLookup = needsFallback.filter((e) => {
    const codexId = codexIdForPrinting(e.printingId ?? undefined);
    return !codexId || !variantByCodexId.has(codexId);
  });

  if (needsNameLookup.length > 0) {
    const names = [...new Set(needsNameLookup.map((e) => e.name))];
    const cards = await prisma.card.findMany({
      where: { name: { in: names, mode: "insensitive" } },
      select: {
        id: true,
        name: true,
        variants: {
          select: { id: true, setId: true, typeText: true },
          take: 1,
        },
      },
    });
    cardByNameLower = new Map(cards.map((c) => [c.name.toLowerCase(), c]));
  }

  // Process all entries using the batched lookups
  for (const entry of groupedEntries) {
    const codexId = codexIdForPrinting(entry.printingId ?? undefined);
    const nameMatch = cardByNameLower.get(entry.name.toLowerCase());
    const resolved: ResolvedVariant | undefined =
      directHit(entry) ??
      (codexId ? variantByCodexId.get(codexId) : undefined) ??
      (nameMatch && nameMatch.variants[0]
        ? {
            id: nameMatch.variants[0].id,
            cardId: nameMatch.id,
            setId: nameMatch.variants[0].setId,
            typeText: nameMatch.variants[0].typeText,
          }
        : undefined);

    if (!resolved) {
      unresolved.push({ name: entry.name, count: entry.quantity });
      continue;
    }

    // Determine zone: sideboard -> Collection (for constructed), main deck sites -> Atlas, main deck spells -> Spellbook
    let zone: string;
    if (entry.zone === "sideboard") {
      zone = "Collection";
    } else {
      const isSite =
        entry.type?.toLowerCase() === "site" ||
        entry.category?.toLowerCase() === "site";
      zone = isSite ? "Atlas" : "Spellbook";
    }
    mapped.push({
      cardId: resolved.cardId,
      variantId: resolved.id,
      setId: resolved.setId,
      zone,
      count: entry.quantity,
      name: entry.name,
    });
  }

  if (unresolved.length > 0) {
    return { error: `Could not map some cards by slug or name`, unresolved };
  }

  // Handle avatar (from metadata, not in deck list)
  if (!avatarName) {
    return {
      error: "Deck requires exactly 1 Avatar (none found in the imported deck)",
    };
  }

  // Look up avatar card by name and add to mapped
  const avatarCard = await prisma.card.findFirst({
    where: { name: { equals: avatarName, mode: "insensitive" } },
    select: {
      id: true,
      variants: { select: { id: true, setId: true }, take: 1 },
    },
  });

  if (!avatarCard) {
    return { error: `Avatar "${avatarName}" not found in database` };
  }

  const avatarVariant = avatarCard.variants[0];
  mapped.push({
    cardId: avatarCard.id,
    variantId: avatarVariant?.id ?? null,
    setId: avatarVariant?.setId ?? null,
    zone: "Spellbook", // Avatars go in Spellbook
    count: 1,
    name: avatarName,
  });

  // Validate counts
  const atlasCount = mapped
    .filter((m) => m.zone === "Atlas")
    .reduce((a, b) => a + b.count, 0);
  const spellbookCount =
    mapped
      .filter((m) => m.zone === "Spellbook")
      .reduce((a, b) => a + b.count, 0) - 1; // minus avatar

  // Store the format the list actually qualifies for so a later edit or
  // publish doesn't fail a gate the import never applied
  const resolvedFormat = resolveImportFormat(
    { spellbookCount, atlasCount, avatarCount: 1 },
    avatarName,
    requestedFormat
  );
  if (!resolvedFormat.validation.isValid) {
    return { error: formatValidationErrors(resolvedFormat.validation) };
  }

  // Create deck
  const deck = await prisma.deck.create({
    data: {
      name: deckName,
      format: resolvedFormat.label,
      imported: true,
      curiosaSourceId, // Store for sync functionality
      user: { connect: { id: userId } },
    },
  });

  // Aggregate and create deck cards
  const allowedZones = new Set([
    "Spellbook",
    "Atlas",
    "Collection",
    "Sideboard",
  ]);
  const agg = new Map<
    string,
    {
      cardId: number;
      variantId: number | null;
      setId: number | null;
      zone: string;
      count: number;
    }
  >();

  for (const m of mapped) {
    if (!allowedZones.has(m.zone)) continue;
    const key = `${m.cardId}:${m.zone}:${m.variantId ?? "x"}`;
    const prev = agg.get(key);
    if (prev) {
      prev.count += m.count;
    } else {
      agg.set(key, {
        cardId: m.cardId,
        variantId: m.variantId,
        setId: m.setId,
        zone: m.zone,
        count: m.count,
      });
    }
  }

  const createRows = Array.from(agg.values()).map((v) => ({
    deckId: deck.id,
    cardId: v.cardId,
    setId: v.setId,
    variantId: v.variantId,
    zone: v.zone,
    count: v.count,
  }));

  if (createRows.length) {
    await prisma.deckCard.createMany({ data: createRows });
  }

  return { deck: { id: deck.id, name: deck.name, format: deck.format } };
}
