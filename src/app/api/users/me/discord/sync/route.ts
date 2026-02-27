/**
 * POST /api/users/me/discord/sync
 * Syncs league memberships for a user who already has Discord linked.
 * Uses stored guild IDs from the OAuth flow to check league membership.
 */

import { NextResponse } from "next/server";
import { getServerAuthSession } from "@/lib/auth";
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
      select: { discordId: true, discordGuildIds: true },
    });

    if (!user?.discordId) {
      return NextResponse.json(
        { error: "Discord not linked" },
        { status: 400 },
      );
    }

    // Parse stored guild IDs from OAuth flow
    let guildIds: string[] = [];
    if (user.discordGuildIds) {
      try {
        const parsed: unknown = JSON.parse(user.discordGuildIds);
        if (Array.isArray(parsed)) {
          guildIds = parsed.filter((id): id is string => typeof id === "string");
        }
      } catch {
        console.warn("[users/me/discord/sync] Failed to parse stored guild IDs");
      }
    }

    if (guildIds.length === 0) {
      return NextResponse.json({
        synced: true,
        leagues: [],
        hint: "No guild data stored. Re-link Discord to refresh server memberships.",
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
