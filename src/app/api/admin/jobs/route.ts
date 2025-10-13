import { NextResponse } from "next/server";
import { AdminAccessError, requireAdminSession } from "@/lib/admin/auth";
import type { AdminJobStatus } from "@/lib/admin/types";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  try {
    await requireAdminSession();
    const now = Date.now();
    const oneHourAgo = new Date(now - 60 * 60 * 1000);
    const oneDayAgo = new Date(now - 24 * 60 * 60 * 1000);

    const [
      broadcastRecent,
      broadcastRecentSuccess,
      broadcastLatest,
      tournaments,
      drafts,
      matches,
    ] = await Promise.all([
      prisma.socketBroadcastHealth.count({
        where: { success: false, timestamp: { gte: oneHourAgo } },
      }),
      prisma.socketBroadcastHealth.count({
        where: { success: true, timestamp: { gte: oneHourAgo } },
      }),
      prisma.socketBroadcastHealth.findFirst({
        orderBy: { timestamp: "desc" },
      }),
      prisma.tournament.groupBy({
        by: ["status"],
        _count: { status: true },
      }),
      prisma.draftSession.groupBy({
        by: ["status"],
        _count: { status: true },
      }),
      prisma.onlineMatchSession.groupBy({
        by: ["status"],
        _count: { status: true },
      }),
    ]);

    const tournamentsMap = new Map<string, number>();
    tournaments.forEach((row) => {
      tournamentsMap.set(row.status, row._count.status);
    });

    const draftsMap = new Map<string, number>();
    drafts.forEach((row) => draftsMap.set(row.status, row._count.status));

    const matchesMap = new Map<string, number>();
    matches.forEach((row) => matchesMap.set(row.status, row._count.status));

    const jobs: AdminJobStatus[] = [
      {
        id: "broadcast",
        label: "Broadcast queue",
        queued: broadcastRecent,
        inProgress: broadcastRecentSuccess,
        failed: await prisma.socketBroadcastHealth.count({
          where: { success: false, timestamp: { gte: oneDayAgo } },
        }),
        updatedAt: broadcastLatest
          ? broadcastLatest.timestamp.toISOString()
          : new Date().toISOString(),
        details: "Socket broadcast events in the last hour",
      },
      {
        id: "tournaments",
        label: "Tournament preparation",
        queued: tournamentsMap.get("preparing") || 0,
        inProgress: tournamentsMap.get("active") || 0,
        failed: tournamentsMap.get("cancelled") || 0,
        updatedAt: new Date().toISOString(),
        details: "Tournaments grouped by status",
      },
      {
        id: "drafts",
        label: "Draft sessions",
        queued: draftsMap.get("waiting") || 0,
        inProgress: draftsMap.get("active") || 0,
        failed: draftsMap.get("cancelled") || 0,
        updatedAt: new Date().toISOString(),
      },
      {
        id: "matches",
        label: "Online matches",
        queued:
          (matchesMap.get("waiting") || 0) +
          (matchesMap.get("deck_construction") || 0),
        inProgress: matchesMap.get("in_progress") || 0,
        failed: matchesMap.get("cancelled") || 0,
        updatedAt: new Date().toISOString(),
        details: "Live sessions waiting or in progress",
      },
    ];

    return NextResponse.json({
      jobs,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    if (error instanceof AdminAccessError) {
      return new NextResponse("Forbidden", { status: 403 });
    }
    console.error("[admin] jobs endpoint failed:", error);
    return NextResponse.json(
      { error: "Failed to load job status" },
      { status: 500 }
    );
  }
}
