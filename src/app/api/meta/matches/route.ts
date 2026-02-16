import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type MatchStatRow = {
  format: string;
  count: bigint;
  avgDuration: number | null;
};

export async function GET(): Promise<NextResponse> {
  try {
    // Try serving from pre-computed cache
    const snapshot = await prisma.metaStatsSnapshot.findUnique({
      where: { key: "matches" },
    });
    if (snapshot) {
      const cached = snapshot.data as Record<string, unknown>;
      return NextResponse.json({
        ...cached,
        generatedAt: snapshot.computedAt.toISOString(),
      });
    }

    // Fallback: compute on-the-fly
    const rows = await prisma.$queryRaw<MatchStatRow[]>`
      SELECT 
        format::text as format,
        COUNT(*)::bigint as count,
        AVG(duration)::float as "avgDuration"
      FROM "MatchResult"
      WHERE "isPrecon" = false
      GROUP BY format
      ORDER BY COUNT(*) DESC
    `;

    const stats = rows.map((row) => ({
      format: row.format,
      totalMatches: Number(row.count),
      avgDurationSec: row.avgDuration,
    }));

    return NextResponse.json({
      stats,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Failed to load match stats:", error);
    return NextResponse.json(
      { error: "Failed to load match stats" },
      { status: 500 }
    );
  }
}
