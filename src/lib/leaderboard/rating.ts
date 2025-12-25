import { GameFormat } from "@prisma/client";
import { prisma } from "@/lib/prisma";

// ELO rating system constants
const K_FACTOR = 32; // Rating change factor
const DEFAULT_RATING = 1200;

// Anti-farming: diminishing returns for repeated opponents
// Games vs same opponent in 24h window get progressively less rating impact
const OPPONENT_REPEAT_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours
const OPPONENT_REPEAT_MULTIPLIERS = [1.0, 0.5, 0.25, 0]; // 1st, 2nd, 3rd, 4th+ game

/**
 * Calculate expected score for ELO rating
 */
function calculateExpectedScore(ratingA: number, ratingB: number): number {
  return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
}

/**
 * Count recent games between two players within the repeat window
 * Returns the number of games played (0 = first game today)
 */
async function countRecentGamesBetweenPlayers(
  player1Id: string,
  player2Id: string,
  format: GameFormat
): Promise<number> {
  const windowStart = new Date(Date.now() - OPPONENT_REPEAT_WINDOW_MS);

  const count = await prisma.matchResult.count({
    where: {
      format,
      completedAt: { gte: windowStart },
      OR: [
        { winnerId: player1Id, loserId: player2Id },
        { winnerId: player2Id, loserId: player1Id },
        // Also check draws via players JSON array
        {
          isDraw: true,
          players: {
            array_contains: [{ id: player1Id }, { id: player2Id }],
          },
        },
      ],
    },
  });

  return count;
}

/**
 * Get the rating multiplier based on how many games have been played vs this opponent
 */
function getOpponentRepeatMultiplier(gamesPlayedToday: number): number {
  if (gamesPlayedToday >= OPPONENT_REPEAT_MULTIPLIERS.length) {
    return OPPONENT_REPEAT_MULTIPLIERS[OPPONENT_REPEAT_MULTIPLIERS.length - 1];
  }
  return OPPONENT_REPEAT_MULTIPLIERS[gamesPlayedToday];
}

/**
 * Update ELO ratings after a match
 * @param multiplier - Anti-farming multiplier (0-1) to reduce rating changes for repeated opponents
 */
function calculateNewRatings(
  winnerRating: number,
  loserRating: number,
  isDraw: boolean = false,
  multiplier: number = 1.0
): { newWinnerRating: number; newLoserRating: number } {
  const expectedWinner = calculateExpectedScore(winnerRating, loserRating);
  const expectedLoser = calculateExpectedScore(loserRating, winnerRating);

  let actualWinner: number;
  let actualLoser: number;

  if (isDraw) {
    actualWinner = 0.5;
    actualLoser = 0.5;
  } else {
    actualWinner = 1;
    actualLoser = 0;
  }

  // Apply multiplier to reduce rating changes for repeated opponents
  const effectiveK = K_FACTOR * multiplier;
  const newWinnerRating = Math.round(
    winnerRating + effectiveK * (actualWinner - expectedWinner)
  );
  const newLoserRating = Math.round(
    loserRating + effectiveK * (actualLoser - expectedLoser)
  );

  return { newWinnerRating, newLoserRating };
}

/**
 * Get or create leaderboard entry for a player
 */
async function getOrCreateLeaderboardEntry(
  playerId: string,
  displayName: string,
  format: GameFormat,
  timeFrame: "all_time" | "monthly" | "weekly"
) {
  const existing = await prisma.leaderboardEntry.findUnique({
    where: {
      playerId_format_timeFrame: {
        playerId,
        format,
        timeFrame,
      },
    },
  });

  if (existing) {
    return existing;
  }

  return await prisma.leaderboardEntry.create({
    data: {
      playerId,
      displayName,
      format,
      timeFrame,
      rating: DEFAULT_RATING,
    },
  });
}

/**
 * Record match result and update leaderboard
 */
