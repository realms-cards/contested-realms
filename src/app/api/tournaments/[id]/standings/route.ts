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

    // Update standings based on match results
    for (const result of matchResults) {
      const { winnerId, loserId, isDraw, gameWins, gameLosses } = result;

      if (isDraw) {
        // Update both players for draw
        await updatePlayerStanding(id, winnerId, { draws: 1, matchPoints: 1 });
        await updatePlayerStanding(id, loserId, { draws: 1, matchPoints: 1 });
      } else if (winnerId && loserId) {
        // Update winner and loser
        await updatePlayerStanding(id, winnerId, { 
          wins: 1, 
          matchPoints: 3,
          gameWins: gameWins || 2,
          gameLosses: gameLosses || 0
        });
        await updatePlayerStanding(id, loserId, { 
          losses: 1, 
          matchPoints: 0,
          gameWins: gameLosses || 0,
          gameLosses: gameWins || 2
        });
      }
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

// Helper function to update player standing
async function updatePlayerStanding(
  tournamentId: string, 
  playerId: string, 
  updates: {
    wins?: number;
    losses?: number; 
    draws?: number;
    matchPoints?: number;
    gameWins?: number;
    gameLosses?: number;
  }
) {
  const currentStanding = await prisma.playerStanding.findUnique({
    where: {
      tournamentId_playerId: {
        tournamentId,
        playerId
      }
    }
  });

  if (!currentStanding) return;

  await prisma.playerStanding.update({
    where: {
      tournamentId_playerId: {
        tournamentId,
        playerId
      }
    },
    data: {
      wins: currentStanding.wins + (updates.wins || 0),
      losses: currentStanding.losses + (updates.losses || 0),
      draws: currentStanding.draws + (updates.draws || 0),
      matchPoints: currentStanding.matchPoints + (updates.matchPoints || 0)
    }
  });
}

// Helper function to recalculate tiebreakers
async function recalculateTiebreakers(tournamentId: string) {
  const standings = await prisma.playerStanding.findMany({
    where: { tournamentId }
  });

  // Calculate game win percentages and opponent match win percentages
  for (const standing of standings) {
    const totalGames = standing.wins * 2 + standing.losses * 2 + standing.draws * 2;
    const gameWins = standing.wins * 2 + standing.draws;
    const gameWinPercentage = totalGames > 0 ? Math.max(0.33, gameWins / totalGames) : 0.33;

    // For opponent match win percentage, we'd need to analyze actual matches
    // For now, use a placeholder calculation
    const opponentMatchWinPercentage = 0.5;

    await prisma.playerStanding.update({
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
  }
}