import { NextResponse } from "next/server";
import { parseMetaWindow } from "@/lib/meta/stats";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ElementStatRow = {
  elements: string | null;
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
        key: window === "all" ? `elements:${format}` : `elements:${format}:${window}`,
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
    const rows = await prisma.$queryRaw<ElementStatRow[]>`
      SELECT c.elements,
             SUM(h.plays)::bigint as plays,
             SUM(h.wins)::bigint as wins,
             SUM(h.losses)::bigint as losses
      FROM "HumanCardStats" h
      JOIN "Card" c ON c.id = h."cardId"
      WHERE h.format = ${format}::"GameFormat"
      GROUP BY c.elements
      ORDER BY SUM(h.plays) DESC
    `;

    const stats = rows.map((row) => {
      const plays = Number(row.plays);
      const wins = Number(row.wins);
      const losses = Number(row.losses);
      return {
        element: row.elements || "None",
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
    console.error("Failed to load element stats:", error);
    return NextResponse.json(
      { error: "Failed to load element stats" },
      { status: 500 }
    );
  }
}
