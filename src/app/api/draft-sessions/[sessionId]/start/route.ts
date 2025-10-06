import { NextRequest } from 'next/server';
import { getServerAuthSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { TournamentDraftEngine } from '@/lib/services/tournament-draft-engine';

export const dynamic = 'force-dynamic';

// POST /api/draft-sessions/[sessionId]/start
// Initialize and start the draft session
export async function POST(req: NextRequest, { params }: { params: Promise<{ sessionId: string }> }) {
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

    // If already completed, do NOT re-initialize. Return final state for clients to transition to deck build.
    if (draftSession.status === 'completed') {
      try {
        const engine = new TournamentDraftEngine(sessionId);
        const current = await engine.getState();
        return new Response(
          JSON.stringify({
            success: true,
            draftState: current ?? draftSession.draftState ?? null,
            message: 'Draft session already completed',
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        );
      } catch {
        return new Response(
          JSON.stringify({ success: true, draftState: draftSession.draftState ?? null, message: 'Draft session already completed' }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        );
      }
    }

    // Idempotent start: if active and has state, return current state
    if (draftSession.status === 'active' && draftSession.draftState) {
      console.log(`[API] Draft session ${sessionId} already started and has state - returning current state (200)`);
      try {
        const engine = new TournamentDraftEngine(sessionId);
        const current = await engine.getState();
        return new Response(JSON.stringify({
          success: true,
          draftState: current,
          message: 'Draft session already started'
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      } catch {
        return new Response(JSON.stringify({
          success: true,
          draftState: draftSession.draftState,
          message: 'Draft session already started'
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
    }

    if (draftSession.status === 'active' && !draftSession.draftState) {
      console.log(`[API] Draft session ${sessionId} is active but has no state - allowing restart`);
    }

    // Initialize draft engine and generate packs
    console.log(`[API] Starting draft session ${sessionId}`);
    const engine = new TournamentDraftEngine(sessionId);

    console.log(`[API] Initializing draft engine...`);
    const initialState = await engine.initialize();

    console.log(`[API] Draft initialized successfully, phase: ${initialState.phase}`);

    // Broadcast state to all participants
    await engine.broadcastStateUpdate();

    return new Response(JSON.stringify({
      success: true,
      draftState: initialState,
      message: 'Draft session started successfully'
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
  } catch (e: unknown) {
    console.error('[API] Error starting draft session:', e);
    if (e instanceof Error) {
      console.error('[API] Error stack:', e.stack);
    }
    const message = e instanceof Error ? e.message : typeof e === 'string' ? e : 'Unknown error';
    return new Response(JSON.stringify({ error: message, details: e instanceof Error ? e.stack : undefined }), { status: 500 });
  }
}
