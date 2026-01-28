#!/usr/bin/env node
/**
 * Merge duplicate user accounts.
 * 
 * Usage:
 *   node scripts/merge-duplicate-users.js --dry-run --keep "b_2_3_n" --merge "b23n"
 *   node scripts/merge-duplicate-users.js --keep "b_2_3_n" --merge "b23n"
 * 
 * This will:
 * 1. Find both users by name (or ID if you pass --by-id)
 * 2. Transfer all data from "merge" user to "keep" user
 * 3. Update "keep" user with Discord credentials from "merge" user (if applicable)
 * 4. Delete the "merge" user
 */

require("dotenv").config();
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function findUser(identifier, byId = false) {
  if (byId) {
    return prisma.user.findUnique({ where: { id: identifier } });
  }
  // Try by name first, then by shortId
  let user = await prisma.user.findFirst({ where: { name: identifier } });
  if (!user) {
    user = await prisma.user.findFirst({ where: { shortId: identifier } });
  }
  return user;
}

async function getUserStats(userId) {
  const [
    decks,
    collections,
    matchWins,
    matchLosses,
    cubes,
    passkeys,
    friendshipsOwned,
    friendshipsTargeted,
    leaderboard,
    tournamentRegs,
  ] = await Promise.all([
    prisma.deck.count({ where: { userId } }),
    prisma.collectionCard.count({ where: { userId } }),
    prisma.matchResult.count({ where: { winnerId: userId } }),
    prisma.matchResult.count({ where: { loserId: userId } }),
    prisma.cube.count({ where: { userId } }),
    prisma.passkeyCredential.count({ where: { userId } }),
    prisma.friendship.count({ where: { ownerUserId: userId } }),
    prisma.friendship.count({ where: { targetUserId: userId } }),
    prisma.leaderboardEntry.count({ where: { playerId: userId } }),
    prisma.tournamentRegistration.count({ where: { playerId: userId } }),
  ]);

  return {
    decks,
    collections,
    matchWins,
    matchLosses,
    cubes,
    passkeys,
    friendshipsOwned,
    friendshipsTargeted,
    leaderboard,
    tournamentRegs,
  };
}

