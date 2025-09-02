"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useThree } from "@react-three/fiber";
import { KTX2Loader } from "three/examples/jsm/loaders/KTX2Loader.js";
import {
  SRGBColorSpace,
  Texture,
  TextureLoader,
  type WebGLRenderer,
} from "three";

export interface UseCardTextureOptions {
  slug?: string;
  textureUrl?: string;
}

// --- Global caches & helpers ---
// Cache textures by final loaded URL with refcounts so multiple components share one GPU resource.
const textureCache = new Map<string, { texture: Texture; refs: number }>();
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
    // Use CDN-hosted transcoder binaries; switch to "/ktx2/" in public if self-hosting.
    loader.setTranscoderPath(
      "https://unpkg.com/three@0.179.1/examples/jsm/libs/basis/"
    );
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

  if (kind === "ktx2") {
    // For compressed textures, avoid flipY and use UV transform for vertical flip
    t.flipY = false;
    t.repeat.y = -1;
    t.offset.y = 1;
  } else {
    // Raster images use flipY
    t.flipY = true;
    t.repeat.y = 1;
    t.offset.y = 0;
  }

  // Improve readability of card text/details
  if (gl) {
    try {
      const maxAniso = gl.capabilities.getMaxAnisotropy();
      if (maxAniso && maxAniso > 1) t.anisotropy = Math.min(8, maxAniso);
    } catch {}
  }

  t.needsUpdate = true;
}

async function acquire(
  url: string,
  load: () => Promise<Texture>
): Promise<Texture> {
  const cached = textureCache.get(url);
  if (cached) {
    cached.refs++;
    return cached.texture;
  }
  const pending = pendingLoads.get(url);
  if (pending) {
    const tex = await pending;
    const entry = textureCache.get(url);
    if (entry) entry.refs++;
    return tex;
  }
  const p = load()
    .then((t) => {
      textureCache.set(url, { texture: t, refs: 0 });
      return t;
    })
    .finally(() => {
      pendingLoads.delete(url);
    });
  pendingLoads.set(url, p);
  const tex = await p;
  const entry = textureCache.get(url);
  if (entry) entry.refs++;
  return tex;
}

function release(url: string | null) {
  if (!url) return;
  const entry = textureCache.get(url);
  if (!entry) return;
  entry.refs--;
  if (entry.refs <= 0) {
    entry.texture.dispose();
    textureCache.delete(url);
  }
}

// Attempts to load a KTX2 texture first (when URL is /api/images/*),
// and falls back to loading the raster image when unsupported or unavailable.
export function useCardTexture({ slug, textureUrl }: UseCardTextureOptions) {
  const { gl } = useThree();
  const [tex, setTex] = useState<Texture | null>(null);
  // Track which cache key (URL) we currently hold a ref for.
  const heldKeyRef = useRef<string | null>(null);

  const baseUrl = useMemo(() => {
    if (textureUrl) return textureUrl;
    if (slug) return `/api/images/${slug}`;
    return "";
  }, [textureUrl, slug]);

  const ktx2Url = useMemo(() => {
    if (!baseUrl) return "";
    try {
      const u = new URL(
        baseUrl,
        typeof window !== "undefined"
          ? window.location.origin
          : "http://localhost"
      );
      
      // Force specific assets to only use regular images (not ktx2)
      const dataOnlyAssets = new Set([
        "fire.png", "air.png", "water.png", "earth.png",
        "cardback_atlas.png", "cardback_spellbook.png", "card-back.png",
        // Booster pack images
        "beta-booster.png", "alpha-booster.png", "arthurian-legends-booster.png", "dragonlord-booster.png"
      ]);
      
      const shouldForceDataOnly = u.pathname.split("/").some(segment => 
        dataOnlyAssets.has(segment) || dataOnlyAssets.has(segment.replace(/\.[^.]+$/, ".png"))
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
  }, [baseUrl]);

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
                  ((iw % 4) !== 0 || (ih % 4) !== 0)
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
            const tex = await new TextureLoader().loadAsync(baseUrl);
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
