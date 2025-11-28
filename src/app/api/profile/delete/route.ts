import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * DELETE /api/profile/delete
 * Permanently deletes the authenticated user's account and all associated data.
 * This implements the "right to deletion" for GDPR compliance.
 */
export async function DELETE() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;

  try {
    // Delete in order respecting foreign key constraints
    await prisma.$transaction(async (tx) => {
      // 1. Delete user's tournament registrations and related standings/statistics
      await tx.tournamentRegistration.deleteMany({
        where: { playerId: userId },
      });
      await tx.playerStanding.deleteMany({ where: { playerId: userId } });
      await tx.tournamentStatistics.deleteMany({ where: { playerId: userId } });

      // 2. Delete leaderboard entries and draft participations
      await tx.leaderboardEntry.deleteMany({ where: { playerId: userId } });
      await tx.draftParticipant.deleteMany({ where: { playerId: userId } });

      // 3. Delete user's online match sessions
      await tx.onlineMatchSession.deleteMany({
        where: { playerIds: { has: userId } },
      });

      // 4. Delete user's decks and deck cards
      const userDecks = await tx.deck.findMany({
        where: { userId },
        select: { id: true },
      });
      const deckIds = userDecks.map((d) => d.id);
      if (deckIds.length > 0) {
        await tx.deckCard.deleteMany({ where: { deckId: { in: deckIds } } });
        await tx.deck.deleteMany({ where: { id: { in: deckIds } } });
      }

      // 5. Delete user's cubes and cube cards
      const userCubes = await tx.cube.findMany({
        where: { userId },
        select: { id: true },
      });
      const cubeIds = userCubes.map((c) => c.id);
      if (cubeIds.length > 0) {
        await tx.cubeCard.deleteMany({ where: { cubeId: { in: cubeIds } } });
        await tx.cube.deleteMany({ where: { id: { in: cubeIds } } });
      }

      // 6. Delete friendships (both directions)
      await tx.friendship.deleteMany({
        where: {
          OR: [{ ownerUserId: userId }, { targetUserId: userId }],
        },
      });

      // 7. Anonymize match results that reference this user
      await tx.matchResult.updateMany({
        where: { OR: [{ winnerId: userId }, { loserId: userId }] },
        data: { winnerId: null, loserId: null },
      });

      // 8. Delete user's passkey credentials, sessions, and accounts
      await tx.passkeyCredential.deleteMany({ where: { userId } });
      await tx.session.deleteMany({ where: { userId } });
      await tx.account.deleteMany({ where: { userId } });

      // 9. Finally, delete the user
      await tx.user.delete({ where: { id: userId } });
    });

    return NextResponse.json({ success: true, message: "Account deleted" });
  } catch (error) {
    console.error("Error deleting user account:", error);
    return NextResponse.json(
      {
        error: "Failed to delete account. Please try again or contact support.",
      },
      { status: 500 }
    );
  }
}
