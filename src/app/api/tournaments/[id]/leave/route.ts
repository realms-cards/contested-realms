import { NextRequest } from 'next/server';
import { getServerAuthSession } from '@/lib/auth';
import { invalidateCache, CacheKeys } from '@/lib/cache/redis-cache';
import { prisma } from '@/lib/prisma';
import { tournamentSocketService } from '@/lib/services/tournament-broadcast';
import { updateStandingsAfterMatch } from '@/lib/tournament/pairing';
import { countActiveSeats, getRegistrationSettings, isActiveSeat } from '@/lib/tournament/registration';

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

    const registrationSettings = getRegistrationSettings(tournament.settings);
    const isOpenSeat = registrationSettings.mode === 'open';

    if (!isOpenSeat && tournament.status !== 'registering') {
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
      select: { displayName: true, currentMatchId: true }
    });
    const playerName = playerStanding?.displayName || 'Unknown Player';

    if (isOpenSeat && tournament.status !== 'registering') {
      // If in an active match, end it as a loss for the leaving player
      const currentMatchId = playerStanding?.currentMatchId || null;
      if (currentMatchId) {
        const match = await prisma.match.findUnique({ where: { id: currentMatchId } });
        if (match && match.status !== 'completed') {
          const playersArr = Array.isArray(match.players)
            ? (match.players as Array<{ id?: string; playerId?: string; userId?: string }>)
            : [];
          const ids = playersArr
            .map((p) => (p?.id || p?.playerId || p?.userId ? String(p.id || p.playerId || p.userId) : null))
            .filter((x): x is string => !!x);
          const opponentId = ids.find((pid) => pid !== userId) || null;

          const now = new Date();
          await prisma.match.update({
            where: { id: currentMatchId },
            data: {
              status: 'completed',
              results: {
                winnerId: opponentId,
                loserId: userId,
                isDraw: false,
                gameResults: [],
                completedAt: now.toISOString(),
              },
              completedAt: now,
            },
          });

          if (opponentId) {
            await updateStandingsAfterMatch(id, currentMatchId, {
              winnerId: opponentId,
              loserId: userId,
              isDraw: false,
            });
          }
        }
      }

      const seatMeta = (registration.seatMeta as Record<string, unknown> | null) ?? {};
      await prisma.$transaction([
        prisma.tournamentRegistration.update({
          where: { id: registration.id },
          data: {
            seatStatus: 'vacant',
            seatMeta: {
              ...seatMeta,
              vacatedAt: new Date().toISOString(),
              vacatedBy: userId
            }
          }
        }),
        prisma.playerStanding.updateMany({
          where: {
            tournamentId: id,
            playerId: userId
          },
          data: { currentMatchId: null }
        })
      ]);
    } else {
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
    }

    // Get updated player count
    const updatedTournament = await prisma.tournament.findUnique({
      where: { id },
      include: { registrations: true }
    });
    const currentPlayerCount = updatedTournament
      ? countActiveSeats(updatedTournament.registrations)
      : countActiveSeats(tournament.registrations.filter(isActiveSeat));

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
