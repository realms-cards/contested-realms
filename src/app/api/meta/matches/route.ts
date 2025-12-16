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
    // Get match counts and average duration by format
    // MatchResult has: duration (seconds), completedAt
    const rows = await prisma.$queryRaw<MatchStatRow[]>`
      SELECT 
        format::text as format,
        COUNT(*)::bigint as count,
        AVG(duration)::float as "avgDuration"
      FROM "MatchResult"
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
