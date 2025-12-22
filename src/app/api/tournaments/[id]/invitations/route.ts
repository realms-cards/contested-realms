import { NextRequest } from 'next/server';
import { getServerAuthSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { TOURNAMENT_PLAYER_LIMITS } from '@/lib/tournament/constants';
import { countActiveSeats, getRegistrationSettings } from '@/lib/tournament/registration';

export const dynamic = 'force-dynamic';

// GET /api/tournaments/[id]/invitations
// Returns all invitations for a tournament (creator only)
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerAuthSession();
  if (!session?.user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  try {
    const { id: tournamentId } = await params;

    // Check if user is the tournament creator
    const tournament = await prisma.tournament.findUnique({
      where: { id: tournamentId },
      select: { creatorId: true, isPrivate: true }
    });

    if (!tournament) {
      return new Response(JSON.stringify({ error: 'Tournament not found' }), { status: 404 });
    }

    if (tournament.creatorId !== session.user.id) {
      return new Response(JSON.stringify({ error: 'Only tournament creator can view invitations' }), { status: 403 });
    }

    const invitations = await prisma.tournamentInvitation.findMany({
      where: { tournamentId },
      include: {
        invitee: {
          select: { id: true, name: true, email: true, image: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    return new Response(JSON.stringify(invitations), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
  } catch (e: unknown) {
    console.error('Error fetching invitations:', e);
    const message = e instanceof Error ? e.message : typeof e === 'string' ? e : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), { status: 500 });
  }
}

// POST /api/tournaments/[id]/invitations
// Body: { inviteeId: string } or { inviteeIds: string[] }
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerAuthSession();
  if (!session?.user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  try {
    const { id: tournamentId } = await params;
    const body = await req.json();

    // Support both single inviteeId and multiple inviteeIds
    const inviteeIds = body.inviteeIds
      ? (Array.isArray(body.inviteeIds) ? body.inviteeIds : [body.inviteeIds])
      : body.inviteeId
      ? [body.inviteeId]
      : [];

    if (inviteeIds.length === 0) {
      return new Response(JSON.stringify({ error: 'Missing inviteeId or inviteeIds' }), { status: 400 });
    }

    // Check if user is the tournament creator
    const tournament = await prisma.tournament.findUnique({
      where: { id: tournamentId },
      select: {
        creatorId: true,
        isPrivate: true,
        status: true,
        maxPlayers: true,
        settings: true,
        registrations: { select: { playerId: true, seatStatus: true } }
      }
    });

    if (!tournament) {
      return new Response(JSON.stringify({ error: 'Tournament not found' }), { status: 404 });
    }

    if (tournament.creatorId !== session.user.id) {
      return new Response(JSON.stringify({ error: 'Only tournament creator can send invitations' }), { status: 403 });
    }

    const registrationSettings = getRegistrationSettings(tournament.settings);
    const isOpenSeat = registrationSettings.mode === 'open';
    const isLocked = registrationSettings.locked;

    const canInviteNewSeat =
      isOpenSeat &&
      !isLocked &&
      (tournament.status === 'registering' || tournament.status === 'preparing');

    if (!isOpenSeat && tournament.status !== 'registering') {
      return new Response(JSON.stringify({ error: 'Cannot send invitations after registration closes' }), { status: 400 });
    }
    // Check if tournament is full
    if (!isOpenSeat && tournament.registrations.length >= tournament.maxPlayers) {
      return new Response(JSON.stringify({ error: 'Tournament is full' }), { status: 400 });
    }
    if (isOpenSeat) {
      const activeCount = countActiveSeats(tournament.registrations);
      const hasVacantSeat = tournament.registrations.some((reg) => reg.seatStatus === 'vacant');
      if (activeCount >= TOURNAMENT_PLAYER_LIMITS.MAX_PLAYERS) {
        return new Response(JSON.stringify({ error: 'Tournament is full' }), { status: 400 });
      }
      if (!canInviteNewSeat && !hasVacantSeat) {
        return new Response(
          JSON.stringify({
            error: isLocked ? 'Tournament registration is locked' : 'No vacant seats available'
          }),
          { status: 400 }
        );
      }
    }

    // Create invitations (skip duplicates)
    const createdInvitations = [];
    const errors = [];

    for (const inviteeId of inviteeIds) {
      try {
        // Check if user exists
        const invitee = await prisma.user.findUnique({
          where: { id: inviteeId },
          select: { id: true, name: true }
        });

        if (!invitee) {
          errors.push({ inviteeId, error: 'User not found' });
          continue;
        }

        // Check if already registered
        const isRegistered = tournament.registrations.some(r => r.playerId === inviteeId);
        if (isRegistered) {
          errors.push({ inviteeId, error: 'User already registered' });
          continue;
        }

        // Check if invitation already exists
        const existingInvitation = await prisma.tournamentInvitation.findUnique({
          where: {
            tournamentId_inviteeId: {
              tournamentId,
              inviteeId
            }
          }
        });

        if (existingInvitation) {
          if (existingInvitation.status === 'pending') {
            errors.push({ inviteeId, error: 'Invitation already sent' });
            continue;
          } else if (existingInvitation.status === 'declined') {
            // Update declined invitation to pending again
            const updated = await prisma.tournamentInvitation.update({
              where: { id: existingInvitation.id },
              data: {
                status: 'pending',
                respondedAt: null
              },
              include: {
                invitee: {
                  select: { id: true, name: true, email: true, image: true }
                }
              }
            });
            createdInvitations.push(updated);
            continue;
          }
        }

        // Create new invitation
        const invitation = await prisma.tournamentInvitation.create({
          data: {
            tournamentId,
            inviteeId,
            inviterId: session.user.id,
            status: 'pending'
          },
          include: {
            invitee: {
              select: { id: true, name: true, email: true, image: true }
            }
          }
        });

        createdInvitations.push(invitation);
      } catch (err) {
        console.error(`Error creating invitation for ${inviteeId}:`, err);
        errors.push({
          inviteeId,
          error: err instanceof Error ? err.message : 'Failed to create invitation'
        });
      }
    }

    return new Response(JSON.stringify({
      invitations: createdInvitations,
      errors: errors.length > 0 ? errors : undefined
    }), {
      status: createdInvitations.length > 0 ? 201 : 400,
      headers: { 'content-type': 'application/json' }
    });
  } catch (e: unknown) {
    console.error('Error creating invitations:', e);
    const message = e instanceof Error ? e.message : typeof e === 'string' ? e : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), { status: 500 });
  }
}
