import { promises as fs } from 'node:fs';
import path from 'node:path';
import { NextRequest } from 'next/server';

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
    
    // If a CDN origin is configured, permanently redirect there and prefer .webp for raster
    const cdn = process.env.ASSET_CDN_ORIGIN?.trim();
    if (cdn) {
      const outName = (() => {
        if (name.toLowerCase().endsWith('.ktx2')) return name;
        if (name.match(/\.(png|jpe?g|webp)$/i)) {
          return name.replace(/\.[^.]+$/, '.webp');
        }
        return name;
      })();
      const cdnUrl = `${cdn.replace(/\/$/, '')}/${outName}`;
      return new Response(null, {
        status: 308,
        headers: {
          Location: cdnUrl,
          'Cache-Control': 'public, max-age=31536000, immutable',
        },
      });
    }

    // Check data-ktx2, then data-webp (for raster), then data directories
    const candidates: string[] = [];
    if (name.toLowerCase().endsWith('.ktx2')) {
      candidates.push(path.join(process.cwd(), 'data-ktx2', name));
      // allow falling back to raster by same basename if needed (rare)
      const base = name.replace(/\.[^.]+$/, '');
      candidates.push(path.join(process.cwd(), 'data-webp', `${base}.webp`));
      candidates.push(path.join(process.cwd(), 'data', `${base}.png`));
      candidates.push(path.join(process.cwd(), 'data', `${base}.jpg`));
      candidates.push(path.join(process.cwd(), 'data', `${base}.jpeg`));
    } else {
      // For raster: prefer .webp in data-webp, then original in data
      const ext = path.extname(name).toLowerCase();
      if (ext === '.png' || ext === '.jpg' || ext === '.jpeg') {
        const webpName = name.replace(/\.[^.]+$/, '.webp');
        candidates.push(path.join(process.cwd(), 'data-webp', webpName));
      }
      candidates.push(path.join(process.cwd(), 'data-webp', name));
      candidates.push(path.join(process.cwd(), 'data', name));
    }
    
    let filePath: string | null = null;
    for (const candidate of candidates) {
      try {
        await fs.access(candidate);
        filePath = candidate;
        break;
      } catch {}
    }
    
    if (!filePath) {
      return new Response('Not found', { status: 404 });
    }
    
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
