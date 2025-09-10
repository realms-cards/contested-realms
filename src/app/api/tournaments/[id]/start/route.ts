import { NextRequest } from 'next/server';
import { getServerAuthSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { generatePairings, createRoundMatches } from '@/lib/tournament/pairing';

export const dynamic = 'force-dynamic';

// POST /api/tournaments/[id]/start
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getServerAuthSession();
  if (!session?.user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  try {
    const tournament = await prisma.tournament.findUnique({
      where: { id },
      include: { registrations: true }
    });

    if (!tournament) {
      return new Response(JSON.stringify({ error: 'Tournament not found' }), { status: 404 });
    }

    // Only tournament creator can start the tournament
    if (tournament.creatorId !== session.user.id) {
      return new Response(JSON.stringify({ error: 'Only tournament creator can start the tournament' }), { status: 403 });
    }

    if (tournament.status !== 'registering') {
      return new Response(JSON.stringify({ error: 'Tournament already started' }), { status: 400 });
    }

    if (tournament.registrations.length < 2) {
      return new Response(JSON.stringify({ error: 'Need at least 2 players to start tournament' }), { status: 400 });
    }

    // Check if all players are ready
    const unreadyPlayers = tournament.registrations.filter(reg => !reg.ready);
    if (unreadyPlayers.length > 0) {
      return new Response(JSON.stringify({ 
        error: `Cannot start tournament - ${unreadyPlayers.length} players not ready` 
      }), { status: 400 });
    }

    // Determine next status based on match type
    let nextStatus: 'draft_phase' | 'sealed_phase' | 'playing' = 'playing';
    if (tournament.matchType === 'draft') {
      nextStatus = 'draft_phase';
    } else if (tournament.matchType === 'sealed') {
      nextStatus = 'sealed_phase';
    }

    // Start tournament
    const updatedTournament = await prisma.tournament.update({
      where: { id },
      data: {
        status: nextStatus,
        currentRound: nextStatus === 'playing' ? 1 : 0
      }
    });

    // If going straight to playing (constructed), create first round with matches
    if (nextStatus === 'playing') {
      // Create the round
      const newRound = await prisma.tournamentRound.create({
        data: {
          tournamentId: id,
          roundNumber: 1,
          status: 'pending'
        }
      });

      // Generate pairings for the first round
      const pairings = await generatePairings(id, 1);

      // Create matches for the round
      const matchIds = await createRoundMatches(id, newRound.id, pairings);

      console.log(`Created ${matchIds.length} matches for tournament ${id}, round 1`);
    }

    return new Response(JSON.stringify({
      success: true,
      tournamentId: id,
      status: updatedTournament.status,
      currentRound: updatedTournament.currentRound
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : typeof e === 'string' ? e : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), { status: 500 });
  }
}