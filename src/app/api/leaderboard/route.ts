import { GameFormat, TimeFrame } from "@prisma/client";
import { NextRequest } from "next/server";
import { getServerAuthSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// Time windows for counting unique opponents
const TIME_WINDOWS: Record<TimeFrame, number | null> = {
  all_time: null, // no limit
  monthly: 30 * 24 * 60 * 60 * 1000,
  weekly: 7 * 24 * 60 * 60 * 1000,
};

/**
 * Count unique opponents for a player in a given format and time window
 */
async function countUniqueOpponents(
  playerId: string,
  format: GameFormat,
  timeFrame: TimeFrame
): Promise<number> {
  const windowMs = TIME_WINDOWS[timeFrame];
  const windowStart = windowMs ? new Date(Date.now() - windowMs) : undefined;

  // Get all matches where this player participated
  const matches = await prisma.matchResult.findMany({
    where: {
      format,
      ...(windowStart ? { completedAt: { gte: windowStart } } : {}),
      OR: [{ winnerId: playerId }, { loserId: playerId }],
    },
    select: {
      winnerId: true,
      loserId: true,
    },
  });

  // Collect unique opponent IDs
  const opponents = new Set<string>();
  for (const match of matches) {
    if (match.winnerId && match.winnerId !== playerId) {
      opponents.add(match.winnerId);
    }
    if (match.loserId && match.loserId !== playerId) {
      opponents.add(match.loserId);
    }
  }

  return opponents.size;
}

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

    const leaderboard = await prisma.leaderboardEntry.findMany({
      where: {
        format,
        timeFrame,
      },
      include: {
        player: {
          select: {
            id: true,
            name: true,
            image: true,
          },
        },
      },
      orderBy: [{ rating: "desc" }, { winRate: "desc" }, { wins: "desc" }],
      take: limit,
      skip: offset,
    });

    // Get total count for pagination
    const totalCount = await prisma.leaderboardEntry.count({
      where: {
        format,
        timeFrame,
      },
    });

    // Get current user's entry and rank
    const currentUserId = session.user.id;
    const currentUserEntry = await prisma.leaderboardEntry.findUnique({
      where: {
        playerId_format_timeFrame: {
          playerId: currentUserId,
          format,
          timeFrame,
        },
      },
    });

    let currentUserRank: {
      rank: number;
      rating: number;
      wins: number;
      losses: number;
      draws: number;
      winRate: number;
      uniqueOpponents: number;
    } | null = null;

    if (currentUserEntry) {
      // Count how many players are ranked above this user
      const playersAbove = await prisma.leaderboardEntry.count({
        where: {
          format,
          timeFrame,
          OR: [
            { rating: { gt: currentUserEntry.rating } },
            {
              rating: currentUserEntry.rating,
              winRate: { gt: currentUserEntry.winRate },
            },
            {
              rating: currentUserEntry.rating,
              winRate: currentUserEntry.winRate,
              wins: { gt: currentUserEntry.wins },
            },
          ],
        },
      });

      const userUniqueOpponents = await countUniqueOpponents(
        currentUserId,
        format,
        timeFrame
      );

      currentUserRank = {
        rank: playersAbove + 1,
        rating: currentUserEntry.rating,
        wins: currentUserEntry.wins,
        losses: currentUserEntry.losses,
        draws: currentUserEntry.draws,
        winRate: currentUserEntry.winRate,
        uniqueOpponents: userUniqueOpponents,
      };
    }

    // Fetch unique opponent counts for all players in parallel
    const uniqueOpponentCounts = await Promise.all(
      leaderboard.map((entry) =>
        countUniqueOpponents(entry.playerId, format, timeFrame)
      )
    );

    const leaderboardData = leaderboard.map((entry, index) => ({
      rank: offset + index + 1,
      playerId: entry.playerId,
      displayName: entry.displayName,
      playerImage: entry.player.image,
      wins: entry.wins,
      losses: entry.losses,
      draws: entry.draws,
      winRate: entry.winRate,
      rating: entry.rating,
      tournamentWins: entry.tournamentWins,
      uniqueOpponents: uniqueOpponentCounts[index],
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
