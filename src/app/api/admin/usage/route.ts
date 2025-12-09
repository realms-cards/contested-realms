import { NextResponse } from "next/server";
import { AdminAccessError, requireAdminSession } from "@/lib/admin/auth";
import type { UsageSnapshot } from "@/lib/admin/types";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function buildSnapshot(
  from: Date,
  period: UsageSnapshot["period"]
): Promise<UsageSnapshot> {
  const [
    newUsersCount,
    matchesCompleted,
    tournamentsStarted,
    draftsStarted,
    matchParticipants,
    tournamentParticipants,
    draftParticipants,
    deckActivity,
    collectionActivity,
    cardListActivity,
  ] = await Promise.all([
    // New users: users created after `from` (using emailVerified as proxy for creation date)
    prisma.user.count({
      where: {
        emailVerified: { gte: from },
      },
    }),
    prisma.matchResult.count({ where: { completedAt: { gte: from } } }),
    prisma.tournament.count({ where: { startedAt: { gte: from } } }),
    prisma.draftSession.count({ where: { createdAt: { gte: from } } }),
    // Active users from matches
    prisma.matchResult.findMany({
      where: { completedAt: { gte: from } },
      select: { winnerId: true, loserId: true },
    }),
    // Active users from tournament registrations
    prisma.tournamentRegistration.findMany({
      where: {
        tournament: {
          OR: [{ startedAt: { gte: from } }, { createdAt: { gte: from } }],
        },
      },
      select: { playerId: true },
    }),
    // Active users from draft participants
    prisma.draftParticipant.findMany({
      where: {
        draftSession: { createdAt: { gte: from } },
      },
      select: { playerId: true },
    }),
    // Active users from deck creation/updates
    prisma.deck.findMany({
      where: {
        OR: [{ createdAt: { gte: from } }, { updatedAt: { gte: from } }],
      },
      select: { userId: true },
    }),
    // Active users from collection updates (solo/collection users)
    prisma.collectionCard.findMany({
      where: {
        OR: [{ createdAt: { gte: from } }, { updatedAt: { gte: from } }],
      },
      select: { userId: true },
    }),
    // Active users from card list updates (wishlists, trade binders, etc.)
    prisma.cardList.findMany({
      where: {
        OR: [{ createdAt: { gte: from } }, { updatedAt: { gte: from } }],
      },
      select: { userId: true },
    }),
  ]);

  // Collect unique active user IDs from all activity sources
  const activeUserIds = new Set<string>();
  for (const match of matchParticipants) {
    if (match.winnerId) activeUserIds.add(match.winnerId);
    if (match.loserId) activeUserIds.add(match.loserId);
  }
  for (const reg of tournamentParticipants) {
    activeUserIds.add(reg.playerId);
  }
  for (const draft of draftParticipants) {
    activeUserIds.add(draft.playerId);
  }
  for (const deck of deckActivity) {
    activeUserIds.add(deck.userId);
  }
  for (const card of collectionActivity) {
    activeUserIds.add(card.userId);
  }
  for (const list of cardListActivity) {
    activeUserIds.add(list.userId);
  }

  return {
    period,
    newUsers: newUsersCount,
    matchesCompleted,
    tournamentsStarted,
    draftsStarted,
    activeUsers: activeUserIds.size,
    generatedAt: new Date().toISOString(),
  };
}

export async function GET(): Promise<NextResponse> {
  try {
    await requireAdminSession();
    const now = new Date();
    const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const last7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const [daySnapshot, weekSnapshot] = await Promise.all([
      buildSnapshot(last24h, "24h"),
      buildSnapshot(last7d, "7d"),
    ]);

    return NextResponse.json({
      snapshots: [daySnapshot, weekSnapshot],
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    if (error instanceof AdminAccessError) {
      return new NextResponse("Forbidden", { status: 403 });
    }
    console.error("[admin] usage endpoint failed:", error);
    return NextResponse.json(
      { error: "Failed to load usage snapshots" },
      { status: 500 }
    );
  }
}
