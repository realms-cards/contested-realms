/**
 * GET  /api/users/me/discord — Returns Discord link status + league memberships
 * DELETE /api/users/me/discord — Unlinks Discord and removes league memberships
 */

import { NextResponse } from "next/server";
import { getServerAuthSession } from "@/lib/auth";
import { getUserLeagues, removeAllMemberships } from "@/lib/leagues/membership";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getServerAuthSession();
  if (!session?.user?.id) {
    return NextResponse.json(
      { error: "Authentication required" },
      { status: 401 },
    );
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { discordId: true, discordUsername: true },
  });

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const leagues = user.discordId ? await getUserLeagues(session.user.id) : [];

  return NextResponse.json({
    discordId: user.discordId,
    discordUsername: user.discordUsername,
    leagues: leagues.map((l) => ({
      id: l.id,
      slug: l.slug,
      name: l.name,
      badgeColor: l.badgeColor,
      iconUrl: l.iconUrl,
      joinedAt: l.joinedAt.toISOString(),
    })),
  });
}

export async function DELETE() {
  const session = await getServerAuthSession();
  if (!session?.user?.id) {
    return NextResponse.json(
      { error: "Authentication required" },
      { status: 401 },
    );
  }

  try {
    // Remove league memberships first
    await removeAllMemberships(session.user.id);

    // Clear Discord info
    await prisma.user.update({
      where: { id: session.user.id },
      data: { discordId: null, discordUsername: null },
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[users/me/discord] Unlink error:", err);
    return NextResponse.json(
      { error: "Failed to unlink Discord" },
      { status: 500 },
    );
  }
}
