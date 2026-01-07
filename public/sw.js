/**
 * Service Worker for Realms.cards
 * Implements cache-first strategy for card images with background updates
 */

const CACHE_VERSION = "v4";
const CARD_CACHE_NAME = `realms-cards-${CACHE_VERSION}`;
const STATIC_CACHE_NAME = `realms-static-${CACHE_VERSION}`;
const API_CACHE_NAME = `realms-api-${CACHE_VERSION}`;

// Patterns for card images to cache
const CARD_IMAGE_PATTERNS = [
  /\/api\/images\//,
  /\/api\/assets\//,
  /cdn\.realms\.cards.*\.(webp|png|jpg|jpeg|ktx2)$/i,
];

// Patterns for API routes to cache (card data that rarely changes)
const API_CACHE_PATTERNS = [
  /\/api\/cards\/meta-by-variant/,
  /\/api\/cards\/search/,
  /\/api\/cards\/lookup/,
  /\/api\/cards\/by-id/,
  /\/api\/cards\/sets/,
  /\/api\/cards\/slugs/,
  /\/api\/codex/,
];

// Static assets to pre-cache on install
const STATIC_ASSETS = [
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  // Element icons are served via /api/assets/ from data/ folder
];

// Check if a request is for a card image
function isCardImageRequest(request) {
  const url = request.url;
  return CARD_IMAGE_PATTERNS.some((pattern) => pattern.test(url));
}

// Check if a request is a static asset
function isStaticAsset(request) {
  const url = new URL(request.url);
  return STATIC_ASSETS.some((path) => url.pathname === path);
}

// Check if a request is for cacheable API data
function isApiCacheRequest(request) {
  const url = request.url;
  return API_CACHE_PATTERNS.some((pattern) => pattern.test(url));
}

// Install event - pre-cache static assets
self.addEventListener("install", (event) => {
  console.log("[SW] Installing service worker...");
  event.waitUntil(
    caches
      .open(STATIC_CACHE_NAME)
      .then((cache) => {
        console.log("[SW] Pre-caching static assets");
        return cache.addAll(
          STATIC_ASSETS.filter((url) => !url.startsWith("http"))
        );
      })
      .then(() => {
        console.log("[SW] Install complete, skipping waiting");
        return self.skipWaiting();
      })
      .catch((err) => {
        console.error("[SW] Install failed:", err);
      })
  );
});

// Activate event - clean up old caches
self.addEventListener("activate", (event) => {
  console.log("[SW] Activating service worker...");
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((name) => {
              // Delete old versions of our caches
              return (
                (name.startsWith("realms-cards-") ||
                  name.startsWith("realms-static-") ||
                  name.startsWith("realms-api-")) &&
                name !== CARD_CACHE_NAME &&
                name !== STATIC_CACHE_NAME &&
                name !== API_CACHE_NAME
              );
            })
            .map((name) => {
              console.log("[SW] Deleting old cache:", name);
              return caches.delete(name);
            })
        );
      })
      .then(() => {
        console.log("[SW] Activate complete, claiming clients");
        return self.clients.claim();
      })
  );
});

// Fetch event - implement caching strategies
self.addEventListener("fetch", (event) => {
  const request = event.request;

  // Only handle GET requests
  if (request.method !== "GET") {
    return;
  }

  // Card images: Cache-first with background update
  if (isCardImageRequest(request)) {
    event.respondWith(
      cacheFirstWithBackgroundUpdate(request, CARD_CACHE_NAME, event)
    );
    return;
  }

  // Static assets: Cache-first
  if (isStaticAsset(request)) {
    event.respondWith(cacheFirst(request, STATIC_CACHE_NAME));
    return;
  }

  // API routes: Cache-first with 1 week TTL (card data only changes on set releases ~2x/year)
  if (isApiCacheRequest(request)) {
    event.respondWith(
      cacheFirstWithTTL(request, API_CACHE_NAME, 604800000) // 1 week
    );
    return;
  }

  // Everything else: Network-first (default Next.js behavior)
  // Don't intercept - let the browser handle it normally
});

/**
 * Cache-first strategy with stale-while-revalidate
 * Returns cached response immediately if available, then updates cache in background
 */
async function cacheFirstWithBackgroundUpdate(request, cacheName, fetchEvent) {
  const cache = await caches.open(cacheName);
  const cachedResponse = await cache.match(request);

  if (cachedResponse) {
    // Return cached version immediately
    // Optionally update in background for fresh content
    // (Skip background update for immutable assets - they never change)
    const cacheControl = cachedResponse.headers.get("Cache-Control") || "";
    if (!cacheControl.includes("immutable") && fetchEvent) {
      // Update cache in background without blocking
      fetchEvent.waitUntil(updateCache(request, cache));
    }
    return cachedResponse;
  }

  // No cache - fetch from network and cache
  try {
    const networkResponse = await fetch(request);

    // Cache successful responses
    if (networkResponse.ok) {
      // Clone response before caching (response body can only be read once)
      const responseToCache = networkResponse.clone();
      cache.put(request, responseToCache);

      // Notify clients about cache update
      notifyClients({
        type: "CARD_CACHED",
        url: request.url,
      });
    }

    return networkResponse;
  } catch (error) {
    console.error("[SW] Fetch failed for:", request.url, error);
    // Return a placeholder or error response if needed
    return new Response("Network error", { status: 503 });
  }
}

