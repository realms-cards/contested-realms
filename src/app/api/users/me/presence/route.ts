import { NextRequest } from 'next/server';
import { getServerAuthSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

// GET /api/users/me/presence -> { hidden: boolean }
export async function GET() {
  const session = await getServerAuthSession();
  if (!session?.user?.id) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'content-type': 'application/json' } });
  }
  try {
    const me = await prisma.user.findUnique({ where: { id: session.user.id } });
    if (!me) {
      return new Response(JSON.stringify({ error: 'User not found' }), { status: 404, headers: { 'content-type': 'application/json' } });
    }
    const hidden = (me as unknown as { presenceHidden?: boolean }).presenceHidden ?? false;
    return new Response(JSON.stringify({ hidden: !!hidden }), { status: 200, headers: { 'content-type': 'application/json' } });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : typeof e === 'string' ? e : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), { status: 500, headers: { 'content-type': 'application/json' } });
  }
}

// PATCH /api/users/me/presence
// Body: { hidden: boolean }
export async function PATCH(req: NextRequest) {
  const session = await getServerAuthSession();
  if (!session?.user?.id) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'content-type': 'application/json' } });
  }
  try {
    const body = await req.json().catch(() => ({}));
    const hiddenRaw = (body && typeof body.hidden !== 'undefined') ? body.hidden : undefined;
    if (typeof hiddenRaw !== 'boolean') {
      return new Response(JSON.stringify({ error: 'Missing or invalid "hidden" boolean' }), { status: 400, headers: { 'content-type': 'application/json' } });
    }
    // @ts-expect-error Prisma Client types may be stale; presenceHidden exists in schema
    const me = await prisma.user.update({ where: { id: session.user.id }, data: { presenceHidden: hiddenRaw } });
    const hidden = (me as unknown as { presenceHidden?: boolean }).presenceHidden ?? hiddenRaw;
    return new Response(JSON.stringify({ ok: true, hidden: !!hidden }), { status: 200, headers: { 'content-type': 'application/json' } });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : typeof e === 'string' ? e : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), { status: 500, headers: { 'content-type': 'application/json' } });
  }
}
