import { NextRequest } from "next/server";
import { getServerAuthSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { invalidateCache, CacheKeys } from "@/lib/cache/redis-cache";
import { tournamentSocketService } from "@/lib/services/tournament-broadcast";
import { updateStandingsAfterMatch } from "@/lib/tournament/pairing";

export const dynamic = "force-dynamic";

// POST /api/tournaments/matches/[matchId]/invalidate
// Body: { mode: "invalid" | "bye", winnerId?: string, reason?: string }
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ matchId: string }> }
) {
  const { matchId } = await params;
  const session = await getServerAuthSession();
  if (!session?.user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
    });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const mode = body?.mode === "bye" ? "bye" : "invalid";
    const winnerId = typeof body?.winnerId === "string" ? body.winnerId : null;
    const reason = typeof body?.reason === "string" ? body.reason : null;

    const match = await prisma.match.findUnique({
      where: { id: matchId },
      include: {
        tournament: { select: { id: true, creatorId: true } },
      },
    });

    if (!match || !match.tournamentId || !match.tournament) {
      return new Response(JSON.stringify({ error: "Match not found" }), {
        status: 404,
      });
    }

    if (match.tournament.creatorId !== session.user.id) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
      });
    }

    if (match.status === "completed" || match.status === "cancelled") {
      return new Response(
        JSON.stringify({ success: true, alreadyResolved: true }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        }
      );
    }

    const players = Array.isArray(match.players) ? match.players : [];
    const playerIds = players
      .map((p) => {
        if (typeof p === "string") return p;
        const record = p as { id?: string };
        return typeof record.id === "string" ? record.id : null;
      })
      .filter(Boolean) as string[];

    const now = new Date();

    if (mode === "bye") {
      if (!winnerId || !playerIds.includes(winnerId)) {
        return new Response(
          JSON.stringify({ error: "Winner must be one of the match players" }),
          { status: 400 }
        );
      }

      const loserId = playerIds.find((id) => id !== winnerId) || null;
      if (!loserId) {
        return new Response(
          JSON.stringify({ error: "Match does not have an opponent" }),
          { status: 400 }
        );
      }

      const matchResults = {
        winnerId,
        loserId,
        isDraw: false,
        gameResults: [],
        completedAt: now.toISOString(),
        invalid: true,
        bye: true,
        reason,
      };

      await prisma.match.update({
        where: { id: matchId },
        data: {
          status: "completed",
          results: matchResults,
          completedAt: now,
        },
      });

      await updateStandingsAfterMatch(match.tournamentId, matchId, {
        winnerId,
        loserId,
        isDraw: false,
      });
    } else {
      const matchResults = {
        winnerId: null,
        loserId: null,
        isDraw: false,
        gameResults: [],
        completedAt: now.toISOString(),
        invalid: true,
        bye: false,
        reason,
      };

      await prisma.match.update({
        where: { id: matchId },
        data: {
          status: "cancelled",
          results: matchResults,
          completedAt: now,
        },
      });

      if (playerIds.length > 0) {
        await prisma.playerStanding.updateMany({
          where: {
            tournamentId: match.tournamentId,
            playerId: { in: playerIds },
          },
          data: { currentMatchId: null },
        });
      }
    }

    // Broadcast statistics update via Socket.io
    try {
      const updatedStandings = await prisma.playerStanding.findMany({
        where: { tournamentId: match.tournamentId },
        orderBy: [
          { matchPoints: "desc" },
          { gameWinPercentage: "desc" },
          { opponentMatchWinPercentage: "desc" },
        ],
      });

      await tournamentSocketService.broadcastStatisticsUpdate(
        match.tournamentId,
        {
          tournamentId: match.tournamentId,
          standings: updatedStandings.map((standing) => ({
            playerId: standing.playerId,
            playerName: standing.displayName,
            wins: standing.wins,
            losses: standing.losses,
            draws: standing.draws,
            matchPoints: standing.matchPoints,
            tiebreakers: {
              gameWinPercentage: standing.gameWinPercentage,
              opponentMatchWinPercentage: standing.opponentMatchWinPercentage,
            },
            finalRanking: null,
          })),
          rounds: [],
          overallStats: {
            totalMatches: 0,
            completedMatches: 0,
            averageMatchDuration: null,
            tournamentDuration: null,
            totalPlayers: updatedStandings.length,
            roundsCompleted: 0,
          },
        }
      );
    } catch (socketError) {
      console.warn("Failed to broadcast statistics update:", socketError);
    }

    try {
      await tournamentSocketService.broadcastTournamentUpdateById(
        match.tournamentId
      );
    } catch (socketErr) {
      console.warn("Failed to broadcast tournament update:", socketErr);
    }

    await invalidateCache(
      CacheKeys.tournaments.invalidateTournament(match.tournamentId)
    );

    return new Response(
      JSON.stringify({
        success: true,
        matchId,
        mode,
      }),
      {
        status: 200,
        headers: { "content-type": "application/json" },
      }
    );
  } catch (e: unknown) {
    const message =
      e instanceof Error ? e.message : typeof e === "string" ? e : "Unknown error";
    return new Response(JSON.stringify({ error: message }), { status: 500 });
  }
}
