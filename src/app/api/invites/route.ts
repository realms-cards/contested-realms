import { NextRequest } from 'next/server';
import { getServerAuthSession } from '@/lib/auth';

export const dynamic = 'force-dynamic';

function getSocketHttpOrigin(): string {
  const exp = (process.env.NEXT_PUBLIC_WS_HTTP_ORIGIN || process.env.WS_HTTP_ORIGIN || '').trim();
  if (exp) return exp;
  const ws = (process.env.NEXT_PUBLIC_WS_URL || '').trim();
  if (ws.startsWith('ws://')) return ws.replace(/^ws:\/\//, 'http://');
  if (ws.startsWith('wss://')) return ws.replace(/^wss:\/\//, 'https://');
  return 'http://localhost:3010';
}

// POST /api/invites
// Body: { targetUserId: string }
// Behavior: requires auth; forwards invite check to Socket server by verifying availability via /players/available.
// Returns 202 if target appears in available list; 409 otherwise.
export async function POST(req: NextRequest) {
  const session = await getServerAuthSession();
  if (!session?.user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'content-type': 'application/json' } });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const targetUserId = typeof body?.targetUserId === 'string' ? body.targetUserId.trim() : '';
    if (!targetUserId) {
      return new Response(JSON.stringify({ error: 'Missing targetUserId' }), { status: 400, headers: { 'content-type': 'application/json' } });
    }

    // Check availability on the Socket server HTTP endpoint
    const origin = getSocketHttpOrigin();
    let cursor: string | null = '0';
    let found = false;
    const limit = 100; // server max

    while (cursor !== null && !found) {
      const url = new URL('/players/available', origin);
      url.searchParams.set('limit', String(limit));
      url.searchParams.set('cursor', String(cursor));
      // Optimize by filtering by last chars if userId may be large? For now, fetch pages
      const res = await fetch(url.toString(), { method: 'GET', headers: { 'accept': 'application/json' } });
      if (res.status !== 200) break;
      const json = await res.json();
      const items: Array<{ userId: string }> = Array.isArray(json?.items) ? json.items : [];
      found = items.some((p) => String(p.userId) === targetUserId);
      cursor = json?.nextCursor ?? null;
    }

    if (found) {
      // In a future iteration, we could forward an actual invite via socket or a control plane.
      return new Response(JSON.stringify({ ok: true, status: 'accepted' }), { status: 202, headers: { 'content-type': 'application/json' } });
    }

    return new Response(JSON.stringify({ ok: false, status: 'unavailable' }), { status: 409, headers: { 'content-type': 'application/json' } });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : typeof e === 'string' ? e : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), { status: 500, headers: { 'content-type': 'application/json' } });
  }
}
