import { NextRequest } from 'next/server';
import { getServerAuthSession } from '@/lib/auth';
import { TournamentDraftEngine } from '@/lib/services/tournament-draft-engine';

export const dynamic = 'force-dynamic';

// POST /api/draft-sessions/[sessionId]/pick
// Record a player's pick in the tournament draft session
export async function POST(req: NextRequest, { params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;

  // Internal S2S bypass: validate headers and use X-User-Id as the actor
  const flag = (req.headers.get('x-internal-call') || '').toLowerCase();
  const isOn = flag === '1' || flag === 'true' || flag === 'yes' || flag === 'on';
  const uidHeader = req.headers.get('x-user-id') || '';
  // Treat as internal if the flag is on OR we have an explicit X-User-Id header
  // Middleware enforces key checks in production environments
  const isInternal = isOn || !!uidHeader;

  let userId: string;
  if (isInternal) {
    const uid = uidHeader;
    if (!uid) {
      return new Response(JSON.stringify({ error: 'Missing X-User-Id for internal request' }), { status: 400 });
    }
    userId = uid;
  } else {
    const session = await getServerAuthSession();
    if (!session?.user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    }
    userId = session.user.id;
  }

  try {
    const body = await req.json();
    const { cardId } = body as { cardId?: string };

    if (!cardId) {
      return new Response(JSON.stringify({ error: 'Missing required field: cardId' }), { status: 400 });
    }

    // Use draft engine to process the pick
    const engine = new TournamentDraftEngine(sessionId);
    const updatedState = await engine.makePick(userId, cardId);

    console.log(
      `[API/pick] session=${sessionId} user=${userId} cardId=${cardId} -> pickNumber=${updatedState.pickNumber} waitingFor=${updatedState.waitingFor.length}`
    );

    // Broadcast state update to all participants
    await engine.broadcastStateUpdate();

    return new Response(JSON.stringify({
      success: true,
      draftState: updatedState,
      message: 'Pick recorded successfully'
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : typeof e === 'string' ? e : 'Unknown error';
    const conflictSignals = [
      'Not in picking phase',
      'Not player',
      'Out-of-order or duplicate pick',
      'Card', // card not found in current pack
    ];
    const isConflict = conflictSignals.some((s) => message.includes(s))
      // Serialize conflicts from the DB layer (e.g., Postgres code 40001)
      || message.includes('could not serialize access due to concurrent update');
    console.error('[API/pick] error:', message);
    return new Response(JSON.stringify({ error: message }), { status: isConflict ? 409 : 500 });
  }
}
