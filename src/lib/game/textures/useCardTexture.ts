"use client";

import { useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  SRGBColorSpace,
  Texture,
  TextureLoader,
  type WebGLRenderer,
} from "three";
import { KTX2Loader } from "three/examples/jsm/loaders/KTX2Loader.js";
import { exposeTextureCache } from "./textureMonitoring";

export interface UseCardTextureOptions {
  slug?: string;
  textureUrl?: string;
  // If true, skip attempting KTX2 and load raster (WebP/PNG) directly.
  // Useful in draft where network size matters and cards churn quickly.
  preferRaster?: boolean;
}

// --- Global caches & helpers ---
// Cache textures by final loaded URL with refcounts so multiple components share one GPU resource.
// When refs drop to 0, we keep the texture in a soft-cache for a short TTL to avoid thrash on rapid churn.
type CacheEntry = {
  texture: Texture;
  refs: number;
  lastUsed: number;
  evictTimer?: number;
};
const textureCache = new Map<string, CacheEntry>();
// Pending loads by URL to dedupe concurrent requests.
const pendingLoads = new Map<string, Promise<Texture>>();

// Expose cache to monitoring utilities for debugging and performance tracking
if (typeof globalThis !== 'undefined') {
  exposeTextureCache(textureCache, pendingLoads);
}

// Single KTX2Loader per app to reuse workers/transcoder and internal caches across all canvases.
let globalKtx2Loader: KTX2Loader | null = null;
// Remember KTX2 URLs that failed recently; retry after a cooldown.
const ktx2FailureTimes = new Map<string, number>();
const KTX2_RETRY_DELAY_MS = (() => {
  const raw = process.env.NEXT_PUBLIC_KTX2_RETRY_MS;
  const parsed = raw ? Number(raw) : NaN;
  if (Number.isFinite(parsed) && parsed >= 0) {
    return parsed;
  }
  // Default to 60 seconds before re-attempting.
  return 60_000;
})();

function getKTX2Loader(gl: WebGLRenderer): KTX2Loader {
  if (!globalKtx2Loader) {
    const loader = new KTX2Loader();
    // Allow overriding transcoder path via env; default to self-hosted /ktx2/
    const envPath = process.env.NEXT_PUBLIC_KTX2_TRANSCODER_PATH;
    loader.setTranscoderPath(envPath && envPath.trim() ? envPath : "/ktx2/");
    // Ensure cross-origin requests (after CDN redirect) are made with anonymous CORS
    try {
      // KTX2Loader extends Loader, which supports setCrossOrigin
      (
        loader as unknown as { setCrossOrigin?: (v: string) => void }
      ).setCrossOrigin?.("anonymous");
    } catch {}
    globalKtx2Loader = loader;
  }
  // Detect/refresh support against the current renderer context (safe to call repeatedly)
  try {
    globalKtx2Loader.detectSupport(gl);
  } catch {
    // ignore; loader will reject if unsupported
  }
  return globalKtx2Loader;
}

type TextureWithDimensions = Texture & {
  image?: { width?: number; height?: number };
  source?: { data?: { width?: number; height?: number }; url?: string };
};

function assertBlockAligned(tex: Texture, url: string) {
  const candidate = tex as TextureWithDimensions;
  const iw = candidate.image?.width ?? candidate.source?.data?.width;
  const ih = candidate.image?.height ?? candidate.source?.data?.height;
  if (
    typeof iw === "number" &&
    typeof ih === "number" &&
    (iw % 4 !== 0 || ih % 4 !== 0)
  ) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[KTX2] Non-multiple-of-4 texture rejected", {
        url,
        width: iw,
        height: ih,
      });
    }
    try {
      tex.dispose();
    } catch {}
    throw new Error("KTX2 texture dimensions must be multiples of 4");
  }
}

// Ensure a canonical orientation each time we hand a texture to a consumer.
function normalizeTexture(
  t: Texture,
  _kind: "ktx2" | "raster",
  gl?: WebGLRenderer
) {
  let changed = false;
  // Color space consistency
  if (t.colorSpace !== SRGBColorSpace) {
    t.colorSpace = SRGBColorSpace;
    changed = true;
  }
  // Reset any transforms that might have been mutated by previous users.
  if (t.rotation !== 0) {
    t.rotation = 0;
    changed = true;
  }
  // Some code sets center to (0.5, 0.5) for rotations; reset to default
  if (t.center.x !== 0 || t.center.y !== 0) {
    t.center.set(0, 0);
    changed = true;
  }
  // Horizontal orientation must never be mirrored for cards
  if (t.repeat.x !== 1) {
    t.repeat.x = 1;
    changed = true;
  }
  if (t.offset.x !== 0) {
    t.offset.x = 0;
    changed = true;
  }

  // Keep flipY disabled to avoid GPU-driver specific flips.
  // Invert via UV: repeat.y = -1, offset.y = 1.
  if (t.flipY !== false) {
    t.flipY = false;
    changed = true;
  }
  if (t.repeat.y !== -1) {
    t.repeat.y = -1;
    changed = true;
  }
  if (t.offset.y !== 1) {
    t.offset.y = 1;
    changed = true;
  }

  // Improve readability of card text/details (use moderate anisotropy to save memory)
  if (gl) {
    try {
      const maxAniso = gl.capabilities.getMaxAnisotropy();
      const desired = maxAniso && maxAniso > 1 ? Math.min(4, maxAniso) : 0;
      if (desired && t.anisotropy !== desired) {
        t.anisotropy = desired;
        changed = true;
      }
    } catch {}
  }

  if (changed) t.needsUpdate = true;
}

