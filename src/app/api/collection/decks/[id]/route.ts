import { NextRequest } from "next/server";
import { getServerAuthSession } from "@/lib/auth";
import { validateOwnership } from "@/lib/collection/validation";
import {
  CONSTRUCTED_REQUIREMENTS,
  type ValidationError,
} from "@/lib/deck/validation-rules";
import { prisma } from "@/lib/prisma";
import { getImageSlug } from "@/lib/utils/cardSlug";

export const dynamic = "force-dynamic";

// GET /api/collection/decks/[id]
// Get a collection deck with card availability info
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerAuthSession();
  if (!session?.user) {
    return new Response(
      JSON.stringify({ error: "Unauthorized", code: "UNAUTHORIZED" }),
      { status: 401, headers: { "content-type": "application/json" } }
    );
  }

  try {
    const { id } = await params;
    const userId = session.user.id;

    const deck = await prisma.deck.findUnique({
      where: { id },
      include: {
        cards: {
          include: {
            card: {
              include: {
                meta: { take: 1 },
              },
            },
            variant: true,
            set: true,
          },
        },
      },
    });

    if (!deck) {
      return new Response(
        JSON.stringify({ error: "Deck not found", code: "NOT_FOUND" }),
        { status: 404, headers: { "content-type": "application/json" } }
      );
    }

    if (deck.userId !== userId) {
      return new Response(
        JSON.stringify({ error: "Unauthorized", code: "UNAUTHORIZED" }),
        { status: 401, headers: { "content-type": "application/json" } }
      );
    }

    // Get user's collection to calculate availability
    const collection = await prisma.collectionCard.findMany({
      where: { userId },
      select: { cardId: true, quantity: true },
    });

    // Build ownership map
    const ownedByCard = new Map<number, number>();
    for (const c of collection) {
      ownedByCard.set(c.cardId, (ownedByCard.get(c.cardId) || 0) + c.quantity);
    }

    // Get card IDs that need variant lookup (no variant in deck card)
    const cardIdsNeedingVariant = deck.cards
      .filter((c) => !c.variant)
      .map((c) => c.cardId);

    // Lookup any variant for cards missing one
    const variantLookup = new Map<number, string>();
    if (cardIdsNeedingVariant.length > 0) {
      const variants = await prisma.variant.findMany({
        where: { cardId: { in: cardIdsNeedingVariant } },
        select: { cardId: true, slug: true },
      });
      for (const v of variants) {
        if (!variantLookup.has(v.cardId)) {
          variantLookup.set(v.cardId, v.slug);
        }
      }
    }

    // Calculate availability for each card
    const cardsWithAvailability = deck.cards.map((c) => {
      const owned = ownedByCard.get(c.cardId) || 0;
      const meta = c.card.meta[0];
      // Use variant slug, or lookup a variant, or generate fallback
      const slug =
        c.variant?.slug ||
        variantLookup.get(c.cardId) ||
        getImageSlug(null, c.card.name, c.set?.name);
      return {
        cardId: c.cardId,
        variantId: c.variantId,
        name: c.card.name,
        zone: c.zone,
        count: c.count,
        ownedQuantity: owned,
        availableQuantity: Math.max(0, owned - c.count),
        slug,
        meta: meta
          ? {
              type: meta.type,
              cost: meta.cost,
              thresholds: meta.thresholds,
            }
          : null,
      };
    });

    // Count avatars properly
    const avatarCount = deck.cards
      .filter((c) => c.card.meta[0]?.type?.toLowerCase().includes("avatar"))
      .reduce((sum, c) => sum + c.count, 0);

    // Deck stats
    const spellbookCount = deck.cards
      .filter((c) => c.zone === "Spellbook")
      .reduce((sum, c) => sum + c.count, 0);
    const atlasCount = deck.cards
      .filter((c) => c.zone === "Atlas")
      .reduce((sum, c) => sum + c.count, 0);
    const collectionCount = deck.cards
      .filter((c) => c.zone === "Collection")
      .reduce((sum, c) => sum + c.count, 0);
    const sideboardCount = deck.cards
      .filter((c) => c.zone === "Sideboard")
      .reduce((sum, c) => sum + c.count, 0);

    // Validation using constructed rules (collection decks are for constructed play)
    const reqs = CONSTRUCTED_REQUIREMENTS;
    const errors: ValidationError[] = [];

    // Avatar validation
    if (avatarCount !== reqs.avatarCount) {
      errors.push({
        code: "AVATAR_COUNT",
        message: `Deck must have exactly ${reqs.avatarCount} avatar (has ${avatarCount})`,
      });
    }

    // Spellbook validation
    if (spellbookCount < reqs.minSpellbook) {
      errors.push({
        code: "SPELLBOOK_MIN",
        message: `Spellbook needs at least ${reqs.minSpellbook} cards (has ${spellbookCount})`,
      });
    }

    // Atlas validation
    if (atlasCount < reqs.minAtlas) {
      errors.push({
        code: "ATLAS_MIN",
        message: `Atlas needs at least ${reqs.minAtlas} sites (has ${atlasCount})`,
      });
    }

    // Collection validation (null = unlimited, e.g. limited format)
    if (reqs.maxCollection !== null && collectionCount > reqs.maxCollection) {
      errors.push({
        code: "COLLECTION_MAX",
        message: `Collection cannot exceed ${reqs.maxCollection} cards (has ${collectionCount})`,
      });
    }

    // Check ownership violations
    for (const c of cardsWithAvailability) {
      if (c.count > c.ownedQuantity) {
        errors.push({
          code: "EXCEEDS_OWNED",
          message: `${c.name}: need ${c.count}, own ${c.ownedQuantity}`,
          cardId: c.cardId,
        });
      }
    }

    const response = {
      id: deck.id,
      name: deck.name,
      format: deck.format,
      isCollectionDeck: true,
      cards: cardsWithAvailability,
      validation: {
        isValid: errors.length === 0,
        errors,
        warnings: [],
      },
      stats: {
        spellbookCount,
        atlasCount,
        collectionCount,
        sideboardCount,
        avatarCount,
        hasAvatar: avatarCount === 1,
      },
      requirements: {
        minSpellbook: reqs.minSpellbook,
        minAtlas: reqs.minAtlas,
        maxCollection: reqs.maxCollection,
        avatarCount: reqs.avatarCount,
      },
    };

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
}

