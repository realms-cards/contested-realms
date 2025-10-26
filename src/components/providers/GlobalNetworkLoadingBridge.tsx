"use client";

import { useEffect, useRef } from "react";
import { useLoadingContext } from "@/lib/contexts/LoadingContext";
export default function GlobalNetworkLoadingBridge() {
  const { startLoading, stopLoading } = useLoadingContext();
  const patchedRef = useRef(false);

  useEffect(() => {
    if (patchedRef.current) return;
    if (typeof window === "undefined") return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any;
    if (w.__globalLoadingBridgePatched) return;

    const THRESHOLD_MS = 120;

    const assetPattern = /\.(?:png|jpe?g|gif|webp|svg|ico|ttf|otf|woff2?|mp3|wav|ogg|ktx2|wasm)(?:\?.*)?$/i;
    const nextInternalPattern = /^\/_next\//;

    const shouldTrack = (input: RequestInfo | URL, init?: RequestInit): boolean => {
      try {
        let skipHeader = false;
        try {
          const h = new Headers((init?.headers ?? undefined) as HeadersInit);
          const v = h.get("x-skip-loading-indicator");
          if (v && v.toLowerCase() === "true") skipHeader = true;
        } catch {}
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const R: any = Request;
          if (R && input instanceof R) {
            const h2 = new Headers((input as Request).headers);
            const v2 = h2.get("x-skip-loading-indicator");
            if (v2 && v2.toLowerCase() === "true") skipHeader = true;
          }
        } catch {}
        if (skipHeader) return false;
        // Normalize URL string
        const urlStr = typeof input === "string" ? input : input instanceof URL ? input.toString() : String((input as Request).url ?? "");
        if (!urlStr) return true;
        // Ignore Next.js internal assets and common static assets
        if (nextInternalPattern.test(urlStr)) return false;
        if (urlStr.includes("/socket.io/")) return false;
        if (assetPattern.test(urlStr)) return false;
        return true;
      } catch {
        return true;
      }
    };

    const originalFetch: typeof window.fetch = window.fetch.bind(window);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).__originalFetch = originalFetch;
    window.fetch = (async (...args: Parameters<typeof originalFetch>) => {
      let started = false;
      let timer: number | null = null;
      try {
        if (shouldTrack(args[0], args[1])) {
          timer = window.setTimeout(() => {
            startLoading();
            started = true;
          }, THRESHOLD_MS);
        }
        const res = await originalFetch(...args);
        return res;
      } finally {
        if (timer) window.clearTimeout(timer);
        if (started) stopLoading();
      }
    }) as typeof window.fetch;

    const OriginalXHR = window.XMLHttpRequest;
    class PatchedXHR extends OriginalXHR {
      private __loadingTimer: number | null = null;
      private __loadingStarted = false;
      private __tracked = true;

      override open(method: string, url: string, async?: boolean, username?: string | null, password?: string | null): void {
        try {
          this.__tracked = shouldTrack(url);
        } catch {
          this.__tracked = true;
        }
        super.open(method, url, async ?? true, username ?? null, password ?? null);
      }

      override send(body?: Document | XMLHttpRequestBodyInit | null): void {
        try {
          if (this.__tracked) {
            this.__loadingTimer = window.setTimeout(() => {
              startLoading();
              this.__loadingStarted = true;
            }, THRESHOLD_MS);
          }
        } catch {}

        const clear = () => {
          if (this.__loadingTimer) {
            window.clearTimeout(this.__loadingTimer);
            this.__loadingTimer = null;
          }
          if (this.__loadingStarted) {
            stopLoading();
            this.__loadingStarted = false;
          }
          this.removeEventListener("loadend", clear);
          this.removeEventListener("error", clear);
          this.removeEventListener("abort", clear);
        };

        this.addEventListener("loadend", clear);
        this.addEventListener("error", clear);
        this.addEventListener("abort", clear);

        try {
          super.send(body as never);
        } catch (e) {
          clear();
          throw e;
        }
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).__OriginalXHR = OriginalXHR;
    window.XMLHttpRequest = PatchedXHR as unknown as typeof XMLHttpRequest;

    w.__globalLoadingBridgePatched = true;
    patchedRef.current = true;

    return () => {
      try {
        if (typeof window !== "undefined") {
          if ((window as never as { __originalFetch?: typeof window.fetch }).__originalFetch) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (window as any).fetch = (window as any).__originalFetch;
          }
          if ((window as never as { __OriginalXHR?: typeof XMLHttpRequest }).__OriginalXHR) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (window as any).XMLHttpRequest = (window as any).__OriginalXHR;
          }
        }
      } catch {}
    };
  }, [startLoading, stopLoading]);

  return null;
}
