import { NextRequest } from 'next/server';
import { getServerAuthSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

// PATCH /api/tournaments/invitations/[invitationId]
// Body: { action: 'accept' | 'decline' }
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ invitationId: string }> }
) {
  const session = await getServerAuthSession();
  if (!session?.user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  try {
    const { invitationId } = await params;
    const body = await req.json();
    const action = body.action as 'accept' | 'decline' | undefined;

    if (!action || !['accept', 'decline'].includes(action)) {
      return new Response(JSON.stringify({ error: 'Invalid action. Must be "accept" or "decline"' }), { status: 400 });
    }

    // Get invitation with tournament details
    const invitation = await prisma.tournamentInvitation.findUnique({
      where: { id: invitationId },
      include: {
        tournament: {
          select: {
            id: true,
            name: true,
            status: true,
            maxPlayers: true,
            registrations: { select: { playerId: true } }
          }
        }
      }
    });

    if (!invitation) {
      return new Response(JSON.stringify({ error: 'Invitation not found' }), { status: 404 });
    }

    if (invitation.inviteeId !== session.user.id) {
      return new Response(JSON.stringify({ error: 'This invitation is not for you' }), { status: 403 });
    }

    if (invitation.status !== 'pending') {
      return new Response(JSON.stringify({ error: `Invitation already ${invitation.status}` }), { status: 400 });
    }

    if (invitation.tournament.status !== 'registering') {
      return new Response(JSON.stringify({ error: 'Tournament registration is closed' }), { status: 400 });
    }

    if (action === 'accept') {
      // Check if tournament is full
      if (invitation.tournament.registrations.length >= invitation.tournament.maxPlayers) {
        // Mark invitation as expired
        await prisma.tournamentInvitation.update({
          where: { id: invitationId },
          data: {
            status: 'expired',
            respondedAt: new Date()
          }
        });
        return new Response(JSON.stringify({ error: 'Tournament is full' }), { status: 400 });
      }

      // Check if user is already registered
      const userId = session.user?.id;
      if (!userId) {
        return new Response(JSON.stringify({ error: 'User ID not found' }), { status: 401 });
      }

      const isRegistered = invitation.tournament.registrations.some(r => r.playerId === userId);
      if (isRegistered) {
        await prisma.tournamentInvitation.update({
          where: { id: invitationId },
          data: {
            status: 'accepted',
            respondedAt: new Date()
          }
        });
        return new Response(JSON.stringify({ error: 'Already registered for this tournament' }), { status: 400 });
      }

      // Check if user is already in another active tournament (one lobby rule)
      const existingTournamentRegistrations = await prisma.tournamentRegistration.findMany({
        where: {
          playerId: userId,
          tournament: {
            status: { in: ['registering', 'preparing', 'active'] }
          }
        },
        include: { tournament: { select: { name: true } } }
      });

      if (existingTournamentRegistrations.length > 0) {
        const tournamentName = existingTournamentRegistrations[0].tournament.name;
        return new Response(JSON.stringify({
          error: `You are already in tournament "${tournamentName}". Leave that tournament before joining another.`
        }), { status: 400 });
      }

      // Accept invitation and register player
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { name: true, email: true }
      });

      const displayName = user?.name || (user?.email ? user.email.split('@')[0] : null) || 'Player';

      await prisma.$transaction([
        prisma.tournamentInvitation.update({
          where: { id: invitationId },
          data: {
            status: 'accepted',
            respondedAt: new Date()
          }
        }),
        prisma.tournamentRegistration.create({
          data: {
            tournamentId: invitation.tournamentId,
            playerId: userId
          }
        }),
        prisma.playerStanding.create({
          data: {
            tournamentId: invitation.tournamentId,
            playerId: userId,
            displayName
          }
        })
      ]);

      return new Response(JSON.stringify({
        success: true,
        message: 'Invitation accepted and registered for tournament',
        tournamentId: invitation.tournamentId
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    } else {
      // Decline invitation
      await prisma.tournamentInvitation.update({
        where: { id: invitationId },
        data: {
          status: 'declined',
          respondedAt: new Date()
        }
      });

      return new Response(JSON.stringify({
        success: true,
        message: 'Invitation declined'
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    }
  } catch (e: unknown) {
    console.error('Error responding to invitation:', e);
    const message = e instanceof Error ? e.message : typeof e === 'string' ? e : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), { status: 500 });
  }
}

// DELETE /api/tournaments/invitations/[invitationId]
// Cancel/revoke an invitation (creator only)
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ invitationId: string }> }
) {
  const session = await getServerAuthSession();
  if (!session?.user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  try {
    const { invitationId } = await params;

    const invitation = await prisma.tournamentInvitation.findUnique({
      where: { id: invitationId },
      include: {
        tournament: {
          select: { creatorId: true }
        }
      }
    });

    if (!invitation) {
      return new Response(JSON.stringify({ error: 'Invitation not found' }), { status: 404 });
    }

    if (invitation.tournament.creatorId !== session.user.id) {
      return new Response(JSON.stringify({ error: 'Only tournament creator can revoke invitations' }), { status: 403 });
    }

    await prisma.tournamentInvitation.delete({
      where: { id: invitationId }
    });

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
  } catch (e: unknown) {
    console.error('Error deleting invitation:', e);
    const message = e instanceof Error ? e.message : typeof e === 'string' ? e : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), { status: 500 });
  }
}