export async function recordMatchResult(config: {
  matchId: string;
  lobbyName?: string;
  winnerId?: string;
  loserId?: string;
  isDraw?: boolean;
  format: GameFormat;
  tournamentId?: string;
  players: Array<{ id: string; displayName: string }>;
  duration?: number;
}): Promise<void> {
  const {
    matchId,
    lobbyName,
    winnerId,
    loserId,
    isDraw = false,
    format,
    tournamentId,
    players,
    duration,
  } = config;

  // Record the match result
  await prisma.matchResult.create({
    data: {
      matchId,
      lobbyName,
      winnerId: isDraw ? null : winnerId,
      loserId: isDraw ? null : loserId,
      isDraw,
      format,
      tournamentId,
      players,
      duration,
    },
  });

  // Update leaderboard entries for all time frames
  const timeFrames: Array<"all_time" | "monthly" | "weekly"> = [
    "all_time",
    "monthly",
    "weekly",
  ];

  // Count recent games between these players for anti-farming
  let repeatMultiplier = 1.0;
  if (players.length === 2) {
    const recentGames = await countRecentGamesBetweenPlayers(
      players[0].id,
      players[1].id,
      format
    );
    repeatMultiplier = getOpponentRepeatMultiplier(recentGames);

    if (repeatMultiplier < 1.0) {
      console.log(
        `[Rating] Anti-farming: ${recentGames} recent games between players, ` +
          `multiplier: ${repeatMultiplier}`
      );
    }
  }

  for (const timeFrame of timeFrames) {
    if (isDraw && players.length === 2) {
      // Handle draw between two players
      const player1 = players[0];
      const player2 = players[1];

      const [entry1, entry2] = await Promise.all([
        getOrCreateLeaderboardEntry(
          player1.id,
          player1.displayName,
          format,
          timeFrame
        ),
        getOrCreateLeaderboardEntry(
          player2.id,
          player2.displayName,
          format,
          timeFrame
        ),
      ]);

      const { newWinnerRating, newLoserRating } = calculateNewRatings(
        entry1.rating,
        entry2.rating,
        true,
        repeatMultiplier
      );

      await Promise.all([
        prisma.leaderboardEntry.update({
          where: { id: entry1.id },
          data: {
            draws: { increment: 1 },
            rating: newWinnerRating,
            winRate:
              entry1.wins / (entry1.wins + entry1.losses + entry1.draws + 1),
            lastActive: new Date(),
          },
        }),
        prisma.leaderboardEntry.update({
          where: { id: entry2.id },
          data: {
            draws: { increment: 1 },
            rating: newLoserRating,
            winRate:
              entry2.wins / (entry2.wins + entry2.losses + entry2.draws + 1),
            lastActive: new Date(),
          },
        }),
      ]);
    } else if (winnerId && loserId) {
      // Handle win/loss
      const winner = players.find((p) => p.id === winnerId);
      const loser = players.find((p) => p.id === loserId);

      if (!winner || !loser) return;

      const [winnerEntry, loserEntry] = await Promise.all([
        getOrCreateLeaderboardEntry(
          winnerId,
          winner.displayName,
          format,
          timeFrame
        ),
        getOrCreateLeaderboardEntry(
          loserId,
          loser.displayName,
          format,
          timeFrame
        ),
      ]);

      const { newWinnerRating, newLoserRating } = calculateNewRatings(
        winnerEntry.rating,
        loserEntry.rating,
        false,
        repeatMultiplier
      );

      // Check if this was a tournament win
      const isTournamentWin = tournamentId
        ? await checkTournamentWin(tournamentId, winnerId)
        : false;

      await Promise.all([
        prisma.leaderboardEntry.update({
          where: { id: winnerEntry.id },
          data: {
            wins: { increment: 1 },
            rating: newWinnerRating,
            winRate:
              (winnerEntry.wins + 1) /
              (winnerEntry.wins + winnerEntry.losses + winnerEntry.draws + 1),
            tournamentWins: isTournamentWin ? { increment: 1 } : undefined,
            lastActive: new Date(),
          },
        }),
        prisma.leaderboardEntry.update({
          where: { id: loserEntry.id },
          data: {
            losses: { increment: 1 },
            rating: newLoserRating,
            winRate:
              loserEntry.wins /
              (loserEntry.wins + loserEntry.losses + loserEntry.draws + 1),
            lastActive: new Date(),
          },
        }),
      ]);
    }
  }

  // Recalculate ranks for this format
  await recalculateRanks(format);
}

/**
 * Check if a player won a tournament
 */
async function checkTournamentWin(
  tournamentId: string,
  playerId: string
): Promise<boolean> {
  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    include: {
      standings: {
        where: { playerId },
        take: 1,
      },
    },
  });

  if (
    !tournament ||
    tournament.status !== "completed" ||
    !tournament.standings[0]
  ) {
    return false;
  }

  // Check if this player is rank 1 in final standings
  const topStanding = await prisma.playerStanding.findFirst({
    where: { tournamentId },
    orderBy: [
      { matchPoints: "desc" },
      { gameWinPercentage: "desc" },
      { opponentMatchWinPercentage: "desc" },
    ],
  });

  return topStanding?.playerId === playerId;
}

/**
 * Recalculate ranks for all players in a format
 */
async function recalculateRanks(format: GameFormat): Promise<void> {
  const timeFrames: Array<"all_time" | "monthly" | "weekly"> = [
    "all_time",
    "monthly",
    "weekly",
  ];

  for (const timeFrame of timeFrames) {
    const entries = await prisma.leaderboardEntry.findMany({
      where: { format, timeFrame },
      orderBy: [{ rating: "desc" }, { winRate: "desc" }, { wins: "desc" }],
    });

    // Update ranks in batches for performance
    const updatePromises = entries.map((entry, index) =>
      prisma.leaderboardEntry.update({
        where: { id: entry.id },
        data: { rank: index + 1 },
      })
    );

    await Promise.all(updatePromises);
  }
}

/**
 * Reset weekly/monthly leaderboards (called by cron job)
 */
export async function resetTimeFrameLeaderboards(
  timeFrame: "weekly" | "monthly"
): Promise<void> {
  await prisma.leaderboardEntry.updateMany({
    where: { timeFrame },
    data: {
      wins: 0,
      losses: 0,
      draws: 0,
      winRate: 0,
      tournamentWins: 0,
      rank: 0,
    },
  });

  // Recalculate ranks for all formats
  const formats: GameFormat[] = ["constructed", "sealed", "draft"];
  for (const format of formats) {
    await recalculateRanks(format);
  }
}
