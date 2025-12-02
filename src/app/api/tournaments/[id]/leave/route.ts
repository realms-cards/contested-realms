import { NextRequest } from 'next/server';
import { getServerAuthSession } from '@/lib/auth';
import { invalidateCache, CacheKeys } from '@/lib/cache/redis-cache';
import { prisma } from '@/lib/prisma';
import { tournamentSocketService } from '@/lib/services/tournament-broadcast';

export const dynamic = 'force-dynamic';

// POST /api/tournaments/[id]/leave
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getServerAuthSession();
  if (!session?.user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  try {
    const userId = session.user.id;
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
    const registration = tournament.registrations.find(reg => reg.playerId === userId);
    if (!registration) {
      return new Response(JSON.stringify({ error: 'Not registered for this tournament' }), { status: 400 });
    }

    // Get player name for broadcast
    const playerStanding = await prisma.playerStanding.findUnique({
      where: {
        tournamentId_playerId: {
          tournamentId: id,
          playerId: userId
        }
      },
      select: { displayName: true }
    });
    const playerName = playerStanding?.displayName || 'Unknown Player';

    // Remove registration and standing
    await prisma.$transaction([
      prisma.tournamentRegistration.delete({
        where: { id: registration.id }
      }),
      prisma.playerStanding.deleteMany({
        where: {
          tournamentId: id,
          playerId: userId
        }
      })
    ]);

    // Get updated player count
    const updatedTournament = await prisma.tournament.findUnique({
      where: { id },
      include: { registrations: true }
    });
    const currentPlayerCount = updatedTournament?.registrations.length || 0;

    // Broadcast player left event via Socket.io
    try {
      await tournamentSocketService.broadcastPlayerLeft(
        id,
        userId,
        playerName,
        currentPlayerCount
      );
      // Also broadcast a full tournament update snapshot
      await tournamentSocketService.broadcastTournamentUpdateById(id);
    } catch (socketError) {
      console.warn('Failed to broadcast player left event:', socketError);
      // Don't fail the request if socket broadcast fails
    }

    // Invalidate tournament cache so next poll gets fresh data
    await invalidateCache(CacheKeys.tournaments.invalidateTournament(id));

    return new Response(JSON.stringify({
      success: true,
      playerId: userId,
      currentPlayerCount
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : typeof e === 'string' ? e : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), { status: 500 });
  }
}
