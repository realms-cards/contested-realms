import { NextRequest } from 'next/server';
import { getServerAuthSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { tournamentSocketService } from '@/lib/services/tournament-broadcast';
import { generatePairings, createRoundMatches } from '@/lib/tournament/pairing';

export const dynamic = 'force-dynamic';

// POST /api/tournaments/[id]/next-round
// Advances tournament to next round and generates pairings
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getServerAuthSession();
  if (!session?.user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  try {
    const tournament = await prisma.tournament.findUnique({
      where: { id },
      include: {
        rounds: {
          orderBy: { roundNumber: 'desc' },
          take: 1
        }
      }
    });

    if (!tournament) {
      return new Response(JSON.stringify({ error: 'Tournament not found' }), { status: 404 });
    }

    if (tournament.status !== 'active') {
      return new Response(JSON.stringify({ error: 'Tournament must be in active status' }), { status: 400 });
    }

    // Calculate next round number from existing rounds
    const maxRound = tournament.rounds.length > 0 ? Math.max(...tournament.rounds.map(r => r.roundNumber)) : 0;
    const nextRoundNumber = maxRound + 1;

    // Check if current round is complete (if any)
    if (tournament.rounds.length > 0) {
      const currentRound = tournament.rounds[0];
      const pendingMatches = await prisma.match.count({
        where: {
          roundId: currentRound.id,
          status: { in: ['pending', 'active'] }
        }
      });

      if (pendingMatches > 0) {
        return new Response(JSON.stringify({ error: 'Current round is not complete' }), { status: 400 });
      }
    }

    // Create new round
    const newRound = await prisma.tournamentRound.create({
      data: {
        tournamentId: id,
        roundNumber: nextRoundNumber,
        status: 'pending'
      }
    });

    // Generate pairings
    const pairings = await generatePairings(id);

    // Create matches
    const matchIds = await createRoundMatches(id, newRound.id, pairings);

    // Update round status to active
    await prisma.tournamentRound.update({
      where: { id: newRound.id },
      data: {
        status: 'active',
        startedAt: new Date()
      }
    });

    // Get match data for broadcasting
    const roundMatches = await prisma.match.findMany({
      where: { roundId: newRound.id }
    });

    // Get player names for the matches
    const allPlayerIds = roundMatches.flatMap(match => 
      Array.isArray(match.players) ? match.players.filter(id => typeof id === 'string') as string[] : []
    );
    
    const players = await prisma.user.findMany({
      where: { id: { in: allPlayerIds } },
      select: { id: true, name: true }
    });
    
    const playerNameMap = new Map(players.map(p => [p.id, p.name]));

    const matchData = roundMatches.map(match => {
      const playerArray = Array.isArray(match.players) ? match.players as string[] : [];
      const player1Id = playerArray[0] || '';
      const player2Id = playerArray.length > 1 ? playerArray[1] : null;
      
      return {
        id: match.id,
        player1Id,
        player1Name: playerNameMap.get(player1Id) || 'Unknown Player',
        player2Id,
        player2Name: player2Id ? playerNameMap.get(player2Id) || 'Unknown Player' : null
      };
    });

    // Broadcast round started event via Socket.io
    try {
      await tournamentSocketService.broadcastRoundStarted(
        id,
        nextRoundNumber,
        matchData
      );

      // Broadcast tournament update so UI refreshes automatically
      await tournamentSocketService.broadcastTournamentUpdateById(id);

      // Additionally, send MATCH_ASSIGNED to each participant of created matches
      const t = await prisma.tournament.findUnique({ where: { id }, select: { name: true } });
      const lobbyName = t?.name || 'Tournament Match';
      for (const m of matchData) {
        if (m.player1Id) {
          await tournamentSocketService.broadcastMatchAssigned(id, m.player1Id, {
            matchId: m.id,
            opponentId: m.player2Id,
            opponentName: m.player2Name,
            lobbyName,
          });
        }
        if (m.player2Id) {
          await tournamentSocketService.broadcastMatchAssigned(id, m.player2Id, {
            matchId: m.id,
            opponentId: m.player1Id,
            opponentName: m.player1Name,
            lobbyName,
          });
        }
      }
    } catch (socketError) {
      console.warn('Failed to broadcast round started event:', socketError);
      // Don't fail the request if socket broadcast fails
    }

    return new Response(JSON.stringify({
      success: true,
      roundNumber: nextRoundNumber,
      roundId: newRound.id,
      matchIds,
      pairings: {
        matches: pairings.matches.length,
        byes: pairings.byes.length
      }
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : typeof e === 'string' ? e : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), { status: 500 });
  }
}
