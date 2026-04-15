import { getAdminSession } from '@/lib/admin/auth';
import { getPerformanceStats, exportPerformanceMetrics } from '@/lib/monitoring/performance';

// GET /api/monitoring/performance
// Returns performance statistics (admin only)
export async function GET() {
  const { session, isAdmin } = await getAdminSession();

  if (!session?.user) {
    return new Response(
      JSON.stringify({ error: 'Unauthorized' }),
      { status: 401, headers: { 'content-type': 'application/json' } }
    );
  }

  if (!isAdmin) {
    return new Response(
      JSON.stringify({ error: 'Forbidden' }),
      { status: 403, headers: { 'content-type': 'application/json' } }
    );
  }

  try {
    const allMetrics = exportPerformanceMetrics();

    // Calculate stats for each unique route
    const routes = new Set(allMetrics.map(m => m.route));
    const statsByRoute: Record<string, ReturnType<typeof getPerformanceStats>> = {};

    for (const route of routes) {
      statsByRoute[route] = getPerformanceStats(route);
    }

    // Overall stats
    const overallStats = getPerformanceStats();

    return new Response(
      JSON.stringify({
        timestamp: Date.now(),
        overall: overallStats,
        byRoute: statsByRoute,
        recentRequests: allMetrics.slice(-20), // Last 20 requests
      }),
      {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { 'content-type': 'application/json' } }
    );
  }
}
