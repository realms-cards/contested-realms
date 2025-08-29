import { NextRequest } from 'next/server';
import path from 'node:path';
import { promises as fs } from 'node:fs';

export const dynamic = 'force-dynamic';

function contentTypeFor(name: string) {
  const lower = name.toLowerCase();
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.ktx2')) return 'image/ktx2';
  return 'application/octet-stream';
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ name: string }> }) {
  try {
    const { name } = await params;
    // Basic safety: names only, no path separators
    if (!/^[a-zA-Z0-9_.-]+$/.test(name)) {
      return new Response('Bad Request', { status: 400 });
    }
    const filePath = path.join(process.cwd(), 'data', name);
    const buf = await fs.readFile(filePath);
    const body = new Uint8Array(buf);
    return new Response(body, {
      status: 200,
      headers: {
        'content-type': contentTypeFor(name),
        'cache-control': 'public, max-age=31536000, immutable',
      },
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ error: message }), { status: 404 });
  }
}
