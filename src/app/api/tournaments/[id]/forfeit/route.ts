import { NextRequest } from 'next/server';
import { getServerAuthSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { tournamentSocketService } from '@/lib/services/tournament-broadcast';

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
      select: { id: true, status: true, name: true }
    });

    if (!tournament) {
      return new Response(JSON.stringify({ error: 'Tournament not found' }), { status: 404 });
    }

    if (tournament.status === 'completed' || tournament.status === 'cancelled') {
      return new Response(JSON.stringify({ error: 'Tournament already finished' }), { status: 400 });
    }

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

    // Mark player as eliminated and clear current match assignment
    await prisma.playerStanding.update({
      where: {
        tournamentId_playerId: { tournamentId: id, playerId: userId }
      },
      data: { isEliminated: true, currentMatchId: null }
    });

    // Broadcast update so UIs refresh standings and lists
    try {
      await tournamentSocketService.broadcastTournamentUpdateById(id);
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

