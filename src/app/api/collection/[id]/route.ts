import { NextRequest } from "next/server";
import { getServerAuthSession } from "@/lib/auth";
import { validateQuantity } from "@/lib/collection/validation";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// PATCH /api/collection/[id]
// Body: { quantity?: number, notes?: string }
// If quantity <= 0, deletes the entry
export async function PATCH(
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
    const entryId = parseInt(id, 10);

    if (isNaN(entryId)) {
      return new Response(
        JSON.stringify({ error: "Invalid ID", code: "INVALID_ID" }),
        { status: 400, headers: { "content-type": "application/json" } }
      );
    }

    const userId = session.user.id;

    // Find the entry and verify ownership
    const entry = await prisma.collectionCard.findUnique({
      where: { id: entryId },
    });

    if (!entry) {
      return new Response(
        JSON.stringify({ error: "Entry not found", code: "NOT_FOUND" }),
        { status: 404, headers: { "content-type": "application/json" } }
      );
    }

    if (entry.userId !== userId) {
      return new Response(
        JSON.stringify({ error: "Unauthorized", code: "UNAUTHORIZED" }),
        { status: 401, headers: { "content-type": "application/json" } }
      );
    }

    const body = await req.json();
    const newQuantity = body?.quantity;
    const newNotes = body?.notes;

    // Build update data
    const updateData: { quantity?: number; notes?: string | null } = {};

    // Handle quantity update
    if (typeof newQuantity === "number") {
      // If quantity is 0 or less, delete the entry
      if (newQuantity <= 0) {
        await prisma.collectionCard.delete({
          where: { id: entryId },
        });

        return new Response(JSON.stringify({ deleted: true, id: entryId }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }

      // Validate quantity
      const validation = validateQuantity(newQuantity);
      if (!validation.valid) {
        return new Response(
          JSON.stringify({ error: validation.error, code: "INVALID_QUANTITY" }),
          { status: 400, headers: { "content-type": "application/json" } }
        );
      }
      updateData.quantity = newQuantity;
    }

    // Handle notes update (can be string or null to clear)
    if (typeof newNotes === "string" || newNotes === null) {
      updateData.notes = newNotes || null;
    }

    // Must have at least one field to update
    if (Object.keys(updateData).length === 0) {
      return new Response(
        JSON.stringify({
          error: "No valid fields to update",
          code: "INVALID_REQUEST",
        }),
        { status: 400, headers: { "content-type": "application/json" } }
      );
    }

    // Update the entry
    const updated = await prisma.collectionCard.update({
      where: { id: entryId },
      data: updateData,
    });

    return new Response(
      JSON.stringify({
        id: updated.id,
        cardId: updated.cardId,
        quantity: updated.quantity,
        notes: updated.notes,
        updatedAt: updated.updatedAt.toISOString(),
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

// DELETE /api/collection/[id]
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
    const entryId = parseInt(id, 10);

    if (isNaN(entryId)) {
      return new Response(
        JSON.stringify({ error: "Invalid ID", code: "INVALID_ID" }),
        { status: 400, headers: { "content-type": "application/json" } }
      );
    }

    const userId = session.user.id;

    // Find the entry and verify ownership
    const entry = await prisma.collectionCard.findUnique({
      where: { id: entryId },
    });

    if (!entry) {
      return new Response(
        JSON.stringify({ error: "Entry not found", code: "NOT_FOUND" }),
        { status: 404, headers: { "content-type": "application/json" } }
      );
    }

    if (entry.userId !== userId) {
      return new Response(
        JSON.stringify({ error: "Unauthorized", code: "UNAUTHORIZED" }),
        { status: 401, headers: { "content-type": "application/json" } }
      );
    }

    // Delete the entry
    await prisma.collectionCard.delete({
      where: { id: entryId },
    });

    return new Response(JSON.stringify({ deleted: true, id: entryId }), {
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
