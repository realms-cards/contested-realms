import { NextResponse } from "next/server";
import { AdminAccessError, requireAdminSession } from "@/lib/admin/auth";
import { prisma } from "@/lib/prisma";
import { tournamentSocketService } from "@/lib/services/tournament-broadcast";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/admin/tournaments/close
 * Close/end a tournament (admin only, bypasses creator check)
 */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    await requireAdminSession();

    const body = (await request.json()) as { tournamentId?: string };
    const tournamentId = body?.tournamentId;

    if (!tournamentId || typeof tournamentId !== "string") {
      return NextResponse.json(
        { error: "Missing tournamentId" },
        { status: 400 }
      );
    }

    const tournament = await prisma.tournament.findUnique({
      where: { id: tournamentId },
      select: { id: true, name: true, status: true },
    });

    if (!tournament) {
      return NextResponse.json(
        { error: "Tournament not found" },
        { status: 404 }
      );
    }

    if (
      tournament.status === "completed" ||
      tournament.status === "cancelled"
    ) {
      return NextResponse.json(
        { error: `Tournament is already ${tournament.status}` },
        { status: 400 }
      );
    }

    // Update tournament status to completed
    const updatedTournament = await prisma.tournament.update({
      where: { id: tournamentId },
      data: {
        status: "completed",
        completedAt: new Date(),
      },
    });

    // Mark all active tournament matches as completed
    const activeMatches = await prisma.match.findMany({
      where: {
        tournamentId,
        status: "active",
      },
      select: { id: true },
    });

    await prisma.match.updateMany({
      where: {
        tournamentId,
        status: "active",
      },
      data: {
        status: "completed",
      },
    });

    // Notify the socket server to clean up these matches
    try {
      for (const match of activeMatches) {
        await tournamentSocketService.broadcastToMatch(match.id, "matchEnded", {
          matchId: match.id,
          tournamentId,
          reason: "tournament_closed_by_admin",
        });
      }
    } catch (cleanupError) {
      console.warn(
        "[admin] Failed to cleanup tournament matches:",
        cleanupError
      );
    }

    // Broadcast tournament ended event via Socket.io
    try {
      await tournamentSocketService.broadcastPhaseChanged(
        tournamentId,
        "completed",
        {
          previousStatus: tournament.status,
          completedAt: updatedTournament.completedAt?.toISOString(),
          endedBy: "admin",
          message: `Tournament "${tournament.name}" has been closed by an administrator`,
        }
      );
      await tournamentSocketService.broadcastTournamentUpdateById(tournamentId);
    } catch (socketError) {
      console.warn(
        "[admin] Failed to broadcast tournament closed event:",
        socketError
      );
    }

    return NextResponse.json({
      success: true,
      message: `Tournament "${tournament.name}" has been closed`,
      tournamentId,
      status: updatedTournament.status,
      matchesClosed: activeMatches.length,
    });
  } catch (error) {
    if (error instanceof AdminAccessError) {
      return new NextResponse("Forbidden", { status: 403 });
    }
    console.error("[admin] close tournament failed:", error);
    return NextResponse.json(
      { error: "Failed to close tournament" },
      { status: 500 }
    );
  }
}
