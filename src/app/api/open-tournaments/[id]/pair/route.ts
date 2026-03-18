import { NextRequest } from "next/server";
import { getServerAuthSession } from "@/lib/auth";
import { PairingRequestSchema } from "@/lib/open-tournament/validation";
import { prisma } from "@/lib/prisma";
import {
  generatePairings,
  createRoundMatches,
  type PlayerPairing,
  type TournamentPairingResult,
} from "@/lib/tournament/pairing";
import { isActiveSeat } from "@/lib/tournament/registration";

type RouteParams = { params: Promise<{ id: string }> };

/** POST /api/open-tournaments/[id]/pair — Generate pairings for the active round */
export async function POST(req: NextRequest, { params }: RouteParams) {
  const session = await getServerAuthSession();
  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const tournament = await prisma.tournament.findUnique({
    where: { id, format: "open" },
    include: {
      rounds: {
        where: { status: "active" },
        take: 1,
      },
      registrations: {
        select: { playerId: true, seatStatus: true },
      },
      standings: {
        where: { isEliminated: false },
        orderBy: [
          { matchPoints: "desc" },
          { gameWinPercentage: "desc" },
          { opponentMatchWinPercentage: "desc" },
        ],
      },
    },
  });

  if (!tournament) {
    return Response.json({ error: "Tournament not found" }, { status: 404 });
  }
  if (tournament.creatorId !== session.user.id) {
    return Response.json({ error: "Only the host can generate pairings" }, { status: 403 });
  }

  const activeRound = tournament.rounds[0];
  if (!activeRound) {
    return Response.json({ error: "No active round. Create a round first." }, { status: 400 });
  }

  // Check if round already has matches
  const existingMatches = await prisma.match.count({
    where: { roundId: activeRound.id },
  });
  if (existingMatches > 0) {
    return Response.json(
      { error: "Round already has matches. End or clear the round first." },
      { status: 400 },
    );
  }

  const body: unknown = await req.json();
  const parsed = PairingRequestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const input = parsed.data;
  let pairingResult: TournamentPairingResult;

  if (input.source === "swiss") {
    // Use existing Swiss pairing algorithm
    pairingResult = await generatePairings(id);
  } else {
    // Manual pairings from the host
    const activePlayerIds = new Set(
      tournament.registrations.filter(isActiveSeat).map((r) => r.playerId),
    );
    const standingsMap = new Map(
      tournament.standings.map((s) => [s.playerId, s]),
    );

    const pairedPlayerIds = new Set<string>();
    const matches: TournamentPairingResult["matches"] = [];

    for (const pair of input.pairings) {
      if (!activePlayerIds.has(pair.player1Id) || !activePlayerIds.has(pair.player2Id)) {
        return Response.json(
          { error: `Invalid player ID in pairing: ${pair.player1Id} vs ${pair.player2Id}` },
          { status: 400 },
        );
      }

      const p1Standing = standingsMap.get(pair.player1Id);
      const p2Standing = standingsMap.get(pair.player2Id);

      const toPlayerPairing = (
        playerId: string,
        standing: typeof p1Standing,
      ): PlayerPairing => ({
        playerId,
        displayName: standing?.displayName ?? "Unknown",
        matchPoints: standing?.matchPoints ?? 0,
        gameWinPercentage: standing?.gameWinPercentage ?? 0,
        opponentMatchWinPercentage: standing?.opponentMatchWinPercentage ?? 0,
        isEliminated: standing?.isEliminated ?? false,
      });

      matches.push({
        player1: toPlayerPairing(pair.player1Id, p1Standing),
        player2: toPlayerPairing(pair.player2Id, p2Standing),
      });

      pairedPlayerIds.add(pair.player1Id);
      pairedPlayerIds.add(pair.player2Id);
    }

    // Unpaired active players get a bye
    const byes: PlayerPairing[] = [];
    for (const [playerId, standing] of standingsMap) {
      if (activePlayerIds.has(playerId) && !pairedPlayerIds.has(playerId)) {
        byes.push({
          playerId,
          displayName: standing.displayName,
          matchPoints: standing.matchPoints,
          gameWinPercentage: standing.gameWinPercentage,
          opponentMatchWinPercentage: standing.opponentMatchWinPercentage,
          isEliminated: standing.isEliminated,
        });
      }
    }

    pairingResult = { matches, byes };
  }

  // Create match records in the database
  const matchIds = await createRoundMatches(id, activeRound.id, pairingResult);

  // Fetch created matches for response
  const createdMatches = await prisma.match.findMany({
    where: { id: { in: matchIds } },
  });

  return Response.json({
    matches: createdMatches,
    byes: pairingResult.byes.map((b) => ({
      playerId: b.playerId,
      displayName: b.displayName,
    })),
  });
}
