import { GameFormat, TimeFrame } from '@prisma/client';
import { NextRequest } from 'next/server';
import { getServerAuthSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

// GET /api/leaderboard?format=constructed&timeFrame=all_time&limit=100
export async function GET(req: NextRequest) {
  const session = await getServerAuthSession();
  if (!session?.user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const format = searchParams.get('format') as GameFormat || 'constructed';
    const timeFrame = searchParams.get('timeFrame') as TimeFrame || 'all_time';
    const limit = Math.min(parseInt(searchParams.get('limit') || '100'), 500);
    const offset = parseInt(searchParams.get('offset') || '0');

    // Validate format and timeFrame
    if (!['constructed', 'sealed', 'draft'].includes(format)) {
      return new Response(JSON.stringify({ error: 'Invalid format' }), { status: 400 });
    }
    if (!['all_time', 'monthly', 'weekly'].includes(timeFrame)) {
      return new Response(JSON.stringify({ error: 'Invalid timeFrame' }), { status: 400 });
    }

    const leaderboard = await prisma.leaderboardEntry.findMany({
      where: {
        format,
        timeFrame
      },
      include: {
        player: {
          select: {
            id: true,
            name: true,
            image: true
          }
        }
      },
      orderBy: [
        { rating: 'desc' },
        { winRate: 'desc' },
        { wins: 'desc' }
      ],
      take: limit,
      skip: offset
    });

    // Get total count for pagination
    const totalCount = await prisma.leaderboardEntry.count({
      where: {
        format,
        timeFrame
      }
    });

    const leaderboardData = leaderboard.map((entry, index) => ({
      rank: offset + index + 1,
      playerId: entry.playerId,
      displayName: entry.displayName,
      playerImage: entry.player.image,
      wins: entry.wins,
      losses: entry.losses,
      draws: entry.draws,
      winRate: entry.winRate,
      rating: entry.rating,
      tournamentWins: entry.tournamentWins,
      lastActive: entry.lastActive.toISOString()
    }));

    return new Response(JSON.stringify({
      leaderboard: leaderboardData,
      pagination: {
        total: totalCount,
        limit,
        offset,
        hasMore: offset + limit < totalCount
      },
      filters: {
        format,
        timeFrame
      }
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : typeof e === 'string' ? e : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), { status: 500 });
  }
}