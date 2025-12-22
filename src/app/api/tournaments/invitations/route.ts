import { InvitationStatus } from '@prisma/client';
import { NextRequest } from 'next/server';
import { getServerAuthSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { countActiveSeats } from '@/lib/tournament/registration';

export const dynamic = 'force-dynamic';

// GET /api/tournaments/invitations
// Returns all invitations for the current user
export async function GET(req: NextRequest) {
  const session = await getServerAuthSession();
  if (!session?.user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  try {
    const url = new URL(req.url);
    const statusParam = url.searchParams.get('status'); // pending, accepted, declined, expired

    const where: {
      inviteeId: string;
      status?: InvitationStatus;
    } = {
      inviteeId: session.user.id
    };

    if (statusParam && ['pending', 'accepted', 'declined', 'expired'].includes(statusParam)) {
      where.status = statusParam as InvitationStatus;
    }

    const invitations = await prisma.tournamentInvitation.findMany({
      where,
      include: {
        tournament: {
          select: {
            id: true,
            name: true,
            format: true,
            status: true,
            maxPlayers: true,
            createdAt: true,
            creator: {
              select: { id: true, name: true, image: true }
            },
            registrations: { select: { playerId: true, seatStatus: true } }
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    // Add currentPlayers count to each tournament
    const invitationsWithCount = invitations.map(inv => ({
      ...inv,
      tournament: {
        ...inv.tournament,
        currentPlayers: countActiveSeats(inv.tournament.registrations)
      }
    }));

    return new Response(JSON.stringify(invitationsWithCount), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
  } catch (e: unknown) {
    console.error('Error fetching invitations:', e);
    const message = e instanceof Error ? e.message : typeof e === 'string' ? e : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), { status: 500 });
  }
}
