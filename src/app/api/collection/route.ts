import type { Finish } from "@prisma/client";
import { NextRequest } from "next/server";
import { getServerAuthSession } from "@/lib/auth";
import type {
  CollectionListResponse,
  CollectionAddResponse,
  CollectionSortField,
  SortOrder,
} from "@/lib/collection/types";
import {
  validateCollectionCardInput,
  validateQuantity,
} from "@/lib/collection/validation";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// GET /api/collection
// Query params: page, limit, setId, element, type, rarity, search, sort, order
export async function GET(req: NextRequest) {
  const session = await getServerAuthSession();
  if (!session?.user) {
    return new Response(
      JSON.stringify({ error: "Unauthorized", code: "UNAUTHORIZED" }),
      {
        status: 401,
        headers: { "content-type": "application/json" },
      }
    );
  }

  try {
    const { searchParams } = new URL(req.url);
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.min(
      100,
      Math.max(1, parseInt(searchParams.get("limit") || "50", 10))
    );
    const setIdParam = searchParams.get("setId");
    const setId = setIdParam ? parseInt(setIdParam, 10) : undefined;
    const element = searchParams.get("element") || undefined;
    const type = searchParams.get("type") || undefined;
    const rarity = searchParams.get("rarity") || undefined;
    const search = searchParams.get("search") || undefined;
    const sort = (searchParams.get("sort") || "name") as CollectionSortField;
    const order = (searchParams.get("order") || "asc") as SortOrder;

    const userId = session.user.id;

    // Build where clause for collection cards
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = { userId };

    if (setId) {
      where.setId = setId;
    }

    // For element, type, rarity filtering - need to filter via card relations
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cardFilter: any = {};

    if (element) {
      cardFilter.elements = { contains: element, mode: "insensitive" };
    }

    if (search) {
      cardFilter.name = { contains: search, mode: "insensitive" };
    }

    if (Object.keys(cardFilter).length > 0) {
      where.card = cardFilter;
    }

    // For type and rarity, we need to filter via CardSetMetadata
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let metaFilter: any = undefined;
    if (type || rarity) {
      metaFilter = {};
      if (type) metaFilter.type = { contains: type, mode: "insensitive" };
      if (rarity) metaFilter.rarity = rarity;
    }

    // Build orderBy
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let orderBy: any;
    switch (sort) {
      case "quantity":
        orderBy = { quantity: order };
        break;
      case "recent":
        orderBy = { updatedAt: order };
        break;
      case "name":
      default:
        orderBy = { card: { name: order } };
        break;
    }

    // Get total count
    const total = await prisma.collectionCard.count({ where });

    // Fetch collection cards with relations
    const cards = await prisma.collectionCard.findMany({
      where,
      orderBy,
      skip: (page - 1) * limit,
      take: limit,
      include: {
        card: {
          include: {
            meta: metaFilter ? { where: metaFilter, take: 1 } : { take: 1 },
          },
        },
        variant: true,
        set: true,
      },
    });

    // Post-filter for type/rarity if needed (when card's meta doesn't match)
    const filteredCards = metaFilter
      ? cards.filter((c) => c.card.meta.length > 0)
      : cards;

    // Calculate stats
    const statsAgg = await prisma.collectionCard.aggregate({
      where: { userId },
      _sum: { quantity: true },
      _count: { cardId: true },
    });

    const uniqueCards = await prisma.collectionCard.groupBy({
      by: ["cardId"],
      where: { userId },
    });

    const response: CollectionListResponse = {
      cards: filteredCards.map((c) => ({
        id: c.id,
        cardId: c.cardId,
        variantId: c.variantId,
        setId: c.setId,
        finish: c.finish,
        quantity: c.quantity,
        card: {
          name: c.card.name,
          elements: c.card.elements,
          subTypes: c.card.subTypes,
        },
        variant: c.variant
          ? {
              slug: c.variant.slug,
              finish: c.variant.finish,
              product: c.variant.product,
            }
          : null,
        set: c.set ? { name: c.set.name } : null,
        meta: c.card.meta[0]
          ? {
              type: c.card.meta[0].type,
              rarity: c.card.meta[0].rarity,
              cost: c.card.meta[0].cost,
              attack: c.card.meta[0].attack,
              defence: c.card.meta[0].defence,
            }
          : null,
        price: null, // Pricing to be added in later task
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
      stats: {
        totalCards: statsAgg._sum.quantity || 0,
        uniqueCards: uniqueCards.length,
        totalValue: null, // Pricing to be computed later
        currency: "USD",
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

// POST /api/collection
// Body: { cards: [{ cardId, variantId?, setId?, finish, quantity }] }
export async function POST(req: NextRequest) {
  const session = await getServerAuthSession();
  if (!session?.user) {
    return new Response(
      JSON.stringify({ error: "Unauthorized", code: "UNAUTHORIZED" }),
      {
        status: 401,
        headers: { "content-type": "application/json" },
      }
    );
  }

  try {
    const userId = session.user.id;

    // Verify user exists
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return new Response(
        JSON.stringify({
          error:
            "Your account could not be found in the database. Please sign out and sign back in.",
          code: "USER_NOT_FOUND",
        }),
        { status: 401, headers: { "content-type": "application/json" } }
      );
    }

    const body = await req.json();
    const cardsInput = Array.isArray(body?.cards) ? body.cards : [];

    if (cardsInput.length === 0) {
      return new Response(
        JSON.stringify({ error: "No cards provided", code: "INVALID_INPUT" }),
        { status: 400, headers: { "content-type": "application/json" } }
      );
    }

    const response: CollectionAddResponse = {
      added: [],
      updated: [],
      errors: [],
    };

    // Validate all card IDs exist
    const cardIds: number[] = Array.from(
      new Set<number>(cardsInput.map((c: { cardId: number }) => c.cardId))
    );
    const existingCards = await prisma.card.findMany({
      where: { id: { in: cardIds } },
      select: { id: true },
    });
    const existingCardIds = new Set(existingCards.map((c) => c.id));

    // Process each card
    for (const input of cardsInput) {
      const validation = validateCollectionCardInput(input);
      if (!validation.valid) {
        response.errors.push({
          cardId: input.cardId,
          message: validation.errors.join(", "),
        });
        continue;
      }

      const { cardId, variantId, setId, finish, quantity } = input as {
        cardId: number;
        variantId?: number | null;
        setId?: number | null;
        finish: Finish;
        quantity: number;
      };

      // Check card exists
      if (!existingCardIds.has(cardId)) {
        response.errors.push({
          cardId,
          message: "Card not found",
        });
        continue;
      }

      // Validate quantity
      const qtyValidation = validateQuantity(quantity);
      if (!qtyValidation.valid) {
        response.errors.push({
          cardId,
          message: qtyValidation.error || "Invalid quantity",
        });
        continue;
      }

      // Check if entry already exists (upsert)
      // For nullable variantId, we need to query differently
      const existing = await prisma.collectionCard.findFirst({
        where: {
          userId,
          cardId,
          variantId: variantId ?? null,
          finish,
        },
      });

      if (existing) {
        // Update quantity
        const newQuantity = Math.min(99, existing.quantity + quantity);
        const updated = await prisma.collectionCard.update({
          where: { id: existing.id },
          data: { quantity: newQuantity },
        });
        response.updated.push({
          id: updated.id,
          cardId: updated.cardId,
          variantId: updated.variantId,
          quantity: updated.quantity,
        });
      } else {
        // Create new entry
        const created = await prisma.collectionCard.create({
          data: {
            userId,
            cardId,
            variantId: variantId ?? null,
            setId: setId ?? null,
            finish,
            quantity,
          },
        });
        response.added.push({
          id: created.id,
          cardId: created.cardId,
          variantId: created.variantId,
          quantity: created.quantity,
          isNew: true,
        });
      }
    }

    return new Response(JSON.stringify(response), {
      status: 201,
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
