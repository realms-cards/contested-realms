import { getServerAuthSession } from '@/lib/auth';
import { getConnectionMetrics } from '@/lib/prisma';
import { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * GET /api/monitoring/connections
 * Returns database connection pool metrics
 * Requires admin authentication
 */
export async function GET(req: NextRequest) {
  const session = await getServerAuthSession();

  // Only admins can access monitoring endpoints
  if (!session?.user || session.user.role !== 'admin') {
    return new Response(
      JSON.stringify({ error: 'Unauthorized' }),
      {
        status: 403,
        headers: { 'content-type': 'application/json' }
      }
    );
  }

  try {
    const metrics = getConnectionMetrics();

    return new Response(
      JSON.stringify({
        pool: metrics,
        timestamp: Date.now(),
        environment: process.env.NODE_ENV,
      }),
      {
        status: 200,
        headers: {
          'content-type': 'application/json',
          'Cache-Control': 'no-store', // Never cache monitoring data
        },
      }
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: message }),
      {
        status: 500,
        headers: { 'content-type': 'application/json' },
      }
    );
  }
}
