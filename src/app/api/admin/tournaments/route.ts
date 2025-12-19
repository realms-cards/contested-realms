import { NextResponse } from "next/server";
import { AdminAccessError, requireAdminSession } from "@/lib/admin/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/tournaments
 * List active tournaments (admin only)
 */
export async function GET(): Promise<NextResponse> {
  try {
    await requireAdminSession();

    const tournaments = await prisma.tournament.findMany({
      where: {
        status: {
          notIn: ["completed", "cancelled"],
        },
      },
      select: {
        id: true,
        name: true,
        status: true,
        format: true,
        settings: true,
        createdAt: true,
        startedAt: true,
        creator: {
          select: {
            id: true,
            name: true,
          },
        },
        rounds: {
          select: {
            roundNumber: true,
          },
          orderBy: {
            roundNumber: "desc",
          },
          take: 1,
        },
        _count: {
          select: {
            registrations: true,
            matches: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
      take: 50,
    });

    const formattedTournaments = tournaments.map((t) => {
      const settings = t.settings as { rounds?: number } | null;
      const maxRounds = settings?.rounds ?? 3;
      const currentRound = t.rounds[0]?.roundNumber ?? 0;
      return {
        id: t.id,
        name: t.name,
        status: t.status,
        format: t.format,
        createdAt: t.createdAt?.toISOString() ?? null,
        startedAt: t.startedAt?.toISOString() ?? null,
        currentRound,
        maxRounds,
        creatorId: t.creator?.id ?? null,
        creatorName: t.creator?.name ?? null,
        playerCount: t._count.registrations,
        matchCount: t._count.matches,
      };
    });

    return NextResponse.json({
      tournaments: formattedTournaments,
      total: formattedTournaments.length,
    });
  } catch (error) {
    if (error instanceof AdminAccessError) {
      return new NextResponse("Forbidden", { status: 403 });
    }
    console.error("[admin] list tournaments failed:", error);
    return NextResponse.json(
      { error: "Failed to list tournaments" },
      { status: 500 }
    );
  }
}
