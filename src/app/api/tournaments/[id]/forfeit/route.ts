import { NextRequest } from 'next/server';
import { getServerAuthSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { tournamentSocketService } from '@/lib/services/tournament-broadcast';
import { updateStandingsAfterMatch } from '@/lib/tournament/pairing';
import { countActiveSeats, getRegistrationSettings } from '@/lib/tournament/registration';

export const dynamic = 'force-dynamic';

// POST /api/tournaments/[id]/forfeit
// Allow a player to forfeit (drop) from an in-progress tournament
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
      select: { id: true, status: true, name: true, settings: true }
    });

    if (!tournament) {
      return new Response(JSON.stringify({ error: 'Tournament not found' }), { status: 404 });
    }

    if (tournament.status === 'completed' || tournament.status === 'cancelled') {
      return new Response(JSON.stringify({ error: 'Tournament already finished' }), { status: 400 });
    }

    const registrationSettings = getRegistrationSettings(tournament.settings);
    const isOpenSeat = registrationSettings.mode === 'open';

    // Ensure the player is registered/has standings
    const standing = await prisma.playerStanding.findUnique({
      where: {
        tournamentId_playerId: {
          tournamentId: id,
          playerId: userId
        }
      }
    });

    if (!standing) {
      return new Response(JSON.stringify({ error: 'You are not part of this tournament' }), { status: 400 });
    }

    // If in an active match, end it as a loss for the forfeiting player
    const currentMatchId = (standing as unknown as { currentMatchId?: string | null })?.currentMatchId || null;
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
          // Update standings and recalc tiebreakers
          await updateStandingsAfterMatch(id, currentMatchId, {
            winnerId: opponentId,
            loserId: userId,
            isDraw: false,
          });

          // Broadcast STATISTICS_UPDATED
          try {
            const updatedStandings = await prisma.playerStanding.findMany({
              where: { tournamentId: id },
              orderBy: [
                { matchPoints: 'desc' },
                { gameWinPercentage: 'desc' },
                { opponentMatchWinPercentage: 'desc' },
              ],
            });
            await tournamentSocketService.broadcastStatisticsUpdate(id, {
              tournamentId: id,
              standings: updatedStandings.map((standing) => ({
                playerId: standing.playerId,
                playerName: standing.displayName,
                wins: standing.wins,
                losses: standing.losses,
                draws: standing.draws,
                matchPoints: standing.matchPoints,
                tiebreakers: {
                  gameWinPercentage: standing.gameWinPercentage,
                  opponentMatchWinPercentage: standing.opponentMatchWinPercentage,
                },
                finalRanking: null,
              })),
              rounds: [],
              overallStats: {
                totalMatches: 0,
                completedMatches: 0,
                averageMatchDuration: null,
                tournamentDuration: null,
                totalPlayers: updatedStandings.length,
                roundsCompleted: 0,
              },
            });
          } catch {}
        }

        // Notify both players' match clients
        try {
          await tournamentSocketService.broadcastToMatch(currentMatchId, 'matchEnded', {
            tournamentId: id,
            reason: 'forfeit',
            winnerId: opponentId || undefined,
          });
        } catch {}
      }
    }

    if (isOpenSeat) {
      const registration = await prisma.tournamentRegistration.findUnique({
        where: {
          tournamentId_playerId: {
            tournamentId: id,
            playerId: userId
          }
        }
      });

      if (!registration) {
        return new Response(JSON.stringify({ error: 'Registration not found' }), { status: 400 });
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
              vacatedBy: userId,
              reason: 'forfeit'
            }
          }
        }),
        prisma.playerStanding.update({
          where: {
            tournamentId_playerId: { tournamentId: id, playerId: userId }
          },
          data: { currentMatchId: null }
        })
      ]);
    } else {
      // Mark player as eliminated, clear current match assignment, and remove registration
      await prisma.$transaction([
        prisma.playerStanding.update({
          where: {
            tournamentId_playerId: { tournamentId: id, playerId: userId }
          },
          data: { isEliminated: true, currentMatchId: null }
        }),
        // Remove the registration to fully unregister the player
        prisma.tournamentRegistration.deleteMany({
          where: {
            tournamentId: id,
            playerId: userId
          }
        })
      ]);
    }

    // Broadcast update so UIs refresh standings and lists
    try {
      await tournamentSocketService.broadcastTournamentUpdateById(id);
    } catch {}

    // Notify tournament room that the player left (host and viewers)
    try {
      const regCount = await prisma.tournamentRegistration.count({ where: { tournamentId: id } });
      const activeCount = isOpenSeat
        ? countActiveSeats(await prisma.tournamentRegistration.findMany({ where: { tournamentId: id } }))
        : regCount;
      const user = await prisma.user.findUnique({ where: { id: userId }, select: { name: true, shortId: true } });
      const playerName = user?.name || user?.shortId || userId;
      await tournamentSocketService.broadcastPlayerLeft(id, userId, playerName, activeCount);
    } catch {}

    return new Response(JSON.stringify({
      success: true,
      message: 'You have forfeited the tournament',
      tournamentId: id
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : typeof e === 'string' ? e : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), { status: 500 });
  }
}
