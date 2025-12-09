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
