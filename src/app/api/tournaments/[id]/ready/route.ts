import { NextRequest } from 'next/server';
import { getServerAuthSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

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
    const body = await req.json();
    const ready = Boolean(body.ready);
    
    console.log(`Tournament ready toggle: ${id}, user: ${session.user.id}, ready: ${ready}`);
    
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
    const registration = tournament.registrations.find(reg => reg.playerId === session.user!.id);
    if (!registration) {
      return new Response(JSON.stringify({ error: 'Not registered for this tournament' }), { status: 400 });
    }

    // Update ready status
    await prisma.tournamentRegistration.update({
      where: { id: registration.id },
      data: { ready }
    });

    console.log(`Tournament ready status updated: ${session.user.id} -> ${ready}`);

    return new Response(JSON.stringify({
      success: true,
      playerId: session.user!.id,
      ready,
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