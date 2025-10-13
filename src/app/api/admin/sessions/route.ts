import { NextResponse } from "next/server";
import { AdminAccessError, requireAdminSession } from "@/lib/admin/auth";
import type { AdminSessionInfo } from "@/lib/admin/types";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  try {
    await requireAdminSession();
    const [matches, drafts, tournaments] = await Promise.all([
      prisma.onlineMatchSession.findMany({
        where: {
          status: { in: ["waiting", "deck_construction", "in_progress"] },
        },
        orderBy: { updatedAt: "desc" },
        take: 10,
        select: {
          id: true,
          status: true,
          playerIds: true,
          matchType: true,
          lobbyName: true,
          updatedAt: true,
          createdAt: true,
        },
      }),
      prisma.draftSession.findMany({
        where: { status: { in: ["waiting", "active"] } },
        orderBy: { createdAt: "desc" },
        take: 10,
        select: {
          id: true,
          status: true,
          tournamentId: true,
          participants: { select: { id: true } },
          startedAt: true,
          createdAt: true,
        },
      }),
      prisma.tournament.findMany({
        where: { status: { in: ["registering", "preparing", "active"] } },
        orderBy: { updatedAt: "desc" },
        take: 10,
        select: {
          id: true,
          name: true,
          status: true,
          createdAt: true,
          updatedAt: true,
          startedAt: true,
          maxPlayers: true,
        },
      }),
    ]);

    const sessions: AdminSessionInfo[] = [];

    matches.forEach((match) => {
      sessions.push({
        id: match.id,
        type: "match",
        status: match.status,
        playerCount: Array.isArray(match.playerIds) ? match.playerIds.length : 0,
        description: `${match.matchType} ${match.lobbyName ?? ""}`.trim(),
        startedAt: match.createdAt?.toISOString?.() ?? null,
        updatedAt: match.updatedAt?.toISOString?.() ?? null,
      });
    });

    drafts.forEach((draft) => {
      sessions.push({
        id: draft.id,
        type: "draft",
        status: draft.status,
        playerCount: draft.participants.length,
        description: draft.tournamentId
          ? `Tournament ${draft.tournamentId}`
          : "Standalone draft",
        startedAt: draft.startedAt?.toISOString() ?? draft.createdAt.toISOString(),
        updatedAt: draft.startedAt?.toISOString() ?? null,
      });
    });

    tournaments.forEach((tournament) => {
      sessions.push({
        id: tournament.id,
        type: "tournament",
        status: tournament.status,
        playerCount: tournament.maxPlayers ?? 0,
        description: tournament.name,
        startedAt: tournament.startedAt?.toISOString() ?? tournament.createdAt.toISOString(),
        updatedAt: tournament.updatedAt?.toISOString() ?? null,
      });
    });

    sessions.sort((a, b) => {
      const ta = a.updatedAt ?? a.startedAt ?? "";
      const tb = b.updatedAt ?? b.startedAt ?? "";
      return tb.localeCompare(ta);
    });

    return NextResponse.json({
      sessions,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    if (error instanceof AdminAccessError) {
      return new NextResponse("Forbidden", { status: 403 });
    }
    console.error("[admin] sessions endpoint failed:", error);
    return NextResponse.json(
      { error: "Failed to load active sessions" },
      { status: 500 }
    );
  }
}