/**
 * Simple cache-first strategy
 */
async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cachedResponse = await cache.match(request);

  if (cachedResponse) {
    return cachedResponse;
  }

  const networkResponse = await fetch(request);
  if (networkResponse.ok) {
    cache.put(request, networkResponse.clone());
  }
  return networkResponse;
}

/**
 * Update cache in background
 */
async function updateCache(request, cache) {
  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      await cache.put(request, networkResponse);
    }
  } catch {
    // Silently fail - we already have a cached version
  }
}

/**
 * Cache-first with TTL for API routes
 * Respects Cache-Control headers and adds timestamp for TTL checking
 */
async function cacheFirstWithTTL(request, cacheName, ttlMs) {
  const cache = await caches.open(cacheName);
  const cachedResponse = await cache.match(request);

  if (cachedResponse) {
    // Check if cache is still fresh based on Cache-Control or our TTL
    const dateHeader = cachedResponse.headers.get("Date");

    if (dateHeader) {
      const cacheAge = Date.now() - new Date(dateHeader).getTime();
      // If cache is stale (older than TTL), fetch fresh data in background
      if (cacheAge > ttlMs) {
        // Return stale data immediately, update in background
        fetch(request)
          .then((networkResponse) => {
            if (networkResponse.ok) {
              cache.put(request, networkResponse);
            }
          })
          .catch(() => {});
      }
    }

    return cachedResponse;
  }

  // No cache - fetch from network and cache
  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (_error) {
    return new Response(JSON.stringify({ error: "Network error" }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    });
  }
}

/**
 * Notify all clients about an event
 */
async function notifyClients(message) {
  const clients = await self.clients.matchAll({ type: "window" });
  clients.forEach((client) => {
    client.postMessage(message);
  });
}

// Message handler for communication with main thread
self.addEventListener("message", (event) => {
  const { type, payload } = event.data || {};

  switch (type) {
    case "GET_CACHE_STATS":
      getCacheStats().then((stats) => {
        event.source.postMessage({ type: "CACHE_STATS", payload: stats });
      });
      break;

    case "CLEAR_CARD_CACHE":
      clearCache(CARD_CACHE_NAME).then(() => {
        event.source.postMessage({
          type: "CACHE_CLEARED",
          payload: { cacheName: CARD_CACHE_NAME },
        });
      });
      break;

    case "CLEAR_API_CACHE":
      clearCache(API_CACHE_NAME).then(() => {
        event.source.postMessage({
          type: "CACHE_CLEARED",
          payload: { cacheName: API_CACHE_NAME },
        });
      });
      break;

    case "CLEAR_ALL_CACHES":
      clearAllCaches().then(() => {
        event.source.postMessage({ type: "ALL_CACHES_CLEARED" });
      });
      break;

    case "PRE_CACHE_CARDS":
      preCacheCards(payload.urls).then((result) => {
        event.source.postMessage({
          type: "PRE_CACHE_COMPLETE",
          payload: result,
        });
      });
      break;

    case "SKIP_WAITING":
      self.skipWaiting();
      break;

    default:
      console.log("[SW] Unknown message type:", type);
  }
});

/**
 * Get cache statistics
 */
async function getCacheStats() {
  const cardCache = await caches.open(CARD_CACHE_NAME);
  const staticCache = await caches.open(STATIC_CACHE_NAME);
  const apiCache = await caches.open(API_CACHE_NAME);

  const cardKeys = await cardCache.keys();
  const staticKeys = await staticCache.keys();
  const apiKeys = await apiCache.keys();

  // Estimate storage usage
  let cardCacheSize = 0;
  let staticCacheSize = 0;
  let apiCacheSize = 0;

  // Get size estimates from cached responses
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

  for (const request of apiKeys) {
    const response = await apiCache.match(request);
    if (response) {
      const blob = await response.clone().blob();
      apiCacheSize += blob.size;
    }
  }

  return {
    cardCount: cardKeys.length,
    cardCacheSize,
    staticCount: staticKeys.length,
    staticCacheSize,
    apiCount: apiKeys.length,
    apiCacheSize,
    totalSize: cardCacheSize + staticCacheSize + apiCacheSize,
    version: CACHE_VERSION,
  };
}

/**
 * Clear a specific cache
 */
async function clearCache(cacheName) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  await Promise.all(keys.map((key) => cache.delete(key)));
  console.log("[SW] Cleared cache:", cacheName);
}

/**
 * Clear all caches
 */
async function clearAllCaches() {
  const cacheNames = await caches.keys();
  await Promise.all(
    cacheNames
      .filter((name) => name.startsWith("realms-"))
      .map((name) => caches.delete(name))
  );
  console.log("[SW] All caches cleared");
}

/**
 * Pre-cache a list of card URLs
 */
async function preCacheCards(urls) {
  if (!urls || !urls.length) {
    return { cached: 0, failed: 0, skipped: 0 };
  }

  const cache = await caches.open(CARD_CACHE_NAME);
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

        // Notify progress
        notifyClients({
          type: "PRE_CACHE_PROGRESS",
          payload: { cached, failed, skipped, total: urls.length },
        });
      } else {
        failed++;
      }
    } catch {
      failed++;
    }
  }

  return { cached, failed, skipped, total: urls.length };
}
