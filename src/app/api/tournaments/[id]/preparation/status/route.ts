import { NextRequest } from 'next/server';
import { getServerAuthSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

// GET /api/tournaments/[id]/preparation/status
// Get preparation status for current player
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getServerAuthSession();
  if (!session?.user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  try {
    const registration = await prisma.tournamentRegistration.findFirst({
      where: {
        tournamentId: id,
        playerId: session.user.id
      },
      include: {
        tournament: {
          select: {
            format: true,
            status: true,
            settings: true
          }
        }
      }
    });

    if (!registration) {
      return new Response(JSON.stringify({ error: 'Not registered for this tournament' }), { status: 404 });
    }

    // Get all players' preparation status for coordination
    const allRegistrations = await prisma.tournamentRegistration.findMany({
      where: { tournamentId: id, seatStatus: 'active' },
      select: {
        playerId: true,
        preparationStatus: true,
        deckSubmitted: true,
        player: {
          select: { name: true }
        }
      }
    });

    const preparationSummary = {
      total: allRegistrations.length,
      notStarted: allRegistrations.filter(r => r.preparationStatus === 'notStarted').length,
      inProgress: allRegistrations.filter(r => r.preparationStatus === 'inProgress').length,
      completed: allRegistrations.filter(r => r.preparationStatus === 'completed').length,
      playersReady: allRegistrations.filter(r => r.deckSubmitted).length
    };

    const allPlayersReady = preparationSummary.completed === preparationSummary.total && 
                           preparationSummary.playersReady === preparationSummary.total;

    return new Response(JSON.stringify({
      playerId: session.user.id,
      tournamentId: id,
      format: registration.tournament.format,
      tournamentStatus: registration.tournament.status,
      preparationStatus: registration.preparationStatus,
      deckSubmitted: registration.deckSubmitted,
      preparationData: registration.preparationData,
      canStartMatch: allPlayersReady,
      preparationSummary,
      settings: registration.tournament.settings
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
  } catch (e: unknown) {
    console.error('Error getting preparation status:', e);
    const message = e instanceof Error ? e.message : typeof e === 'string' ? e : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), { status: 500 });
  }
}
