import { NextRequest } from 'next/server';
import { getServerAuthSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

// GET /api/tournaments/[id]
// Returns specific tournament details
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getServerAuthSession();
  if (!session?.user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  try {
    const tournament = await prisma.tournament.findUnique({
      where: { id },
      include: {
        registrations: {
          include: {
            player: {
              select: { id: true, name: true }
            }
          }
        },
        standings: true,
        rounds: {
          include: {
            matches: true
          },
          orderBy: { roundNumber: 'asc' }
        }
      }
    });

    if (!tournament) {
      return new Response(JSON.stringify({ error: 'Tournament not found' }), { status: 404 });
    }

    // Build viewer deck if available
    const viewerId: string | null = session.user?.id ?? null;
    const viewerReg = viewerId
      ? (tournament.registrations.find(r => r.playerId === viewerId) || null)
      : null;
    let viewerDeck: Array<{ cardId: string; quantity: number }> | null = null;
    if (viewerReg && viewerReg.preparationData) {
      try {
        const prep = viewerReg.preparationData as unknown as Record<string, unknown>;
        const sealed = (prep?.sealed as { deckList?: Array<{ cardId: string; quantity: number }> } | undefined);
        const draft = (prep?.draft as { deckList?: Array<{ cardId: string; quantity: number }> } | undefined);
        const list = sealed?.deckList || draft?.deckList || null;
        if (Array.isArray(list)) viewerDeck = list.map(it => ({ cardId: String(it.cardId), quantity: Number(it.quantity) || 0 }));
      } catch {}
    }

    // Transform to match protocol format
    const tournamentInfo = {
      id: tournament.id,
      name: tournament.name,
      format: tournament.format,
      status: tournament.status,
      maxPlayers: tournament.maxPlayers,
      registeredPlayers: tournament.registrations.map(reg => {
        const prep = (reg.preparationData as Record<string, unknown> | null) || {};
        return {
          id: reg.playerId,
          displayName: reg.player.name || 'Anonymous',
          ready: Boolean((prep as { ready?: boolean }).ready),
          deckSubmitted: Boolean(reg.deckSubmitted)
        };
      }),
      standings: tournament.standings.map(standing => ({
        playerId: standing.playerId,
        displayName: standing.displayName,
        wins: standing.wins,
        losses: standing.losses,
        draws: standing.draws,
        matchPoints: standing.matchPoints,
        gameWinPercentage: standing.gameWinPercentage,
        opponentMatchWinPercentage: standing.opponentMatchWinPercentage,
        isEliminated: standing.isEliminated,
        currentMatchId: standing.currentMatchId
      })),
      currentRound: tournament.rounds.length > 0 ? Math.max(...tournament.rounds.map(r => r.roundNumber)) : 0,
      totalRounds: 0, // Will be calculated based on player count and format
      rounds: tournament.rounds.map(round => ({
        roundNumber: round.roundNumber,
        status: round.status,
        matches: round.matches.map(match => match.id)
      })),
      settings: tournament.settings,
      viewerDeck,
      createdAt: tournament.createdAt.getTime()
    };

    return new Response(JSON.stringify(tournamentInfo), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : typeof e === 'string' ? e : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), { status: 500 });
  }
}

// DELETE /api/tournaments/[id]
// Delete tournament (only if registering and empty)
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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

    if (tournament.status !== 'registering') {
      return new Response(JSON.stringify({ error: 'Cannot delete tournament in progress' }), { status: 400 });
    }

    if (tournament.registrations.length > 0) {
      return new Response(JSON.stringify({ error: 'Cannot delete tournament with registered players' }), { status: 400 });
    }

    await prisma.tournament.delete({
      where: { id }
    });

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : typeof e === 'string' ? e : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), { status: 500 });
  }
}
