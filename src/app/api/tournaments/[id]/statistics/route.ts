import { NextRequest } from 'next/server';
import { getServerAuthSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

// GET /api/tournaments/[id]/statistics
// Get tournament statistics and final standings
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getServerAuthSession();
  if (!session?.user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  try {
    // Get tournament details
    const tournament = await prisma.tournament.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        format: true,
        status: true,
        maxPlayers: true,
        createdAt: true,
        startedAt: true,
        completedAt: true,
        creator: {
          select: { name: true }
        }
      }
    });

    if (!tournament) {
      return new Response(JSON.stringify({ error: 'Tournament not found' }), { status: 404 });
    }

    // Get player standings
    const standings = await prisma.playerStanding.findMany({
      where: { tournamentId: id },
      include: {
        player: {
          select: { name: true, image: true }
        }
      },
      orderBy: [
        { matchPoints: 'desc' },
        { gameWinPercentage: 'desc' },
        { opponentMatchWinPercentage: 'desc' }
      ]
    });

    // Get tournament statistics
    const statistics = await prisma.tournamentStatistics.findMany({
      where: { tournamentId: id },
      include: {
        player: {
          select: { name: true, image: true }
        }
      },
      orderBy: { finalRanking: 'asc' }
    });

    // Get rounds and matches with player data
    const rounds = await prisma.tournamentRound.findMany({
      where: { tournamentId: id },
      include: {
        matches: {
          include: {
            tournament: { select: { name: true } }
          },
          orderBy: { createdAt: 'asc' }
        }
      },
      orderBy: { roundNumber: 'asc' }
    });

    // Calculate additional statistics
    const totalPlayers = standings.length;
    const totalRounds = rounds.length;
    const totalMatches = rounds.reduce((sum, round) => sum + round.matches.length, 0);
    
    // Calculate format-specific stats
    const formatStats = {
      averageMatchLength: 0, // Would need match duration data
      mostCommonResult: 'Unknown', // Would need match result analysis
      dropoutRate: standings.filter(s => s.isEliminated).length / totalPlayers
    };

    // Get top performers
    const topPerformers = standings.slice(0, 3).map((standing, index) => ({
      rank: index + 1,
      playerId: standing.playerId,
      playerName: standing.player.name,
      playerImage: standing.player.image,
      wins: standing.wins,
      losses: standing.losses,
      draws: standing.draws,
      matchPoints: standing.matchPoints,
      gameWinPercentage: standing.gameWinPercentage
    }));

    return new Response(JSON.stringify({
      tournament: {
        id: tournament.id,
        name: tournament.name,
        format: tournament.format,
        status: tournament.status,
        maxPlayers: tournament.maxPlayers,
        creatorName: tournament.creator.name,
        createdAt: tournament.createdAt.toISOString(),
        startedAt: tournament.startedAt?.toISOString() || null,
        completedAt: tournament.completedAt?.toISOString() || null,
        duration: tournament.startedAt && tournament.completedAt 
          ? tournament.completedAt.getTime() - tournament.startedAt.getTime()
          : null
      },
      overview: {
        totalPlayers,
        totalRounds,
        totalMatches,
        completedMatches: rounds.reduce((sum, round) => 
          sum + round.matches.filter(m => m.results !== null).length, 0
        ),
        dropoutRate: formatStats.dropoutRate
      },
      standings: standings.map((standing, index) => ({
        rank: index + 1,
        playerId: standing.playerId,
        playerName: standing.player.name,
        playerImage: standing.player.image,
        wins: standing.wins,
        losses: standing.losses,
        draws: standing.draws,
        matchPoints: standing.matchPoints,
        gameWinPercentage: standing.gameWinPercentage,
        opponentMatchWinPercentage: standing.opponentMatchWinPercentage,
        isEliminated: standing.isEliminated
      })),
      topPerformers,
      rounds: rounds.map(round => ({
        id: round.id,
        roundNumber: round.roundNumber,
        status: round.status,
        startedAt: round.startedAt?.toISOString() || null,
        completedAt: round.completedAt?.toISOString() || null,
        matchCount: round.matches.length,
        completedMatches: round.matches.filter(m => m.results !== null).length,
        matches: round.matches.map(match => {
          const players = match.players as Array<{ id: string; name: string }>;
          const results = match.results as { winnerId?: string; isDraw?: boolean; gameResults?: Array<{ winner: string }> } | null;

          return {
            id: match.id,
            status: match.status,
            players: players.map(p => ({
              id: p.id,
              name: p.name
            })),
            winnerId: results?.winnerId || null,
            isDraw: results?.isDraw || false,
            gameCount: results?.gameResults?.length || 0,
            startedAt: match.startedAt?.toISOString() || null,
            completedAt: match.completedAt?.toISOString() || null
          };
        })
      })),
      finalStatistics: statistics.map(stat => ({
        playerId: stat.playerId,
        playerName: stat.player.name,
        playerImage: stat.player.image,
        wins: stat.wins,
        losses: stat.losses,
        draws: stat.draws,
        matchPoints: stat.matchPoints,
        finalRanking: stat.finalRanking,
        tiebreakers: stat.tiebreakers
      })),
      formatStats
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
  } catch (e: unknown) {
    console.error('Error getting tournament statistics:', e);
    const message = e instanceof Error ? e.message : typeof e === 'string' ? e : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), { status: 500 });
  }
}