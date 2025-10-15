import { NextRequest, NextResponse } from 'next/server';
import { AdminAccessError, requireAdminSession } from '@/lib/admin/auth';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/replays/bots/[matchId]
 * Returns full replay data for a specific bot match (admin only)
 *
 * This endpoint verifies the match involves at least one CPU bot before returning data
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ matchId: string }> }
): Promise<NextResponse> {
  try {
    await requireAdminSession();

    const { matchId } = await params;

    if (!matchId) {
      return NextResponse.json(
        { error: 'Match ID is required' },
        { status: 400 }
      );
    }

    // First verify this is a bot match
    const matchResult = await prisma.matchResult.findFirst({
      where: { matchId },
    });

    if (!matchResult) {
      return NextResponse.json(
        { error: 'Match not found' },
        { status: 404 }
      );
    }

    // Verify at least one player is a bot
    const isBotMatch = Array.isArray(matchResult.players) &&
      matchResult.players.some((player) => {
        if (!player || typeof player !== 'object') return false;
        const p = player as Record<string, unknown>;
        const playerId = p?.id;
        return typeof playerId === 'string' &&
               (playerId.startsWith('cpu_') || playerId.startsWith('host_'));
      });

    if (!isBotMatch) {
      return NextResponse.json(
        { error: 'Not a bot match' },
        { status: 403 }
      );
    }

    // Load full replay data
    const session = await prisma.onlineMatchSession.findUnique({
      where: { id: matchId },
    });

    const actions = await prisma.onlineMatchAction.findMany({
      where: { matchId },
      orderBy: { timestamp: 'asc' },
      select: {
        patch: true,
        timestamp: true,
        playerId: true,
      },
    });

    // Get player names
    const playerIds = Array.isArray(matchResult.players)
      ? matchResult.players
          .map((p) => {
            if (!p || typeof p !== 'object') return null;
            const player = p as Record<string, unknown>;
            return typeof player.id === 'string' ? player.id : null;
          })
          .filter((id): id is string => id !== null)
      : (Array.isArray(session?.playerIds) ? session.playerIds : []);

    const playerNames = Array.isArray(matchResult.players)
      ? matchResult.players.map((p) => {
          if (!p || typeof p !== 'object') return 'Player';
          const player = p as Record<string, unknown>;
          const displayName = typeof player.displayName === 'string' ? player.displayName : null;
          const id = typeof player.id === 'string' ? player.id : null;
          return displayName || id || 'Player';
        })
      : [];

    const endTime = matchResult.completedAt
      ? new Date(matchResult.completedAt).getTime()
      : (session?.updatedAt ? new Date(session.updatedAt).getTime() : undefined);

    const duration = typeof matchResult.duration === 'number' ? matchResult.duration * 1000 : undefined;
    const startTime = endTime && duration
      ? endTime - duration
      : (session?.createdAt ? new Date(session.createdAt).getTime() : (endTime || Date.now()));

    // Build initial state
    const initialState = {
      playerIds: playerIds as string[],
      seed: session?.seed || '',
      matchType: session?.matchType || 'constructed',
      playerDecks: session?.playerDecks || null,
    };

    // Format actions
    const formattedActions = actions.map((a) => ({
      patch: a.patch,
      timestamp: Number(a.timestamp || 0),
      playerId: a.playerId || 'system',
    }));

    // Find setup start index (cut beginning noise)
    const cutIdx = findSetupStartIndex(formattedActions);
    let finalActions = formattedActions;
    let finalStartTime = startTime;

    if (cutIdx > 0 && cutIdx < formattedActions.length) {
      const t0 = formattedActions[cutIdx].timestamp;
      finalActions = formattedActions.slice(cutIdx);
      finalStartTime = t0;
    }

    return NextResponse.json({
      matchId,
      playerNames,
      startTime: finalStartTime,
      endTime,
      initialState,
      actions: finalActions,
      lobbyName: matchResult.lobbyName,
    });
  } catch (error) {
    if (error instanceof AdminAccessError) {
      return new NextResponse('Forbidden', { status: 403 });
    }
    console.error('[admin] bot replay load failed:', error);
    return NextResponse.json(
      { error: 'Failed to load bot replay' },
      { status: 500 }
    );
  }
}

// Helper function to find the first meaningful setup action
function findSetupStartIndex(actions: Array<{ patch: unknown }>): number {
  for (let i = 0; i < actions.length; i++) {
    const p = actions[i]?.patch;
    if (!p || typeof p !== 'object') continue;

    const patch = p as Record<string, unknown>;
    if (patch.setupWinner === 'p1' || patch.setupWinner === 'p2') return i;

    const dr = patch.d20Rolls as { p1?: number | null; p2?: number | null } | undefined;
    if (dr && (dr.p1 !== null && dr.p1 !== undefined || dr.p2 !== null && dr.p2 !== undefined)) {
      return i;
    }
  }
  return -1;
}
