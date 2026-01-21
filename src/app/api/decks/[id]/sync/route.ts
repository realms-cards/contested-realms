import { NextRequest } from "next/server";
import { getServerAuthSession } from "@/lib/auth";
import { invalidateCache, CacheKeys } from "@/lib/cache/redis-cache";
import { prisma } from "@/lib/prisma";
import {
  fetchCuriosatrpc,
  type CuriosatrpcDeck,
} from "@/lib/services/curiosa-deck";

export const dynamic = "force-dynamic";

/**
 * POST /api/decks/[id]/sync
 *
 * Syncs a Curiosa-imported deck with the latest data from Curiosa.
 * The deck must have a curiosaSourceId (set during import).
 *
 * Returns: { id, name, syncedAt }
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerAuthSession();
  if (!session?.user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }

  try {
    const { id } = await params;
    if (!id) {
      return new Response(JSON.stringify({ error: "Missing deck id" }), {
        status: 400,
        headers: { "content-type": "application/json" },
      });
    }

    // Fetch deck and verify ownership
    const deck = await prisma.deck.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        userId: true,
        curiosaSourceId: true,
      },
    });

    if (!deck) {
      return new Response(JSON.stringify({ error: "Deck not found" }), {
        status: 404,
        headers: { "content-type": "application/json" },
      });
    }

    if (deck.userId !== session.user.id) {
      return new Response(
        JSON.stringify({ error: "You don't own this deck" }),
        {
          status: 403,
          headers: { "content-type": "application/json" },
        }
      );
    }

    if (!deck.curiosaSourceId) {
      return new Response(
        JSON.stringify({
          error:
            "This deck was not imported from Curiosa or has no source ID for syncing",
        }),
        {
          status: 400,
          headers: { "content-type": "application/json" },
        }
      );
    }

    // Fetch latest data from Curiosa
    const trpcData = await fetchCuriosatrpc(deck.curiosaSourceId);
    if (!trpcData) {
      return new Response(
        JSON.stringify({
          error:
            "Failed to fetch deck from Curiosa. The deck may have been deleted or made private.",
        }),
        {
          status: 404,
          headers: { "content-type": "application/json" },
        }
      );
    }

    // Map Curiosa data to deck cards
    const mappingResult = await mapCuriosaDataToDeckCards(
      trpcData.deckList,
      trpcData.sideboardList,
      trpcData.avatarName
    );

    if (mappingResult.error) {
      return new Response(
        JSON.stringify({
          error: mappingResult.error,
          unresolved: mappingResult.unresolved,
        }),
        {
          status: 400,
          headers: { "content-type": "application/json" },
        }
      );
    }

    // Update deck cards in a transaction
    await prisma.$transaction(async (tx) => {
      // Delete existing deck cards
      await tx.deckCard.deleteMany({ where: { deckId: id } });

      // Create new deck cards
      if (mappingResult.cards.length) {
        await tx.deckCard.createMany({
          data: mappingResult.cards.map((card) => ({
            deckId: id,
            cardId: card.cardId,
            setId: card.setId,
            variantId: card.variantId,
            zone: card.zone,
            count: card.count,
          })),
        });
      }

      // Update deck name if it changed in Curiosa
      if (trpcData.deckName && trpcData.deckName !== deck.name) {
        await tx.deck.update({
          where: { id },
          data: { name: trpcData.deckName },
        });
      }
    });

    // Invalidate cache
    await invalidateCache(CacheKeys.decks.list(session.user.id));

    return new Response(
      JSON.stringify({
        id: deck.id,
        name: trpcData.deckName || deck.name,
        syncedAt: new Date().toISOString(),
      }),
      {
        status: 200,
        headers: { "content-type": "application/json" },
      }
    );
  } catch (e: unknown) {
    const message =
      e instanceof Error
        ? e.message
        : typeof e === "string"
          ? e
          : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
}

// Card mapping result type
interface MappedCard {
  cardId: number;
  variantId: number | null;
  setId: number | null;
  zone: string;
  count: number;
}

interface MappingResult {
  error?: string;
  unresolved?: { name: string; count: number }[];
  cards: MappedCard[];
}

/**
 * Maps Curiosa tRPC data to DeckCard entries.
 * Extracted from the import route for reuse in sync.
 */
