import { NextRequest } from 'next/server';
import { getServerAuthSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { TournamentDraftEngine } from '@/lib/services/tournament-draft-engine';

export const dynamic = 'force-dynamic';

// GET /api/draft-sessions/[sessionId]/state
// Get current draft state
export async function GET(req: NextRequest, { params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  const session = await getServerAuthSession();
  if (!session?.user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  try {
    // Verify session exists and user is a participant
    const draftSession = await prisma.draftSession.findUnique({
      where: { id: sessionId },
      include: {
        participants: {
          select: { playerId: true }
        }
      }
    });

    if (!draftSession) {
      return new Response(JSON.stringify({ error: 'Draft session not found' }), { status: 404 });
    }

    const userId = session.user.id;
    const isParticipant = draftSession.participants.some(p => p.playerId === userId);
    if (!isParticipant) {
      return new Response(JSON.stringify({ error: 'Not a participant in this draft session' }), { status: 403 });
    }

    // Get current state
    const engine = new TournamentDraftEngine(sessionId);
    const currentState = await engine.getState();

    console.log(`[API/state] Session ${sessionId}, status: ${draftSession.status}, has state: ${!!currentState}`);
    if (currentState) {
      console.log(`[API/state] Phase: ${currentState.phase}, packs: ${currentState.currentPacks?.length || 0}`);
    }

    return new Response(JSON.stringify({
      draftState: currentState,
      status: draftSession.status,
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
  } catch (e: unknown) {
    console.error('Error fetching draft state:', e);
    const message = e instanceof Error ? e.message : typeof e === 'string' ? e : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), { status: 500 });
  }
}
