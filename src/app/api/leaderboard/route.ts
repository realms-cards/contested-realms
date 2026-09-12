import { GameFormat, TimeFrame } from "@prisma/client";
import { NextRequest } from "next/server";
import { getServerAuthSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// Mirrors LADDER.DECAY_GRACE_DAYS in server/modules/leaderboard/rating-model.ts:
// past this idle span a rating above 1200 starts decaying.
const INACTIVE_AFTER_MS = 14 * 24 * 60 * 60 * 1000;

// Rows are precomputed by the socket server's ladder replay (rating, rank,
// windowed W-L-D, opponent counts, provisional flag), so this route only reads.
// GET /api/leaderboard?format=constructed&timeFrame=all_time&limit=100
export async function GET(req: NextRequest) {
  const session = await getServerAuthSession();
  if (!session?.user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
    });
  }

  try {
    const { searchParams } = new URL(req.url);
    const format = (searchParams.get("format") as GameFormat) || "constructed";
    const timeFrame =
      (searchParams.get("timeFrame") as TimeFrame) || "all_time";
    const limit = Math.min(parseInt(searchParams.get("limit") || "100"), 500);
    const offset = parseInt(searchParams.get("offset") || "0");

    // Validate format and timeFrame
    if (!["constructed", "sealed", "draft"].includes(format)) {
      return new Response(JSON.stringify({ error: "Invalid format" }), {
        status: 400,
      });
    }
    if (!["all_time", "monthly", "weekly"].includes(timeFrame)) {
      return new Response(JSON.stringify({ error: "Invalid timeFrame" }), {
        status: 400,
      });
    }

    // Invite-link guests get a shadow User row but never a ranking; excluded
    // users are dropped by the replay but filtered here too for safety.
    const where = {
      format,
      timeFrame,
      player: { isGuest: false, ladderExcluded: false },
    };

    const [leaderboard, totalCount, currentUserEntry] = await Promise.all([
      prisma.leaderboardEntry.findMany({
        where,
        include: {
          player: {
            select: {
              id: true,
              name: true,
              image: true,
            },
          },
        },
        orderBy: [
          { provisional: "asc" },
          { rating: "desc" },
          { winRate: "desc" },
          { wins: "desc" },
        ],
        take: limit,
        skip: offset,
      }),
      prisma.leaderboardEntry.count({ where }),
      prisma.leaderboardEntry.findUnique({
        where: {
          playerId_format_timeFrame: {
            playerId: session.user.id,
            format,
            timeFrame,
          },
        },
      }),
    ]);

    const now = Date.now();
    const isInactive = (lastRatedAt: Date | null): boolean =>
      lastRatedAt !== null && now - lastRatedAt.getTime() > INACTIVE_AFTER_MS;

    const currentUserRank = currentUserEntry
      ? {
          // Stored rank is 0 only until the first replay after a deploy.
          rank: currentUserEntry.rank > 0 ? currentUserEntry.rank : null,
          rating: currentUserEntry.rating,
          wins: currentUserEntry.wins,
          losses: currentUserEntry.losses,
          draws: currentUserEntry.draws,
          winRate: currentUserEntry.winRate,
          uniqueOpponents: currentUserEntry.uniqueOpponents,
          ratedGames: currentUserEntry.ratedGames,
          provisional: currentUserEntry.provisional,
          lastRatedAt: currentUserEntry.lastRatedAt?.toISOString() ?? null,
          inactive: isInactive(currentUserEntry.lastRatedAt),
        }
      : null;

    const leaderboardData = leaderboard.map((entry, index) => ({
      rank: entry.rank > 0 ? entry.rank : offset + index + 1,
      playerId: entry.playerId,
      displayName: entry.displayName,
      playerImage: entry.player.image,
      wins: entry.wins,
      losses: entry.losses,
      draws: entry.draws,
      winRate: entry.winRate,
      rating: entry.rating,
      tournamentWins: entry.tournamentWins,
      uniqueOpponents: entry.uniqueOpponents,
      ratedGames: entry.ratedGames,
      provisional: entry.provisional,
      lastRatedAt: entry.lastRatedAt?.toISOString() ?? null,
      inactive: isInactive(entry.lastRatedAt),
      lastActive: entry.lastActive.toISOString(),
    }));

    return new Response(
      JSON.stringify({
        leaderboard: leaderboardData,
        currentUser: currentUserRank,
        pagination: {
          total: totalCount,
          limit,
          offset,
          hasMore: offset + limit < totalCount,
        },
        filters: {
          format,
          timeFrame,
        },
      }),
      {
        status: 200,
        headers: { "content-type": "application/json" },
      }
    );
  } catch (e: unknown) {
    const message =
      e instanceof Error
        ? e.message
        : typeof e === "string"
        ? e
        : "Unknown error";
    return new Response(JSON.stringify({ error: message }), { status: 500 });
  }
}
