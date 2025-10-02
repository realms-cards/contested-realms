import jwt from 'jsonwebtoken';

import { getServerAuthSession } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// GET /api/socket-token
// Generate a short-lived JWT token for socket.io authentication
export async function GET() {
  try {
    const session = await getServerAuthSession();

    console.log('[socket-token] Session check:', {
      hasSession: !!session,
      hasUser: !!session?.user,
      userId: session?.user?.id
    });

    if (!session?.user) {
      console.log('[socket-token] No session/user, returning 401');
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'content-type': 'application/json' }
      });
    }

    const secret = process.env.NEXTAUTH_SECRET;
    if (!secret) {
      console.error('[socket-token] NEXTAUTH_SECRET not configured');
      return new Response(JSON.stringify({ error: 'Server configuration error' }), {
        status: 500,
        headers: { 'content-type': 'application/json' }
      });
    }

    // Generate short-lived token (5 minutes)
    const userId = (session.user as { id?: string }).id;
    const userName = (session.user as { name?: string | null }).name;
    const userEmail = (session.user as { email?: string | null }).email;

    if (!userId) {
      console.error('[socket-token] User ID is missing from session');
      return new Response(JSON.stringify({ error: 'User ID missing' }), {
        status: 400,
        headers: { 'content-type': 'application/json' }
      });
    }

    const token = jwt.sign(
      {
        userId,
        name: userName,
        email: userEmail,
      },
      secret,
      { expiresIn: '5m' }
    );

    console.log('[socket-token] Token generated successfully for user:', userId);

    return new Response(JSON.stringify({ token }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
  } catch (e: unknown) {
    console.error('[socket-token] Error generating token:', e);
    const message = e instanceof Error ? e.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 400,
      headers: { 'content-type': 'application/json' }
    });
  }
}
