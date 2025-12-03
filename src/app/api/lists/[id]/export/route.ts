import { NextRequest } from "next/server";
import { getServerAuthSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

// GET /api/lists/[id]/export - Export a list in various formats
// Public lists can be exported without authentication
export async function GET(req: NextRequest, context: RouteContext) {
  const session = await getServerAuthSession();
  const { id } = await context.params;
  const { searchParams } = new URL(req.url);
  const format = searchParams.get("format") || "text";

  try {
    const list = await prisma.cardList.findUnique({
      where: { id },
      include: {
        cards: {
          orderBy: { card: { name: "asc" } },
          include: {
            card: true,
            variant: { include: { set: true } },
            set: true,
          },
        },
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

    if (format === "json") {
      const jsonExport = {
        name: list.name,
        description: list.description,
        exportedAt: new Date().toISOString(),
        cards: list.cards.map((c: (typeof list.cards)[number]) => ({
          name: c.card.name,
          quantity: c.quantity,
          finish: c.finish,
          set: c.set?.name || c.variant?.set?.name || null,
          notes: c.notes,
        })),
      };

      return new Response(JSON.stringify(jsonExport, null, 2), {
        status: 200,
        headers: {
          "content-type": "application/json",
          "content-disposition": `attachment; filename="${list.name.replace(
            /[^a-z0-9]/gi,
            "_"
          )}.json"`,
        },
      });
    }

    if (format === "csv") {
      const csvLines = [
        "Quantity,Name,Set,Finish,Notes",
        ...list.cards.map((c: (typeof list.cards)[number]) => {
          const setName = c.set?.name || c.variant?.set?.name || "";
          const notes = c.notes?.replace(/"/g, '""') || "";
          return `${c.quantity},"${c.card.name}","${setName}",${c.finish},"${notes}"`;
        }),
      ];

      return new Response(csvLines.join("\n"), {
        status: 200,
        headers: {
          "content-type": "text/csv",
          "content-disposition": `attachment; filename="${list.name.replace(
            /[^a-z0-9]/gi,
            "_"
          )}.csv"`,
        },
      });
    }

    // Default: text format (simple list)
    const textLines = [
      `# ${list.name}`,
      list.description ? `# ${list.description}` : null,
      "",
      ...list.cards.map(
        (c: (typeof list.cards)[number]) => `${c.quantity}x ${c.card.name}`
      ),
    ].filter((l): l is string => l !== null);

    return new Response(textLines.join("\n"), {
      status: 200,
      headers: {
        "content-type": "text/plain",
        "content-disposition": `attachment; filename="${list.name.replace(
          /[^a-z0-9]/gi,
          "_"
        )}.txt"`,
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
