import { NextRequest } from "next/server";
import { getServerAuthSession } from "@/lib/auth";
import { invalidateCache, CacheKeys } from "@/lib/cache/redis-cache";
import { prisma } from "@/lib/prisma";
import { tournamentSocketService } from "@/lib/services/tournament-broadcast";
import { createRoundMatches, generatePairings } from "@/lib/tournament/pairing";

export const dynamic = "force-dynamic";

function getTotalRounds(
  settings: Record<string, unknown>,
  playerCount: number
): number {
  const configured = Number(settings.totalRounds);
  if (configured) return configured;
  const pairingFormat =
    (settings.pairingFormat as "swiss" | "elimination" | "round_robin") ||
    "swiss";
  if (pairingFormat === "round_robin") {
    return Math.max(0, playerCount - 1);
  }
  if (pairingFormat === "elimination") {
    return Math.max(1, Math.ceil(Math.log2(Math.max(playerCount, 1))));
  }
  return 3;
}

// POST /api/tournaments/[id]/rounds/end
// Host ends the current round after all matches are resolved
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await getServerAuthSession();
  if (!session?.user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
    });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const requestedRoundId =
      body && typeof body.roundId === "string" ? body.roundId : null;

    const tournament = await prisma.tournament.findUnique({
      where: { id },
      select: { creatorId: true, status: true, settings: true },
    });

    if (!tournament) {
      return new Response(JSON.stringify({ error: "Tournament not found" }), {
        status: 404,
      });
    }

    if (tournament.creatorId !== session.user.id) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
      });
    }

    if (tournament.status !== "active") {
      return new Response(
        JSON.stringify({ error: "Tournament must be active" }),
        { status: 400 }
      );
    }

    const round = await prisma.tournamentRound.findFirst({
      where: {
        tournamentId: id,
        ...(requestedRoundId ? { id: requestedRoundId } : { status: "active" }),
      },
      include: { matches: true },
      orderBy: { roundNumber: "desc" },
    });

    if (!round) {
      return new Response(JSON.stringify({ error: "Active round not found" }), {
        status: 404,
      });
    }

    if (round.status === "completed") {
      return new Response(
        JSON.stringify({
          success: true,
          roundId: round.id,
          roundNumber: round.roundNumber,
          alreadyCompleted: true,
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        }
      );
    }

    const unresolvedMatches = round.matches.filter(
      (match) => match.status === "pending" || match.status === "active"
    ).length;

    if (unresolvedMatches > 0) {
      return new Response(
        JSON.stringify({ error: "Round still has unresolved matches" }),
        { status: 400 }
      );
    }

    await prisma.tournamentRound.update({
      where: { id: round.id },
      data: { status: "completed", completedAt: new Date() },
    });

    const settings = (tournament.settings as Record<string, unknown>) || {};
    const playerCount = await prisma.playerStanding.count({
      where: { tournamentId: id },
    });
    const totalRounds = getTotalRounds(settings, playerCount);
    const isFinalRound = round.roundNumber >= totalRounds;

    if (isFinalRound) {
      await prisma.tournament.update({
        where: { id },
        data: { status: "completed", completedAt: new Date() },
      });

      try {
        await tournamentSocketService.broadcastPhaseChanged(id, "completed", {
          previousStatus: "active",
          completedAt: new Date().toISOString(),
          finalRound: round.roundNumber,
          message: "Tournament completed!",
        });
      } catch (socketError) {
        console.warn("Failed to broadcast tournament completion:", socketError);
      }

      try {
        await tournamentSocketService.broadcastTournamentUpdateById(id);
      } catch (socketErr) {
        console.warn("Failed to broadcast tournament update:", socketErr);
      }

      await invalidateCache(CacheKeys.tournaments.invalidateTournament(id));

      return new Response(
        JSON.stringify({
          success: true,
          roundId: round.id,
          roundNumber: round.roundNumber,
          tournamentCompleted: true,
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        }
      );
    }

    const nextRoundNumber = round.roundNumber + 1;
    const existingPending = await prisma.tournamentRound.findFirst({
      where: { tournamentId: id, roundNumber: nextRoundNumber },
      select: { id: true },
    });

    if (!existingPending) {
      const pairings = await generatePairings(id);
      const pendingRound = await prisma.tournamentRound.create({
        data: {
          tournamentId: id,
          roundNumber: nextRoundNumber,
          status: "pending",
          pairingData: {
            algorithm: "swiss",
            seed: Date.now(),
            byes: pairings.byes.map((bye) => bye.playerId),
          },
        },
      });

      await createRoundMatches(id, pendingRound.id, pairings, {
        assignMatches: false,
        applyByes: false,
      });
    }

    try {
      await tournamentSocketService.broadcastTournamentUpdateById(id);
    } catch (socketErr) {
      console.warn("Failed to broadcast tournament update:", socketErr);
    }

    await invalidateCache(CacheKeys.tournaments.invalidateTournament(id));

    return new Response(
      JSON.stringify({
        success: true,
        roundId: round.id,
        roundNumber: round.roundNumber,
        nextRoundNumber,
      }),
      {
        status: 200,
        headers: { "content-type": "application/json" },
      }
    );
  } catch (e: unknown) {
    const message =
      e instanceof Error
        ? e.message
        : typeof e === "string"
        ? e
        : "Unknown error";
    return new Response(JSON.stringify({ error: message }), { status: 500 });
  }
}
