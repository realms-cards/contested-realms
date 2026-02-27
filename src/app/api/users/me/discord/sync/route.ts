/**
 * POST /api/users/me/discord/sync
 * Syncs league memberships for a user who already has Discord linked.
 * Uses the Discord bot token to check guild membership.
 */

import { NextResponse } from "next/server";
import { getServerAuthSession } from "@/lib/auth";
import { syncLeagueMembershipsViaBotCheck } from "@/lib/leagues/membership";
import { prisma } from "@/lib/prisma";

export async function POST() {
  const session = await getServerAuthSession();
  if (!session?.user?.id) {
    return NextResponse.json(
      { error: "Authentication required" },
      { status: 401 },
    );
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { discordId: true },
    });

    if (!user?.discordId) {
      return NextResponse.json(
        { error: "Discord not linked" },
        { status: 400 },
      );
    }

    const leagues = await syncLeagueMembershipsViaBotCheck(
      session.user.id,
      user.discordId,
    );

    return NextResponse.json({
      synced: true,
      leagues: leagues.map((l) => ({
        id: l.id,
        slug: l.slug,
        name: l.name,
        badgeColor: l.badgeColor,
        iconUrl: l.iconUrl,
        joinedAt: l.joinedAt.toISOString(),
      })),
    });
  } catch (err) {
    console.error("[users/me/discord/sync] Error:", err);
    return NextResponse.json(
      { error: "Failed to sync leagues" },
      { status: 500 },
    );
  }
}
