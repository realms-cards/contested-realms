import { NextRequest } from 'next/server';
import { getServerAuthSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

// GET /api/tournaments/[id]/rounds
// Get all rounds for a tournament with detailed statistics
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getServerAuthSession();
  if (!session?.user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  try {
    // Get tournament info
    const tournament = await prisma.tournament.findUnique({
      where: { id },
      select: { 
        name: true, 
        format: true, 
        status: true,
        maxPlayers: true
      }
    });

    if (!tournament) {
      return new Response(JSON.stringify({ error: 'Tournament not found' }), { status: 404 });
    }

    // Get all rounds with matches
    const rounds = await prisma.tournamentRound.findMany({
      where: { tournamentId: id },
      include: {
        matches: {
          orderBy: { createdAt: 'asc' }
        }
      },
      orderBy: { roundNumber: 'asc' }
    });

    // Process rounds with statistics
    const processedRounds = rounds.map(round => {
      const totalMatches = round.matches.length;
      const completedMatches = round.matches.filter(m => m.status === 'completed').length;
      const activeMatches = round.matches.filter(m => m.status === 'active').length;
      const pendingMatches = round.matches.filter(m => m.status === 'pending').length;

      // Calculate round duration if completed
      let roundDuration = null;
      if (round.startedAt && round.completedAt) {
        roundDuration = round.completedAt.getTime() - round.startedAt.getTime();
      }

      // Calculate average match duration for completed matches
      let averageMatchDuration = null;
      const completedMatchesWithDuration = round.matches.filter(m => 
        m.status === 'completed' && m.startedAt && m.completedAt
      );
      
      if (completedMatchesWithDuration.length > 0) {
        const totalMatchDuration = completedMatchesWithDuration.reduce((sum, match) => {
          const started = match.startedAt;
          const completed = match.completedAt;
          if (!started || !completed) return sum;
          const duration = completed.getTime() - started.getTime();
          return sum + duration;
        }, 0);
        averageMatchDuration = totalMatchDuration / completedMatchesWithDuration.length;
      }

      // Process matches for this round
      const matchDetails = round.matches.map(match => {
        const players = match.players as Array<{ id: string; name: string }>;
        const results = match.results as { winnerId?: string; isDraw?: boolean; gameResults?: Array<{ winner: string }> } | null;
        
        let winnerId = null;
        let isDraw = false;
        let gameCount = 0;

        if (results) {
          winnerId = results.winnerId || null;
          isDraw = results.isDraw || false;
          gameCount = results.gameResults?.length || 0;
        }

        return {
          id: match.id,
          status: match.status,
          players: players.map(p => ({
            id: p.id,
            name: p.name
          })),
          winnerId,
          isDraw,
          gameCount,
          startedAt: match.startedAt?.toISOString() || null,
          completedAt: match.completedAt?.toISOString() || null,
          duration: match.startedAt && match.completedAt 
            ? match.completedAt.getTime() - match.startedAt.getTime() 
            : null
        };
      });

      return {
        id: round.id,
        roundNumber: round.roundNumber,
        status: round.status,
        startedAt: round.startedAt?.toISOString() || null,
        completedAt: round.completedAt?.toISOString() || null,
        duration: roundDuration,
        statistics: {
          totalMatches,
          completedMatches,
          activeMatches,
          pendingMatches,
          completionRate: totalMatches > 0 ? Math.round((completedMatches / totalMatches) * 100) / 100 : 0,
          averageMatchDuration: averageMatchDuration ? Math.round(averageMatchDuration / 1000) : null // Convert to seconds
        },
        pairingData: round.pairingData,
        matches: matchDetails
      };
    });

    // Calculate tournament-wide round statistics
    const totalRounds = processedRounds.length;
    const completedRounds = processedRounds.filter(r => r.status === 'completed').length;
    const activeRounds = processedRounds.filter(r => r.status === 'active').length;
    
    const allMatches = processedRounds.flatMap(r => r.matches);
    const totalTournamentMatches = allMatches.length;
    const completedTournamentMatches = allMatches.filter(m => m.status === 'completed').length;

    return new Response(JSON.stringify({
      tournament: {
        id,
        name: tournament.name,
        format: tournament.format,
        status: tournament.status,
        maxPlayers: tournament.maxPlayers
      },
      summary: {
        totalRounds,
        completedRounds,
        activeRounds,
        pendingRounds: totalRounds - completedRounds - activeRounds,
        totalMatches: totalTournamentMatches,
        completedMatches: completedTournamentMatches,
        overallCompletionRate: totalTournamentMatches > 0 
          ? Math.round((completedTournamentMatches / totalTournamentMatches) * 100) / 100 
          : 0
      },
      rounds: processedRounds
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
  } catch (e: unknown) {
    console.error('Error getting tournament rounds:', e);
    const message = e instanceof Error ? e.message : typeof e === 'string' ? e : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), { status: 500 });
  }
}
