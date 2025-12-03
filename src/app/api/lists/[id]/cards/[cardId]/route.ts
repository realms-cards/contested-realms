import { NextRequest } from "next/server";
import { getServerAuthSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string; cardId: string }> };

// PATCH /api/lists/[id]/cards/[cardId] - Update a card in a list
export async function PATCH(req: NextRequest, context: RouteContext) {
  const session = await getServerAuthSession();
  if (!session?.user) {
    return new Response(
      JSON.stringify({ error: "Unauthorized", code: "UNAUTHORIZED" }),
      { status: 401, headers: { "content-type": "application/json" } }
    );
  }

  const { id: listId, cardId } = await context.params;
  const cardIdNum = parseInt(cardId, 10);

  if (isNaN(cardIdNum)) {
    return new Response(
      JSON.stringify({ error: "Invalid card ID", code: "INVALID_INPUT" }),
      { status: 400, headers: { "content-type": "application/json" } }
    );
  }

  try {
    // Verify list ownership
    const list = await prisma.cardList.findUnique({
      where: { id: listId },
      select: { userId: true },
    });

    if (!list) {
      return new Response(
        JSON.stringify({ error: "List not found", code: "NOT_FOUND" }),
        { status: 404, headers: { "content-type": "application/json" } }
      );
    }

    if (list.userId !== session.user.id) {
      return new Response(
        JSON.stringify({ error: "Access denied", code: "FORBIDDEN" }),
        { status: 403, headers: { "content-type": "application/json" } }
      );
    }

    const body = await req.json();
    const { quantity, notes } = body;

    const updateData: { quantity?: number; notes?: string | null } = {};

    if (quantity !== undefined) {
      if (typeof quantity !== "number" || quantity < 0 || quantity > 99) {
        return new Response(
          JSON.stringify({
            error: "Quantity must be between 0 and 99",
            code: "INVALID_INPUT",
          }),
          { status: 400, headers: { "content-type": "application/json" } }
        );
      }
      updateData.quantity = quantity;
    }

    if (notes !== undefined) {
      updateData.notes = notes?.trim() || null;
    }

    // If quantity is 0, delete the card
    if (updateData.quantity === 0) {
      await prisma.cardListCard.delete({
        where: { id: cardIdNum },
      });

      return new Response(JSON.stringify({ deleted: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    const updated = await prisma.cardListCard.update({
      where: { id: cardIdNum },
      data: updateData,
    });

    // Touch the list
    await prisma.cardList.update({
      where: { id: listId },
      data: { updatedAt: new Date() },
    });

    return new Response(
      JSON.stringify({
        id: updated.id,
        quantity: updated.quantity,
        notes: updated.notes,
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

// DELETE /api/lists/[id]/cards/[cardId] - Remove a card from a list
export async function DELETE(req: NextRequest, context: RouteContext) {
  const session = await getServerAuthSession();
  if (!session?.user) {
    return new Response(
      JSON.stringify({ error: "Unauthorized", code: "UNAUTHORIZED" }),
      { status: 401, headers: { "content-type": "application/json" } }
    );
  }

  const { id: listId, cardId } = await context.params;
  const cardIdNum = parseInt(cardId, 10);

  if (isNaN(cardIdNum)) {
    return new Response(
      JSON.stringify({ error: "Invalid card ID", code: "INVALID_INPUT" }),
      { status: 400, headers: { "content-type": "application/json" } }
    );
  }

  try {
    // Verify list ownership
    const list = await prisma.cardList.findUnique({
      where: { id: listId },
      select: { userId: true },
    });

    if (!list) {
      return new Response(
        JSON.stringify({ error: "List not found", code: "NOT_FOUND" }),
        { status: 404, headers: { "content-type": "application/json" } }
      );
    }

    if (list.userId !== session.user.id) {
      return new Response(
        JSON.stringify({ error: "Access denied", code: "FORBIDDEN" }),
        { status: 403, headers: { "content-type": "application/json" } }
      );
    }

    await prisma.cardListCard.delete({
      where: { id: cardIdNum },
    });

    // Touch the list
    await prisma.cardList.update({
      where: { id: listId },
      data: { updatedAt: new Date() },
    });

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
