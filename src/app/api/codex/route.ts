import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * GET /api/codex?card=Card Name
 * Returns codex entries that reference the given card name
 *
 * GET /api/codex?search=keyword
 * Returns codex entries matching the search term in title or content
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const cardName = searchParams.get("card");
    const search = searchParams.get("search");

    if (cardName) {
      // Find entries that reference this card in content (as [[Card Name]])
      // Use content search since array 'has' can be unreliable across DB providers
      const entries = await prisma.codexEntry.findMany({
        where: {
          content: {
            contains: `[[${cardName}]]`,
            mode: "insensitive",
          },
        },
        select: {
          id: true,
          title: true,
          content: true,
        },
        orderBy: { title: "asc" },
      });

      return Response.json({ entries, cardName });
    }

    if (search) {
      // Search by title or content
      const entries = await prisma.codexEntry.findMany({
        where: {
          OR: [
            { title: { contains: search, mode: "insensitive" } },
            { content: { contains: search, mode: "insensitive" } },
          ],
        },
        select: {
          id: true,
          title: true,
          content: true,
        },
        orderBy: { title: "asc" },
        take: 20,
      });

      return Response.json({ entries, search });
    }

    // Return all entry titles for browsing
    const entries = await prisma.codexEntry.findMany({
      select: {
        id: true,
        title: true,
      },
      orderBy: { title: "asc" },
    });

    return Response.json({ entries });
  } catch (e) {
    console.error("Codex API error:", e);
    return Response.json(
      { error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 }
    );
  }
}
