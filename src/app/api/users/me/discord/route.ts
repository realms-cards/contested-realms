/**
 * GET  /api/users/me/discord — Returns Discord link status + league memberships
 * PATCH /api/users/me/discord — Opts out of (or back into) a league: { slug, optedOut }
 * DELETE /api/users/me/discord — Unlinks Discord and removes league memberships
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerAuthSession } from "@/lib/auth";
import {
  getUserLeagues,
  removeAllMemberships,
  setLeagueOptOut,
} from "@/lib/leagues/membership";
import { prisma } from "@/lib/prisma";

export async function GET() {
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
      select: { discordId: true, discordUsername: true },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // League queries may fail if migration hasn't been applied yet
    let leagues: Awaited<ReturnType<typeof getUserLeagues>> = [];
    if (user.discordId) {
      try {
        leagues = await getUserLeagues(session.user.id);
      } catch (err) {
        console.error("[users/me/discord] League query error:", err);
      }
    }

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
        optedOut: l.optedOut,
      })),
    });
  } catch (err) {
    console.error("[users/me/discord] Error:", err);
    return NextResponse.json(
      { error: "Failed to load Discord status" },
      { status: 500 },
    );
  }
}

export async function PATCH(request: NextRequest) {
  const session = await getServerAuthSession();
  if (!session?.user?.id) {
    return NextResponse.json(
      { error: "Authentication required" },
      { status: 401 },
    );
  }

  const body = (await request.json().catch(() => null)) as {
    slug?: unknown;
    optedOut?: unknown;
  } | null;
  if (
    !body ||
    typeof body.slug !== "string" ||
    typeof body.optedOut !== "boolean"
  ) {
    return NextResponse.json(
      { error: "slug (string) and optedOut (boolean) required" },
      { status: 400 },
    );
  }

  try {
    const league = await prisma.league.findUnique({
      where: { slug: body.slug },
      select: { id: true },
    });
    if (!league) {
      return NextResponse.json({ error: "Unknown league" }, { status: 404 });
    }

    const optOuts = await setLeagueOptOut(
      session.user.id,
      body.slug,
      body.optedOut,
    );
    return NextResponse.json({ leagueOptOuts: optOuts });
  } catch (err) {
    console.error("[users/me/discord] Opt-out error:", err);
    return NextResponse.json(
      { error: "Failed to update league opt-out" },
      { status: 500 },
    );
  }
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
