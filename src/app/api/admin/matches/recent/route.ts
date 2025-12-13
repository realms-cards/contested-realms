import { NextResponse } from "next/server";
import { AdminAccessError, requireAdminSession } from "@/lib/admin/auth";
import type { RecentMatchInfo } from "@/lib/admin/types";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/matches/recent
 * Returns list of recently completed matches from the database (admin only)
 */
export async function GET(request: Request): Promise<NextResponse> {
  try {
    await requireAdminSession();

    const url = new URL(request.url);
    const limit = Math.min(Number(url.searchParams.get("limit")) || 50, 200);

    // Fetch recent match results from the database
    const matchResults = await prisma.matchResult.findMany({
      orderBy: { completedAt: "desc" },
      take: limit * 2, // Fetch more to account for filtering
    });

    // Count actions per match to filter out those with no replay data
    const matchIds = matchResults.map((mr) => mr.matchId);
    const actionCounts = matchIds.length
      ? await prisma.onlineMatchAction.groupBy({
          by: ["matchId"],
          where: { matchId: { in: matchIds } },
          _count: { _all: true },
        })
      : [];
    const actionCountById = new Map(
      actionCounts.map((g) => [g.matchId, g._count._all])
    );

    // Filter to only matches with actions
    const matchesWithActions = matchResults.filter(
      (mr) => (actionCountById.get(mr.matchId) || 0) > 0
    );

    const recentMatches: RecentMatchInfo[] = matchesWithActions
      .slice(0, limit)
      .map((mr) => {
        const players = Array.isArray(mr.players) ? mr.players : [];
        const playerNames = players.map((p) =>
          p && typeof p === "object"
            ? (p as { displayName?: string; id?: string }).displayName ||
              (p as { id?: string }).id ||
              "Player"
            : "Player"
        );

        // Find winner name
        let winnerName: string | null = null;
        if (mr.winnerId) {
          const winnerPlayer = players.find(
            (p) =>
              p &&
              typeof p === "object" &&
              (p as { id?: string }).id === mr.winnerId
          );
          if (winnerPlayer && typeof winnerPlayer === "object") {
            winnerName =
              (winnerPlayer as { displayName?: string }).displayName ||
              (winnerPlayer as { id?: string }).id ||
              null;
          }
        }

        return {
          matchId: mr.matchId,
          playerNames,
          matchType: mr.format || "constructed",
          winnerId: mr.winnerId,
          winnerName,
          completedAt:
            mr.completedAt?.toISOString() || new Date().toISOString(),
          duration: mr.duration,
          tournamentId: mr.tournamentId,
        };
      });

    return NextResponse.json({
      matches: recentMatches,
      total: recentMatches.length,
    });
  } catch (error) {
    if (error instanceof AdminAccessError) {
      return new NextResponse("Forbidden", { status: 403 });
    }
    console.error("[admin] recent matches list failed:", error);
    return NextResponse.json(
      { error: "Failed to load recent matches" },
      { status: 500 }
    );
  }
}
