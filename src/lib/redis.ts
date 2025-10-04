import Redis from 'ioredis';

let pub: Redis | null = null;

export function getRedis(): Redis {
  if (!pub) {
    const url = process.env.REDIS_URL || 'redis://localhost:6379';
    pub = new Redis(url);
  }
  return pub;
}

export async function publish(channel: string, message: unknown): Promise<void> {
  try {
    const cli = getRedis();
    await cli.publish(channel, JSON.stringify(message ?? null));
  } catch (e) {
    // Best-effort; avoid throwing from API routes on broadcast failures
    try { console.warn('[redis] publish failed:', (e as Error)?.message || e); } catch {}
  }
}
