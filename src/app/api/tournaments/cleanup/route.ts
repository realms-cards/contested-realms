import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/**
 * POST /api/tournaments/cleanup
 * Cleans up abandoned tournaments (in registering status with no players after timeout)
 */
export async function POST() {
  try {
    // Delete tournaments in 'registering' status with no players that are older than 10 minutes
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);

    const deletedTournaments = await prisma.tournament.deleteMany({
      where: {
        status: 'registering',
        createdAt: {
          lt: tenMinutesAgo
        },
        registrations: {
          none: {}
        }
      }
    });

    console.log(`Cleaned up ${deletedTournaments.count} abandoned tournaments`);

    return new Response(JSON.stringify({
      success: true,
      deletedCount: deletedTournaments.count,
      message: `Cleaned up ${deletedTournaments.count} abandoned tournaments`
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
  } catch (e: unknown) {
    console.error('Error cleaning up tournaments:', e);
    const message = e instanceof Error ? e.message : typeof e === 'string' ? e : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), { status: 500 });
  }
}
