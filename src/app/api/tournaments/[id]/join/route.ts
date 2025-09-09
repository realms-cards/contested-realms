import { NextRequest } from 'next/server';
import { getServerAuthSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

// POST /api/tournaments/[id]/join
// Body: { displayName?: string }
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getServerAuthSession();
  if (!session?.user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  try {
    const body = await req.json();
    
    // Get user info for display name fallback
    const user = await prisma.user.findUnique({
      where: { id: session.user!.id },
      select: { name: true, email: true }
    });
    
    const displayName = String(
      body?.displayName || 
      user?.name || 
      (user?.email ? user.email.split('@')[0] : null) || 
      'Anonymous'
    ).trim();

    const tournament = await prisma.tournament.findUnique({
      where: { id },
      include: { registrations: true }
    });

    if (!tournament) {
      return new Response(JSON.stringify({ error: 'Tournament not found' }), { status: 404 });
    }

    if (tournament.status !== 'registering') {
      return new Response(JSON.stringify({ error: 'Tournament registration is closed' }), { status: 400 });
    }

    if (tournament.registrations.length >= tournament.maxPlayers) {
      return new Response(JSON.stringify({ error: 'Tournament is full' }), { status: 400 });
    }

    // Check if already registered
    const existingRegistration = tournament.registrations.find(reg => reg.playerId === session.user!.id);
    if (existingRegistration) {
      return new Response(JSON.stringify({ error: 'Already registered for this tournament' }), { status: 400 });
    }

    // Create registration
    const registration = await prisma.tournamentRegistration.create({
      data: {
        tournamentId: id,
        playerId: session.user!.id,
        displayName
      }
    });

    // Create initial standing
    await prisma.playerStanding.create({
      data: {
        tournamentId: id,
        playerId: session.user!.id,
        displayName
      }
    });

    return new Response(JSON.stringify({
      success: true,
      registrationId: registration.id,
      playerId: session.user!.id,
      displayName
    }), {
      status: 201,
      headers: { 'content-type': 'application/json' }
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : typeof e === 'string' ? e : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), { status: 500 });
  }
}