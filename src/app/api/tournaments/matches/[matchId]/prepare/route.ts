import { Prisma } from "@prisma/client";
import type { OnlineMatchStatus } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * POST /api/tournaments/matches/[matchId]/prepare
 * Ensures a tournament match has a corresponding OnlineMatchSession for Socket.IO gameplay
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ matchId: string }> }
) {
  try {
    const { matchId } = await params;

    // Fetch the tournament match
    const tournamentMatch = await prisma.match.findUnique({
      where: { id: matchId },
      include: {
        tournament: true,
      },
    });

    if (!tournamentMatch) {
      return NextResponse.json({ error: "Match not found" }, { status: 404 });
    }

    // Check if OnlineMatchSession already exists
    const existingSession = await prisma.onlineMatchSession.findUnique({
      where: { id: matchId },
    });

    if (existingSession) {
      return NextResponse.json({
        success: true,
        message: "Online match session already exists",
        matchId,
      });
    }

    // Create OnlineMatchSession from tournament match
    const players = tournamentMatch.players as Array<{
      id: string;
      name: string;
      seat: number;
    }>;
    const playerDecks = tournamentMatch.playerDecks as Record<
      string,
      unknown
    > | null;

    const statusMap: OnlineMatchStatus =
      tournamentMatch.status === "active"
        ? "in_progress"
        : tournamentMatch.status === "completed"
        ? "ended"
        : "waiting";

    // Normalize playerDecks to Prisma.InputJsonValue when present
    const normalizedDecks: Prisma.InputJsonValue | undefined = playerDecks
      ? (JSON.parse(JSON.stringify(playerDecks)) as Prisma.InputJsonValue)
      : undefined;

    await prisma.onlineMatchSession.create({
      data: {
        id: matchId,
        status: statusMap,
        matchType: (tournamentMatch.tournament?.format ?? "constructed") as
          | "constructed"
          | "draft"
          | "sealed",
        playerIds: players.map((p) => p.id),
        ...(normalizedDecks !== undefined
          ? { playerDecks: normalizedDecks }
          : {}),
        game: Prisma.JsonNull,
        seed: matchId, // Use matchId as seed for consistency
        createdAt: tournamentMatch.createdAt,
      },
    });

    return NextResponse.json({
      success: true,
      message: "Online match session created",
      matchId,
    });
  } catch (error) {
    console.error("[API] Error preparing tournament match:", error);
    return NextResponse.json(
      { error: "Failed to prepare tournament match" },
      { status: 500 }
    );
  }
}
