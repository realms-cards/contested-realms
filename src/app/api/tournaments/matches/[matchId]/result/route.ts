import { NextRequest } from 'next/server';
import { getServerAuthSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
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
    }

    // Check if round is complete
    if (match.roundId) {
      const pendingMatches = await prisma.match.count({
        where: {
          roundId: match.roundId,
          status: { in: ['pending', 'in_progress'] }
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
          if (match.round.roundNumber >= match.tournament.totalRounds) {
            await prisma.tournament.update({
              where: { id: match.tournament.id },
              data: {
                status: 'completed'
              }
            });
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