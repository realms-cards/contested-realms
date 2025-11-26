import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type TypeStatRow = {
  type: string;
  plays: bigint;
  wins: bigint;
};

export async function GET(request: Request): Promise<NextResponse> {
  try {
    await requireAdminSession();

    const url = new URL(request.url);
    const format = url.searchParams.get("format") || "constructed";

    // Get play/win stats grouped by card type from HumanCardStats joined with CardSetMetadata
    // We take the first matching set metadata for each card
    const rows = await prisma.$queryRaw<TypeStatRow[]>`
      SELECT m.type, 
             SUM(h.plays)::bigint as plays, 
             SUM(h.wins)::bigint as wins
      FROM "HumanCardStats" h
      JOIN LATERAL (
        SELECT type FROM "CardSetMetadata" 
        WHERE "cardId" = h."cardId" 
        LIMIT 1
      ) m ON true
      WHERE h.format = ${format}::"GameFormat"
      GROUP BY m.type
      ORDER BY SUM(h.plays) DESC
    `;

    const stats = rows.map((row) => {
      const plays = Number(row.plays);
      const wins = Number(row.wins);
      return {
        type: row.type,
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
    console.error("Failed to load type stats:", error);
    return NextResponse.json(
      { error: "Failed to load type stats" },
      { status: 500 }
    );
  }
}
