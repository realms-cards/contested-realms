#!/usr/bin/env node
/**
 * Backfill script to sync displayNames from Redis to User.name in Postgres
 *
 * This script scans Redis for all player:{id} keys, retrieves the displayName,
 * and updates the corresponding User.name in the database if it's currently null.
 *
 * Usage:
 *   node scripts/backfill-usernames.js [--dry-run] [--force]
 *
 * Options:
 *   --dry-run  Show what would be updated without making changes
 *   --force    Update User.name even if it already has a value
 */

require("dotenv").config();

const { PrismaClient } = require("@prisma/client");
const Redis = require("ioredis");

const prisma = new PrismaClient();

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const force = args.includes("--force");

  console.log("=== Backfill Usernames from Redis ===");
  console.log(`Mode: ${dryRun ? "DRY RUN" : "LIVE"}`);
  console.log(`Force update: ${force ? "YES" : "NO (only null names)"}`);
  console.log("");

  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    console.error("Error: REDIS_URL environment variable not set");
    process.exit(1);
  }

  console.log(
    `Connecting to Redis: ${redisUrl.replace(
      /\/\/[^:]+:[^@]+@/,
      "//***:***@"
    )}...`
  );

  const redis = new Redis(redisUrl, {
    maxRetriesPerRequest: 3,
    retryStrategy: (times) => {
      if (times > 3) {
        return null; // Stop retrying
      }
      return Math.min(times * 200, 1000);
    },
  });

  // Handle connection errors
  redis.on("error", (err) => {
    console.error("Redis connection error:", err.message);
  });

  // Wait for connection
  try {
    await redis.ping();
    console.log("Redis connected successfully");
  } catch (err) {
    console.error("");
    console.error("Failed to connect to Redis:", err.message);
    console.error("");
    console.error(
      "Make sure you're running this script where Redis is accessible:"
    );
    console.error("  - On the production server (via SSH)");
    console.error(
      "  - Or with REDIS_URL pointing to an accessible Redis instance"
    );
    console.error("");
    console.error(
      "Example: REDIS_URL=redis://localhost:6379 node scripts/backfill-usernames.js --dry-run"
    );
    await redis.quit();
    process.exit(1);
  }

  try {
    // Scan for all player:* keys in Redis
    console.log("Scanning Redis for player:* keys...");
    const playerKeys = [];
    let cursor = "0";

    do {
      const [nextCursor, keys] = await redis.scan(
        cursor,
        "MATCH",
        "player:*",
        "COUNT",
        100
      );
      cursor = nextCursor;
      playerKeys.push(...keys);
    } while (cursor !== "0");

    console.log(`Found ${playerKeys.length} player keys in Redis`);

    if (playerKeys.length === 0) {
      console.log("No player keys found. Nothing to backfill.");
      return;
    }

    // Extract player IDs and fetch displayNames
    const updates = [];

    for (const key of playerKeys) {
      const playerId = key.replace("player:", "");
      const displayName = await redis.hget(key, "displayName");

      if (!displayName || displayName === "Player") {
        continue;
      }

      // Check if user exists and their current name
      const user = await prisma.user.findUnique({
        where: { id: playerId },
        select: { id: true, name: true },
      });

      if (!user) {
        console.log(`  Skip: ${playerId} - user not found in database`);
        continue;
      }

      if (user.name && !force) {
        console.log(
          `  Skip: ${playerId} - already has name "${user.name}" (use --force to override)`
        );
        continue;
      }

      updates.push({
        id: playerId,
        currentName: user.name,
        newName: displayName,
      });
    }

    console.log("");
    console.log(`Users to update: ${updates.length}`);
    console.log("");

    if (updates.length === 0) {
      console.log("No updates needed.");
      return;
    }

    // Show what will be updated
    for (const update of updates) {
      const current = update.currentName || "(null)";
      console.log(`  ${update.id}: "${current}" -> "${update.newName}"`);
    }

    if (dryRun) {
      console.log("");
      console.log("DRY RUN - no changes made. Run without --dry-run to apply.");
      return;
    }

    // Apply updates
    console.log("");
    console.log("Applying updates...");

    let successCount = 0;
    let errorCount = 0;

    for (const update of updates) {
      try {
        await prisma.user.update({
          where: { id: update.id },
          data: { name: update.newName },
        });
        successCount++;
      } catch (err) {
        console.error(`  Error updating ${update.id}:`, err.message);
        errorCount++;
      }
    }

    console.log("");
    console.log(`Done! Updated: ${successCount}, Errors: ${errorCount}`);
  } finally {
    await redis.quit();
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
