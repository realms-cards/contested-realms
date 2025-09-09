import { NextRequest } from 'next/server';
import { getServerAuthSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

// GET /api/leaderboard/player/[id]
// Get detailed player statistics
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getServerAuthSession();
  if (!session?.user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  try {
    // Get player info
    const player = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        image: true
      }
    });

    if (!player) {
      return new Response(JSON.stringify({ error: 'Player not found' }), { status: 404 });
    }

    // Get all leaderboard entries for this player
    const leaderboardEntries = await prisma.leaderboardEntry.findMany({
      where: { playerId: id }
    });

    // Get recent match results
    const recentMatches = await prisma.matchResult.findMany({
      where: {
        OR: [
          { winnerId: id },
          { loserId: id }
        ]
      },
      orderBy: { completedAt: 'desc' },
      take: 20,
      include: {
        winner: {
          select: { id: true, name: true }
        },
        loser: {
          select: { id: true, name: true }
        }
      }
    });

    // Get tournament standings
    const tournamentStandings = await prisma.playerStanding.findMany({
      where: { playerId: id },
      include: {
        tournament: {
          select: {
            id: true,
            name: true,
            format: true,
            status: true
          }
        }
      },
      orderBy: {
        tournament: {
          createdAt: 'desc'
        }
      },
      take: 10
    });

    // Calculate overall stats
    const totalWins = leaderboardEntries.reduce((sum, entry) => sum + entry.wins, 0);
    const totalLosses = leaderboardEntries.reduce((sum, entry) => sum + entry.losses, 0);
    const totalDraws = leaderboardEntries.reduce((sum, entry) => sum + entry.draws, 0);
    const totalGames = totalWins + totalLosses + totalDraws;
    const overallWinRate = totalGames > 0 ? totalWins / totalGames : 0;

    const playerStats = {
      player: {
        id: player.id,
        name: player.name,
        image: player.image,
        memberSince: new Date().toISOString() // Placeholder since createdAt not selected
      },
      overallStats: {
        totalWins,
        totalLosses,
        totalDraws,
        totalGames,
        overallWinRate,
        tournamentWins: leaderboardEntries.reduce((sum, entry) => sum + entry.tournamentWins, 0)
      },
      leaderboardRankings: leaderboardEntries.map(entry => ({
        format: entry.format,
        timeFrame: entry.timeFrame,
        rank: entry.rank,
        rating: entry.rating,
        wins: entry.wins,
        losses: entry.losses,
        draws: entry.draws,
        winRate: entry.winRate,
        tournamentWins: entry.tournamentWins,
        lastActive: entry.lastActive.toISOString()
      })),
      recentMatches: recentMatches.map(match => ({
        id: match.id,
        matchId: match.matchId,
        lobbyName: match.lobbyName,
        format: match.format,
        isWin: match.winnerId === id,
        isDraw: match.isDraw,
        opponent: match.winnerId === id ? match.loser : match.winner,
        tournamentId: match.tournamentId,
        completedAt: match.completedAt.toISOString()
      })),
      tournamentHistory: tournamentStandings.map(standing => ({
        tournament: standing.tournament,
        wins: standing.wins,
        losses: standing.losses,
        draws: standing.draws,
        matchPoints: standing.matchPoints,
        finalRank: 0, // Placeholder since rank calculation would be complex
        isEliminated: standing.isEliminated
      }))
    };

    return new Response(JSON.stringify(playerStats), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : typeof e === 'string' ? e : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), { status: 500 });
  }
}