// Utilities for building asset/texture URLs that can transparently point to a CDN
// Usage: set NEXT_PUBLIC_TEXTURE_ORIGIN on Vercel (e.g. https://cdn.realms.cards)
// Then call assetUrl('/data-ktx2/xyz.ktx2') or ktx2Url('xyz.ktx2') from the client.

const ORIGIN = (process.env.NEXT_PUBLIC_TEXTURE_ORIGIN || '').trim().replace(/\/$/, '');

function join(base: string, path: string): string {
  const p = path.startsWith('/') ? path : `/${path}`;
  if (!base) return p; // fallback to app origin/static path
  return `${base}${p}`;
}

export function getTextureOrigin(): string | null {
  return ORIGIN || null;
}

export function assetUrl(path: string): string {
  return join(ORIGIN, path);
}

export function ktx2Url(relativePath: string): string {
  const clean = relativePath.replace(/^\/+/, '');
  return assetUrl(`/data-ktx2/${clean}`);
}

export function webpUrl(relativePath: string): string {
  const clean = relativePath.replace(/^\/+/, '');
  return assetUrl(`/data-webp/${clean}`);
}

export function imgUrl(relativePath: string): string {
  const clean = relativePath.replace(/^\/+/, '');
  return assetUrl(`/data/${clean}`);
}

/**
 * Get URL for cardback atlas (landscape orientation).
 * Returns CDN URL if NEXT_PUBLIC_TEXTURE_ORIGIN is set, otherwise falls back to API route.
 */
export function cardbackAtlasUrl(): string {
  if (ORIGIN) {
    return `${ORIGIN}/cardback_atlas_landscape.webp`;
  }
  return '/api/assets/cardback_atlas_landscape.png';
}

/**
 * Get URL for spellbook cardback.
 * Returns CDN URL if NEXT_PUBLIC_TEXTURE_ORIGIN is set, otherwise falls back to API route.
 */
export function cardbackSpellbookUrl(): string {
  if (ORIGIN) {
    return `${ORIGIN}/cardback_spellbook.webp`;
  }
  return '/api/assets/cardback_spellbook.png';
}
