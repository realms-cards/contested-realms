import { NextRequest } from 'next/server';
import { getServerAuthSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

// GET /api/friends
// Returns the current user's friend list (users they have added)
export async function GET() {
  const session = await getServerAuthSession();
  if (!session?.user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'content-type': 'application/json' } });
  }

  try {
    const friendships = await prisma.friendship.findMany({
      where: { ownerUserId: session.user.id },
      include: {
        target: {
          select: { id: true, name: true, image: true },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    const friends = friendships.map((f) => f.target);
    return new Response(JSON.stringify({ friends }), { status: 200, headers: { 'content-type': 'application/json' } });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : typeof e === 'string' ? e : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), { status: 500, headers: { 'content-type': 'application/json' } });
  }
}

// POST /api/friends
// Body: { targetUserId: string }

// DELETE /api/friends
// Body or query: { targetUserId: string }
// Behavior: requires auth; remove Friendship; return 200 whether existed or not (idempotent)
export async function DELETE(req: NextRequest) {
  const session = await getServerAuthSession();
  if (!session?.user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'content-type': 'application/json' } });
  }
  try {
    const { searchParams } = new URL(req.url);
    const fromQuery = searchParams.get('targetUserId');
    let targetUserId: string | null = null;
    try {
      const body = await req.json().catch(() => ({} as unknown));
      const id = (body as { targetUserId?: string })?.targetUserId;
      if (typeof id === 'string' && id.trim()) targetUserId = id.trim();
    } catch {}
    if (!targetUserId && typeof fromQuery === 'string' && fromQuery.trim()) targetUserId = fromQuery.trim();

    if (!targetUserId) {
      return new Response(JSON.stringify({ error: 'Missing targetUserId' }), { status: 400, headers: { 'content-type': 'application/json' } });
    }
    if (targetUserId === session.user.id) {
      return new Response(JSON.stringify({ error: 'Cannot remove yourself' }), { status: 400, headers: { 'content-type': 'application/json' } });
    }

    // Attempt delete; ignore if not found (idempotent)
    await prisma.friendship.delete({
      where: { ownerUserId_targetUserId: { ownerUserId: session.user.id, targetUserId } },
    }).catch(() => null);

    return new Response(JSON.stringify({ ok: true, status: 'removed' }), { status: 200, headers: { 'content-type': 'application/json' } });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : typeof e === 'string' ? e : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), { status: 500, headers: { 'content-type': 'application/json' } });
  }
}
// Behavior: requires auth; upsert Friendship; return 201 new, 200 already friend
export async function POST(req: NextRequest) {
  const session = await getServerAuthSession();
  if (!session?.user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'content-type': 'application/json' } });
  }

  try {
    // Ensure the authenticated user exists in the database (useful after local DB resets)
    const me = await prisma.user.findUnique({ where: { id: session.user.id } });
    if (!me) {
      return new Response(
        JSON.stringify({
          error:
            'Your account could not be found in the database. If you already have a user account, please sign out, clear your browser cookies and sign back in',
        }),
        { status: 401, headers: { 'content-type': 'application/json' } },
      );
    }

    const body = await req.json().catch(() => ({}));
    const targetUserId = typeof body?.targetUserId === 'string' ? body.targetUserId.trim() : '';

    if (!targetUserId) {
      return new Response(JSON.stringify({ error: 'Missing targetUserId' }), { status: 400, headers: { 'content-type': 'application/json' } });
    }
    if (targetUserId === me.id) {
      return new Response(JSON.stringify({ error: 'Cannot add yourself as a friend' }), { status: 400, headers: { 'content-type': 'application/json' } });
    }

    // Ensure target exists (optional but helpful for UX)
    const target = await prisma.user.findUnique({ where: { id: targetUserId } });
    if (!target) {
      return new Response(JSON.stringify({ error: 'Target user not found' }), { status: 404, headers: { 'content-type': 'application/json' } });
    }

    // Check if friendship already exists (owner -> target)
    const existing = await prisma.friendship.findUnique({
      where: { ownerUserId_targetUserId: { ownerUserId: me.id, targetUserId } },
    }).catch(() => null);

    if (existing) {
      return new Response(JSON.stringify({ ok: true, status: 'already_friend' }), { status: 200, headers: { 'content-type': 'application/json' } });
    }

    // Create friendship
    await prisma.friendship.create({
      data: {
        ownerUserId: me.id,
        targetUserId,
      },
    });

    return new Response(JSON.stringify({ ok: true, status: 'created' }), { status: 201, headers: { 'content-type': 'application/json' } });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : typeof e === 'string' ? e : 'Unknown error';
    // If unique constraint hit due to race, return 200 idempotent
    if (message && message.toLowerCase().includes('unique')) {
      return new Response(JSON.stringify({ ok: true, status: 'already_friend' }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    return new Response(JSON.stringify({ error: message }), { status: 500, headers: { 'content-type': 'application/json' } });
  }
}
