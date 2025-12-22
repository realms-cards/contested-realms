import { NextRequest } from "next/server";
import { getServerAuthSession } from "@/lib/auth";
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

function normalizePlayers(value: unknown): Array<{ id: string; name?: string }> {
  if (!Array.isArray(value)) return [];
  return value
    .map((player) => {
      if (typeof player === "string") return { id: player };
      if (player && typeof player === "object" && "id" in player) {
        return player as { id?: string; name?: string };
      }
      return null;
    })
    .filter((player): player is { id: string; name?: string } =>
      Boolean(player && typeof player.id === "string")
    );
}

async function assignRoundMatches(
  tournamentId: string,
  roundId: string,
  pairingData: Record<string, unknown> | null | undefined
) {
  const roundMatches = await prisma.match.findMany({
    where: { roundId },
  });

  await Promise.all(
    roundMatches.map(async (match) => {
      const players = normalizePlayers(match.players);
      const ids = players.map((p) => p.id);
      if (ids.length === 0) return;
      await prisma.playerStanding.updateMany({
        where: {
          tournamentId,
          playerId: { in: ids },
        },
        data: { currentMatchId: match.id },
      });
    })
  );

  const byes = Array.isArray(pairingData?.byes)
    ? pairingData?.byes.filter((id): id is string => typeof id === "string")
    : [];
  if (byes.length > 0) {
    await Promise.all(
      byes.map((playerId) =>
        prisma.playerStanding.update({
          where: {
            tournamentId_playerId: {
              tournamentId,
              playerId,
            },
          },
          data: {
            wins: { increment: 1 },
            matchPoints: { increment: 3 },
            currentMatchId: null,
          },
        })
      )
    );
  }

  return roundMatches;
}

// POST /api/tournaments/[id]/next-round
// Starts the next pending round (host-controlled)
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
    const tournament = await prisma.tournament.findUnique({
      where: { id },
      select: { status: true, settings: true, creatorId: true, name: true },
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

    const activeRound = await prisma.tournamentRound.findFirst({
      where: { tournamentId: id, status: "active" },
      select: { id: true },
    });

    if (activeRound) {
      return new Response(
        JSON.stringify({ error: "A round is already active" }),
        { status: 400 }
      );
    }

    let pendingRound = await prisma.tournamentRound.findFirst({
      where: { tournamentId: id, status: "pending" },
      orderBy: { roundNumber: "asc" },
    });

    if (!pendingRound) {
      const lastRound = await prisma.tournamentRound.findFirst({
        where: { tournamentId: id },
        orderBy: { roundNumber: "desc" },
      });
      const nextRoundNumber = (lastRound?.roundNumber ?? 0) + 1;
      const playerCount = await prisma.playerStanding.count({
        where: { tournamentId: id },
      });
      const totalRounds = getTotalRounds(
        (tournament.settings as Record<string, unknown>) || {},
        playerCount
      );
      if (nextRoundNumber > totalRounds) {
        return new Response(
          JSON.stringify({
            error: `Cannot start round ${nextRoundNumber}. Tournament is configured for ${totalRounds} round${totalRounds === 1 ? "" : "s"}.`,
          }),
          { status: 400 }
        );
      }

      const pairings = await generatePairings(id);
      pendingRound = await prisma.tournamentRound.create({
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

    await prisma.tournamentRound.update({
      where: { id: pendingRound.id },
      data: { status: "active", startedAt: new Date() },
    });

    const roundMatches = await assignRoundMatches(
      id,
      pendingRound.id,
      (pendingRound.pairingData as Record<string, unknown>) || {}
    );

    const matchData = roundMatches.map((match) => {
      const players = normalizePlayers(match.players);
      const player1 = players[0];
      const player2 = players[1];
      return {
        id: match.id,
        player1Id: player1?.id || "",
        player1Name: player1?.name || "Unknown Player",
        player2Id: player2?.id || null,
        player2Name: player2?.name || null,
      };
    });

    try {
      await tournamentSocketService.broadcastRoundStarted(
        id,
        pendingRound.roundNumber,
        matchData
      );

      await tournamentSocketService.broadcastTournamentUpdateById(id);

      const lobbyName = tournament.name || "Tournament Match";
      const broadcastPromises = [];
      for (const m of matchData) {
        if (m.player1Id) {
          broadcastPromises.push(
            tournamentSocketService.broadcastMatchAssigned(id, m.player1Id, {
              matchId: m.id,
              opponentId: m.player2Id,
              opponentName: m.player2Name,
              lobbyName,
            })
          );
        }
        if (m.player2Id) {
          broadcastPromises.push(
            tournamentSocketService.broadcastMatchAssigned(id, m.player2Id, {
              matchId: m.id,
              opponentId: m.player1Id,
              opponentName: m.player1Name,
              lobbyName,
            })
          );
        }
      }

      await Promise.all(broadcastPromises);
    } catch (socketError) {
      console.warn("Failed to broadcast round started event:", socketError);
    }

    return new Response(
      JSON.stringify({
        success: true,
        roundNumber: pendingRound.roundNumber,
        roundId: pendingRound.id,
        matchIds: roundMatches.map((match) => match.id),
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
