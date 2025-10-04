import { TournamentStatus as DBTournamentStatus, TournamentFormat as DBTournamentFormat } from '@prisma/client';
import { NextRequest } from 'next/server';
import { getServerAuthSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { tournamentSocketService } from '@/lib/services/tournament-broadcast';

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

    // Only tournament creator can start the tournament
    if (tournament.creatorId !== session.user.id) {
      return new Response(JSON.stringify({ error: 'Only tournament creator can start the tournament' }), { status: 403 });
    }

    if (tournament.status !== DBTournamentStatus.registering) {
      return new Response(JSON.stringify({ error: 'Tournament already started' }), { status: 400 });
    }

    // Require all seats to be filled before starting
    if (tournament.registrations.length !== tournament.maxPlayers) {
      return new Response(
        JSON.stringify({
          error: `All players must join before starting (${tournament.registrations.length}/${tournament.maxPlayers})`,
        }),
        { status: 400 }
      );
    }

    // Determine next status based on format
    // Change: constructed tournaments also enter 'preparing' so players can submit a deck used for ALL matches
    let nextStatus: DBTournamentStatus = DBTournamentStatus.preparing;
    if (tournament.format === DBTournamentFormat.draft || tournament.format === DBTournamentFormat.sealed) {
      nextStatus = DBTournamentStatus.preparing;
    } else {
      // constructed
      nextStatus = DBTournamentStatus.preparing;
    }

    // We no longer support starting directly into 'active'. The tournament starts in 'preparing'.

    // Start tournament
    const updatedTournament = await prisma.tournament.update({
      where: { id },
      data: {
        status: nextStatus,
        startedAt: new Date()
      }
    });

    // Broadcast phase change event via Socket.io (fire-and-forget so API response is instant)
    tournamentSocketService
      .broadcastPhaseChanged(
        id,
        nextStatus,
        {
          previousStatus: tournament.status,
          startedAt: updatedTournament.startedAt?.toISOString(),
          format: tournament.format,
          totalPlayers: tournament.registrations.length
        }
      )
      .catch((socketError) => {
        console.warn('Failed to broadcast phase changed event:', socketError);
      });
    // Also broadcast a full tournament snapshot so lists sync immediately
    tournamentSocketService
      .broadcastTournamentUpdateById(id)
      .catch((socketError) => {
        console.warn('Failed to broadcast tournament update:', socketError);
      });

    // If we ever reintroduce direct start into 'active', re-add round creation here.

    return new Response(JSON.stringify({
      success: true,
      tournamentId: id,
      status: updatedTournament.status,
      startedAt: updatedTournament.startedAt?.getTime()
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : typeof e === 'string' ? e : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), { status: 500 });
  }
}
