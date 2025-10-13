import { NextResponse } from "next/server";
import { AdminAccessError, requireAdminSession } from "@/lib/admin/auth";
import type { UsageSnapshot } from "@/lib/admin/types";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function buildSnapshot(from: Date, period: UsageSnapshot["period"]): Promise<UsageSnapshot> {
  const [newUserGroups, matchesCompleted, tournamentsStarted, draftsStarted, activeUserGroups] =
    await Promise.all([
      prisma.session.groupBy({
        by: ["userId"],
        _min: { expires: true },
        having: {
          expires: {
            _min: { gte: from },
          },
        },
      }),
      prisma.matchResult.count({ where: { completedAt: { gte: from } } }),
      prisma.tournament.count({ where: { startedAt: { gte: from } } }),
      prisma.draftSession.count({ where: { createdAt: { gte: from } } }),
      prisma.session.groupBy({
        by: ["userId"],
        where: { expires: { gte: from } },
      }),
    ]);

  const newUsers = newUserGroups.length;
  const activeUsers = activeUserGroups.length;

  return {
    period,
    newUsers,
    matchesCompleted,
    tournamentsStarted,
    draftsStarted,
    activeUsers,
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
