import type { Finish, Prisma, Rarity } from "@prisma/client";
import { NextRequest } from "next/server";
import { getServerAuthSession } from "@/lib/auth";
import { CacheKeys, invalidateCache } from "@/lib/cache/redis-cache";
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
import { logPerformance } from "@/lib/monitoring/performance";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// GET /api/collection
// Query params: page, limit, setId, element, type, rarity, search, sort, order
export async function GET(req: NextRequest) {
  const startTime = performance.now();
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
    const where: Prisma.CollectionCardWhereInput = { userId };

    if (setId) {
      where.setId = setId;
    }

    // For element, type, rarity filtering - need to filter via card relations
    const cardFilter: Prisma.CardWhereInput = {};

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
    let metaFilter: Prisma.CardSetMetadataWhereInput | undefined = undefined;
    if (type || rarity) {
      metaFilter = {};
      if (type) metaFilter.type = { contains: type, mode: "insensitive" };
      if (rarity) metaFilter.rarity = rarity as Rarity;
    }

    // Build orderBy
    let orderBy: Prisma.CollectionCardOrderByWithRelationInput;
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

    // Run count, main query, and stats in parallel
    const [total, cards, statsAgg, uniqueCount] = await Promise.all([
      // Get total count
      prisma.collectionCard.count({ where }),
      // Fetch collection cards with relations
      prisma.collectionCard.findMany({
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
          variant: {
            include: { set: true },
          },
          set: true,
        },
      }),
      // Calculate stats - aggregate
      prisma.collectionCard.aggregate({
        where: { userId },
        _sum: { quantity: true },
      }),
      // Count unique cards
      prisma.collectionCard.groupBy({
        by: ["cardId"],
        where: { userId },
        _count: true,
      }),
    ]);

    // Post-filter for type/rarity if needed (when card's meta doesn't match)
    const filteredCards = metaFilter
      ? cards.filter((c) => c.card.meta.length > 0)
      : cards;

    const response: CollectionListResponse = {
      cards: filteredCards.map((c) => ({
        id: c.id,
        cardId: c.cardId,
        variantId: c.variantId,
        setId: c.setId,
        finish: c.finish,
        quantity: c.quantity,
        notes: c.notes,
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
        // Prefer collection.set, fall back to variant.set for legacy entries
        set: c.set
          ? { name: c.set.name }
          : c.variant?.set
          ? { name: c.variant.set.name }
          : null,
        meta: c.card.meta[0]
          ? {
              type: c.card.meta[0].type,
              rarity: c.card.meta[0].rarity ?? "Unknown",
              cost: c.card.meta[0].cost,
              attack: c.card.meta[0].attack,
              defence: c.card.meta[0].defence,
              thresholds: c.card.meta[0].thresholds,
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
        uniqueCards: uniqueCount.length,
        totalValue: null, // Pricing to be computed later
        currency: "USD",
      },
    };

    logPerformance("GET /api/collection", performance.now() - startTime);
    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  } catch (e) {
    logPerformance("GET /api/collection", performance.now() - startTime);
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
  const startTime = performance.now();
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

    // Validate inputs first (no DB calls)
    const validInputs: Array<{
      cardId: number;
      variantId: number | null;
      setId: number | null;
      finish: Finish;
      quantity: number;
    }> = [];

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

      const qtyValidation = validateQuantity(quantity);
      if (!qtyValidation.valid) {
        response.errors.push({
          cardId,
          message: qtyValidation.error || "Invalid quantity",
        });
        continue;
      }

      validInputs.push({
        cardId,
        variantId: variantId ?? null,
        setId: setId ?? null,
        finish,
        quantity,
      });
    }

    if (validInputs.length === 0) {
      return new Response(JSON.stringify(response), {
        status: 201,
        headers: { "content-type": "application/json" },
      });
    }

    // Single transaction for all DB operations
    const results = await prisma.$transaction(async (tx) => {
      // Batch verify: user exists + cards exist in single query
      const [user, existingCards] = await Promise.all([
        tx.user.findUnique({ where: { id: userId }, select: { id: true } }),
        tx.card.findMany({
          where: { id: { in: validInputs.map((c) => c.cardId) } },
          select: { id: true },
        }),
      ]);

      if (!user) {
        throw new Error("USER_NOT_FOUND");
      }

      const existingCardIds = new Set(existingCards.map((c) => c.id));
      const toProcess: typeof validInputs = [];

      for (const input of validInputs) {
        if (!existingCardIds.has(input.cardId)) {
          response.errors.push({
            cardId: input.cardId,
            message: "Card not found",
          });
        } else {
          toProcess.push(input);
        }
      }

      // Batch fetch existing collection entries
      const existingEntries = await tx.collectionCard.findMany({
        where: {
          userId,
          OR: toProcess.map((c) => ({
            cardId: c.cardId,
            variantId: c.variantId,
            finish: c.finish,
          })),
        },
      });

      // Build lookup map: "cardId:variantId:finish" -> existing entry
      const entryMap = new Map(
        existingEntries.map((e) => [
          `${e.cardId}:${e.variantId ?? ""}:${e.finish}`,
          e,
        ])
      );

      const created: typeof response.added = [];
      const updated: typeof response.updated = [];

      // Process all cards in parallel
      await Promise.all(
        toProcess.map(async (input) => {
          const key = `${input.cardId}:${input.variantId ?? ""}:${
            input.finish
          }`;
          const existing = entryMap.get(key);

          if (existing) {
            const newQuantity = Math.min(
              99,
              existing.quantity + input.quantity
            );
            const result = await tx.collectionCard.update({
              where: { id: existing.id },
              data: { quantity: newQuantity },
            });
            updated.push({
              id: result.id,
              cardId: result.cardId,
              variantId: result.variantId,
              quantity: result.quantity,
            });
          } else {
            const result = await tx.collectionCard.create({
              data: {
                userId,
                cardId: input.cardId,
                variantId: input.variantId,
                setId: input.setId,
                finish: input.finish,
                quantity: input.quantity,
              },
            });
            created.push({
              id: result.id,
              cardId: result.cardId,
              variantId: result.variantId,
              quantity: result.quantity,
              isNew: true,
            });
          }
        })
      );

      return { created, updated };
    });

    response.added = results.created;
    response.updated = results.updated;

    // Invalidate user's collection caches (cards were added/updated)
    await invalidateCache(CacheKeys.collection.invalidateUser(userId));

    logPerformance("POST /api/collection", performance.now() - startTime);
    return new Response(JSON.stringify(response), {
      status: 201,
      headers: { "content-type": "application/json" },
    });
  } catch (e) {
    logPerformance("POST /api/collection", performance.now() - startTime);
    if (e instanceof Error && e.message === "USER_NOT_FOUND") {
      return new Response(
        JSON.stringify({
          error:
            "Your account could not be found in the database. Please sign out and sign back in.",
          code: "USER_NOT_FOUND",
        }),
        { status: 401, headers: { "content-type": "application/json" } }
      );
    }
    const message = e instanceof Error ? e.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
}

// DELETE /api/collection
// Deletes ALL cards in the user's collection (danger zone)
export async function DELETE() {
  const startTime = performance.now();
  const session = await getServerAuthSession();
  if (!session?.user) {
    return new Response(
      JSON.stringify({ error: "Unauthorized", code: "UNAUTHORIZED" }),
      { status: 401, headers: { "content-type": "application/json" } }
    );
  }

  try {
    const userId = session.user.id;

    // Verify user exists
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return new Response(
        JSON.stringify({
          error: "Your account could not be found in the database.",
          code: "USER_NOT_FOUND",
        }),
        { status: 401, headers: { "content-type": "application/json" } }
      );
    }

    // Delete all collection cards for this user
    const result = await prisma.collectionCard.deleteMany({
      where: { userId },
    });

    // Invalidate user's collection caches
    await invalidateCache(CacheKeys.collection.invalidateUser(userId));

    logPerformance("DELETE /api/collection", performance.now() - startTime);
    return new Response(
      JSON.stringify({ deleted: result.count, message: "Collection deleted" }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  } catch (e) {
    logPerformance("DELETE /api/collection", performance.now() - startTime);
    const message = e instanceof Error ? e.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
}
