import { NextRequest } from 'next/server';
import { getServerAuthSession } from '@/lib/auth';
import { logPerformance } from '@/lib/monitoring/performance';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

// GET /api/draft-sessions/[sessionId]
// Fetch draft session details
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const startTime = performance.now();
  const { sessionId } = await params;
  const session = await getServerAuthSession();

  if (!session?.user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'content-type': 'application/json' },
    });
  }

  try {
    const draftSession = await prisma.draftSession.findUnique({
      where: { id: sessionId },
      include: {
        participants: {
          include: {
            player: {
              select: { id: true, name: true },
            },
          },
          orderBy: { seatNumber: 'asc' },
        },
      },
    });

    if (!draftSession) {
      return new Response(JSON.stringify({ error: 'Draft session not found' }), {
        status: 404,
        headers: { 'content-type': 'application/json' },
      });
    }

    // Check if user is a participant
    const userId = session.user.id;
    const isParticipant = draftSession.participants.some(
      (p) => p.playerId === userId
    );

    if (!isParticipant) {
      return new Response(
        JSON.stringify({ error: 'You are not a participant in this draft session' }),
        {
          status: 403,
          headers: { 'content-type': 'application/json' },
        }
      );
    }

    logPerformance(`GET /api/draft-sessions/${sessionId}`, performance.now() - startTime);
    return new Response(
      JSON.stringify({
        id: draftSession.id,
        tournamentId: draftSession.tournamentId,
        status: draftSession.status,
        participants: draftSession.participants.map((p) => ({
          playerId: p.playerId,
          playerName: p.player.name || 'Anonymous',
          seatNumber: p.seatNumber,
          status: p.status,
        })),
        packConfiguration: draftSession.packConfiguration,
        settings: draftSession.settings,
        startedAt: draftSession.startedAt?.toISOString() || null,
      }),
      {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }
    );
  } catch (e: unknown) {
    console.error('Error fetching draft session:', e);
    logPerformance(`GET /api/draft-sessions/${sessionId}`, performance.now() - startTime);
    const message =
      e instanceof Error ? e.message : typeof e === 'string' ? e : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    });
  }
}
