import { NextRequest } from 'next/server';
import { getServerAuthSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
// Avoid importing the engine here to prevent extra DB queries; we'll parse state directly

export const dynamic = 'force-dynamic';

// GET /api/draft-sessions/[sessionId]/state
// Get current draft state
export async function GET(req: NextRequest, { params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  // Internal S2S bypass (prod guard handled by middleware)
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
    // Verify session exists and user is a participant
    const draftSession = await prisma.draftSession.findUnique({
      where: { id: sessionId },
      include: {
        participants: {
          select: { playerId: true, seatNumber: true, deckData: true },
          orderBy: { seatNumber: 'asc' },
        }
      }
    });

    if (!draftSession) {
      return new Response(JSON.stringify({ error: 'Draft session not found' }), { status: 404 });
    }

    const isParticipant = draftSession.participants.some(p => p.playerId === userId);
    if (!isParticipant) {
      return new Response(JSON.stringify({ error: 'Not a participant in this draft session' }), { status: 403 });
    }

    // Get current state from the session record directly to avoid extra DB round-trips
    let currentState: unknown = null;
    try {
      const raw = (draftSession as unknown as { draftState?: unknown }).draftState;
      currentState = typeof raw === 'string' ? JSON.parse(raw as string) : raw;
    } catch {}

    console.log(`[API/state] Session ${sessionId}, status: ${draftSession.status}, has state: ${!!currentState}`);
    try {
      const cs = currentState as { phase?: string; currentPacks?: unknown[] } | null;
      if (cs) {
        console.log(`[API/state] Phase: ${cs.phase}, packs: ${Array.isArray(cs.currentPacks) ? cs.currentPacks.length : 0}`);
      }
    } catch {}

    // Compute my picks for convenience (deck editor authoritative):
    // Prefer persisted deckData.picks on completed drafts; otherwise fall back to currentState.picks
    let myPicks: unknown[] | undefined;
    try {
      const pidList = draftSession.participants || [];
      const idx = pidList.findIndex((p) => p.playerId === userId);
      if (idx >= 0) {
        // 1) Completed drafts: prefer deckData.picks if present
        if (draftSession.status === 'completed') {
          const mine = draftSession.participants[idx];
          const dd = (mine?.deckData ?? null) as unknown;
          type DeckDataWithPicks = { picks?: unknown[] } | null;
          let picksFromDeckData: unknown[] | null = null;
          if (Array.isArray(dd)) {
            picksFromDeckData = dd as unknown[];
          } else if (dd && typeof dd === 'object') {
            const obj = dd as DeckDataWithPicks;
            if (obj && Array.isArray(obj.picks)) picksFromDeckData = obj.picks as unknown[];
          }
          if (Array.isArray(picksFromDeckData)) {
            myPicks = picksFromDeckData;
          }
        }
        // 2) Fallback to current state JSON
        if (!myPicks) {
          try {
            const cs = currentState as { picks?: unknown[] } | null;
            if (cs && Array.isArray(cs.picks)) {
              myPicks = (cs.picks[idx] as unknown[]) || [];
            }
          } catch {}
        }
      }
    } catch {}

    return new Response(JSON.stringify({
      draftState: currentState,
      status: draftSession.status,
      myPicks: myPicks ?? null,
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
