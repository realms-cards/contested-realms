/**
 * Service Worker Registration and Management
 */

export interface SWRegistrationResult {
  success: boolean;
  registration?: ServiceWorkerRegistration;
  error?: string;
}

export interface CacheStats {
  cardCount: number;
  cardCacheSize: number;
  staticCount: number;
  staticCacheSize: number;
  totalSize: number;
  version: string;
}

export type SWMessageType =
  | "GET_CACHE_STATS"
  | "CLEAR_CARD_CACHE"
  | "CLEAR_ALL_CACHES"
  | "PRE_CACHE_CARDS"
  | "SKIP_WAITING";

export type SWResponseType =
  | "CACHE_STATS"
  | "CACHE_CLEARED"
  | "ALL_CACHES_CLEARED"
  | "PRE_CACHE_COMPLETE"
  | "PRE_CACHE_PROGRESS"
  | "CARD_CACHED";

// Check if service workers are supported
export function isServiceWorkerSupported(): boolean {
  return typeof window !== "undefined" && "serviceWorker" in navigator;
}

/**
 * Register the service worker
 */
export async function registerServiceWorker(): Promise<SWRegistrationResult> {
  if (!isServiceWorkerSupported()) {
    return { success: false, error: "Service workers not supported" };
  }

  try {
    const registration = await navigator.serviceWorker.register("/sw.js", {
      scope: "/",
      updateViaCache: "none",
    });

    console.log("[SW Registration] Registered with scope:", registration.scope);

    // Check for updates periodically
    registration.addEventListener("updatefound", () => {
      const newWorker = registration.installing;
      if (newWorker) {
        newWorker.addEventListener("statechange", () => {
          if (
            newWorker.state === "installed" &&
            navigator.serviceWorker.controller
          ) {
            console.log("[SW Registration] New version available");
            // Dispatch custom event for UI to show update notification
            window.dispatchEvent(
              new CustomEvent("sw:updateAvailable", {
                detail: { registration },
              })
            );
          }
        });
      }
    });

    return { success: true, registration };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[SW Registration] Failed:", message);
    return { success: false, error: message };
  }
}

/**
 * Unregister all service workers
 */
export async function unregisterServiceWorker(): Promise<boolean> {
  if (!isServiceWorkerSupported()) {
    return false;
  }

  try {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map((r) => r.unregister()));
    console.log("[SW Registration] All service workers unregistered");
    return true;
  } catch (error) {
    console.error("[SW Registration] Unregister failed:", error);
    return false;
  }
}

/**
 * Get the current service worker registration
 */
export async function getRegistration(): Promise<
  ServiceWorkerRegistration | undefined
> {
  if (!isServiceWorkerSupported()) {
    return undefined;
  }
  return navigator.serviceWorker.getRegistration();
}

/**
 * Check for service worker updates
 */
export async function checkForUpdates(): Promise<void> {
  const registration = await getRegistration();
  if (registration) {
    await registration.update();
  }
}

/**
 * Send a message to the service worker and wait for response
 */
export function sendMessageToSW<T = unknown>(
  type: SWMessageType,
  payload?: unknown
): Promise<T> {
  return new Promise((resolve, reject) => {
    if (!navigator.serviceWorker.controller) {
      reject(new Error("No active service worker"));
      return;
    }

    const messageChannel = new MessageChannel();

    messageChannel.port1.onmessage = (event) => {
      resolve(event.data.payload as T);
    };

    navigator.serviceWorker.controller.postMessage({ type, payload }, [
      messageChannel.port2,
    ]);

    // Timeout after 10 seconds
    setTimeout(() => {
      reject(new Error("Service worker message timeout"));
    }, 10000);
  });
}

/**
 * Get cache statistics from service worker
 */
