import { NextResponse } from "next/server";
import { parseMetaWindow } from "@/lib/meta/stats";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type TypeStatRow = {
  type: string;
  plays: bigint;
  wins: bigint;
  losses: bigint;
};

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const url = new URL(request.url);
    const format = url.searchParams.get("format") || "constructed";
    const window = parseMetaWindow(url.searchParams.get("window"));

    // Try serving from pre-computed cache
    const snapshot = await prisma.metaStatsSnapshot.findUnique({
      // All-time snapshots keep their historical key; windows are suffixed
      where: {
        key: window === "all" ? `types:${format}` : `types:${format}:${window}`,
      },
    });
    if (snapshot) {
      const cached = snapshot.data as Record<string, unknown>;
      return NextResponse.json({
        ...cached,
        generatedAt: snapshot.computedAt.toISOString(),
      });
    }

    // Windowed views are only served from snapshots (recomputed every 10 min
    // and on server start); until the first run there is nothing to show.
    if (window !== "all") {
      return NextResponse.json({
        stats: [],
        format,
        window,
        pending: true,
        generatedAt: new Date().toISOString(),
      });
    }

    // Fallback: compute on-the-fly
    const rows = await prisma.$queryRaw<TypeStatRow[]>`
      SELECT m.type, 
             SUM(h.plays)::bigint as plays, 
             SUM(h.wins)::bigint as wins,
             SUM(h.losses)::bigint as losses
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
      const losses = Number(row.losses);
      return {
        type: row.type,
        plays,
        wins,
        losses,
        // Draws are excluded from win rate, matching the card view
        winRate: wins + losses > 0 ? wins / (wins + losses) : 0,
      };
    });

    return NextResponse.json({
      stats,
      format,
      window,
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
