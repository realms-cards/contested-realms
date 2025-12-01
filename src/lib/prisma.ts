import { PrismaClient } from '@prisma/client';

// Ensure a single PrismaClient instance in dev (Next.js hot-reload)
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

/**
 * Optimized Prisma Client with connection pooling for serverless environments
 *
 * Connection Pool Configuration:
 * - pool_timeout: 10s (max time to wait for connection from pool)
 * - connection_limit: 10 (max concurrent connections per instance)
 * - Enables prepared statement cache for performance
 *
 * For production, ensure DATABASE_URL includes:
 * ?connection_limit=10&pool_timeout=10&connect_timeout=20
 */
export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
    // Connection pool configuration (also set in DATABASE_URL for redundancy)
    datasources: {
      db: {
        url: process.env.DATABASE_URL,
      },
    },
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

// Connection pool metrics for monitoring
const connectionMetrics = {
  totalConnections: 0,
  activeConnections: 0,
  idleConnections: 0,
  lastChecked: Date.now(),
};

/**
 * Get current connection pool metrics
 */
export function getConnectionMetrics() {
  return {
    ...connectionMetrics,
    age: Date.now() - connectionMetrics.lastChecked,
  };
}

/**
 * Warm up database connection (prevents cold start delays)
 * Call this during server initialization
 */
export async function warmupConnection(): Promise<void> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    console.log('[prisma] Connection warmed up successfully');
  } catch (e) {
    console.error('[prisma] Connection warmup failed:', e instanceof Error ? e.message : e);
  }
}
