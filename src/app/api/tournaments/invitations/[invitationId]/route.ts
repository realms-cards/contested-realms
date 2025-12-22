import { NextRequest } from 'next/server';
import { getServerAuthSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { TOURNAMENT_PLAYER_LIMITS } from '@/lib/tournament/constants';
import { countActiveSeats, getRegistrationSettings } from '@/lib/tournament/registration';

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

  function replaceIdDeep(value: unknown, fromId: string, toId: string): unknown {
    if (typeof value === 'string') return value === fromId ? toId : value;
    if (Array.isArray(value)) return value.map((item) => replaceIdDeep(item, fromId, toId));
    if (value && typeof value === 'object') {
      const out: Record<string, unknown> = {};
      for (const [key, entry] of Object.entries(value)) {
        if (typeof entry === 'string' && entry === fromId) {
          out[key] = toId;
        } else {
          out[key] = replaceIdDeep(entry, fromId, toId);
        }
      }
      return out;
    }
    return value;
  }

  function replacePlayerInList(players: unknown, fromId: string, toId: string, displayName: string) {
    if (!Array.isArray(players)) return players;
    return players.map((player) => {
      if (typeof player === 'string') {
        return player === fromId ? toId : player;
      }
      if (!player || typeof player !== 'object') return player;
      const record = { ...(player as Record<string, unknown>) };
      const rawId = record.id || record.playerId || record.userId;
      if (rawId === fromId) {
        record.id = toId;
        record.playerId = toId;
        record.userId = toId;
        record.name = displayName;
      }
      return record;
    });
  }

  function replacePlayerDecks(playerDecks: unknown, fromId: string, toId: string) {
    if (!playerDecks || typeof playerDecks !== 'object' || Array.isArray(playerDecks)) return playerDecks;
    const next = { ...(playerDecks as Record<string, unknown>) };
    if (Object.prototype.hasOwnProperty.call(next, fromId)) {
      next[toId] = next[fromId];
      delete next[fromId];
    }
    return next;
  }

  function containsIdDeep(value: unknown, id: string): boolean {
    if (typeof value === 'string') return value === id;
    if (Array.isArray(value)) return value.some((item) => containsIdDeep(item, id));
    if (value && typeof value === 'object') {
      return Object.values(value).some((entry) => containsIdDeep(entry, id));
    }
    return false;
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
            settings: true,
            registrations: { select: { playerId: true, seatStatus: true, deckSubmitted: true, seatMeta: true } }
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

    const registrationSettings = getRegistrationSettings(invitation.tournament.settings);
    const isOpenSeat = registrationSettings.mode === 'open';
    const isLocked = registrationSettings.locked;
    const canOpenSeatAcceptNewSeat =
      isOpenSeat &&
      !isLocked &&
      (invitation.tournament.status === 'registering' || invitation.tournament.status === 'preparing');

    if (!isOpenSeat && invitation.tournament.status !== 'registering') {
      return new Response(JSON.stringify({ error: 'Tournament registration is closed' }), { status: 400 });
    }

    if (action === 'accept') {
      // Check if tournament is full
      if (!isOpenSeat && invitation.tournament.registrations.length >= invitation.tournament.maxPlayers) {
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

      if (isOpenSeat) {
        const activeCount = countActiveSeats(invitation.tournament.registrations);
        if (activeCount >= TOURNAMENT_PLAYER_LIMITS.MAX_PLAYERS) {
          await prisma.tournamentInvitation.update({
            where: { id: invitationId },
            data: {
              status: 'expired',
              respondedAt: new Date()
            }
          });
          return new Response(JSON.stringify({ error: 'Tournament is full' }), { status: 400 });
        }
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
          seatStatus: 'active',
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

      if (isOpenSeat && !canOpenSeatAcceptNewSeat) {
        const vacantSeat = invitation.tournament.registrations.find((reg) => reg.seatStatus === 'vacant');
        if (!vacantSeat) {
          return new Response(
            JSON.stringify({
              error: isLocked ? 'Tournament registration is locked' : 'No vacant seats available'
            }),
            { status: 400 }
          );
        }
        if (!vacantSeat.deckSubmitted) {
          return new Response(JSON.stringify({ error: 'Vacant seat has no deck to inherit yet' }), { status: 400 });
        }

        const vacantStanding = await prisma.playerStanding.findUnique({
          where: {
            tournamentId_playerId: {
              tournamentId: invitation.tournamentId,
              playerId: vacantSeat.playerId
            }
          }
        });

        if (vacantStanding?.currentMatchId) {
          return new Response(JSON.stringify({ error: 'Vacant seat is still in an active match' }), { status: 400 });
        }

        const seatMeta = (vacantSeat as unknown as { seatMeta?: Record<string, unknown> | null }).seatMeta ?? {};
        const nowIso = new Date().toISOString();

        await prisma.$transaction(async (tx) => {
          await tx.tournamentInvitation.update({
            where: { id: invitationId },
            data: {
              status: 'accepted',
              respondedAt: new Date()
            }
          });

          await tx.tournamentRegistration.update({
            where: {
              tournamentId_playerId: {
                tournamentId: invitation.tournamentId,
                playerId: vacantSeat.playerId
              }
            },
            data: {
              playerId: userId,
              seatStatus: 'active',
              seatMeta: {
                ...seatMeta,
                previousPlayerId: vacantSeat.playerId,
                replacedAt: nowIso
              }
            }
          });

          const existingStanding = await tx.playerStanding.findUnique({
            where: {
              tournamentId_playerId: {
                tournamentId: invitation.tournamentId,
                playerId: vacantSeat.playerId
              }
            }
          });

          if (existingStanding) {
            await tx.playerStanding.update({
              where: { id: existingStanding.id },
              data: {
                playerId: userId,
                displayName,
                isEliminated: false,
                currentMatchId: null
              }
            });
          } else {
            await tx.playerStanding.create({
              data: {
                tournamentId: invitation.tournamentId,
                playerId: userId,
                displayName
              }
            });
          }

          await tx.tournamentStatistics.updateMany({
            where: {
              tournamentId: invitation.tournamentId,
              playerId: vacantSeat.playerId
            },
            data: {
              playerId: userId
            }
          });

          await tx.draftParticipant.updateMany({
            where: {
              playerId: vacantSeat.playerId,
              draftSession: {
                tournamentId: invitation.tournamentId
              }
            },
            data: {
              playerId: userId
            }
          });

          const matches = await tx.match.findMany({
            where: { tournamentId: invitation.tournamentId }
          });

          for (const match of matches) {
            const players = Array.isArray(match.players) ? match.players : [];
            const hasPlayer = players.some((p) => {
              if (typeof p === 'string') return p === vacantSeat.playerId;
              if (!p || typeof p !== 'object') return false;
              const record = p as Record<string, unknown>;
              const rawId = record.id || record.playerId || record.userId;
              return rawId === vacantSeat.playerId;
            });

            const resultsHasId = containsIdDeep(match.results, vacantSeat.playerId);
            const decksHasId =
              match.playerDecks &&
              typeof match.playerDecks === 'object' &&
              !Array.isArray(match.playerDecks) &&
              Object.prototype.hasOwnProperty.call(match.playerDecks, vacantSeat.playerId);

            if (hasPlayer || resultsHasId || decksHasId) {
              const updatedPlayers = hasPlayer
                ? replacePlayerInList(players, vacantSeat.playerId, userId, displayName)
                : match.players;
              const updatedResults = resultsHasId
                ? replaceIdDeep(match.results, vacantSeat.playerId, userId)
                : match.results;
              const updatedDecks = decksHasId
                ? replacePlayerDecks(match.playerDecks, vacantSeat.playerId, userId)
                : match.playerDecks;

              await tx.match.update({
                where: { id: match.id },
                data: {
                  players: updatedPlayers as unknown as object,
                  results: updatedResults as unknown as object,
                  playerDecks: updatedDecks as unknown as object
                }
              });
            }
          }
        });

        return new Response(JSON.stringify({
          success: true,
          message: 'Invitation accepted and seat claimed',
          tournamentId: invitation.tournamentId
        }), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        });
      }

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
        prisma.playerStanding.upsert({
          where: {
            tournamentId_playerId: { tournamentId: invitation.tournamentId, playerId: userId }
          },
          create: {
            tournamentId: invitation.tournamentId,
            playerId: userId,
            displayName
          },
          update: {
            displayName,
            isEliminated: false,
            currentMatchId: null,
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
        message: 'Invitation declined',
        tournamentId: invitation.tournamentId
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    }
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : typeof e === 'string' ? e : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), { status: 500 });
  }
}