// PUT /api/collection/decks/[id]
// Update deck with ownership validation
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerAuthSession();
  if (!session?.user) {
    return new Response(
      JSON.stringify({ error: "Unauthorized", code: "UNAUTHORIZED" }),
      { status: 401, headers: { "content-type": "application/json" } }
    );
  }

  try {
    const { id } = await params;
    const userId = session.user.id;

    const deck = await prisma.deck.findUnique({
      where: { id },
    });

    if (!deck) {
      return new Response(
        JSON.stringify({ error: "Deck not found", code: "NOT_FOUND" }),
        { status: 404, headers: { "content-type": "application/json" } }
      );
    }

    if (deck.userId !== userId) {
      return new Response(
        JSON.stringify({ error: "Unauthorized", code: "UNAUTHORIZED" }),
        { status: 401, headers: { "content-type": "application/json" } }
      );
    }

    const body = await req.json();
    const name = body?.name ? String(body.name).trim() : deck.name;
    const cards = Array.isArray(body?.cards) ? body.cards : [];

    // Get user's collection
    const collection = await prisma.collectionCard.findMany({
      where: { userId },
      select: { cardId: true, quantity: true },
    });

    // Build ownership map
    const ownedByCard = new Map<number, number>();
    for (const c of collection) {
      ownedByCard.set(c.cardId, (ownedByCard.get(c.cardId) || 0) + c.quantity);
    }

    // Validate ownership for each card
    const cardNames = await prisma.card.findMany({
      where: { id: { in: cards.map((c: { cardId: number }) => c.cardId) } },
      select: { id: true, name: true },
    });
    const nameById = new Map(cardNames.map((c) => [c.id, c.name]));

    for (const card of cards) {
      const owned = ownedByCard.get(card.cardId) || 0;
      const cardName = nameById.get(card.cardId) || "Unknown card";
      const validation = validateOwnership(owned, card.count, cardName);

      if (!validation.valid) {
        return new Response(
          JSON.stringify({
            error: "Card quantity exceeds collection",
            code: "EXCEEDS_OWNED",
            details: {
              cardId: card.cardId,
              requested: card.count,
              owned,
            },
          }),
          { status: 400, headers: { "content-type": "application/json" } }
        );
      }
    }

    // Update deck in transaction
    await prisma.$transaction(async (tx) => {
      // Update deck name
      await tx.deck.update({
        where: { id },
        data: { name },
      });

      // Delete existing cards
      await tx.deckCard.deleteMany({
        where: { deckId: id },
      });

      // Create new cards
      if (cards.length > 0) {
        await tx.deckCard.createMany({
          data: cards.map(
            (c: {
              cardId: number;
              variantId?: number;
              zone: string;
              count: number;
            }) => ({
              deckId: id,
              cardId: c.cardId,
              variantId: c.variantId || null,
              zone: c.zone,
              count: c.count,
            })
          ),
        });
      }
    });

    // Fetch updated deck
    const updated = await prisma.deck.findUnique({
      where: { id },
      include: {
        cards: {
          include: {
            card: true,
          },
        },
      },
    });

    if (!updated) {
      return new Response(
        JSON.stringify({ error: "Failed to fetch updated deck" }),
        { status: 500, headers: { "content-type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        id: updated.id,
        name: updated.name,
        cards: updated.cards,
        validation: {
          isValid: true,
          errors: [],
          warnings: [],
        },
      }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
}

// DELETE /api/collection/decks/[id]
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerAuthSession();
  if (!session?.user) {
    return new Response(
      JSON.stringify({ error: "Unauthorized", code: "UNAUTHORIZED" }),
      { status: 401, headers: { "content-type": "application/json" } }
    );
  }

  try {
    const { id } = await params;
    const userId = session.user.id;

    const deck = await prisma.deck.findUnique({
      where: { id },
    });

    if (!deck) {
      return new Response(
        JSON.stringify({ error: "Deck not found", code: "NOT_FOUND" }),
        { status: 404, headers: { "content-type": "application/json" } }
      );
    }

    if (deck.userId !== userId) {
      return new Response(
        JSON.stringify({ error: "Unauthorized", code: "UNAUTHORIZED" }),
        { status: 401, headers: { "content-type": "application/json" } }
      );
    }

    await prisma.deck.delete({
      where: { id },
    });

    return new Response(JSON.stringify({ deleted: true, id }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
}
