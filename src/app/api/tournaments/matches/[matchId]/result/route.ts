import { NextRequest } from 'next/server';
import { getServerAuthSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { tournamentSocketService } from '@/lib/services/tournament-socket-service';
import { updateStandingsAfterMatch } from '@/lib/tournament/pairing';

export const dynamic = 'force-dynamic';

// POST /api/tournaments/matches/[matchId]/result
// Body: { winnerId: string, loserId: string, isDraw?: boolean, gameResults?: any[] }
export async function POST(req: NextRequest, { params }: { params: Promise<{ matchId: string }> }) {
  const { matchId } = await params;
  const session = await getServerAuthSession();
  if (!session?.user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  try {
    const body = await req.json();
    const { winnerId, loserId, isDraw = false, gameResults = [] } = body;

    const match = await prisma.match.findUnique({
      where: { id: matchId },
      include: {
        tournament: true,
        round: true
      }
    });

    if (!match) {
      return new Response(JSON.stringify({ error: 'Match not found' }), { status: 404 });
    }

    if (match.status === 'completed') {
      return new Response(JSON.stringify({ error: 'Match already completed' }), { status: 400 });
    }

    // Verify the players are in this match
    const playerIds = (match.players as Array<{ id: string }>).map(p => p.id);
    if (!playerIds.includes(winnerId) || !playerIds.includes(loserId)) {
      return new Response(JSON.stringify({ error: 'Invalid player IDs for this match' }), { status: 400 });
    }

    if (!isDraw && winnerId === loserId) {
      return new Response(JSON.stringify({ error: 'Winner and loser cannot be the same player' }), { status: 400 });
    }

    // Update match with results
    const matchResults = {
      winnerId: isDraw ? null : winnerId,
      loserId: isDraw ? null : loserId,
      isDraw,
      gameResults,
      completedAt: new Date().toISOString()
    };

    await prisma.match.update({
      where: { id: matchId },
      data: {
        status: 'completed',
        results: matchResults,
        completedAt: new Date()
      }
    });

    // Update tournament standings
    if (match.tournamentId) {
      await updateStandingsAfterMatch(match.tournamentId, matchId, {
        winnerId,
        loserId,
        isDraw
      });

      // Broadcast statistics update via Socket.io
      try {
        // Get updated statistics for the tournament
        const updatedStandings = await prisma.playerStanding.findMany({
          where: { tournamentId: match.tournamentId },
          orderBy: [
            { matchPoints: 'desc' },
            { gameWinPercentage: 'desc' },
            { opponentMatchWinPercentage: 'desc' }
          ]
        });

        await tournamentSocketService.broadcastStatisticsUpdate(
          match.tournamentId,
          {
            tournamentId: match.tournamentId,
            standings: updatedStandings.map(standing => ({
              playerId: standing.playerId,
              playerName: standing.displayName,
              wins: standing.wins,
              losses: standing.losses,
              draws: standing.draws,
              matchPoints: standing.matchPoints,
              tiebreakers: {
                gameWinPercentage: standing.gameWinPercentage,
                opponentMatchWinPercentage: standing.opponentMatchWinPercentage
              },
              finalRanking: null // Will be calculated after tournament completion
            })),
            rounds: [],
            overallStats: {
              totalMatches: 0,
              completedMatches: 0,
              averageMatchDuration: null,
              tournamentDuration: null,
              totalPlayers: updatedStandings.length,
              roundsCompleted: 0
            }
          }
        );
      } catch (socketError) {
        console.warn('Failed to broadcast statistics update:', socketError);
        // Don't fail the request if socket broadcast fails
      }
    }

    // Check if round is complete
    if (match.roundId) {
      const pendingMatches = await prisma.match.count({
        where: {
          roundId: match.roundId,
          status: { in: ['pending', 'active'] }
        }
      });

    if (pendingMatches === 0) {
      // Round is complete
      await prisma.tournamentRound.update({
        where: { id: match.roundId },
        data: {
          status: 'completed',
          completedAt: new Date()
        }
      });

      // Check if tournament is complete
      if (match.tournament && match.round) {
        const settings = (match.tournament.settings as Record<string, unknown>) || {};
        const pairingFormat = (settings.pairingFormat as 'swiss' | 'elimination' | 'round_robin' | undefined) || 'swiss';
        let totalRounds = (settings.totalRounds as number) || 0;

        // If totalRounds not set, derive sensible defaults from format and player count
        if (!totalRounds) {
          const playerCount = await prisma.playerStanding.count({ where: { tournamentId: match.tournament.id } });
          if (pairingFormat === 'round_robin') {
            totalRounds = Math.max(0, playerCount - 1);
          } else if (pairingFormat === 'elimination') {
            totalRounds = Math.max(1, Math.ceil(Math.log2(Math.max(playerCount, 1))));
          } else {
            totalRounds = 3; // Default swiss rounds if not configured
          }
        }
        if (match.round.roundNumber >= totalRounds) {
          await prisma.tournament.update({
            where: { id: match.tournament.id },
            data: {
              status: 'completed',
              completedAt: new Date()
            }
          });

          // Broadcast tournament completion
          try {
            await tournamentSocketService.broadcastPhaseChanged(
              match.tournament.id,
              'completed',
              {
                previousStatus: 'active',
                completedAt: new Date().toISOString(),
                finalRound: match.round.roundNumber,
                message: 'Tournament completed!'
              }
            );
          } catch (socketError) {
            console.warn('Failed to broadcast tournament completion:', socketError);
          }
        } else {
          // Manual next round: do not auto-create a new round. Host will trigger /next-round.
          try {
            await tournamentSocketService.broadcastTournamentUpdateById(match.tournament.id);
          } catch (socketErr2) {
            console.warn('Failed to broadcast tournament update after round completion:', socketErr2);
          }
        }
      }
    }
    }

    return new Response(JSON.stringify({
      success: true,
      matchId,
      results: matchResults
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : typeof e === 'string' ? e : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), { status: 500 });
  }
}
