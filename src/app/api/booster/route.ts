import { NextRequest } from 'next/server';
import { generateBoosters } from '@/lib/booster';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const set = searchParams.get('set') || 'Alpha';
    const count = Math.max(1, Math.min(36, Number(searchParams.get('count') || '1')));
    const replaceAvatars = searchParams.get('replaceAvatars') === 'true';

    const packs = await generateBoosters(set, count, undefined, replaceAvatars);

    return new Response(JSON.stringify({ set, count, packs }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : typeof e === 'string' ? e : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), { status: 500 });
  }
}