async function mergeUsers(keepUser, mergeUser, dryRun = true) {
  const keepId = keepUser.id;
  const mergeId = mergeUser.id;

  console.log("\n--- Merge Plan ---");
  console.log(`Keep:  ${keepUser.name} (${keepId})`);
  console.log(`       Email: ${keepUser.email || "(none)"}`);
  console.log(`       Discord: ${keepUser.discordId || "(none)"} / ${keepUser.discordUsername || "(none)"}`);
  console.log(`Merge: ${mergeUser.name} (${mergeId})`);
  console.log(`       Email: ${mergeUser.email || "(none)"}`);
  console.log(`       Discord: ${mergeUser.discordId || "(none)"} / ${mergeUser.discordUsername || "(none)"}`);

  const keepStats = await getUserStats(keepId);
  const mergeStats = await getUserStats(mergeId);

  console.log("\n--- Data to Transfer ---");
  console.log(`Decks:           ${mergeStats.decks} → (keep has ${keepStats.decks})`);
  console.log(`Collection:      ${mergeStats.collections} cards → (keep has ${keepStats.collections})`);
  console.log(`Match Wins:      ${mergeStats.matchWins} → (keep has ${keepStats.matchWins})`);
  console.log(`Match Losses:    ${mergeStats.matchLosses} → (keep has ${keepStats.matchLosses})`);
  console.log(`Cubes:           ${mergeStats.cubes} → (keep has ${keepStats.cubes})`);
  console.log(`Passkeys:        ${mergeStats.passkeys} → (keep has ${keepStats.passkeys})`);
  console.log(`Friends (owned): ${mergeStats.friendshipsOwned} → (keep has ${keepStats.friendshipsOwned})`);
  console.log(`Friends (target):${mergeStats.friendshipsTargeted} → (keep has ${keepStats.friendshipsTargeted})`);
  console.log(`Leaderboard:     ${mergeStats.leaderboard} → (keep has ${keepStats.leaderboard})`);
  console.log(`Tournament Regs: ${mergeStats.tournamentRegs} → (keep has ${keepStats.tournamentRegs})`);

  if (dryRun) {
    console.log("\n[DRY RUN] No changes made. Remove --dry-run to execute.\n");
    return;
  }

  console.log("\n--- Executing Merge ---");

  await prisma.$transaction(async (tx) => {
    // Transfer decks
    if (mergeStats.decks > 0) {
      const result = await tx.deck.updateMany({
        where: { userId: mergeId },
        data: { userId: keepId },
      });
      console.log(`Transferred ${result.count} decks`);
    }

    // Transfer collection cards
    if (mergeStats.collections > 0) {
      const result = await tx.collectionCard.updateMany({
        where: { userId: mergeId },
        data: { userId: keepId },
      });
      console.log(`Transferred ${result.count} collection cards`);
    }

    // Transfer cubes
    if (mergeStats.cubes > 0) {
      const result = await tx.cube.updateMany({
        where: { userId: mergeId },
        data: { userId: keepId },
      });
      console.log(`Transferred ${result.count} cubes`);
    }

    // Transfer match results (wins)
    if (mergeStats.matchWins > 0) {
      const result = await tx.matchResult.updateMany({
        where: { winnerId: mergeId },
        data: { winnerId: keepId },
      });
      console.log(`Transferred ${result.count} match wins`);
    }

    // Transfer match results (losses)
    if (mergeStats.matchLosses > 0) {
      const result = await tx.matchResult.updateMany({
        where: { loserId: mergeId },
        data: { loserId: keepId },
      });
      console.log(`Transferred ${result.count} match losses`);
    }

    // Transfer passkeys
    if (mergeStats.passkeys > 0) {
      const result = await tx.passkeyCredential.updateMany({
        where: { userId: mergeId },
        data: { userId: keepId },
      });
      console.log(`Transferred ${result.count} passkeys`);
    }

    // Transfer friendships (owned) - skip duplicates
    if (mergeStats.friendshipsOwned > 0) {
      const existingFriends = await tx.friendship.findMany({
        where: { ownerUserId: keepId },
        select: { targetUserId: true },
      });
      const existingTargets = new Set(existingFriends.map(f => f.targetUserId));
      
      const toTransfer = await tx.friendship.findMany({
        where: { ownerUserId: mergeId },
      });
      
      for (const f of toTransfer) {
        if (!existingTargets.has(f.targetUserId) && f.targetUserId !== keepId) {
          await tx.friendship.update({
            where: { id: f.id },
            data: { ownerUserId: keepId },
          });
        } else {
          await tx.friendship.delete({ where: { id: f.id } });
        }
      }
      console.log(`Processed ${toTransfer.length} owned friendships`);
    }

    // Transfer friendships (targeted)
    if (mergeStats.friendshipsTargeted > 0) {
      const existingIncoming = await tx.friendship.findMany({
        where: { targetUserId: keepId },
        select: { ownerUserId: true },
      });
      const existingOwners = new Set(existingIncoming.map(f => f.ownerUserId));
      
      const toTransfer = await tx.friendship.findMany({
        where: { targetUserId: mergeId },
      });
      
      for (const f of toTransfer) {
        if (!existingOwners.has(f.ownerUserId) && f.ownerUserId !== keepId) {
          await tx.friendship.update({
            where: { id: f.id },
            data: { targetUserId: keepId },
          });
        } else {
          await tx.friendship.delete({ where: { id: f.id } });
        }
      }
      console.log(`Processed ${toTransfer.length} targeted friendships`);
    }

    // Transfer leaderboard entries - merge or transfer
    if (mergeStats.leaderboard > 0) {
      // Just delete merge user's entries (they'll rebuild from match history)
      await tx.leaderboardEntry.deleteMany({
        where: { playerId: mergeId },
      });
      console.log(`Deleted ${mergeStats.leaderboard} duplicate leaderboard entries`);
    }

    // Transfer tournament registrations
    if (mergeStats.tournamentRegs > 0) {
      // Check for conflicts
      const keepRegs = await tx.tournamentRegistration.findMany({
        where: { playerId: keepId },
        select: { tournamentId: true },
      });
      const keepTourneys = new Set(keepRegs.map(r => r.tournamentId));
      
      const mergeRegs = await tx.tournamentRegistration.findMany({
        where: { playerId: mergeId },
      });
      
      for (const reg of mergeRegs) {
        if (!keepTourneys.has(reg.tournamentId)) {
          await tx.tournamentRegistration.update({
            where: { id: reg.id },
            data: { playerId: keepId },
          });
        } else {
          // Conflict - delete merge user's registration
          await tx.tournamentRegistration.delete({ where: { id: reg.id } });
        }
      }
      console.log(`Processed ${mergeRegs.length} tournament registrations`);
    }

    // Transfer player standings
    await tx.playerStanding.updateMany({
      where: { playerId: mergeId },
      data: { playerId: keepId },
    }).catch(() => {}); // Ignore conflicts

    // Transfer draft participations
    await tx.draftParticipant.updateMany({
      where: { playerId: mergeId },
      data: { playerId: keepId },
    }).catch(() => {});

    // Transfer tournament statistics
    await tx.tournamentStatistics.deleteMany({
      where: { playerId: mergeId },
    });

    // Transfer card lists
    await tx.cardList.updateMany({
      where: { userId: mergeId },
      data: { userId: keepId },
    });

    // Transfer custom playmats
    await tx.customPlaymat.updateMany({
      where: { userId: mergeId },
      data: { userId: keepId },
    });

    // Transfer custom cardbacks
    await tx.customCardback.updateMany({
      where: { userId: mergeId },
      data: { userId: keepId },
    });

    // Update keep user with Discord credentials if merge user has them
    if (mergeUser.discordId && !keepUser.discordId) {
      await tx.user.update({
        where: { id: keepId },
        data: {
          discordId: mergeUser.discordId,
          discordUsername: mergeUser.discordUsername,
        },
      });
      console.log(`Transferred Discord credentials to keep user`);
    }

    // Delete accounts linked to merge user
    await tx.account.deleteMany({
      where: { userId: mergeId },
    });

    // Delete sessions for merge user
    await tx.session.deleteMany({
      where: { userId: mergeId },
    });

    // Delete the merge user
    await tx.user.delete({
      where: { id: mergeId },
    });
    console.log(`Deleted merge user ${mergeUser.name}`);
  });

  console.log("\n✅ Merge complete!\n");
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const byId = args.includes("--by-id");
  
  const keepIdx = args.indexOf("--keep");
  const mergeIdx = args.indexOf("--merge");
  
  if (keepIdx === -1 || mergeIdx === -1) {
    console.log("Usage: node scripts/merge-duplicate-users.js --dry-run --keep <name|id> --merge <name|id>");
    console.log("       node scripts/merge-duplicate-users.js --keep <name|id> --merge <name|id>");
    console.log("\nOptions:");
    console.log("  --dry-run   Show what would be done without making changes");
    console.log("  --by-id     Treat identifiers as user IDs instead of names");
    console.log("  --keep      The user to keep (primary account)");
    console.log("  --merge     The user to merge into keep (will be deleted)");
    process.exit(1);
  }
  
  const keepIdentifier = args[keepIdx + 1];
  const mergeIdentifier = args[mergeIdx + 1];
  
  if (!keepIdentifier || !mergeIdentifier) {
    console.error("Error: Must provide identifiers for both --keep and --merge");
    process.exit(1);
  }
  
  console.log("Looking up users...");
  
  const keepUser = await findUser(keepIdentifier, byId);
  const mergeUser = await findUser(mergeIdentifier, byId);
  
  if (!keepUser) {
    console.error(`Error: Could not find keep user: ${keepIdentifier}`);
    process.exit(1);
  }
  
  if (!mergeUser) {
    console.error(`Error: Could not find merge user: ${mergeIdentifier}`);
    process.exit(1);
  }
  
  if (keepUser.id === mergeUser.id) {
    console.error("Error: Keep and merge users are the same!");
    process.exit(1);
  }
  
  await mergeUsers(keepUser, mergeUser, dryRun);
}

main()
  .catch((e) => {
    console.error("Error:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
