"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useThree } from "@react-three/fiber";
import { KTX2Loader } from "three/examples/jsm/loaders/KTX2Loader.js";
import { SRGBColorSpace, Texture, TextureLoader } from "three";

export interface UseCardTextureOptions {
  slug?: string;
  textureUrl?: string;
}

// Attempts to load a KTX2 texture first (when URL is /api/images/*),
// and falls back to loading the raster image when unsupported or unavailable.
export function useCardTexture({ slug, textureUrl }: UseCardTextureOptions) {
  const { gl } = useThree();
  const [tex, setTex] = useState<Texture | null>(null);
  const prevTexRef = useRef<Texture | null>(null);

  const baseUrl = useMemo(() => {
    if (textureUrl) return textureUrl;
    if (slug) return `/api/images/${slug}`;
    return "";
  }, [textureUrl, slug]);

  const ktx2Url = useMemo(() => {
    if (!baseUrl) return "";
    try {
      const u = new URL(baseUrl, typeof window !== "undefined" ? window.location.origin : "http://localhost");
      // Only attempt KTX2 via our images API
      if (!u.pathname.startsWith("/api/images/")) return "";
      u.searchParams.set("ktx2", "1");
      return u.toString();
    } catch {
      return "";
    }
  }, [baseUrl]);

  // Memoize a loader per renderer
  const ktx2Loader = useMemo(() => {
    const loader = new KTX2Loader();
    // Use CDN-hosted transcoder binaries by default for simplicity.
    // You can self-host by copying basis_transcoder files to /public/ktx2 and switching the path below.
    loader.setTranscoderPath("https://unpkg.com/three@0.179.1/examples/jsm/libs/basis/");
    try {
      loader.detectSupport(gl);
    } catch {
      // Ignore; will fallback to raster
    }
    return loader;
  }, [gl]);

  useEffect(() => {
    let cancelled = false;
    let localTex: Texture | null = null;

    async function load() {
      setTex(null);

      // Try KTX2 first if applicable
      if (ktx2Url) {
        try {
          const t = await ktx2Loader.loadAsync(ktx2Url);
          if (cancelled) return;
          t.colorSpace = SRGBColorSpace;
          localTex = t;
          setTex(t);
          return;
        } catch {
          // Fall through to raster
        }
      }

      if (baseUrl) {
        const t = await new TextureLoader().loadAsync(baseUrl);
        if (cancelled) return;
        t.colorSpace = SRGBColorSpace;
        localTex = t;
        setTex(t);
      }
    }

    load();

    return () => {
      cancelled = true;
      if (prevTexRef.current && prevTexRef.current !== localTex) {
        prevTexRef.current.dispose();
      }
      prevTexRef.current = localTex;
    };
  }, [baseUrl, ktx2Url, ktx2Loader]);

  return tex;
}