export async function getCacheStats(): Promise<CacheStats | null> {
  try {
    // Use direct cache API for more reliable stats
    if (!("caches" in window)) {
      return null;
    }

    const cardCache = await caches.open("realms-cards-v1");
    const staticCache = await caches.open("realms-static-v1");

    const cardKeys = await cardCache.keys();
    const staticKeys = await staticCache.keys();

    let cardCacheSize = 0;
    let staticCacheSize = 0;

    // Estimate sizes
    for (const request of cardKeys) {
      const response = await cardCache.match(request);
      if (response) {
        const blob = await response.clone().blob();
        cardCacheSize += blob.size;
      }
    }

    for (const request of staticKeys) {
      const response = await staticCache.match(request);
      if (response) {
        const blob = await response.clone().blob();
        staticCacheSize += blob.size;
      }
    }

    return {
      cardCount: cardKeys.length,
      cardCacheSize,
      staticCount: staticKeys.length,
      staticCacheSize,
      totalSize: cardCacheSize + staticCacheSize,
      version: "v1",
    };
  } catch (error) {
    console.error("[Cache] Failed to get stats:", error);
    return null;
  }
}

/**
 * Clear the card image cache
 */
export async function clearCardCache(): Promise<boolean> {
  try {
    await caches.delete("realms-cards-v1");
    console.log("[Cache] Card cache cleared");
    return true;
  } catch (error) {
    console.error("[Cache] Failed to clear card cache:", error);
    return false;
  }
}

/**
 * Clear all caches
 */
export async function clearAllCaches(): Promise<boolean> {
  try {
    const cacheNames = await caches.keys();
    await Promise.all(
      cacheNames
        .filter((name) => name.startsWith("realms-"))
        .map((name) => caches.delete(name))
    );
    console.log("[Cache] All caches cleared");
    return true;
  } catch (error) {
    console.error("[Cache] Failed to clear all caches:", error);
    return false;
  }
}

/**
 * Pre-cache a list of card image URLs
 */
export async function preCacheCards(
  urls: string[],
  onProgress?: (progress: { cached: number; total: number }) => void
): Promise<{ cached: number; failed: number; skipped: number }> {
  if (!urls.length) {
    return { cached: 0, failed: 0, skipped: 0 };
  }

  const cache = await caches.open("realms-cards-v1");
  let cached = 0;
  let failed = 0;
  let skipped = 0;

  for (const url of urls) {
    try {
      // Check if already cached
      const existing = await cache.match(url);
      if (existing) {
        skipped++;
        continue;
      }

      // Fetch and cache
      const response = await fetch(url);
      if (response.ok) {
        await cache.put(url, response);
        cached++;
        onProgress?.({ cached: cached + skipped, total: urls.length });
      } else {
        failed++;
      }
    } catch {
      failed++;
    }
  }

  return { cached, failed, skipped };
}

/**
 * Pre-cache card images for a deck (by slugs).
 * This is a fire-and-forget operation that runs in the background.
 */
export function preCacheDeckCards(slugs: string[]): void {
  if (!slugs.length || typeof window === "undefined" || !("caches" in window)) {
    return;
  }

  // Run in background without blocking
  (async () => {
    try {
      const urls = slugs.map(
        (slug) => `/api/images/${encodeURIComponent(slug)}`
      );
      await preCacheCards(urls);
      console.log(`[Cache] Pre-cached ${slugs.length} deck cards`);
    } catch (error) {
      console.warn("[Cache] Failed to pre-cache deck cards:", error);
    }
  })();
}

/**
 * Pre-cache all cards from a deck API response.
 * Extracts slugs from spellbook, atlas, sideboard, and avatar.
 */
export function preCacheDeckFromResponse(deckData: {
  spellbook?: Array<{ slug?: string | null }>;
  atlas?: Array<{ slug?: string | null }>;
  sideboard?: Array<{ slug?: string | null }>;
  avatar?: { slug?: string | null };
  champion?: { slug?: string | null };
}): void {
  const slugs: string[] = [];

  const addSlug = (item: { slug?: string | null } | undefined) => {
    if (item?.slug) slugs.push(item.slug);
  };

  deckData.spellbook?.forEach(addSlug);
  deckData.atlas?.forEach(addSlug);
  deckData.sideboard?.forEach(addSlug);
  addSlug(deckData.avatar);
  addSlug(deckData.champion);

  if (slugs.length > 0) {
    preCacheDeckCards(slugs);
  }
}

/**
 * Format bytes to human readable string
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}
