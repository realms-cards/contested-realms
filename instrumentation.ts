/**
 * Next.js instrumentation file for server startup tasks
 * https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */

import { warmupConnection } from '@/lib/prisma';

export async function register() {
  // Only run on server startup
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // Warm up database connection to prevent cold start delays
    await warmupConnection();
  }
}
