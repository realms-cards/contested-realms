/**
 * GET /api/leagues/reports?matchId=xxx
 * Returns league match report statuses for a given match.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerAuthSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const session = await getServerAuthSession();
  if (!session?.user?.id) {
    return NextResponse.json(
      { error: "Authentication required" },
      { status: 401 },
    );
  }

  const { searchParams } = new URL(request.url);
  const matchId = searchParams.get("matchId");

  if (!matchId) {
    return NextResponse.json(
      { error: "matchId parameter required" },
      { status: 400 },
    );
  }

  const reports = await prisma.leagueMatchReport.findMany({
    where: { matchId },
    include: { league: { select: { slug: true, name: true } } },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({
    reports: reports.map((r) => ({
      leagueSlug: r.league.slug,
      leagueName: r.league.name,
      reportStatus: r.reportStatus,
      reportedAt: r.reportedAt?.toISOString() || null,
    })),
  });
}