// --- Soft eviction policy (keep-after-release) ---
const EVICT_MS = (() => {
  const v = Number(process.env.NEXT_PUBLIC_TEXTURE_CACHE_TTL_MS || "");
  // Default to 30s - balance between memory and reload performance
  return Number.isFinite(v) && v > 0 ? v : 30_000;
})();

// Maximum cache size (number of textures) before forced LRU eviction
const MAX_CACHE_SIZE = (() => {
  const v = Number(process.env.NEXT_PUBLIC_TEXTURE_CACHE_MAX_SIZE || "");
  // Default to 150 textures - enough for typical draft without overwhelming GPU
  return Number.isFinite(v) && v > 0 ? v : 150;
})();

function cancelEviction(entry: CacheEntry) {
  if (entry.evictTimer) {
    try {
      window.clearTimeout(entry.evictTimer);
    } catch {}
    entry.evictTimer = undefined;
  }
}

function scheduleEviction(url: string, entry: CacheEntry) {
  cancelEviction(entry);
  try {
    entry.evictTimer = window.setTimeout(() => {
      // Only evict if still unreferenced
      const cur = textureCache.get(url);
      if (!cur) return;
      if (cur.refs <= 0) {
        try {
          cur.texture.dispose();
        } catch {}
        textureCache.delete(url);
      }
    }, EVICT_MS);
  } catch {}
}

// Enforce cache size limit by evicting least recently used unreferenced textures
function enforceCacheSizeLimit() {
  if (textureCache.size <= MAX_CACHE_SIZE) return;

  // Find all unreferenced textures, sorted by lastUsed (oldest first)
  const unreferenced = Array.from(textureCache.entries())
    .filter(([, entry]) => entry.refs <= 0)
    .sort((a, b) => a[1].lastUsed - b[1].lastUsed);

  // Evict oldest unreferenced textures until we're under the limit
  const toEvict = textureCache.size - MAX_CACHE_SIZE;
  for (let i = 0; i < Math.min(toEvict, unreferenced.length); i++) {
    const [url, entry] = unreferenced[i];
    cancelEviction(entry);
    try {
      entry.texture.dispose();
    } catch {}
    textureCache.delete(url);
  }

  if (process.env.NODE_ENV === "development" && toEvict > 0) {
    console.log(
      `[texture-cache] Evicted ${Math.min(
        toEvict,
        unreferenced.length
      )} textures (cache: ${textureCache.size}/${MAX_CACHE_SIZE})`
    );
  }
}

async function acquire(
  url: string,
  load: () => Promise<Texture>
): Promise<Texture> {
  const cached = textureCache.get(url);
  if (cached) {
    // Re-activate a soft-cached texture
    cached.refs++;
    cached.lastUsed = Date.now();
    cancelEviction(cached);
    return cached.texture;
  }
  const pending = pendingLoads.get(url);
  if (pending) {
    const tex = await pending;
    const entry = textureCache.get(url);
    if (entry) {
      entry.refs++;
      entry.lastUsed = Date.now();
      cancelEviction(entry);
    }
    return tex;
  }

  // Enforce cache limit before loading new textures
  enforceCacheSizeLimit();

  const p = load()
    .then((t) => {
      textureCache.set(url, { texture: t, refs: 0, lastUsed: Date.now() });
      return t;
    })
    .finally(() => {
      pendingLoads.delete(url);
    });
  pendingLoads.set(url, p);
  const tex = await p;
  const entry = textureCache.get(url);
  if (entry) {
    entry.refs++;
    entry.lastUsed = Date.now();
    cancelEviction(entry);
  }
  return tex;
}

function release(url: string | null) {
  if (!url) return;
  const entry = textureCache.get(url);
  if (!entry) return;
  entry.refs--;
  entry.lastUsed = Date.now();
  // Keep in soft cache for a short TTL; avoids reloading on rapid churn (e.g., draft hand passes)
  if (entry.refs <= 0) scheduleEviction(url, entry);
}

