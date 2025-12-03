import type { Finish } from "@prisma/client";
import { NextRequest } from "next/server";
import { getServerAuthSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

// GET /api/lists/[id] - Get a list with its cards
// Public lists can be viewed without authentication
export async function GET(req: NextRequest, context: RouteContext) {
  const session = await getServerAuthSession();
  const { id } = await context.params;

  try {
    const list = await prisma.cardList.findUnique({
      where: { id },
      include: {
        cards: {
          orderBy: { createdAt: "desc" },
          include: {
            card: {
              include: {
                meta: { take: 1 },
              },
            },
            variant: {
              include: { set: true },
            },
            set: true,
          },
        },
        user: { select: { name: true } },
      },
    });

    if (!list) {
      return new Response(
        JSON.stringify({ error: "List not found", code: "NOT_FOUND" }),
        { status: 404, headers: { "content-type": "application/json" } }
      );
    }

    // Check access: must be owner or list is public
    const isOwner = session?.user?.id === list.userId;
    if (!isOwner && !list.isPublic) {
      return new Response(
        JSON.stringify({ error: "Access denied", code: "FORBIDDEN" }),
        { status: 403, headers: { "content-type": "application/json" } }
      );
    }

    const response = {
      id: list.id,
      name: list.name,
      description: list.description,
      isPublic: list.isPublic,
      isOwner,
      ownerName: list.user?.name,
      createdAt: list.createdAt.toISOString(),
      updatedAt: list.updatedAt.toISOString(),
      cards: list.cards.map((c: (typeof list.cards)[number]) => ({
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
        set: c.set
          ? { name: c.set.name }
          : c.variant?.set
          ? { name: c.variant.set.name }
          : null,
        meta: c.card.meta[0]
          ? {
              type: c.card.meta[0].type,
              rarity: c.card.meta[0].rarity,
              cost: c.card.meta[0].cost,
              attack: c.card.meta[0].attack,
              defence: c.card.meta[0].defence,
            }
          : null,
      })),
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

// PUT /api/lists/[id] - Update a list
export async function PUT(req: NextRequest, context: RouteContext) {
  const session = await getServerAuthSession();
  if (!session?.user) {
    return new Response(
      JSON.stringify({ error: "Unauthorized", code: "UNAUTHORIZED" }),
      { status: 401, headers: { "content-type": "application/json" } }
    );
  }

  const { id } = await context.params;

  try {
    // Verify ownership
    const existing = await prisma.cardList.findUnique({
      where: { id },
      select: { userId: true },
    });

    if (!existing) {
      return new Response(
        JSON.stringify({ error: "List not found", code: "NOT_FOUND" }),
        { status: 404, headers: { "content-type": "application/json" } }
      );
    }

    if (existing.userId !== session.user.id) {
      return new Response(
        JSON.stringify({ error: "Access denied", code: "FORBIDDEN" }),
        { status: 403, headers: { "content-type": "application/json" } }
      );
    }

    const body = await req.json();
    const { name, description, isPublic } = body;

    const updateData: {
      name?: string;
      description?: string | null;
      isPublic?: boolean;
    } = {};

    if (name !== undefined) {
      if (typeof name !== "string" || name.trim().length === 0) {
        return new Response(
          JSON.stringify({
            error: "Name cannot be empty",
            code: "INVALID_INPUT",
          }),
          { status: 400, headers: { "content-type": "application/json" } }
        );
      }
      if (name.trim().length > 100) {
        return new Response(
          JSON.stringify({
            error: "Name must be 100 characters or less",
            code: "INVALID_INPUT",
          }),
          { status: 400, headers: { "content-type": "application/json" } }
        );
      }
      updateData.name = name.trim();
    }

    if (description !== undefined) {
      updateData.description = description?.trim() || null;
    }

    if (isPublic !== undefined) {
      updateData.isPublic = Boolean(isPublic);
    }

    const updated = await prisma.cardList.update({
      where: { id },
      data: updateData,
    });

    return new Response(
      JSON.stringify({
        id: updated.id,
        name: updated.name,
        description: updated.description,
        isPublic: updated.isPublic,
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

// DELETE /api/lists/[id] - Delete a list
export async function DELETE(req: NextRequest, context: RouteContext) {
  const session = await getServerAuthSession();
  if (!session?.user) {
    return new Response(
      JSON.stringify({ error: "Unauthorized", code: "UNAUTHORIZED" }),
      { status: 401, headers: { "content-type": "application/json" } }
    );
  }

  const { id } = await context.params;

  try {
    // Verify ownership
    const existing = await prisma.cardList.findUnique({
      where: { id },
      select: { userId: true },
    });

    if (!existing) {
      return new Response(
        JSON.stringify({ error: "List not found", code: "NOT_FOUND" }),
        { status: 404, headers: { "content-type": "application/json" } }
      );
    }

    if (existing.userId !== session.user.id) {
      return new Response(
        JSON.stringify({ error: "Access denied", code: "FORBIDDEN" }),
        { status: 403, headers: { "content-type": "application/json" } }
      );
    }

    await prisma.cardList.delete({ where: { id } });

    return new Response(JSON.stringify({ success: true }), {
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

// POST /api/lists/[id] - Add cards to a list (alternative to /cards route)
export async function POST(req: NextRequest, context: RouteContext) {
  const session = await getServerAuthSession();
  if (!session?.user) {
    return new Response(
      JSON.stringify({ error: "Unauthorized", code: "UNAUTHORIZED" }),
      { status: 401, headers: { "content-type": "application/json" } }
    );
  }

  const { id } = await context.params;

  try {
    // Verify ownership
    const existing = await prisma.cardList.findUnique({
      where: { id },
      select: { userId: true },
    });

    if (!existing) {
      return new Response(
        JSON.stringify({ error: "List not found", code: "NOT_FOUND" }),
        { status: 404, headers: { "content-type": "application/json" } }
      );
    }

    if (existing.userId !== session.user.id) {
      return new Response(
        JSON.stringify({ error: "Access denied", code: "FORBIDDEN" }),
        { status: 403, headers: { "content-type": "application/json" } }
      );
    }

    const body = await req.json();
    const { cards } = body;

    if (!Array.isArray(cards) || cards.length === 0) {
      return new Response(
        JSON.stringify({ error: "No cards provided", code: "INVALID_INPUT" }),
        { status: 400, headers: { "content-type": "application/json" } }
      );
    }

    const results = { added: 0, updated: 0, errors: [] as string[] };

    for (const cardInput of cards) {
      const {
        cardId,
        variantId,
        setId,
        finish = "Standard",
        quantity = 1,
        notes,
      } = cardInput;

      if (!cardId || typeof cardId !== "number") {
        results.errors.push(`Invalid cardId: ${cardId}`);
        continue;
      }

      // Verify card exists
      const card = await prisma.card.findUnique({
        where: { id: cardId },
        select: { id: true },
      });

      if (!card) {
        results.errors.push(`Card not found: ${cardId}`);
        continue;
      }

      try {
        // Try to upsert the card in the list
        const existingEntry = await prisma.cardListCard.findFirst({
          where: {
            listId: id,
            cardId,
            variantId: variantId ?? null,
            finish: finish as Finish,
          },
        });

        if (existingEntry) {
          await prisma.cardListCard.update({
            where: { id: existingEntry.id },
            data: {
              quantity: Math.min(99, existingEntry.quantity + quantity),
              notes: notes?.trim() || existingEntry.notes,
            },
          });
          results.updated++;
        } else {
          await prisma.cardListCard.create({
            data: {
              listId: id,
              cardId,
              variantId: variantId ?? null,
              setId: setId ?? null,
              finish: (finish as Finish) || "Standard",
              quantity: Math.min(99, quantity),
              notes: notes?.trim() || null,
            },
          });
          results.added++;
        }
      } catch (err) {
        results.errors.push(`Failed to add card ${cardId}: ${err}`);
      }
    }

    // Touch the list to update updatedAt
    await prisma.cardList.update({
      where: { id },
      data: { updatedAt: new Date() },
    });

    return new Response(JSON.stringify(results), {
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
