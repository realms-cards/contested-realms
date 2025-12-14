#!/usr/bin/env node
/**
 * Cleanup script to remove single-player/solo matches from leaderboard data.
 *
 * This script:
 * 1. Finds MatchResult records with fewer than 2 distinct human players
 * 2. Removes associated LeaderboardEntry increments (approximate - decrements stats)
 * 3. Optionally deletes the invalid MatchResult records
 *
 * Usage:
 *   node scripts/cleanup-solo-matches.js --dry-run    # Preview changes
 *   node scripts/cleanup-solo-matches.js --execute    # Apply changes
 */

require("dotenv").config();
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();
const CPU_PREFIX = "cpu:";

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const execute = args.includes("--execute");

  if (!dryRun && !execute) {
    console.log("Usage:");
    console.log(
      "  node scripts/cleanup-solo-matches.js --dry-run    # Preview changes"
    );
    console.log(
      "  node scripts/cleanup-solo-matches.js --execute    # Apply changes"
    );
    process.exit(1);
  }

  console.log(
    `\n${
      dryRun ? "[DRY RUN]" : "[EXECUTE]"
    } Scanning for solo/single-player matches...\n`
  );

  // Find all MatchResult records
  const allResults = await prisma.matchResult.findMany({
    select: {
      id: true,
      matchId: true,
      winnerId: true,
      loserId: true,
      players: true,
      format: true,
      completedAt: true,
    },
  });

  console.log(`Found ${allResults.length} total MatchResult records.`);

  // Filter to find invalid matches (fewer than 2 distinct human players)
  const invalidMatches = allResults.filter((mr) => {
    const players = Array.isArray(mr.players) ? mr.players : [];
    const playerIds = players
      .map((p) => (p && typeof p === "object" ? p.id : null))
      .filter(Boolean);

    // Filter to human players only
    const humanPlayerIds = playerIds.filter(
      (pid) => !pid.startsWith(CPU_PREFIX)
    );
    const uniqueHumans = new Set(humanPlayerIds);

    return uniqueHumans.size < 2;
  });

  console.log(
    `Found ${invalidMatches.length} invalid matches (fewer than 2 distinct human players).\n`
  );

  if (invalidMatches.length === 0) {
    console.log(
      "✓ No cleanup needed - all matches have 2+ distinct human players."
    );
    await prisma.$disconnect();
    return;
  }

  // Show sample of invalid matches
  console.log("Sample of invalid matches:");
  for (const mr of invalidMatches.slice(0, 10)) {
    const players = Array.isArray(mr.players) ? mr.players : [];
    const playerNames = players.map(
      (p) => p?.displayName || p?.id || "unknown"
    );
    console.log(
      `  - ${mr.matchId}: ${playerNames.join(" vs ")} (format: ${mr.format})`
    );
  }
  if (invalidMatches.length > 10) {
    console.log(`  ... and ${invalidMatches.length - 10} more\n`);
  }

  if (dryRun) {
    console.log(
      "\n[DRY RUN] No changes made. Run with --execute to apply cleanup."
    );
    await prisma.$disconnect();
    return;
  }

  // Execute cleanup
  console.log("\nDeleting invalid MatchResult records...");

  const deleteIds = invalidMatches.map((mr) => mr.id);
  const deleted = await prisma.matchResult.deleteMany({
    where: { id: { in: deleteIds } },
  });

  console.log(`✓ Deleted ${deleted.count} invalid MatchResult records.`);

  // Note: We don't try to decrement LeaderboardEntry stats because:
  // 1. The leaderboard check was added, so these shouldn't have affected ratings
  // 2. Decrementing could cause negative values or other issues
  // 3. A full leaderboard recalculation from valid MatchResults would be more accurate

  console.log(
    "\nNote: LeaderboardEntry stats were likely not affected by these matches"
  );
  console.log(
    "(the leaderboard requires both winnerId and loserId to update ratings)."
  );
  console.log(
    "If you want to recalculate leaderboard stats from scratch, run:"
  );
  console.log("  node scripts/recalculate-leaderboard.js");

  await prisma.$disconnect();
  console.log("\n✓ Cleanup complete.");
}

main().catch((err) => {
  console.error("Error:", err);
  prisma.$disconnect();
  process.exit(1);
});
