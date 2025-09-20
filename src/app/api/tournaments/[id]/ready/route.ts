import { NextRequest } from 'next/server';
import { getServerAuthSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { tournamentSocketService } from '@/lib/services/tournament-socket-service';

export const dynamic = 'force-dynamic';

// POST /api/tournaments/[id]/ready
// Toggle player ready status in a tournament
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getServerAuthSession();
  if (!session?.user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  try {
    const userId = session.user.id;
    const body = await req.json();
    const ready = Boolean(body.ready);
    
    console.log(`Tournament ready toggle: ${id}, user: ${userId}, ready: ${ready}`);
    
    // Check if tournament exists and is in registration phase
    const tournament = await prisma.tournament.findUnique({
      where: { id },
      include: { registrations: true }
    });

    if (!tournament) {
      return new Response(JSON.stringify({ error: 'Tournament not found' }), { status: 404 });
    }

    if (tournament.status !== 'registering') {
      return new Response(JSON.stringify({ error: 'Tournament is not in registration phase' }), { status: 400 });
    }

    // Check if user is registered for this tournament
    const registration = tournament.registrations.find(reg => reg.playerId === userId);
    if (!registration) {
      return new Response(JSON.stringify({ error: 'Not registered for this tournament' }), { status: 400 });
    }

    // Note: ready field doesn't exist in current schema
    // This would require adding ready field to TournamentRegistration model
    // For now, we'll use preparationData to store ready status
    await prisma.tournamentRegistration.update({
      where: { id: registration.id },
      data: { 
        preparationData: { ready }
      }
    });

    console.log(`Tournament ready status updated: ${userId} -> ${ready}`);

    // Get updated ready player count
    const updatedRegistrations = await prisma.tournamentRegistration.findMany({
      where: { tournamentId: id },
      select: { preparationData: true }
    });

    const readyPlayerCount = updatedRegistrations.filter(reg => {
      const prepData = reg.preparationData as Record<string, unknown> | null;
      return prepData?.ready;
    }).length;

    // Broadcast preparation update via Socket.io
    try {
      await tournamentSocketService.broadcastPreparationUpdate(
        id,
        userId,
        ready ? 'ready' : 'not-ready',
        readyPlayerCount,
        updatedRegistrations.length,
        false
      );
      // Also broadcast a full tournament snapshot to refresh lists
      await tournamentSocketService.broadcastTournamentUpdateById(id);
    } catch (socketError) {
      console.warn('Failed to broadcast preparation update:', socketError);
      // Don't fail the request if socket broadcast fails
    }

    return new Response(JSON.stringify({
      success: true,
      playerId: userId,
      ready,
      readyPlayerCount,
      message: ready ? 'You are now ready' : 'Ready status removed'
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
  } catch (e: unknown) {
    console.error('Error toggling tournament ready status:', e);
    const message = e instanceof Error ? e.message : typeof e === 'string' ? e : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), { status: 500 });
  }
}
