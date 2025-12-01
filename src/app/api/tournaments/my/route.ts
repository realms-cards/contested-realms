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

    // Optimized query: Removed cartesian explosion from rounds.matches include
    // This reduces data transfer by ~400 records per page (12 tournaments × 3 rounds × 16 matches)
    // Match IDs are fetched separately in a follow-up query for better performance
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
          standings: {
            select: {
              playerId: true,
              displayName: true,
              wins: true,
              losses: true,
              draws: true,
              matchPoints: true,
              gameWinPercentage: true,
              opponentMatchWinPercentage: true,
              isEliminated: true,
              currentMatchId: true,
            }
          },
          rounds: {
            select: {
              id: true,
              roundNumber: true,
              status: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: pageSize,
        skip,
      }),
    ]);

    // Fetch match IDs separately for all rounds (batch query more efficient than nested include)
    const roundIds = tournaments.flatMap(t => t.rounds.map(r => r.id));
    const matchesByRound = roundIds.length > 0 ? await prisma.match.findMany({
      where: { roundId: { in: roundIds } },
      select: { id: true, roundId: true },
    }) : [];

    // Create lookup map for quick access
    const matchIdsByRound = new Map<string, string[]>();
    for (const match of matchesByRound) {
      if (!match.roundId) continue;
      const existing = matchIdsByRound.get(match.roundId);
      if (existing) {
        existing.push(match.id);
      } else {
        matchIdsByRound.set(match.roundId, [match.id]);
      }
    }

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
        matches: matchIdsByRound.get(round.id) || [],
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