async function mapCuriosaDataToDeckCards(
  deckList: CuriosatrpcDeck[],
  sideboardList: CuriosatrpcDeck[],
  avatarName: string | null
): Promise<MappingResult> {
  // Extract card entries with their variant slugs and zone
  const entries: {
    name: string;
    slug: string;
    quantity: number;
    category: string;
    type: string;
    zone: "main" | "sideboard";
  }[] = [];

  // Process main deck cards
  for (const entry of deckList) {
    const { card, variantId, quantity } = entry;
    const variant =
      card.variants.find((v) => v.id === variantId) || card.variants[0];
    const slug = variant?.slug || `${card.slug}`;

    entries.push({
      name: card.name,
      slug,
      quantity,
      category: card.category,
      type: card.type,
      zone: "main",
    });
  }

  // Process sideboard (Collection zone)
  for (const entry of sideboardList) {
    const { card, variantId, quantity } = entry;
    const isAvatar = card.type?.toLowerCase() === "avatar";

    // Skip the main avatar (it's added separately)
    if (isAvatar && card.name === avatarName) continue;

    const variant =
      card.variants.find((v) => v.id === variantId) || card.variants[0];
    const slug = variant?.slug || `${card.slug}`;

    entries.push({
      name: card.name,
      slug,
      quantity,
      category: card.category,
      type: card.type,
      zone: "sideboard",
    });
  }

  if (entries.length === 0) {
    return { error: "No cards found in Curiosa deck", cards: [] };
  }

  // Group by slug+zone and sum quantities
  const grouped = new Map<
    string,
    {
      name: string;
      slug: string;
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

  // Map to our DB variants
  const mapped: MappedCard[] = [];
  const unresolved: { name: string; count: number }[] = [];

  // Batch lookup variants by slug
  const groupedEntries = Array.from(grouped.values());
  const allSlugs = groupedEntries.map((e) => e.slug);

  const variants = await prisma.variant.findMany({
    where: { slug: { in: allSlugs } },
    select: { id: true, cardId: true, setId: true, slug: true },
  });

  const variantBySlug = new Map(variants.map((v) => [v.slug, v]));

  // Find entries that didn't match by slug - need name fallback
  const needsNameLookup = groupedEntries.filter(
    (e) => !variantBySlug.has(e.slug)
  );

  // Batch lookup cards by name for unresolved slugs
  let cardByNameLower = new Map<
    string,
    {
      id: number;
      variants: { id: number; setId: number | null }[];
    }
  >();

  if (needsNameLookup.length > 0) {
    const names = [...new Set(needsNameLookup.map((e) => e.name))];
    const cards = await prisma.card.findMany({
      where: { name: { in: names, mode: "insensitive" } },
      select: {
        id: true,
        name: true,
        variants: {
          select: { id: true, setId: true },
          take: 1,
        },
      },
    });
    cardByNameLower = new Map(cards.map((c) => [c.name.toLowerCase(), c]));
  }

  // Process all entries using the batched lookups
  for (const entry of groupedEntries) {
    const variant = variantBySlug.get(entry.slug);

    if (!variant) {
      // Fallback: try by card name
      const card = cardByNameLower.get(entry.name.toLowerCase());

      if (!card) {
        unresolved.push({ name: entry.name, count: entry.quantity });
        continue;
      }

      const v = card.variants[0];
      const zone =
        entry.zone === "sideboard"
          ? "Collection"
          : entry.type?.toLowerCase() === "site" ||
              entry.category?.toLowerCase() === "site"
            ? "Atlas"
            : "Spellbook";

      mapped.push({
        cardId: card.id,
        variantId: v?.id ?? null,
        setId: v?.setId ?? null,
        zone,
        count: entry.quantity,
      });
    } else {
      const zone =
        entry.zone === "sideboard"
          ? "Collection"
          : entry.type?.toLowerCase() === "site" ||
              entry.category?.toLowerCase() === "site"
            ? "Atlas"
            : "Spellbook";

      mapped.push({
        cardId: variant.cardId,
        variantId: variant.id,
        setId: variant.setId,
        zone,
        count: entry.quantity,
      });
    }
  }

  if (unresolved.length > 0) {
    return {
      error: `Could not map some cards by slug or name`,
      unresolved,
      cards: [],
    };
  }

  // Handle avatar
  if (!avatarName) {
    return {
      error: "Deck requires exactly 1 Avatar (none found in Curiosa deck)",
      cards: [],
    };
  }

  // Look up avatar card
  const avatarCard = await prisma.card.findFirst({
    where: { name: { equals: avatarName, mode: "insensitive" } },
    select: {
      id: true,
      variants: { select: { id: true, setId: true }, take: 1 },
    },
  });

  if (!avatarCard) {
    return { error: `Avatar "${avatarName}" not found in database`, cards: [] };
  }

  const avatarVariant = avatarCard.variants[0];
  mapped.push({
    cardId: avatarCard.id,
    variantId: avatarVariant?.id ?? null,
    setId: avatarVariant?.setId ?? null,
    zone: "Spellbook",
    count: 1,
  });

  // Aggregate by (cardId, zone, variantId)
  const allowedZones = new Set([
    "Spellbook",
    "Atlas",
    "Collection",
    "Sideboard",
  ]);
  const agg = new Map<string, MappedCard>();

  for (const m of mapped) {
    if (!allowedZones.has(m.zone)) continue;
    const key = `${m.cardId}:${m.zone}:${m.variantId ?? "x"}`;
    const prev = agg.get(key);
    if (prev) {
      prev.count += m.count;
    } else {
      agg.set(key, { ...m });
    }
  }

  return { cards: Array.from(agg.values()) };
}
