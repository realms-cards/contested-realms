import jwt from 'jsonwebtoken';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session || !session.user?.id) {
    return new Response('Unauthorized', { status: 401 });
  }
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) {
    return new Response('Server misconfigured', { status: 500 });
  }
  const uid = session.user.id;
  const name = session.user.name || 'Player';
  const now = Math.floor(Date.now() / 1000);
  const token = jwt.sign(
    {
      sub: uid,
      uid,
      name,
      iat: now,
      iss: 'socket-token',
    },
    secret,
    { expiresIn: '10m' },
  );
  return new Response(JSON.stringify({ token }), {
    headers: { 'Content-Type': 'application/json' },
  });
}
