#!/usr/bin/env node

/**
 * Script to clear all tournament records from the database
 * This script deletes all tournament-related data in the correct order
 * to respect foreign key constraints.
 */

const { PrismaClient } = require('@prisma/client');
const path = require('path');

// Load environment variables
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const prisma = new PrismaClient({
  log: ['error', 'warn'],
});

async function clearTournamentRecords() {
  console.log('🗑️  Starting tournament records cleanup...');

  try {
    // Start a transaction to ensure atomicity
    await prisma.$transaction(async (tx) => {
      // Delete in order to respect foreign key constraints

      // 1. Delete tournament statistics first (they reference tournaments and users)
      console.log('📊 Deleting tournament statistics...');
      const statsDeleted = await tx.tournamentStatistics.deleteMany({});
      console.log(`   ✅ Deleted ${statsDeleted.count} tournament statistics`);

      // 2. Delete match results that are associated with tournaments
      console.log('🏆 Deleting tournament match results...');
      const matchResultsDeleted = await tx.matchResult.deleteMany({
        where: {
          tournamentId: {
            not: null,
          },
        },
      });
      console.log(`   ✅ Deleted ${matchResultsDeleted.count} tournament match results`);

      // 3. Delete draft participants (they reference draft sessions and users)
      console.log('🎯 Deleting draft participants...');
      const draftParticipantsDeleted = await tx.draftParticipant.deleteMany({});
      console.log(`   ✅ Deleted ${draftParticipantsDeleted.count} draft participants`);

      // 4. Delete draft sessions (they reference tournaments)
      console.log('📦 Deleting draft sessions...');
      const draftSessionsDeleted = await tx.draftSession.deleteMany({});
      console.log(`   ✅ Deleted ${draftSessionsDeleted.count} draft sessions`);

      // 5. Delete player standings (they reference tournaments and users)
      console.log('🏅 Deleting player standings...');
      const standingsDeleted = await tx.playerStanding.deleteMany({});
      console.log(`   ✅ Deleted ${standingsDeleted.count} player standings`);

      // 6. Delete tournament registrations (they reference tournaments and users)
      console.log('📝 Deleting tournament registrations...');
      const registrationsDeleted = await tx.tournamentRegistration.deleteMany({});
      console.log(`   ✅ Deleted ${registrationsDeleted.count} tournament registrations`);

      // 7. Delete tournament rounds (they reference tournaments)
      console.log('🔄 Deleting tournament rounds...');
      const roundsDeleted = await tx.tournamentRound.deleteMany({});
      console.log(`   ✅ Deleted ${roundsDeleted.count} tournament rounds`);

      // 8. Delete matches that are associated with tournaments
      console.log('⚔️  Deleting tournament matches...');
      const matchesDeleted = await tx.match.deleteMany({
        where: {
          tournamentId: {
            not: null,
          },
        },
      });
      console.log(`   ✅ Deleted ${matchesDeleted.count} tournament matches`);

      // 9. Finally, delete all tournaments
      console.log('🏆 Deleting tournaments...');
      const tournamentsDeleted = await tx.tournament.deleteMany({});
      console.log(`   ✅ Deleted ${tournamentsDeleted.count} tournaments`);

      console.log('🎉 Tournament records cleanup completed successfully!');
    });

  } catch (error) {
    console.error('❌ Error during tournament cleanup:', error);
    throw error;
  }
}

async function main() {
  try {
    await clearTournamentRecords();
  } catch (error) {
    console.error('❌ Script failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main();
}

module.exports = { clearTournamentRecords };
