import { NextRequest } from 'next/server';
import { getServerAuthSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

// GET /api/tournaments/[id]/matches
// Get all matches for a tournament with detailed results
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getServerAuthSession();
  if (!session?.user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const roundNumber = searchParams.get('round');
    const playerId = searchParams.get('player');

    // Build where clause
    const whereClause: Record<string, unknown> = {
      tournamentId: id
    };

    if (roundNumber) {
      whereClause.round = {
        roundNumber: parseInt(roundNumber)
      };
    }

    // Get tournament info first (all scalars by default, including settings)
    const tournament = await prisma.tournament.findUnique({
      where: { id }
    });

    if (!tournament) {
      return new Response(JSON.stringify({ error: 'Tournament not found' }), { status: 404 });
    }

    // Get matches
    const matches = await prisma.match.findMany({
      where: whereClause,
      include: {
        round: {
          select: { roundNumber: true }
        },
        tournament: {
          select: { name: true }
        }
      },
      orderBy: [
        { round: { roundNumber: 'asc' } },
        { createdAt: 'asc' }
      ]
    });

    // Filter by player if specified
    let filteredMatches = matches;
    if (playerId) {
      filteredMatches = matches.filter(match => {
        const players = match.players as Array<{ id: string; name: string }>;
        return players.some(p => p.id === playerId);
      });
    }

    // Process matches to extract detailed information
    const processedMatches = filteredMatches.map(match => {
      const players = match.players as Array<{ id: string; displayName?: string; name?: string; seat?: number }>;
      const results = match.results as { winnerId?: string; gameResults?: Array<{ winner: string; duration?: number }> } | null;
      
      // Calculate match statistics
      let duration = null;
      let gameCount = 0;
      let winnerId = null;
      
      if (results) {
        winnerId = results.winnerId || null;
        if (results.gameResults) {
          gameCount = results.gameResults.length;
          // Calculate total duration if available
          const totalDuration = results.gameResults.reduce((sum, game) => 
            sum + (game.duration || 0), 0
          );
          if (totalDuration > 0) {
            duration = totalDuration;
          }
        }
      }

      return {
        id: match.id,
        tournamentId: match.tournamentId,
        tournamentName: match.tournament?.name,
        roundNumber: match.round?.roundNumber || null,
        status: match.status,
        players: players.map(p => ({
          id: p.id,
          name: (p.displayName ?? p.name ?? 'Unknown Player'),
          seat: p.seat || null
        })),
        winnerId,
        gameCount,
        duration,
        startedAt: match.startedAt?.toISOString() || null,
        completedAt: match.completedAt?.toISOString() || null,
        createdAt: match.createdAt.toISOString()
      };
    });

    // Calculate summary statistics
    const totalMatches = processedMatches.length;
    const completedMatches = processedMatches.filter(m => m.status === 'completed').length;
    const averageGameCount = completedMatches > 0 
      ? processedMatches.reduce((sum, m) => sum + m.gameCount, 0) / completedMatches
      : 0;

    const completedWithDuration = processedMatches.filter(m => m.duration !== null);
    const averageDuration = completedWithDuration.length > 0
      ? completedWithDuration.reduce((sum, m) => sum + (m.duration || 0), 0) / completedWithDuration.length
      : null;

    return new Response(JSON.stringify({
      tournament: {
        id,
        name: tournament.name,
        format: tournament.format,
        status: tournament.status,
        maxPlayers: tournament.maxPlayers
      },
      summary: {
        totalMatches,
        completedMatches,
        pendingMatches: totalMatches - completedMatches,
        averageGameCount: Math.round(averageGameCount * 100) / 100,
        averageDuration: averageDuration ? Math.round(averageDuration / 1000) : null // Convert to seconds
      },
      matches: processedMatches
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
  } catch (e: unknown) {
    console.error('Error getting tournament matches:', e);
    const message = e instanceof Error ? e.message : typeof e === 'string' ? e : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), { status: 500 });
  }
}