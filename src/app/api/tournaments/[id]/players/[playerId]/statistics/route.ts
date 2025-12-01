import { NextRequest } from 'next/server';
import { getServerAuthSession } from '@/lib/auth';
import { logPerformance } from '@/lib/monitoring/performance';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

// GET /api/tournaments/[id]/players/[playerId]/statistics
// Get detailed statistics for a specific player in a tournament
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; playerId: string }> }
) {
  const startTime = performance.now();
  const { id, playerId } = await params;
  const session = await getServerAuthSession();
  if (!session?.user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  try {
    // Get tournament and player info
    const tournament = await prisma.tournament.findUnique({
      where: { id },
      select: { 
        name: true, 
        format: true, 
        status: true,
        creator: { select: { name: true } }
      }
    });

    if (!tournament) {
      return new Response(JSON.stringify({ error: 'Tournament not found' }), { status: 404 });
    }

    const player = await prisma.user.findUnique({
      where: { id: playerId },
      select: { name: true, image: true }
    });

    if (!player) {
      return new Response(JSON.stringify({ error: 'Player not found' }), { status: 404 });
    }

    // Get player's registration
    const registration = await prisma.tournamentRegistration.findUnique({
      where: {
        tournamentId_playerId: {
          tournamentId: id,
          playerId
        }
      }
    });

    if (!registration) {
      return new Response(JSON.stringify({ error: 'Player not registered for this tournament' }), { status: 404 });
    }

    // Get player's standing
    const standing = await prisma.playerStanding.findUnique({
      where: {
        tournamentId_playerId: {
          tournamentId: id,
          playerId
        }
      }
    });

    // Get player's tournament statistics
    const tournamentStats = await prisma.tournamentStatistics.findUnique({
      where: {
        tournamentId_playerId: {
          tournamentId: id,
          playerId
        }
      }
    });

    // Get player's matches in this tournament
    // Optimized: Filter at database level using JSON path query instead of in-memory
    // This reduces data transfer by 4x in a 32-player tournament (48 matches → 12 matches)
    const playerMatches = await prisma.$queryRaw<Array<{
      id: string;
      tournamentId: string;
      roundId: string | null;
      players: unknown;
      results: unknown;
      status: string;
      startedAt: Date | null;
      completedAt: Date | null;
      createdAt: Date;
      roundNumber: number | null;
    }>>`
      SELECT
        m.id,
        m."tournamentId",
        m."roundId",
        m.players,
        m.results,
        m.status,
        m."startedAt",
        m."completedAt",
        m."createdAt",
        r."roundNumber" as "roundNumber"
      FROM "Match" m
      LEFT JOIN "Round" r ON m."roundId" = r.id
      WHERE m."tournamentId" = ${id}
        AND EXISTS (
          SELECT 1 FROM jsonb_array_elements(m.players) AS player
          WHERE player->>'id' = ${playerId}
        )
      ORDER BY r."roundNumber" ASC NULLS LAST, m."createdAt" ASC
    `;

    // Process match history
    const matchHistory = playerMatches.map(match => {
      const players = match.players as Array<{ id: string; name: string }>;
      const results = match.results as { winnerId?: string; isDraw?: boolean; gameResults?: Array<{ winner: string }> } | null;
      
      const opponent = players.find(p => p.id !== playerId);
      let result = 'pending';
      let gameWins = 0;
      let gameLosses = 0;

      if (results) {
        if (results.isDraw) {
          result = 'draw';
        } else if (results.winnerId === playerId) {
          result = 'win';
        } else if (results.winnerId && results.winnerId !== playerId) {
          result = 'loss';
        }

        // Count game wins/losses
        if (results.gameResults) {
          gameWins = results.gameResults.filter(g => g.winner === playerId).length;
          gameLosses = results.gameResults.length - gameWins;
        }
      }

      return {
        matchId: match.id,
        roundNumber: match.roundNumber || null,
        opponent: opponent ? {
          id: opponent.id,
          name: opponent.name
        } : null,
        result,
        gameWins,
        gameLosses,
        startedAt: match.startedAt?.toISOString() || null,
        completedAt: match.completedAt?.toISOString() || null
      };
    });

    // Calculate additional statistics
    const completedMatches = matchHistory.filter(m => m.result !== 'pending');
    const wins = completedMatches.filter(m => m.result === 'win').length;
    const losses = completedMatches.filter(m => m.result === 'loss').length;
    const draws = completedMatches.filter(m => m.result === 'draw').length;
    
    const totalGames = completedMatches.reduce((sum, m) => sum + m.gameWins + m.gameLosses, 0);
    const gameWins = completedMatches.reduce((sum, m) => sum + m.gameWins, 0);
    const gameWinRate = totalGames > 0 ? gameWins / totalGames : 0;

    // Performance trends (wins/losses by round)
    const performanceByRound = matchHistory
      .filter(m => m.roundNumber !== null && m.result !== 'pending')
      .reduce((acc, match) => {
        const round = match.roundNumber as number;
        if (!acc[round]) {
          acc[round] = { wins: 0, losses: 0, draws: 0 };
        }
        acc[round][match.result as keyof typeof acc[typeof round]]++;
        return acc;
      }, {} as Record<number, { wins: number; losses: number; draws: number }>);

    const response = new Response(JSON.stringify({
      tournament: {
        id,
        name: tournament.name,
        format: tournament.format,
        status: tournament.status,
        creatorName: tournament.creator.name
      },
      player: {
        id: playerId,
        name: player.name,
        image: player.image,
        registeredAt: registration.registeredAt.toISOString(),
        preparationStatus: registration.preparationStatus
      },
      currentStanding: standing ? {
        rank: null, // Would need to calculate from all standings
        wins: standing.wins,
        losses: standing.losses,
        draws: standing.draws,
        matchPoints: standing.matchPoints,
        gameWinPercentage: Math.round(standing.gameWinPercentage * 100) / 100,
        opponentMatchWinPercentage: Math.round(standing.opponentMatchWinPercentage * 100) / 100,
        isEliminated: standing.isEliminated
      } : null,
      finalStatistics: tournamentStats ? {
        finalRanking: tournamentStats.finalRanking,
        wins: tournamentStats.wins,
        losses: tournamentStats.losses,
        draws: tournamentStats.draws,
        matchPoints: tournamentStats.matchPoints,
        tiebreakers: tournamentStats.tiebreakers
      } : null,
      matchSummary: {
        totalMatches: matchHistory.length,
        completedMatches: completedMatches.length,
        wins,
        losses,
        draws,
        winRate: completedMatches.length > 0 ? Math.round((wins / completedMatches.length) * 100) / 100 : 0,
        gameWinRate: Math.round(gameWinRate * 100) / 100
      },
      matchHistory,
      performanceByRound: Object.entries(performanceByRound).map(([round, stats]) => ({
        round: parseInt(round),
        ...stats
      }))
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });

    logPerformance(`GET /api/tournaments/${id}/players/${playerId}/statistics`, performance.now() - startTime);
    return response;
  } catch (e: unknown) {
    console.error('Error getting player tournament statistics:', e);
    logPerformance(`GET /api/tournaments/${id}/players/${playerId}/statistics`, performance.now() - startTime);
    const message = e instanceof Error ? e.message : typeof e === 'string' ? e : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), { status: 500 });
  }
}
