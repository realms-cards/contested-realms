/**
 * Performance monitoring utilities for API routes
 *
 * Usage:
 * ```typescript
 * import { withTiming, logPerformance } from '@/lib/monitoring/performance';
 *
 * export async function GET(req: NextRequest) {
 *   const timer = performance.now();
 *   // ... your code ...
 *   logPerformance('GET /api/tournaments', performance.now() - timer);
 * }
 * ```
 */

interface PerformanceMetrics {
  route: string;
  duration: number;
  timestamp: number;
}

// In-memory performance log (last 100 entries)
const performanceLog: PerformanceMetrics[] = [];
const MAX_LOG_SIZE = 100;

/**
 * Log performance metrics for an API route
 * @param route - Route identifier (e.g., 'GET /api/tournaments')
 * @param duration - Duration in milliseconds
 */
export function logPerformance(route: string, duration: number): void {
  const metric: PerformanceMetrics = {
    route,
    duration,
    timestamp: Date.now(),
  };

  performanceLog.push(metric);

  // Keep only last MAX_LOG_SIZE entries
  if (performanceLog.length > MAX_LOG_SIZE) {
    performanceLog.shift();
  }

  // Log slow requests (>1s) to console
  if (duration > 1000) {
    console.warn(`[PERF] Slow request: ${route} took ${duration.toFixed(2)}ms`);
  } else if (process.env.NODE_ENV === 'development') {
    console.log(`[PERF] ${route}: ${duration.toFixed(2)}ms`);
  }
}

/**
 * Get performance statistics for a specific route
 * @param route - Route identifier to filter by (optional)
 * @returns Performance statistics
 */
export function getPerformanceStats(route?: string) {
  const filtered = route
    ? performanceLog.filter(m => m.route === route)
    : performanceLog;

  if (filtered.length === 0) {
    return null;
  }

  const durations = filtered.map(m => m.duration);
  const sorted = [...durations].sort((a, b) => a - b);

  return {
    count: filtered.length,
    avg: durations.reduce((a, b) => a + b, 0) / durations.length,
    min: Math.min(...durations),
    max: Math.max(...durations),
    p50: sorted[Math.floor(sorted.length * 0.5)],
    p95: sorted[Math.floor(sorted.length * 0.95)],
    p99: sorted[Math.floor(sorted.length * 0.99)],
  };
}

/**
 * Higher-order function to wrap API route handlers with timing
 *
 * @example
 * ```typescript
 * export const GET = withTiming('GET /api/tournaments', async (req: NextRequest) => {
 *   // Your handler code
 *   return new Response(JSON.stringify(data), { status: 200 });
 * });
 * ```
 */
export function withTiming<T extends (...args: unknown[]) => Promise<Response>>(
  route: string,
  handler: T
): T {
  return (async (...args: unknown[]) => {
    const start = performance.now();
    try {
      const response = await handler(...args);
      logPerformance(route, performance.now() - start);
      return response;
    } catch (error) {
      logPerformance(route, performance.now() - start);
      throw error;
    }
  }) as T;
}

/**
 * Clear performance log (useful for testing)
 */
export function clearPerformanceLog(): void {
  performanceLog.length = 0;
}

/**
 * Export all performance metrics
 */
export function exportPerformanceMetrics(): PerformanceMetrics[] {
  return [...performanceLog];
}
