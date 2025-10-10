import { NextRequest } from 'next/server';
import { getServerAuthSession } from '@/lib/auth';
import { TournamentDraftEngine } from '@/lib/services/tournament-draft-engine';

export const dynamic = 'force-dynamic';

// POST /api/draft-sessions/[sessionId]/choose-pack
// Player chooses which pre-generated pack to open for the current round
export async function POST(req: NextRequest, { params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;

  // Internal S2S bypass (prod guarded in middleware)
  const flag = (req.headers.get('x-internal-call') || '').toLowerCase();
  const isOn = flag === '1' || flag === 'true' || flag === 'yes' || flag === 'on';
  const uidHeader = req.headers.get('x-user-id') || '';
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
    const packIndex = typeof body?.packIndex === 'number' ? body.packIndex : undefined;
    const setChoice = typeof body?.setChoice === 'string' ? body.setChoice : undefined;

    const engine = new TournamentDraftEngine(sessionId);
    const updated = await engine.choosePack(userId, { packIndex, setChoice });
    console.log(`[API/choose-pack] session=${sessionId} user=${userId} packIndex=${String(packIndex)} set=${String(setChoice)} phase=${updated.phase}`);

    await engine.broadcastStateUpdate();

    return new Response(
      JSON.stringify({ success: true, draftState: updated }),
      { status: 200, headers: { 'content-type': 'application/json' } }
    );
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : typeof e === 'string' ? e : 'Unknown error';
    const conflictSignals = [
      'Not in pack selection phase',
      'Player not found',
    ];
    const isConflict = conflictSignals.some((s) => message.includes(s));
    console.error('[API/choose-pack] error:', message);
    return new Response(JSON.stringify({ error: message }), { status: isConflict ? 409 : 500 });
  }
}