// Attempts to load a KTX2 texture first (when URL is /api/images/*),
// and falls back to loading the raster image when unsupported or unavailable.
export function useCardTexture({
  slug,
  textureUrl,
  preferRaster,
}: UseCardTextureOptions) {
  const { gl } = useThree();
  const [tex, setTex] = useState<Texture | null>(null);
  // Track which cache key (URL) we currently hold a ref for.
  const heldKeyRef = useRef<string | null>(null);

  const baseUrl = useMemo(() => {
    // ALWAYS prioritize textureUrl when provided, even if empty string
    if (textureUrl !== undefined) {
      return textureUrl;
    }
    if (slug) {
      // Special-case token slugs: token:<fileBase>
      if (slug.startsWith("token:")) {
        const base = slug.slice("token:".length);
        // Raster fallback (TextureLoader) must NOT request ktx2 variants.
        // The KTX2 attempt is handled separately via ktx2Url below.
        return `/api/assets/tokens/${base}.png`;
      }
      return `/api/images/${slug}`;
    }
    return "";
  }, [textureUrl, slug]);

  const ktx2Url = useMemo(() => {
    if (!baseUrl) return "";
    if (preferRaster) return ""; // Explicitly skip KTX2 when requested
    try {
      const u = new URL(
        baseUrl,
        typeof window !== "undefined"
          ? window.location.origin
          : "http://localhost"
      );

      // Force specific assets to only use regular images (not ktx2)
      const dataOnlyAssets = new Set([
        "fire.png",
        "air.png",
        "water.png",
        "earth.png",
        "cardback_atlas.png",
        "cardback_spellbook.png",
        // Booster pack images
        "beta-booster.png",
        "alpha-booster.png",
        "arthurian-legends-booster.png",
      ]);

      const shouldForceDataOnly = u.pathname
        .split("/")
        .some(
          (segment) =>
            dataOnlyAssets.has(segment) ||
            dataOnlyAssets.has(segment.replace(/\.[^.]+$/, ".png"))
        );

      if (shouldForceDataOnly) {
        return ""; // Skip KTX2 for these assets
      }

      // Try API images with explicit ktx2 flag
      if (u.pathname.startsWith("/api/images/")) {
        u.searchParams.set("ktx2", "1");
        return u.toString();
      }
      // Try assets by swapping extension to .ktx2 if applicable
      if (u.pathname.startsWith("/api/assets/")) {
        const ext = u.pathname.split(".").pop()?.toLowerCase();
        if (ext && ["png", "jpg", "jpeg", "webp"].includes(ext)) {
          u.pathname = u.pathname.replace(/\.[^.]+$/, ".ktx2");
          return u.toString();
        }
      }
      return "";
    } catch {
      return "";
    }
  }, [baseUrl, preferRaster]);

  // Acquire and release textures with caching and robust fallback.
  useEffect(() => {
    let cancelled = false;
    // Track cancellation only; cleanup will release any held texture.

    async function load() {
      // Determine whether we already have the target texture in cache.
      const lastFailure = ktx2FailureTimes.get(ktx2Url);
      const canRetryKtx2 =
        !lastFailure || Date.now() - lastFailure >= KTX2_RETRY_DELAY_MS;
      const candidateKeys: string[] = [];
      if (ktx2Url && gl && canRetryKtx2) candidateKeys.push(ktx2Url);
      if (baseUrl) candidateKeys.push(baseUrl);
      const hasCached = candidateKeys.some((k) => textureCache.has(k));
      // Only clear the current texture if we don't already have the new one cached.
      if (!hasCached) setTex(null);

      if (ktx2Url && gl && canRetryKtx2) {
        if (lastFailure) {
          // Allow a retry by clearing the stale timestamp.
          ktx2FailureTimes.delete(ktx2Url);
        }
        try {
          const loader = getKTX2Loader(gl);
          const t = await acquire(ktx2Url, async () => {
            const tex = await loader.loadAsync(ktx2Url);
            assertBlockAligned(tex as Texture, ktx2Url);
            normalizeTexture(tex as Texture, "ktx2", gl);
            return tex as Texture;
          });
          if (cancelled) {
            // Balance the acquire if effect was cancelled
            release(ktx2Url);
            return;
          }
          if (heldKeyRef.current) {
            release(heldKeyRef.current);
          }
          heldKeyRef.current = ktx2Url;
          // Normalize again in case the cached instance carried mutated state
          normalizeTexture(t, "ktx2", gl);
          setTex(t);
          return;
        } catch (err) {
          // Fall through to raster
          if (ktx2Url) {
            ktx2FailureTimes.set(ktx2Url, Date.now());
            if (process.env.NODE_ENV !== "production") {
              console.warn("[KTX2] Falling back to raster", {
                url: ktx2Url,
                error: err instanceof Error ? err.message : err,
              });
            }
          }
        }
      }

      // Raster fallback
      if (baseUrl) {
        try {
          const t = await acquire(baseUrl, async () => {
            const tex = await new TextureLoader()
              .setCrossOrigin("anonymous")
              .loadAsync(baseUrl);
            normalizeTexture(tex as Texture, "raster", gl);
            return tex as Texture;
          });
          if (cancelled) {
            release(baseUrl);
            return;
          }
          if (heldKeyRef.current) {
            release(heldKeyRef.current);
          }
          heldKeyRef.current = baseUrl;
          // Normalize again in case the cached instance carried mutated state
          normalizeTexture(t, "raster", gl);
          setTex(t);
        } catch {
          if (!cancelled) {
            setTex(null);
          }
        }
      }
    }

    load();

    return () => {
      cancelled = true;
      // Release the currently held texture reference
      if (heldKeyRef.current) {
        release(heldKeyRef.current);
      }
      heldKeyRef.current = null;
    };
  }, [baseUrl, ktx2Url, gl]);

  return tex;
}
