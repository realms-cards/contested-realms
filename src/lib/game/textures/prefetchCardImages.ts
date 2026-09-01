"use client";

import { getGraphicsSettings } from "@/hooks/useGraphicsSettings";
import { getCardImageCdnUrl } from "@/lib/utils/cdnUrl";

// Slugs whose primary texture URL has already been warmed this session.
const warmed = new Set<string>();

/**
 * The URL the 3D board will request first for a card slug (KTX2 unless the
 * user forces raster). Must stay in sync with useCardTexture's URL logic so
 * the warmed HTTP cache entries are actually hit by the in-game loaders.
 */
function primaryTextureUrl(slug: string): string {
  const preferRaster = getGraphicsSettings().preferRaster;
  const cdn = getCardImageCdnUrl(slug, !preferRaster);
  if (cdn) return cdn;
  return preferRaster ? `/api/images/${slug}` : `/api/images/${slug}?ktx2=1`;
}

/**
 * Warm the browser HTTP cache for a deck's card art before the 3D board
 * mounts, so turn 1 does not fire a 50+ request burst whose failures leave
 * cards face-down. Failures are ignored - the in-game loader retries.
 */
export async function prefetchCardImages(
  slugs: Array<string | null | undefined>,
  opts: {
    concurrency?: number;
    onProgress?: (loaded: number, total: number) => void;
  } = {},
): Promise<void> {
  const unique = Array.from(
    new Set(
      slugs.filter(
        (s): s is string =>
          typeof s === "string" && s.length > 0 && !s.startsWith("token:"),
      ),
    ),
  ).filter((s) => !warmed.has(s));
  const total = unique.length;
  if (total === 0) return;
  const concurrency = Math.max(1, Math.min(opts.concurrency ?? 6, total));
  let next = 0;
  let loaded = 0;
  const worker = async () => {
    while (next < unique.length) {
      const slug = unique[next];
      next += 1;
      try {
        const res = await fetch(primaryTextureUrl(slug), {
          mode: "cors",
          credentials: "omit",
        });
        if (res.ok) {
          await res.arrayBuffer();
          warmed.add(slug);
        }
      } catch {
        // Transient failure: the in-game loader has its own retry path
      }
      loaded += 1;
      try {
        opts.onProgress?.(loaded, total);
      } catch {}
    }
  };
  await Promise.all(Array.from({ length: concurrency }, () => worker()));
}
