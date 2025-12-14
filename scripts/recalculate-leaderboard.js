#!/usr/bin/env node
/**
 * Recalculate LeaderboardEntry stats from valid MatchResult records.
 *
 * This script:
 * 1. Clears all LeaderboardEntry records
 * 2. Replays all valid MatchResult records (2+ distinct human players)
 * 3. Recalculates wins/losses/draws/rating for each player
 * 4. Recalculates ranks
 *
 * Usage:
 *   node scripts/recalculate-leaderboard.js --dry-run    # Preview changes
 *   node scripts/recalculate-leaderboard.js --execute    # Apply changes
 */

require("dotenv").config();
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();
const CPU_PREFIX = "cpu:";
const DEFAULT_RATING = 1200;
const K_FACTOR = 32;

function calculateExpectedScore(ratingA, ratingB) {
  return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
}

function calculateNewRatings(winnerRating, loserRating, isDraw = false) {
  const expectedWinner = calculateExpectedScore(winnerRating, loserRating);
  const expectedLoser = calculateExpectedScore(loserRating, winnerRating);

  const actualWinner = isDraw ? 0.5 : 1;
  const actualLoser = isDraw ? 0.5 : 0;

  const newWinnerRating = Math.round(
    winnerRating + K_FACTOR * (actualWinner - expectedWinner)
  );
  const newLoserRating = Math.round(
    loserRating + K_FACTOR * (actualLoser - expectedLoser)
  );

  return { newWinnerRating, newLoserRating };
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const execute = args.includes("--execute");

  if (!dryRun && !execute) {
    console.log("Usage:");
    console.log(
      "  node scripts/recalculate-leaderboard.js --dry-run    # Preview changes"
    );
    console.log(
      "  node scripts/recalculate-leaderboard.js --execute    # Apply changes"
    );
    process.exit(1);
  }

  console.log(
    `\n${
      dryRun ? "[DRY RUN]" : "[EXECUTE]"
    } Recalculating leaderboard from MatchResult records...\n`
  );

  // Fetch all MatchResult records ordered by completion time
  const allResults = await prisma.matchResult.findMany({
    orderBy: { completedAt: "asc" },
  });

  console.log(`Found ${allResults.length} total MatchResult records.`);

  // Filter to valid matches (2+ distinct human players)
  const validResults = allResults.filter((mr) => {
    const players = Array.isArray(mr.players) ? mr.players : [];
    const playerIds = players
      .map((p) => (p && typeof p === "object" ? p.id : null))
      .filter(Boolean);

    const humanPlayerIds = playerIds.filter(
      (pid) => !pid.startsWith(CPU_PREFIX)
    );
    const uniqueHumans = new Set(humanPlayerIds);

    return uniqueHumans.size >= 2;
  });

  console.log(
    `Found ${validResults.length} valid matches (2+ distinct human players).`
  );
  console.log(
    `Skipping ${allResults.length - validResults.length} invalid matches.\n`
  );

  // Build player stats in memory
  // Key: `${playerId}:${format}:${timeFrame}`
  const playerStats = new Map();

  function getOrCreateStats(playerId, displayName, format, timeFrame) {
    const key = `${playerId}:${format}:${timeFrame}`;
    if (!playerStats.has(key)) {
      playerStats.set(key, {
        playerId,
        displayName,
        format,
        timeFrame,
        wins: 0,
        losses: 0,
        draws: 0,
        rating: DEFAULT_RATING,
        tournamentWins: 0,
        lastActive: new Date(0),
      });
    }
    return playerStats.get(key);
  }

  const timeFrames = ["all_time"]; // Only recalculate all_time for now

  // Process each valid match
  for (const mr of validResults) {
    const format = mr.format || "constructed";
    const isDraw = mr.isDraw === true;
    const winnerId = mr.winnerId;
    const loserId = mr.loserId;
    const completedAt = mr.completedAt ? new Date(mr.completedAt) : new Date();

    const players = Array.isArray(mr.players) ? mr.players : [];
    const playerInfos = players
      .filter((p) => p && typeof p === "object" && p.id)
      .map((p) => ({ id: p.id, displayName: p.displayName || p.id }));

    if (isDraw) {
      // Handle draw - both players get a draw
      for (const timeFrame of timeFrames) {
        for (const info of playerInfos) {
          if (info.id.startsWith(CPU_PREFIX)) continue;
          const stats = getOrCreateStats(
            info.id,
            info.displayName,
            format,
            timeFrame
          );
          stats.draws += 1;
          if (completedAt > stats.lastActive) {
            stats.lastActive = completedAt;
          }
        }

        // Update ratings for draws (if 2 players)
        const humanPlayers = playerInfos.filter(
          (p) => !p.id.startsWith(CPU_PREFIX)
        );
        if (humanPlayers.length === 2) {
          const stats1 = getOrCreateStats(
            humanPlayers[0].id,
            humanPlayers[0].displayName,
            format,
            timeFrame
          );
          const stats2 = getOrCreateStats(
            humanPlayers[1].id,
            humanPlayers[1].displayName,
            format,
            timeFrame
          );
          const { newWinnerRating, newLoserRating } = calculateNewRatings(
            stats1.rating,
            stats2.rating,
            true
          );
          stats1.rating = newWinnerRating;
          stats2.rating = newLoserRating;
        }
      }
    } else if (winnerId && loserId) {
      // Handle win/loss
      const winnerInfo = playerInfos.find((p) => p.id === winnerId);
      const loserInfo = playerInfos.find((p) => p.id === loserId);

      if (!winnerInfo || !loserInfo) continue;
      if (winnerId.startsWith(CPU_PREFIX) && loserId.startsWith(CPU_PREFIX))
        continue;

      for (const timeFrame of timeFrames) {
        // Only update human players
        if (!winnerId.startsWith(CPU_PREFIX)) {
          const winnerStats = getOrCreateStats(
            winnerId,
            winnerInfo.displayName,
            format,
            timeFrame
          );
          winnerStats.wins += 1;
          if (completedAt > winnerStats.lastActive) {
            winnerStats.lastActive = completedAt;
          }
        }

        if (!loserId.startsWith(CPU_PREFIX)) {
          const loserStats = getOrCreateStats(
            loserId,
            loserInfo.displayName,
            format,
            timeFrame
          );
          loserStats.losses += 1;
          if (completedAt > loserStats.lastActive) {
            loserStats.lastActive = completedAt;
          }
        }

        // Update ratings (only between human players)
        if (
          !winnerId.startsWith(CPU_PREFIX) &&
          !loserId.startsWith(CPU_PREFIX)
        ) {
          const winnerStats = getOrCreateStats(
            winnerId,
            winnerInfo.displayName,
            format,
            timeFrame
          );
          const loserStats = getOrCreateStats(
            loserId,
            loserInfo.displayName,
            format,
            timeFrame
          );
          const { newWinnerRating, newLoserRating } = calculateNewRatings(
            winnerStats.rating,
            loserStats.rating,
            false
          );
          winnerStats.rating = newWinnerRating;
          loserStats.rating = newLoserRating;
        }
      }
    }
  }

  // Calculate win rates
  for (const stats of playerStats.values()) {
    const total = stats.wins + stats.losses + stats.draws;
    stats.winRate = total > 0 ? stats.wins / total : 0;
  }

  console.log(
    `Calculated stats for ${playerStats.size} player/format/timeFrame combinations.\n`
  );

  // Show sample of recalculated stats
  console.log("Sample of recalculated stats:");
  let shown = 0;
  for (const stats of playerStats.values()) {
    if (shown >= 10) break;
    console.log(
      `  - ${stats.displayName}: ${stats.wins}W/${stats.losses}L/${stats.draws}D (rating: ${stats.rating})`
    );
    shown++;
  }
  if (playerStats.size > 10) {
    console.log(`  ... and ${playerStats.size - 10} more\n`);
  }

  if (dryRun) {
    console.log(
      "\n[DRY RUN] No changes made. Run with --execute to apply recalculation."
    );
    await prisma.$disconnect();
    return;
  }

  // Execute: Clear existing entries and insert new ones
  console.log("\nClearing existing LeaderboardEntry records...");
  const deleted = await prisma.leaderboardEntry.deleteMany({});
  console.log(`Deleted ${deleted.count} existing entries.`);

  console.log("\nInserting recalculated entries...");
  let inserted = 0;
  for (const stats of playerStats.values()) {
    try {
      // Verify user exists before inserting
      const userExists = await prisma.user.findUnique({
        where: { id: stats.playerId },
      });
      if (!userExists) {
        console.log(`  Skipping ${stats.playerId} - user not found`);
        continue;
      }

      await prisma.leaderboardEntry.create({
        data: {
          playerId: stats.playerId,
          displayName: stats.displayName,
          format: stats.format,
          timeFrame: stats.timeFrame,
          wins: stats.wins,
          losses: stats.losses,
          draws: stats.draws,
          winRate: stats.winRate,
          rating: stats.rating,
          tournamentWins: stats.tournamentWins,
          lastActive: stats.lastActive,
          rank: 0, // Will be recalculated
        },
      });
      inserted++;
    } catch (err) {
      console.log(`  Error inserting ${stats.playerId}: ${err.message}`);
    }
  }
  console.log(`Inserted ${inserted} entries.`);

  // Recalculate ranks
  console.log("\nRecalculating ranks...");
  const formats = ["constructed", "sealed", "draft"];
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

      if (entries.length > 0) {
        console.log(
          `  ${format}/${timeFrame}: ranked ${entries.length} entries`
        );
      }
    }
  }

  await prisma.$disconnect();
  console.log("\n✓ Leaderboard recalculation complete.");
}

main().catch((err) => {
  console.error("Error:", err);
  prisma.$disconnect();
  process.exit(1);
});
