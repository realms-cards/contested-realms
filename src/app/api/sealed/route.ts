import { NextRequest } from 'next/server';
import { generateBoosters } from '@/lib/booster';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const set = searchParams.get('set') || 'Alpha';
    const packs = Math.max(1, Math.min(12, Number(searchParams.get('packs') || '6')));

    const boosters = await generateBoosters(set, packs);

    return new Response(JSON.stringify({ set, packs, boosters }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : typeof e === 'string' ? e : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), { status: 500 });
  }
}
