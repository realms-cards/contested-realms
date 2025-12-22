import { NextRequest } from 'next/server';
import { getServerAuthSession } from '@/lib/auth';
import { invalidateCache, CacheKeys } from '@/lib/cache/redis-cache';
import { prisma } from '@/lib/prisma';
import { tournamentSocketService } from '@/lib/services/tournament-broadcast';
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

    // Do not early-return on completed here; we'll guard idempotently below when updating

    // Resolve player IDs for validation and standings update
    const playerIds = (match.players as Array<{ id: string }>).map(p => p.id);
    // For non-draws, ensure provided ids are part of this match
    if (!isDraw) {
      if (!playerIds.includes(winnerId) || !playerIds.includes(loserId)) {
        return new Response(JSON.stringify({ error: 'Invalid player IDs for this match' }), { status: 400 });
      }
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

    // Idempotent completion: only update if not already completed
    const now = new Date();
    const completeRes = await prisma.match.updateMany({
      where: { id: matchId, status: { not: 'completed' } },
      data: {
        status: 'completed',
        results: matchResults,
        completedAt: now,
      },
    });

    // If no rows updated, another client already reported the result. Treat as success.
    if (completeRes.count === 0) {
      return new Response(JSON.stringify({ success: true, alreadyCompleted: true, matchId }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }

    // Update tournament standings
    if (match.tournamentId) {
      // For draws, pass both player IDs so both receive draw/point
      const [p1, p2] = playerIds;
      const wId = isDraw ? p1 : winnerId;
      const lId = isDraw ? p2 : loserId;
      await updateStandingsAfterMatch(match.tournamentId, matchId, {
        winnerId: wId,
        loserId: lId,
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

    // Round completion is manual; host ends round explicitly.
    if (match.tournamentId) {
      try {
        await tournamentSocketService.broadcastTournamentUpdateById(match.tournamentId);
      } catch (socketErr) {
        console.warn('Failed to broadcast tournament update after match completion:', socketErr);
      }
    }

    // Invalidate tournament cache so next poll gets fresh data
    if (match.tournamentId) {
      await invalidateCache(CacheKeys.tournaments.invalidateTournament(match.tournamentId));
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
