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
// One KTX2Loader per renderer to reuse workers/transcoder and internal caches.
const ktx2LoaderByRenderer = new WeakMap<WebGLRenderer, KTX2Loader>();
// Remember KTX2 URLs that failed to load to skip retrying repeatedly.
const ktx2Failures = new Set<string>();

function getKTX2Loader(gl: WebGLRenderer): KTX2Loader {
  let loader = ktx2LoaderByRenderer.get(gl);
  if (!loader) {
    loader = new KTX2Loader();
    // Allow overriding transcoder path via env; default to self-hosted /ktx2/
    const envPath = process.env.NEXT_PUBLIC_KTX2_TRANSCODER_PATH;
    loader.setTranscoderPath(envPath && envPath.trim() ? envPath : "/ktx2/");
    // Ensure cross-origin requests (after CDN redirect) are made with anonymous CORS
    try {
      // KTX2Loader extends Loader, which supports setCrossOrigin
      (loader as unknown as { setCrossOrigin?: (v: string) => void }).setCrossOrigin?.(
        "anonymous"
      );
    } catch {}
    try {
      loader.detectSupport(gl);
    } catch {
      // ignore; loader will reject if unsupported
    }
    ktx2LoaderByRenderer.set(gl, loader);
  }
  return loader;
}

// Ensure a canonical orientation each time we hand a texture to a consumer.
// This prevents stray mirroring/flips caused by shared cached Texture instances
// being mutated elsewhere (e.g. repeat/offset/rotation changed by a material).
function normalizeTexture(
  t: Texture,
  kind: "ktx2" | "raster",
  gl?: WebGLRenderer
) {
  // Color space consistency
  t.colorSpace = SRGBColorSpace;

  // Reset any transforms that might have been mutated by previous users.
  t.rotation = 0;
  // Some code sets center to (0.5, 0.5) for rotations; reset to default
  t.center.set(0, 0);
  // Horizontal orientation must never be mirrored for cards
  t.repeat.x = 1;
  t.offset.x = 0;

  // Keep flipY disabled to avoid GPU-driver specific flips.
  // With current meshes/UVs we need the same vertical inversion for both KTX2 and raster.
  // Invert via UV: repeat.y = -1, offset.y = 1.
  t.flipY = false;
  t.repeat.y = -1;
  t.offset.y = 1;

  // Improve readability of card text/details
  if (gl) {
    try {
      const maxAniso = gl.capabilities.getMaxAnisotropy();
      if (maxAniso && maxAniso > 1) t.anisotropy = Math.min(8, maxAniso);
    } catch {}
  }

  t.needsUpdate = true;
}

// --- Soft eviction policy (keep-after-release) ---
const EVICT_MS = (() => {
  const v = Number(process.env.NEXT_PUBLIC_TEXTURE_CACHE_TTL_MS || "");
  // Default to 60s if not provided or invalid
  return Number.isFinite(v) && v > 0 ? v : 60_000;
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
export function useCardTexture({ slug, textureUrl, preferRaster }: UseCardTextureOptions) {
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
      setTex(null);

      // Attempt KTX2 first if a suitable URL is provided
      if (ktx2Url && gl && !ktx2Failures.has(ktx2Url)) {
        try {
          const loader = getKTX2Loader(gl);
          const t = await acquire(ktx2Url, async () => {
            const tex = await loader.loadAsync(ktx2Url);
            // Dev-only sanity check: ETC1S/UASTC textures should be multiples of 4
            if (process.env.NODE_ENV !== "production") {
              try {
                type TexWithDims = {
                  image?: { width?: number; height?: number };
                  source?: { data?: { width?: number; height?: number } };
                };
                const twd = tex as unknown as TexWithDims;
                const iw = twd.image?.width ?? twd.source?.data?.width;
                const ih = twd.image?.height ?? twd.source?.data?.height;
                if (
                  typeof iw === "number" &&
                  typeof ih === "number" &&
                  (iw % 4 !== 0 || ih % 4 !== 0)
                ) {
                  console.warn("[KTX2] Non-multiple-of-4 texture loaded", {
                    url: ktx2Url,
                    width: iw,
                    height: ih,
                  });
                }
              } catch {}
            }
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
        } catch {
          // Fall through to raster
          if (ktx2Url) {
            ktx2Failures.add(ktx2Url);
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
