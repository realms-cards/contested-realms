import { NextRequest } from 'next/server';
import { getServerAuthSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { tournamentSocketService } from '@/lib/services/tournament-socket-service';

export const dynamic = 'force-dynamic';

// POST /api/tournaments/[id]/end
// Ends a tournament (only for tournament creator)
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getServerAuthSession();
  if (!session?.user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  try {
    const tournament = await prisma.tournament.findUnique({
      where: { id },
      select: { id: true, creatorId: true, status: true, name: true }
    });

    if (!tournament) {
      return new Response(JSON.stringify({ error: 'Tournament not found' }), { status: 404 });
    }

    // Only tournament creator can end the tournament
    if (tournament.creatorId !== session.user.id) {
      return new Response(JSON.stringify({ error: 'Only tournament creator can end the tournament' }), { status: 403 });
    }

    // Can't end already completed tournaments
    if (tournament.status === 'completed') {
      return new Response(JSON.stringify({ error: 'Tournament is already completed' }), { status: 400 });
    }

    // Update tournament status to completed
    const updatedTournament = await prisma.tournament.update({
      where: { id },
      data: { 
        status: 'completed',
        completedAt: new Date()
      }
    });

    // Broadcast tournament ended event via Socket.io
    try {
      await tournamentSocketService.broadcastPhaseChanged(
        id,
        'completed',
        {
          previousStatus: tournament.status,
          completedAt: updatedTournament.completedAt?.toISOString(),
          endedBy: 'creator',
          message: `Tournament "${tournament.name}" has been ended by the creator`
        }
      );
    } catch (socketError) {
      console.warn('Failed to broadcast tournament ended event:', socketError);
      // Don't fail the request if socket broadcast fails
    }

    return new Response(JSON.stringify({
      success: true,
      message: `Tournament "${tournament.name}" has been ended`,
      tournamentId: id,
      status: updatedTournament.status
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
  } catch (e: unknown) {
    console.error('Error ending tournament:', e);
    const message = e instanceof Error ? e.message : typeof e === 'string' ? e : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), { status: 500 });
  }
}