/**
 * POST /api/users/me/discord/sync
 * Syncs league memberships for a user who already has Discord linked.
 * Uses multi-strategy guild detection:
 *   1. Account access_token (refresh if expired)
 *   2. Stored guild IDs from previous OAuth
 *   3. Bot token check for known guilds
 */

import { NextResponse } from "next/server";
import { getServerAuthSession } from "@/lib/auth";
import { fetchUserGuildIds } from "@/lib/leagues/discord-guilds";
import { syncLeagueMemberships } from "@/lib/leagues/membership";
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

    // Multi-strategy guild detection (token → stored → bot)
    const guildIds = await fetchUserGuildIds(session.user.id, user.discordId);

    if (guildIds.length === 0) {
      return NextResponse.json({
        synced: true,
        leagues: [],
        hint: "Could not detect Discord servers. Try re-linking your Discord account.",
      });
    }

    const leagues = await syncLeagueMemberships(
      session.user.id,
      guildIds,
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
