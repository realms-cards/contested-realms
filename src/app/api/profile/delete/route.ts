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
    // 1. Delete user's tournament registrations
    await prisma.tournamentPlayer.deleteMany({ where: { playerId: userId } });

    // 2. Delete user's matches (as player1 or player2)
    await prisma.match.deleteMany({
      where: { OR: [{ player1Id: userId }, { player2Id: userId }] },
    });

    // 3. Delete user's online match sessions
    await prisma.onlineMatchSession.deleteMany({
      where: { playerIds: { has: userId } },
    });

    // 4. Delete user's decks and deck cards
    const userDecks = await prisma.deck.findMany({
      where: { userId },
      select: { id: true },
    });
    const deckIds = userDecks.map((d) => d.id);
    if (deckIds.length > 0) {
      await prisma.deckCard.deleteMany({ where: { deckId: { in: deckIds } } });
      await prisma.deck.deleteMany({ where: { id: { in: deckIds } } });
    }

    // 5. Delete user's cubes and cube cards
    const userCubes = await prisma.cube.findMany({
      where: { ownerId: userId },
      select: { id: true },
    });
    const cubeIds = userCubes.map((c) => c.id);
    if (cubeIds.length > 0) {
      await prisma.cubeCard.deleteMany({ where: { cubeId: { in: cubeIds } } });
      await prisma.cube.deleteMany({ where: { id: { in: cubeIds } } });
    }

    // 6. Delete friendships (both directions)
    await prisma.friendship.deleteMany({
      where: { OR: [{ userId }, { friendId: userId }] },
    });

    // 7. Delete user's passkey credentials
    await prisma.passKeyCredential.deleteMany({ where: { userId } });

    // 8. Delete user's sessions and accounts
    await prisma.session.deleteMany({ where: { userId } });
    await prisma.account.deleteMany({ where: { userId } });

    // 9. Finally, delete the user
    await prisma.user.delete({ where: { id: userId } });

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
