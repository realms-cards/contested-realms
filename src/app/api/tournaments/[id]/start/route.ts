import { NextRequest } from 'next/server';
import { getServerAuthSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

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

    if (tournament.status !== 'registering') {
      return new Response(JSON.stringify({ error: 'Tournament already started' }), { status: 400 });
    }

    if (tournament.registrations.length < 2) {
      return new Response(JSON.stringify({ error: 'Need at least 2 players to start tournament' }), { status: 400 });
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

    // If going straight to playing (constructed), create first round
    if (nextStatus === 'playing') {
      // TODO: Implement pairing logic in next task
      // For now, just create the round without matches
      await prisma.tournamentRound.create({
        data: {
          tournamentId: id,
          roundNumber: 1,
          status: 'pending'
        }
      });
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