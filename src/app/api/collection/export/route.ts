import type { Prisma } from "@prisma/client";
import { NextRequest } from "next/server";
import { getServerAuthSession } from "@/lib/auth";
import type { ExportFormat } from "@/lib/collection/types";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// GET /api/collection/export
// Query params: format (csv|json|text), setId?
// Returns collection data in the requested format
export async function GET(req: NextRequest) {
  const session = await getServerAuthSession();
  if (!session?.user) {
    return new Response(
      JSON.stringify({ error: "Unauthorized", code: "UNAUTHORIZED" }),
      { status: 401, headers: { "content-type": "application/json" } }
    );
  }

  try {
    const { searchParams } = new URL(req.url);
    const format = (searchParams.get("format") || "csv") as ExportFormat;
    const setIdParam = searchParams.get("setId");
    const setId = setIdParam ? parseInt(setIdParam, 10) : undefined;

    const userId = session.user.id;

    // Build query
    const where: Prisma.CollectionCardWhereInput = { userId };
    if (setId) {
      where.setId = setId;
    }

    // Fetch collection with relations
    const collection = await prisma.collectionCard.findMany({
      where,
      include: {
        card: true,
        variant: true,
        set: true,
      },
      orderBy: { card: { name: "asc" } },
    });

    if (format === "json") {
      const data = collection.map((c) => ({
        quantity: c.quantity,
        cardName: c.card.name,
        set: c.set?.name || null,
        finish: c.finish,
        variant: c.variant?.slug || null,
        elements: c.card.elements,
        subTypes: c.card.subTypes,
      }));

      return new Response(JSON.stringify(data), {
        status: 200,
        headers: {
          "content-type": "application/json",
          "content-disposition": 'attachment; filename="collection.json"',
        },
      });
    }

    if (format === "text") {
      // Simple text format: "4 Apprentice Wizard"
      const lines = collection.map((c) => `${c.quantity} ${c.card.name}`);
      const text = lines.join("\n");

      return new Response(text, {
        status: 200,
        headers: {
          "content-type": "text/plain",
          "content-disposition": 'attachment; filename="collection.txt"',
        },
      });
    }

    // Default: CSV format
    const header = '"Quantity","Card Name","Set","Finish","Variant"';
    const rows = collection.map((c) => {
      const cardName = c.card.name.replace(/"/g, '""'); // Escape quotes
      const setName = (c.set?.name || "").replace(/"/g, '""');
      const variant = (c.variant?.slug || "").replace(/"/g, '""');
      return `"${c.quantity}","${cardName}","${setName}","${c.finish}","${variant}"`;
    });

    const csv = [header, ...rows].join("\n");

    return new Response(csv, {
      status: 200,
      headers: {
        "content-type": "text/csv",
        "content-disposition": 'attachment; filename="collection.csv"',
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
}
