#!/usr/bin/env node
/**
 * Recalculate Leaderboard Ratings with Anti-Farming Rules
 *
 * This script replays all match history and recalculates ratings
 * with the diminishing returns multiplier for repeated opponents.
 *
 * Usage:
 *   node scripts/recalculate-ratings.js [--dry-run]
 *
 * Options:
 *   --dry-run  Show what would happen without making changes
 */

require("dotenv").config();
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

// ELO rating system constants (must match rating.ts)
const K_FACTOR = 32;
const DEFAULT_RATING = 1200;

// Anti-farming: diminishing returns for repeated opponents
const OPPONENT_REPEAT_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours
const OPPONENT_REPEAT_MULTIPLIERS = [1.0, 0.5, 0.25, 0]; // 1st, 2nd, 3rd, 4th+ game

const isDryRun = process.argv.includes("--dry-run");

/**
 * Calculate expected score for ELO rating
 */
function calculateExpectedScore(ratingA, ratingB) {
  return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
}

/**
 * Calculate new ratings after a match
 */
function calculateNewRatings(
  winnerRating,
  loserRating,
  isDraw,
  multiplier = 1.0
) {
  const expectedWinner = calculateExpectedScore(winnerRating, loserRating);
  const expectedLoser = calculateExpectedScore(loserRating, winnerRating);

  let actualWinner, actualLoser;
  if (isDraw) {
    actualWinner = 0.5;
    actualLoser = 0.5;
  } else {
    actualWinner = 1;
    actualLoser = 0;
  }

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
 * Get multiplier based on recent games between players
 */
function getOpponentRepeatMultiplier(gamesInWindow) {
  if (gamesInWindow >= OPPONENT_REPEAT_MULTIPLIERS.length) {
    return OPPONENT_REPEAT_MULTIPLIERS[OPPONENT_REPEAT_MULTIPLIERS.length - 1];
  }
  return OPPONENT_REPEAT_MULTIPLIERS[gamesInWindow];
}

/**
 * Create a key for tracking games between two players
 */
function getPairKey(player1Id, player2Id) {
  return [player1Id, player2Id].sort().join(":");
}

async function recalculateRatings() {
  console.log("=".repeat(60));
  console.log("LEADERBOARD RATING RECALCULATION");
  console.log(isDryRun ? "(DRY RUN - no changes will be made)" : "(LIVE RUN)");
  console.log("=".repeat(60));
  console.log();

  // Fetch all match results ordered by completion time
  console.log("Fetching match history...");
  const matches = await prisma.matchResult.findMany({
    orderBy: { completedAt: "asc" },
    select: {
      id: true,
      matchId: true,
      winnerId: true,
      loserId: true,
      isDraw: true,
      format: true,
      players: true,
      completedAt: true,
    },
  });
  console.log(`Found ${matches.length} matches to process\n`);

  if (matches.length === 0) {
    console.log("No matches to process. Exiting.");
    return;
  }

  // Track ratings per player per format per timeFrame
  // Structure: { [playerId]: { [format]: { [timeFrame]: { rating, wins, losses, draws } } } }
  const playerStats = {};

  // Track recent games between player pairs for anti-farming
  // Structure: { [pairKey]: [{ timestamp, format }] }
  const recentGames = {};

  // Track player display names
  const playerNames = {};

  // Stats for reporting
  let totalGamesProcessed = 0;
  let gamesWithReducedRating = 0;
  let gamesWithZeroRating = 0;

  const timeFrames = ["all_time", "monthly", "weekly"];
  const formats = ["constructed", "sealed", "draft"];

  // Initialize helper to get/create player stats
  function getPlayerStats(playerId, format, timeFrame) {
    if (!playerStats[playerId]) {
      playerStats[playerId] = {};
    }
    if (!playerStats[playerId][format]) {
      playerStats[playerId][format] = {};
    }
    if (!playerStats[playerId][format][timeFrame]) {
      playerStats[playerId][format][timeFrame] = {
        rating: DEFAULT_RATING,
        wins: 0,
        losses: 0,
        draws: 0,
      };
    }
    return playerStats[playerId][format][timeFrame];
  }

  // Count games in the 24h window before a given timestamp
  function countRecentGamesBetween(
    player1Id,
    player2Id,
    format,
    beforeTimestamp
  ) {
    const pairKey = getPairKey(player1Id, player2Id);
    const games = recentGames[pairKey] || [];
    const windowStart = new Date(
      beforeTimestamp.getTime() - OPPONENT_REPEAT_WINDOW_MS
    );

    return games.filter(
      (g) =>
        g.format === format &&
        g.timestamp >= windowStart &&
        g.timestamp < beforeTimestamp
    ).length;
  }

  // Record a game between players
  function recordGameBetween(player1Id, player2Id, format, timestamp) {
    const pairKey = getPairKey(player1Id, player2Id);
    if (!recentGames[pairKey]) {
      recentGames[pairKey] = [];
    }
    recentGames[pairKey].push({ timestamp, format });
  }

  console.log("Processing matches chronologically...\n");

  for (const match of matches) {
    totalGamesProcessed++;

    // Extract player IDs
    let player1Id, player2Id;
    let player1Name, player2Name;

    if (
      match.isDraw &&
      Array.isArray(match.players) &&
      match.players.length >= 2
    ) {
      player1Id = match.players[0]?.id;
      player2Id = match.players[1]?.id;
      player1Name = match.players[0]?.displayName || "Unknown";
      player2Name = match.players[1]?.displayName || "Unknown";
    } else if (match.winnerId && match.loserId) {
      player1Id = match.winnerId;
      player2Id = match.loserId;
      // Try to get names from players array
      const players = Array.isArray(match.players) ? match.players : [];
      const winner = players.find((p) => p?.id === match.winnerId);
      const loser = players.find((p) => p?.id === match.loserId);
      player1Name = winner?.displayName || "Unknown";
      player2Name = loser?.displayName || "Unknown";
    } else {
      // Skip invalid matches
      continue;
    }

    if (!player1Id || !player2Id) {
      continue;
    }

    // Store names for later
    playerNames[player1Id] = player1Name;
    playerNames[player2Id] = player2Name;

    const format = match.format;
    const completedAt = new Date(match.completedAt);

    // Count recent games for anti-farming multiplier
    const recentCount = countRecentGamesBetween(
      player1Id,
      player2Id,
      format,
      completedAt
    );
    const multiplier = getOpponentRepeatMultiplier(recentCount);

    if (multiplier < 1.0) {
      gamesWithReducedRating++;
      if (multiplier === 0) {
        gamesWithZeroRating++;
      }
    }

    // Record this game for future anti-farming checks
    recordGameBetween(player1Id, player2Id, format, completedAt);

    // Update stats for each timeFrame
    for (const timeFrame of timeFrames) {
      const stats1 = getPlayerStats(player1Id, format, timeFrame);
      const stats2 = getPlayerStats(player2Id, format, timeFrame);

      if (match.isDraw) {
        const { newWinnerRating, newLoserRating } = calculateNewRatings(
          stats1.rating,
          stats2.rating,
          true,
          multiplier
        );
        stats1.rating = newWinnerRating;
        stats2.rating = newLoserRating;
        stats1.draws++;
        stats2.draws++;
      } else {
        // player1 is winner, player2 is loser
        const { newWinnerRating, newLoserRating } = calculateNewRatings(
          stats1.rating,
          stats2.rating,
          false,
          multiplier
        );
        stats1.rating = newWinnerRating;
        stats2.rating = newLoserRating;
        stats1.wins++;
        stats2.losses++;
      }
    }

    // Progress indicator every 100 matches
    if (totalGamesProcessed % 100 === 0) {
      process.stdout.write(`Processed ${totalGamesProcessed} matches...\r`);
    }
  }

  console.log(`\nProcessed ${totalGamesProcessed} matches total`);
  console.log(`Games with reduced rating impact: ${gamesWithReducedRating}`);
  console.log(
    `Games with zero rating impact (4th+ vs same opponent): ${gamesWithZeroRating}`
  );
  console.log();

  // Now update the database
  console.log("Updating leaderboard entries...\n");

  let entriesUpdated = 0;
  let entriesCreated = 0;

  for (const playerId of Object.keys(playerStats)) {
    for (const format of formats) {
      if (!playerStats[playerId][format]) continue;

      for (const timeFrame of timeFrames) {
        const stats = playerStats[playerId][format][timeFrame];
        if (
          !stats ||
          (stats.wins === 0 && stats.losses === 0 && stats.draws === 0)
        ) {
          continue;
        }

        const totalGames = stats.wins + stats.losses + stats.draws;
        const winRate = totalGames > 0 ? stats.wins / totalGames : 0;
        const displayName = playerNames[playerId] || "Unknown";

        if (isDryRun) {
          console.log(
            `[DRY] ${displayName} (${format}/${timeFrame}): Rating=${
              stats.rating
            }, W=${stats.wins}, L=${stats.losses}, D=${stats.draws}, WR=${(
              winRate * 100
            ).toFixed(1)}%`
          );
        } else {
          // Upsert the leaderboard entry
          const existing = await prisma.leaderboardEntry.findUnique({
            where: {
              playerId_format_timeFrame: { playerId, format, timeFrame },
            },
          });

          if (existing) {
            await prisma.leaderboardEntry.update({
              where: { id: existing.id },
              data: {
                rating: stats.rating,
                wins: stats.wins,
                losses: stats.losses,
                draws: stats.draws,
                winRate,
                displayName,
              },
            });
            entriesUpdated++;
          } else {
            await prisma.leaderboardEntry.create({
              data: {
                playerId,
                displayName,
                format,
                timeFrame,
                rating: stats.rating,
                wins: stats.wins,
                losses: stats.losses,
                draws: stats.draws,
                winRate,
              },
            });
            entriesCreated++;
          }
        }
      }
    }
  }

  if (!isDryRun) {
    console.log(
      `Updated ${entriesUpdated} entries, created ${entriesCreated} entries`
    );

    // Recalculate ranks for each format/timeFrame
    console.log("\nRecalculating ranks...");
    for (const format of formats) {
      for (const timeFrame of timeFrames) {
        const entries = await prisma.leaderboardEntry.findMany({
          where: { format, timeFrame },
          orderBy: [{ rating: "desc" }, { winRate: "desc" }, { wins: "desc" }],
        });

        for (let i = 0; i < entries.length; i++) {
          await prisma.leaderboardEntry.update({
            where: { id: entries[i].id },
            data: { rank: i + 1 },
          });
        }
        console.log(
          `  ${format}/${timeFrame}: ${entries.length} entries ranked`
        );
      }
    }
  }

  console.log("\n" + "=".repeat(60));
  console.log(
    isDryRun
      ? "DRY RUN COMPLETE - no changes were made"
      : "RECALCULATION COMPLETE"
  );
  console.log("=".repeat(60));
}

// Run the script
recalculateRatings()
  .catch((e) => {
    console.error("Error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
