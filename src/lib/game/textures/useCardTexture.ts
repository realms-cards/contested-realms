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
            // Align orientation and color across KTX2 and raster
            tex.colorSpace = SRGBColorSpace;
            // Flip Y for KTX2 to match raster textures on plain planes
            // This addresses upside-down visuals on card planes.
            // CompressedTexture supports flipY at sampling time in Three.js.
            // If you later switch pipelines, revisit this.
            tex.flipY = false;
            // Improve readability of card text/details
            try {
              const maxAniso = gl.capabilities.getMaxAnisotropy();
              if (maxAniso && maxAniso > 1)
                tex.anisotropy = Math.min(8, maxAniso);
            } catch {}
            tex.needsUpdate = true;
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
            tex.colorSpace = SRGBColorSpace;
            // TextureLoader textures default to flipY=true; set explicitly for consistency.
            tex.flipY = true;
            // Improve readability of card text/details
            try {
              const maxAniso = gl?.capabilities?.getMaxAnisotropy?.();
              if (maxAniso && maxAniso > 1)
                tex.anisotropy = Math.min(8, maxAniso);
            } catch {}
            tex.needsUpdate = true;
            return tex;
          });
          if (cancelled) {
            release(baseUrl);
            return;
          }
          if (heldKeyRef.current) {
            release(heldKeyRef.current);
          }
          heldKeyRef.current = baseUrl;
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
