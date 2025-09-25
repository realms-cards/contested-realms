import { TournamentStatus as DBTournamentStatus, TournamentFormat as DBTournamentFormat, RoundStatus as DBRoundStatus } from '@prisma/client';
import { NextRequest } from 'next/server';
import { getServerAuthSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { tournamentSocketService } from '@/lib/services/tournament-socket-service';
import { generatePairings, createRoundMatches } from '@/lib/tournament/pairing';

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

    if (tournament.registrations.length < 2) {
      return new Response(JSON.stringify({ error: 'Need at least 2 players to start tournament' }), { status: 400 });
    }

    // Check if all players are ready (stored in preparationData)
    const unreadyPlayers = tournament.registrations.filter(reg => {
      const prepData = reg.preparationData as Record<string, unknown> | null;
      return !prepData?.ready;
    });
    if (unreadyPlayers.length > 0) {
      return new Response(JSON.stringify({ 
        error: `Cannot start tournament - ${unreadyPlayers.length} players not ready` 
      }), { status: 400 });
    }

    // Determine next status based on format
    let nextStatus: DBTournamentStatus = DBTournamentStatus.active;
    if (tournament.format === DBTournamentFormat.draft || tournament.format === DBTournamentFormat.sealed) {
      nextStatus = DBTournamentStatus.preparing;
    }

    // Start tournament
    const updatedTournament = await prisma.tournament.update({
      where: { id },
      data: {
        status: nextStatus,
        startedAt: new Date()
      }
    });

    // Broadcast phase change event via Socket.io
    try {
      await tournamentSocketService.broadcastPhaseChanged(
        id,
        nextStatus,
        {
          previousStatus: tournament.status,
          startedAt: updatedTournament.startedAt?.toISOString(),
          format: tournament.format,
          totalPlayers: tournament.registrations.length
        }
      );
      // Also broadcast a full tournament snapshot so lists sync immediately
      await tournamentSocketService.broadcastTournamentUpdateById(id);
    } catch (socketError) {
      console.warn('Failed to broadcast phase changed event:', socketError);
      // Don't fail the request if socket broadcast fails
    }

    // If going straight to active (constructed), create first round with matches
    if (nextStatus === DBTournamentStatus.active) {
      // Create the round
      const newRound = await prisma.tournamentRound.create({
        data: {
          tournamentId: id,
          roundNumber: 1,
          status: DBRoundStatus.pending
        }
      });

      // Generate pairings for the first round
      const pairings = await generatePairings(id);

      // Create matches for the round
      const matchIds = await createRoundMatches(id, newRound.id, pairings);

      // Mark the round as active now that matches exist
      await prisma.tournamentRound.update({
        where: { id: newRound.id },
        data: { status: DBRoundStatus.active, startedAt: new Date() }
      });

      // Build broadcast payload for ROUND_STARTED so clients refresh live without reload
      try {
        const createdMatches = await prisma.match.findMany({
          where: { id: { in: matchIds } },
          select: { id: true, players: true }
        });
        const broadcastMatches = createdMatches.map((m) => {
          const players = (m.players as Array<{ id: string; displayName?: string; name?: string }>);
          const p1 = players?.[0];
          const p2 = players?.[1];
          return {
            id: m.id,
            player1Id: p1?.id || '',
            player1Name: (p1?.displayName || p1?.name || 'Player 1'),
            player2Id: p2?.id || null,
            player2Name: (p2?.displayName || p2?.name || null)
          };
        });
        await tournamentSocketService.broadcastRoundStarted(id, 1, broadcastMatches);

        // Additionally, send targeted MATCH_ASSIGNED events to each participant
        const tournamentName = tournament.name;
        for (const m of broadcastMatches) {
          // Player 1 always present
          await tournamentSocketService.broadcastMatchAssigned(id, m.player1Id, {
            matchId: m.id,
            opponentId: m.player2Id,
            opponentName: m.player2Name,
            lobbyName: tournamentName,
          });
          // Player 2 when present
          if (m.player2Id) {
            await tournamentSocketService.broadcastMatchAssigned(id, m.player2Id, {
              matchId: m.id,
              opponentId: m.player1Id,
              opponentName: m.player1Name,
              lobbyName: tournamentName,
            });
          }
        }
      } catch (socketErr) {
        console.warn('Failed to broadcast ROUND_STARTED:', socketErr);
      }

      console.log(`Created ${matchIds.length} matches for tournament ${id}, round 1`);
    }

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
