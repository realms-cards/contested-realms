import { NextRequest } from 'next/server';
import { getServerAuthSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

// POST /api/tournaments/[id]/leave
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
      return new Response(JSON.stringify({ error: 'Cannot leave tournament in progress' }), { status: 400 });
    }

    // Check if registered
    const registration = tournament.registrations.find(reg => reg.playerId === session.user!.id);
    if (!registration) {
      return new Response(JSON.stringify({ error: 'Not registered for this tournament' }), { status: 400 });
    }

    // Remove registration and standing
    await prisma.$transaction([
      prisma.tournamentRegistration.delete({
        where: { id: registration.id }
      }),
      prisma.playerStanding.deleteMany({
        where: {
          tournamentId: id,
          playerId: session.user!.id
        }
      })
    ]);

    return new Response(JSON.stringify({
      success: true,
      playerId: session.user!.id
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : typeof e === 'string' ? e : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), { status: 500 });
  }
}