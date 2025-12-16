import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CostStatRow = {
  cost: number | null;
  plays: bigint;
  wins: bigint;
};

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const url = new URL(request.url);
    const format = url.searchParams.get("format") || "constructed";

    // Get play/win stats grouped by mana cost from HumanCardStats joined with CardSetMetadata
    const rows = await prisma.$queryRaw<CostStatRow[]>`
      SELECT m.cost, 
             SUM(h.plays)::bigint as plays, 
             SUM(h.wins)::bigint as wins
      FROM "HumanCardStats" h
      JOIN LATERAL (
        SELECT cost FROM "CardSetMetadata" 
        WHERE "cardId" = h."cardId" 
        LIMIT 1
      ) m ON true
      WHERE h.format = ${format}::"GameFormat"
        AND m.cost IS NOT NULL
      GROUP BY m.cost
      ORDER BY m.cost ASC
    `;

    const stats = rows.map((row) => {
      const plays = Number(row.plays);
      const wins = Number(row.wins);
      return {
        cost: row.cost ?? 0,
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
    console.error("Failed to load cost stats:", error);
    return NextResponse.json(
      { error: "Failed to load cost stats" },
      { status: 500 }
    );
  }
}
