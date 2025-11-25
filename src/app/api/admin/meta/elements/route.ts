import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ElementStatRow = {
  elements: string | null;
  plays: bigint;
  wins: bigint;
};

export async function GET(request: Request): Promise<NextResponse> {
  try {
    await requireAdminSession();

    const url = new URL(request.url);
    const format = url.searchParams.get("format") || "constructed";

    // Get play/win stats grouped by element from HumanCardStats joined with Card
    const rows = await prisma.$queryRaw<ElementStatRow[]>`
      SELECT c.elements, 
             SUM(h.plays)::bigint as plays, 
             SUM(h.wins)::bigint as wins
      FROM "HumanCardStats" h
      JOIN "Card" c ON c.id = h."cardId"
      WHERE h.format = ${format}::"GameFormat"
      GROUP BY c.elements
      ORDER BY SUM(h.plays) DESC
    `;

    const stats = rows.map((row) => {
      const plays = Number(row.plays);
      const wins = Number(row.wins);
      return {
        element: row.elements || "None",
        plays,
        wins,
        winRate: plays > 0 ? wins / plays : 0,
      };
    });

    return NextResponse.json({
      stats,
      format,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Failed to load element stats:", error);
    return NextResponse.json(
      { error: "Failed to load element stats" },
      { status: 500 }
    );
  }
}
