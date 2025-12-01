import { NextRequest } from 'next/server';
import { getServerAuthSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

// GET /api/tournaments/[id]/standings
// Get current tournament standings
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getServerAuthSession();
  if (!session?.user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  try {
    const tournament = await prisma.tournament.findUnique({
      where: { id },
      select: { status: true, name: true }
    });

    if (!tournament) {
      return new Response(JSON.stringify({ error: 'Tournament not found' }), { status: 404 });
    }

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

    return new Response(JSON.stringify({
      tournamentId: id,
      tournamentName: tournament.name,
      tournamentStatus: tournament.status,
      lastUpdated: new Date().toISOString(),
      standings: standings.map((standing, index) => ({
        rank: index + 1,
        playerId: standing.playerId,
        playerName: standing.displayName || standing.player.name,
        playerImage: standing.player.image,
        wins: standing.wins,
        losses: standing.losses,
        draws: standing.draws,
        matchPoints: standing.matchPoints,
        gameWinPercentage: Math.round(standing.gameWinPercentage * 100) / 100,
        opponentMatchWinPercentage: Math.round(standing.opponentMatchWinPercentage * 100) / 100,
        isEliminated: standing.isEliminated,
        currentMatchId: standing.currentMatchId
      }))
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
  } catch (e: unknown) {
    console.error('Error getting tournament standings:', e);
    const message = e instanceof Error ? e.message : typeof e === 'string' ? e : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), { status: 500 });
  }
}

// POST /api/tournaments/[id]/standings  
// Update standings after match results (internal use)
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getServerAuthSession();
  if (!session?.user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  try {
    const body = await req.json();
    const { matchResults } = body;

    if (!Array.isArray(matchResults)) {
      return new Response(JSON.stringify({ error: 'matchResults must be an array' }), { status: 400 });
    }

    // Verify tournament exists and user has permission
    const tournament = await prisma.tournament.findUnique({
      where: { id },
      select: { 
        status: true,
        creatorId: true,
        format: true
      }
    });

    if (!tournament) {
      return new Response(JSON.stringify({ error: 'Tournament not found' }), { status: 404 });
    }

    // Only tournament creator can update standings manually
    if (tournament.creatorId !== session.user.id) {
      return new Response(JSON.stringify({ error: 'Only tournament creator can update standings' }), { status: 403 });
    }

    // Batch all standing updates into a single transaction for performance
    // This reduces N×4 sequential queries to 1 transaction with N×2 operations
    const updateOperations = [];

    for (const result of matchResults) {
      const { winnerId, loserId, isDraw } = result;

      if (isDraw && winnerId && loserId) {
        // Both players get draw
        updateOperations.push(
          prisma.playerStanding.update({
            where: {
              tournamentId_playerId: { tournamentId: id, playerId: winnerId }
            },
            data: {
              draws: { increment: 1 },
              matchPoints: { increment: 1 }
            }
          })
        );
        updateOperations.push(
          prisma.playerStanding.update({
            where: {
              tournamentId_playerId: { tournamentId: id, playerId: loserId }
            },
            data: {
              draws: { increment: 1 },
              matchPoints: { increment: 1 }
            }
          })
        );
      } else if (winnerId && loserId) {
        // Winner gets 3 points, loser gets 0
        updateOperations.push(
          prisma.playerStanding.update({
            where: {
              tournamentId_playerId: { tournamentId: id, playerId: winnerId }
            },
            data: {
              wins: { increment: 1 },
              matchPoints: { increment: 3 }
            }
          })
        );
        updateOperations.push(
          prisma.playerStanding.update({
            where: {
              tournamentId_playerId: { tournamentId: id, playerId: loserId }
            },
            data: {
              losses: { increment: 1 }
            }
          })
        );
      }
    }

    // Execute all updates in a single transaction
    if (updateOperations.length > 0) {
      await prisma.$transaction(updateOperations);
    }

    // Recalculate win percentages and tiebreakers
    await recalculateTiebreakers(id);

    return new Response(JSON.stringify({
      success: true,
      message: 'Standings updated successfully'
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
  } catch (e: unknown) {
    console.error('Error updating tournament standings:', e);
    const message = e instanceof Error ? e.message : typeof e === 'string' ? e : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), { status: 500 });
  }
}

// Helper function to recalculate tiebreakers
// Optimized to batch all updates in a single transaction
async function recalculateTiebreakers(tournamentId: string) {
  const standings = await prisma.playerStanding.findMany({
    where: { tournamentId }
  });

  // Fetch completed matches to calculate opponent win percentages
  const matches = await prisma.match.findMany({
    where: {
      tournamentId,
      status: 'completed',
    },
    select: {
      players: true,
      results: true,
    }
  });

  // Build opponent map: playerId -> list of opponent IDs
  const opponentMap = new Map<string, string[]>();
  for (const match of matches) {
    const players = match.players as Array<{ id: string }>;
    if (players.length === 2) {
      const [p1, p2] = players;
      const p1Opponents = opponentMap.get(p1.id) || [];
      const p2Opponents = opponentMap.get(p2.id) || [];
      p1Opponents.push(p2.id);
      p2Opponents.push(p1.id);
      opponentMap.set(p1.id, p1Opponents);
      opponentMap.set(p2.id, p2Opponents);
    }
  }

  // Create standings lookup for match win percentage calculation
  const standingsByPlayer = new Map(
    standings.map(s => [
      s.playerId,
      {
        wins: s.wins,
        losses: s.losses,
        draws: s.draws,
        matchPoints: s.matchPoints,
      }
    ])
  );

  // Calculate game win percentages and opponent match win percentages
  const updateOperations = standings.map((standing) => {
    const totalGames = standing.wins * 2 + standing.losses * 2 + standing.draws * 2;
    const gameWins = standing.wins * 2 + standing.draws;
    const gameWinPercentage = totalGames > 0 ? Math.max(0.33, gameWins / totalGames) : 0.33;

    // Calculate opponent match win percentage (OMW%)
    // Average the match win % of all opponents this player has faced
    const opponents = opponentMap.get(standing.playerId) || [];
    let opponentMatchWinPercentage = 0.33; // Default minimum

    if (opponents.length > 0) {
      let totalOppMWP = 0;
      let validOpponents = 0;

      for (const oppId of opponents) {
        const oppStanding = standingsByPlayer.get(oppId);
        if (oppStanding) {
          const oppMatches = oppStanding.wins + oppStanding.losses + oppStanding.draws;
          if (oppMatches > 0) {
            const oppMWP = Math.max(0.33, oppStanding.matchPoints / (oppMatches * 3));
            totalOppMWP += oppMWP;
            validOpponents++;
          }
        }
      }

      if (validOpponents > 0) {
        opponentMatchWinPercentage = totalOppMWP / validOpponents;
      }
    }

    return prisma.playerStanding.update({
      where: {
        tournamentId_playerId: {
          tournamentId,
          playerId: standing.playerId
        }
      },
      data: {
        gameWinPercentage,
        opponentMatchWinPercentage
      }
    });
  });

  // Execute all tiebreaker updates in a single transaction
  if (updateOperations.length > 0) {
    await prisma.$transaction(updateOperations);
  }
}