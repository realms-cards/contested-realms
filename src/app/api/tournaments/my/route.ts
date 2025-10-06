import { TournamentStatus } from '@prisma/client';
import { NextRequest } from 'next/server';
import { getServerAuthSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

// GET /api/tournaments/my
// Returns tournaments the signed-in user created or participated in, with search and pagination
export async function GET(req: NextRequest) {
  const session = await getServerAuthSession();
  if (!session?.user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  try {
    const url = new URL(req.url);
    const sp = url.searchParams;
    const q = (sp.get('q') || '').trim();
    const statusParam = sp.get('status'); // e.g. 'completed', 'active', 'all', or CSV
    const role = (sp.get('role') || 'any').toLowerCase(); // 'any' | 'creator' | 'participant'
    const page = Math.max(1, Number(sp.get('page') || 1) || 1);
    const pageSize = Math.max(1, Math.min(50, Number(sp.get('pageSize') || 12) || 12));
    const skip = (page - 1) * pageSize;

    // Parse statuses
    let statuses: TournamentStatus[] | null = null; // default to ALL for "my" history
    if (statusParam && statusParam !== 'all') {
      const parts = statusParam.split(',').map((s) => s.trim()).filter(Boolean);
      const allowed = new Set(['registering', 'preparing', 'active', 'completed', 'cancelled']);
      const parsed = parts.filter((p) => allowed.has(p)) as TournamentStatus[];
      statuses = parsed.length ? parsed : null;
    }

    // Build where clause
    const userId = session.user.id;
    const roleClause =
      role === 'creator'
        ? { creatorId: userId }
        : role === 'participant'
        ? { registrations: { some: { playerId: userId } } }
        : { OR: [{ creatorId: userId }, { registrations: { some: { playerId: userId } } }] };

    const where = {
      ...(statuses ? { status: { in: statuses } } : {}),
      ...(q ? { name: { contains: q, mode: 'insensitive' as const } } : {}),
      ...roleClause,
    };

    const [total, tournaments] = await Promise.all([
      prisma.tournament.count({ where }),
      prisma.tournament.findMany({
        where,
        include: {
          registrations: {
            include: {
              player: { select: { id: true, name: true } },
            },
          },
          standings: true,
          rounds: {
            include: { matches: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: pageSize,
        skip,
      }),
    ]);

    const items = tournaments.map((tournament) => ({
      id: tournament.id,
      name: tournament.name,
      creatorId: tournament.creatorId,
      format: tournament.format,
      status: tournament.status,
      maxPlayers: tournament.maxPlayers,
      currentPlayers: tournament.registrations.length,
      registeredPlayers: tournament.registrations.map((reg) => {
        const prepData = (reg.preparationData as Record<string, unknown> | null) || {};
        return {
          id: reg.playerId,
          displayName: (reg.player as { name?: string } | null)?.name || 'Anonymous',
          ready: Boolean((prepData as { ready?: boolean }).ready),
          deckSubmitted: Boolean(reg.deckSubmitted),
        };
      }),
      standings: tournament.standings.map((standing) => ({
        playerId: standing.playerId,
        displayName: standing.displayName,
        wins: standing.wins,
        losses: standing.losses,
        draws: standing.draws,
        matchPoints: standing.matchPoints,
        gameWinPercentage: standing.gameWinPercentage,
        opponentMatchWinPercentage: standing.opponentMatchWinPercentage,
        isEliminated: standing.isEliminated,
        currentMatchId: standing.currentMatchId,
      })),
      currentRound: tournament.rounds.length > 0 ? Math.max(...tournament.rounds.map((r) => r.roundNumber)) : 0,
      totalRounds: ((tournament.settings as Record<string, unknown>)?.totalRounds as number) || 3,
      rounds: tournament.rounds.map((round) => ({
        roundNumber: round.roundNumber,
        status: round.status,
        matches: round.matches.map((m) => m.id),
      })),
      settings: tournament.settings,
      createdAt: tournament.createdAt.getTime(),
      startedAt: tournament.startedAt ? tournament.startedAt.getTime() : undefined,
      completedAt: tournament.completedAt ? tournament.completedAt.getTime() : undefined,
    }));

    return new Response(
      JSON.stringify({ items, total, page, pageSize }),
      { status: 200, headers: { 'content-type': 'application/json' } }
    );
  } catch (e: unknown) {
    console.error('Error fetching my tournaments:', e);
    const message = e instanceof Error ? e.message : typeof e === 'string' ? e : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), { status: 500 });
  }
}
