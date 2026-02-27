/**
 * GET /api/leagues
 * Returns all enabled leagues (public info for display).
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const leagues = await prisma.league.findMany({
      where: { enabled: true },
      select: {
        id: true,
        slug: true,
        name: true,
        badgeColor: true,
        iconUrl: true,
      },
      orderBy: { name: "asc" },
    });

    return NextResponse.json({ leagues });
  } catch (err) {
    console.error("[leagues] Error fetching leagues:", err);
    // Gracefully return empty if table doesn't exist yet
    return NextResponse.json({ leagues: [] });
  }
}
