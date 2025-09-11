import { NextRequest } from 'next/server';
import { getServerAuthSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

// GET /api/tournaments/[id]/export
// Export tournament data in various formats
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getServerAuthSession();
  if (!session?.user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const format = searchParams.get('format') || 'json';

    // Get complete tournament data
    const tournament = await prisma.tournament.findUnique({
      where: { id },
      include: {
        creator: {
          select: { name: true, email: true }
        },
        registrations: {
          include: {
            player: {
              select: { name: true, email: true }
            }
          }
        },
        standings: {
          include: {
            player: {
              select: { name: true, email: true }
            }
          },
          orderBy: [
            { matchPoints: 'desc' },
            { gameWinPercentage: 'desc' },
            { opponentMatchWinPercentage: 'desc' }
          ]
        },
        rounds: {
          include: {
            matches: true
          },
          orderBy: { roundNumber: 'asc' }
        },
        matches: {
          include: {
            round: {
              select: { roundNumber: true }
            }
          },
          orderBy: [
            { round: { roundNumber: 'asc' } },
            { createdAt: 'asc' }
          ]
        },
        statistics: {
          include: {
            player: {
              select: { name: true, email: true }
            }
          },
          orderBy: { finalRanking: 'asc' }
        }
      }
    });

    if (!tournament) {
      return new Response(JSON.stringify({ error: 'Tournament not found' }), { status: 404 });
    }

    // Only tournament creator can export data
    if (tournament.creatorId !== session.user.id) {
      return new Response(JSON.stringify({ error: 'Only tournament creator can export data' }), { status: 403 });
    }

    const exportData = {
      tournament: {
        id: tournament.id,
        name: tournament.name,
        format: tournament.format,
        status: tournament.status,
        maxPlayers: tournament.maxPlayers,
        settings: tournament.settings,
        createdAt: tournament.createdAt.toISOString(),
        startedAt: tournament.startedAt?.toISOString() || null,
        completedAt: tournament.completedAt?.toISOString() || null,
        creator: tournament.creator
      },
      participants: tournament.registrations.map(reg => ({
        playerId: reg.playerId,
        playerName: reg.player.name,
        playerEmail: reg.player.email,
        registeredAt: reg.registeredAt.toISOString(),
        preparationStatus: reg.preparationStatus,
        deckSubmitted: reg.deckSubmitted
      })),
      finalStandings: tournament.standings.map((standing, index) => ({
        rank: index + 1,
        playerId: standing.playerId,
        playerName: standing.player.name,
        wins: standing.wins,
        losses: standing.losses,
        draws: standing.draws,
        matchPoints: standing.matchPoints,
        gameWinPercentage: standing.gameWinPercentage,
        opponentMatchWinPercentage: standing.opponentMatchWinPercentage,
        isEliminated: standing.isEliminated
      })),
      rounds: tournament.rounds.map(round => ({
        roundNumber: round.roundNumber,
        status: round.status,
        startedAt: round.startedAt?.toISOString() || null,
        completedAt: round.completedAt?.toISOString() || null,
        pairingData: round.pairingData,
        matches: round.matches.map(match => ({
          id: match.id,
          status: match.status,
          players: match.players,
          results: match.results,
          startedAt: match.startedAt?.toISOString() || null,
          completedAt: match.completedAt?.toISOString() || null
        }))
      })),
      matchHistory: tournament.matches.map(match => ({
        id: match.id,
        roundNumber: match.round?.roundNumber || null,
        status: match.status,
        players: match.players,
        results: match.results,
        startedAt: match.startedAt?.toISOString() || null,
        completedAt: match.completedAt?.toISOString() || null,
        createdAt: match.createdAt.toISOString()
      })),
      finalStatistics: tournament.statistics.map(stat => ({
        playerId: stat.playerId,
        playerName: stat.player.name,
        finalRanking: stat.finalRanking,
        wins: stat.wins,
        losses: stat.losses,
        draws: stat.draws,
        matchPoints: stat.matchPoints,
        tiebreakers: stat.tiebreakers
      })),
      exportMetadata: {
        exportedAt: new Date().toISOString(),
        exportedBy: session.user.id,
        format,
        version: '1.0'
      }
    };

    // Return data in requested format
    switch (format.toLowerCase()) {
      case 'csv':
        return generateCSVExport(exportData);
      case 'json':
      default:
        return new Response(JSON.stringify(exportData, null, 2), {
          status: 200,
          headers: { 
            'content-type': 'application/json',
            'content-disposition': `attachment; filename="tournament-${tournament.id}-export.json"`
          }
        });
    }
  } catch (e: unknown) {
    console.error('Error exporting tournament data:', e);
    const message = e instanceof Error ? e.message : typeof e === 'string' ? e : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), { status: 500 });
  }
}

// Helper function to generate CSV export
function generateCSVExport(exportData: Record<string, unknown>) {
  // Generate CSV for final standings
  const standings = exportData.finalStandings as Array<Record<string, unknown>>;
  
  const csvHeaders = ['Rank', 'Player Name', 'Wins', 'Losses', 'Draws', 'Match Points', 'Game Win %', 'Opponent Match Win %'];
  const csvRows = standings.map(standing => [
    standing.rank,
    `"${standing.playerName}"`,
    standing.wins,
    standing.losses,
    standing.draws,
    standing.matchPoints,
    Math.round((standing.gameWinPercentage as number) * 100) / 100,
    Math.round((standing.opponentMatchWinPercentage as number) * 100) / 100
  ]);

  const csvContent = [
    csvHeaders.join(','),
    ...csvRows.map(row => row.join(','))
  ].join('\n');

  return new Response(csvContent, {
    status: 200,
    headers: {
      'content-type': 'text/csv',
      'content-disposition': `attachment; filename="tournament-standings.csv"`
    }
  });
}