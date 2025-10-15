import { NextResponse } from 'next/server';
import { AdminAccessError, requireAdminSession } from '@/lib/admin/auth';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/replays/bots
 * Returns list of bot match replays (admin only)
 *
 * Bot matches are identified by having at least one player ID starting with 'cpu_'
 */
export async function GET(): Promise<NextResponse> {
  try {
    await requireAdminSession();

    // Find all match results that involve CPU bots
    const botMatches = await prisma.matchResult.findMany({
      orderBy: { completedAt: 'desc' },
      take: 200,
    });

    // Filter to only matches with CPU bots
    const botMatchRecordings = botMatches.filter((match) => {
      if (!Array.isArray(match.players)) return false;
      return match.players.some((player) => {
        if (!player || typeof player !== 'object') return false;
        const p = player as Record<string, unknown>;
        const playerId = p?.id;
        return typeof playerId === 'string' &&
               (playerId.startsWith('cpu_') || playerId.startsWith('host_'));
      });
    });

    // Also check OnlineMatchSession for bot matches (including in-progress)
    const botSessions = await prisma.onlineMatchSession.findMany({
      where: {
        // Can't easily filter playerIds array in Prisma, will filter in code
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });

    // Filter sessions with bot players
    const botSessionMatches = botSessions.filter((session) => {
      if (!Array.isArray(session.playerIds)) return false;
      return session.playerIds.some((id) => {
        const playerId = String(id || '');
        return playerId.startsWith('cpu_') || playerId.startsWith('host_');
      });
    });

    // Combine both sources, preferring MatchResult data where available
    const resultMatchIds = new Set(botMatchRecordings.map((m) => m.matchId));

    // Get all match IDs from both sources
    const allMatchIds = [
      ...botMatchRecordings.map((m) => m.matchId),
      ...botSessionMatches.filter((s) => !resultMatchIds.has(s.id)).map((s) => s.id),
    ];

    const sessions = await prisma.onlineMatchSession.findMany({
      where: { id: { in: allMatchIds } },
      select: {
        id: true,
        matchType: true,
        playerIds: true,
        createdAt: true,
        updatedAt: true,
        status: true,
      },
    });

    const sessionById = new Map(sessions.map((s) => [s.id, s]));

    // Count actions for each match
    const actionCounts = allMatchIds.length > 0
      ? await prisma.onlineMatchAction.groupBy({
          by: ['matchId'],
          where: { matchId: { in: allMatchIds } },
          _count: { _all: true },
        })
      : [];

    const countById = new Map(actionCounts.map((c) => [c.matchId, c._count._all]));

    // Build response summaries from MatchResult
    const recordingsFromResults = botMatchRecordings.map((mr) => {
      const session = sessionById.get(mr.matchId);
      const playerNames = Array.isArray(mr.players)
        ? mr.players.map((p) => {
            if (!p || typeof p !== 'object') return 'Player';
            const player = p as Record<string, unknown>;
            const displayName = typeof player.displayName === 'string' ? player.displayName : null;
            const id = typeof player.id === 'string' ? player.id : null;
            return displayName || id || 'Player';
          })
        : [];

      const playerIds = Array.isArray(mr.players)
        ? mr.players
            .map((p) => {
              if (!p || typeof p !== 'object') return null;
              const player = p as Record<string, unknown>;
              return typeof player.id === 'string' ? player.id : null;
            })
            .filter((id): id is string => id !== null)
        : [];

      const endTime = mr.completedAt ? new Date(mr.completedAt).getTime() : undefined;
      const duration = typeof mr.duration === 'number' ? mr.duration * 1000 : undefined;
      const startTime = endTime && duration
        ? endTime - duration
        : (session?.createdAt ? new Date(session.createdAt).getTime() : endTime || Date.now());

      return {
        matchId: mr.matchId,
        playerNames,
        playerIds,
        startTime,
        endTime,
        duration: endTime && startTime ? endTime - startTime : undefined,
        actionCount: countById.get(mr.matchId) || 0,
        matchType: mr.format || session?.matchType || 'constructed',
        lobbyName: mr.lobbyName,
      };
    });

    // Build response summaries from sessions without MatchResult
    const recordingsFromSessions = botSessionMatches
      .filter((s) => !resultMatchIds.has(s.id))
      .map((session) => {
        const playerIds = Array.isArray(session.playerIds)
          ? session.playerIds.map((id) => String(id))
          : [];
        const playerNames = playerIds.map((id) => id.replace('cpu_', 'CPU '));

        const endTime = session.updatedAt ? new Date(session.updatedAt).getTime() : undefined;
        const startTime = session.createdAt ? new Date(session.createdAt).getTime() : Date.now();

        return {
          matchId: session.id,
          playerNames,
          playerIds,
          startTime,
          endTime,
          duration: endTime && startTime ? endTime - startTime : undefined,
          actionCount: countById.get(session.id) || 0,
          matchType: session.matchType || 'constructed',
          lobbyName: undefined,
        };
      });

    const recordings = [...recordingsFromResults, ...recordingsFromSessions];
    // Sort by most recent
    recordings.sort((a, b) => {
      const aTime = a.endTime || a.startTime;
      const bTime = b.endTime || b.startTime;
      return bTime - aTime;
    });

    return NextResponse.json({
      recordings,
      total: recordings.length,
    });
  } catch (error) {
    if (error instanceof AdminAccessError) {
      return new NextResponse('Forbidden', { status: 403 });
    }
    console.error('[admin] bot replays list failed:', error);
    return NextResponse.json(
      { error: 'Failed to load bot replays' },
      { status: 500 }
    );
  }
}
