import { NextRequest } from 'next/server';
import { getServerAuthSession } from '@/lib/auth';
import { invalidateCache, CacheKeys } from '@/lib/cache/redis-cache';
import { prisma } from '@/lib/prisma';
import { tournamentSocketService } from '@/lib/services/tournament-broadcast';
import { TOURNAMENT_PLAYER_LIMITS } from '@/lib/tournament/constants';
import { countActiveSeats, getRegistrationSettings, isActiveSeat } from '@/lib/tournament/registration';

export const dynamic = 'force-dynamic';

// POST /api/tournaments/[id]/join
// Body: { displayName?: string }
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
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

  function containsIdDeep(value: unknown, id: string): boolean {
    if (typeof value === 'string') return value === id;
    if (Array.isArray(value)) return value.some((item) => containsIdDeep(item, id));
    if (value && typeof value === 'object') {
      return Object.values(value).some((entry) => containsIdDeep(entry, id));
    }
    return false;
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

  try {
    const userId = session.user.id;
    // Handle empty request body gracefully
    let body: { displayName?: string } = {};
    try {
      const text = await req.text();
      if (text.trim()) {
        body = JSON.parse(text);
      }
    } catch (jsonError) {
      // If JSON parsing fails, use empty object (displayName will be inferred)
      console.log('Invalid or empty JSON body, using default:', jsonError);
    }

    console.log('Tournament join attempt:', { tournamentId: id, userId });

    // Get user info for display name fallback
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { name: true, email: true }
    });

    if (!user) {
      console.error('User not found in database:', session.user.id);
      return new Response(JSON.stringify({ error: 'User not found' }), { status: 404 });
    }

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

    const registrationSettings = getRegistrationSettings(tournament.settings);
    const isOpenSeat = registrationSettings.mode === 'open';
    const isLocked = registrationSettings.locked;
    const activeRegistrations = tournament.registrations.filter(isActiveSeat);

    if (tournament.status === 'completed' || tournament.status === 'cancelled') {
      return new Response(JSON.stringify({ error: 'Tournament already finished' }), { status: 400 });
    }

    if (!isOpenSeat && tournament.status !== 'registering') {
      return new Response(JSON.stringify({ error: 'Tournament registration is closed' }), { status: 400 });
    }

    // Check if already registered (return success to avoid surfacing an error to existing participants)
    const existingRegistration = tournament.registrations.find(reg => reg.playerId === userId);
    if (existingRegistration) {
      if (existingRegistration.seatStatus === 'vacant') {
        await prisma.tournamentRegistration.update({
          where: { id: existingRegistration.id },
          data: {
            seatStatus: 'active',
            seatMeta: {
              ...(existingRegistration.seatMeta as Record<string, unknown> | null ?? {}),
              rejoinedAt: new Date().toISOString()
            }
          }
        });
        await prisma.playerStanding.updateMany({
          where: {
            tournamentId: id,
            playerId: userId
          },
          data: {
            displayName,
            isEliminated: false,
            currentMatchId: null
          }
        });

        const currentPlayerCount = countActiveSeats(
          await prisma.tournamentRegistration.findMany({
            where: { tournamentId: id }
          })
        );

        try {
          await tournamentSocketService.broadcastPlayerJoined(id, userId, displayName, currentPlayerCount);
          await tournamentSocketService.broadcastTournamentUpdateById(id);
        } catch (socketError) {
          console.warn('Failed to broadcast player rejoin event:', socketError);
        }

        await invalidateCache(CacheKeys.tournaments.invalidateTournament(id));

        return new Response(JSON.stringify({
          success: true,
          alreadyRegistered: true,
          rejoined: true,
          registrationId: existingRegistration.id,
          playerId: userId,
          displayName,
          currentPlayerCount
        }), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        });
      }

      return new Response(JSON.stringify({
        success: true,
        alreadyRegistered: true,
        registrationId: existingRegistration.id,
        playerId: userId,
        displayName,
        currentPlayerCount: countActiveSeats(tournament.registrations)
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    }

    const canOpenSeatJoinNewSeat =
      isOpenSeat &&
      !isLocked &&
      (tournament.status === 'registering' || tournament.status === 'preparing');

    if (!isOpenSeat && tournament.registrations.length >= tournament.maxPlayers) {
      return new Response(JSON.stringify({ error: 'Tournament is full' }), { status: 400 });
    }

    if (isOpenSeat && tournament.registrations.length >= TOURNAMENT_PLAYER_LIMITS.MAX_PLAYERS) {
      return new Response(
        JSON.stringify({
          error: `Open seat tournaments cannot exceed ${TOURNAMENT_PLAYER_LIMITS.MAX_PLAYERS} players`
        }),
        { status: 400 }
      );
    }

    // Enforce "one lobby rule" - check if user is in any other active tournament or lobby
    const existingTournamentRegistrations = await prisma.tournamentRegistration.findMany({
      where: {
        playerId: userId,
        seatStatus: 'active',
        tournamentId: { not: id }, // Not this tournament
        tournament: {
          status: { in: ['registering', 'preparing', 'active'] }
        }
      },
      include: { tournament: { select: { name: true } } }
    });

    if (existingTournamentRegistrations.length > 0) {
      const tournamentName = existingTournamentRegistrations[0]?.tournament?.name;
      return new Response(JSON.stringify({ 
        error: `You are already in tournament "${tournamentName}". Leave that tournament first.` 
      }), { status: 400 });
    }

    // Note: We should also check for lobby membership here, but that would require 
    // access to the WebSocket server state or a lobby membership table
    // For now, we'll rely on frontend validation for lobby conflicts

    let registrationId: string | null = null;

    if (isOpenSeat && !canOpenSeatJoinNewSeat) {
      const vacantSeat = tournament.registrations.find((reg) => reg.seatStatus === 'vacant');
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
            tournamentId: id,
            playerId: vacantSeat.playerId
          }
        }
      });

      if (vacantStanding?.currentMatchId) {
        return new Response(JSON.stringify({ error: 'Vacant seat is still in an active match' }), { status: 400 });
      }

      const seatMeta = (vacantSeat.seatMeta as Record<string, unknown> | null) ?? {};
      const nowIso = new Date().toISOString();

      await prisma.$transaction(async (tx) => {
        await tx.tournamentRegistration.update({
          where: { id: vacantSeat.id },
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
              tournamentId: id,
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
              tournamentId: id,
              playerId: userId,
              displayName
            }
          });
        }

        await tx.tournamentStatistics.updateMany({
          where: {
            tournamentId: id,
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
              tournamentId: id
            }
          },
          data: {
            playerId: userId
          }
        });

        const matches = await tx.match.findMany({
          where: { tournamentId: id }
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

      registrationId = vacantSeat.id;
    } else {
      // Create registration
      console.log('Creating tournament registration:', { tournamentId: id, playerId: userId, displayName });
      const registration = await prisma.tournamentRegistration.create({
        data: {
          tournamentId: id,
          playerId: userId
        }
      });

      registrationId = registration.id;

      // Create or revive standing (handle re-join after prior forfeit)
      console.log('Upserting player standing:', { tournamentId: id, playerId: userId, displayName });
      await prisma.playerStanding.upsert({
        where: {
          tournamentId_playerId: { tournamentId: id, playerId: userId }
        },
        create: {
          tournamentId: id,
          playerId: userId,
          displayName
        },
        update: {
          displayName,
          isEliminated: false,
          currentMatchId: null,
        }
      });
    }

    // Get updated player count
    const updatedTournament = await prisma.tournament.findUnique({
      where: { id },
      include: { registrations: true }
    });
    const currentPlayerCount = updatedTournament
      ? countActiveSeats(updatedTournament.registrations)
      : countActiveSeats(activeRegistrations);

    // Broadcast player joined event via Socket.io
    try {
      await tournamentSocketService.broadcastPlayerJoined(
        id,
        userId,
        displayName,
        currentPlayerCount
      );
      // Also broadcast a full tournament update snapshot
      await tournamentSocketService.broadcastTournamentUpdateById(id);
    } catch (socketError) {
      console.warn('Failed to broadcast player joined event:', socketError);
      // Don't fail the request if socket broadcast fails
    }

    // Invalidate tournament cache so next poll gets fresh data
    await invalidateCache(CacheKeys.tournaments.invalidateTournament(id));

    return new Response(JSON.stringify({
      success: true,
      registrationId,
      playerId: userId,
      displayName,
      currentPlayerCount
    }), {
      status: 201,
      headers: { 'content-type': 'application/json' }
    });
  } catch (e: unknown) {
    console.error('Error joining tournament:', e);
    const message = e instanceof Error ? e.message : typeof e === 'string' ? e : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), { status: 500 });
  }
}
