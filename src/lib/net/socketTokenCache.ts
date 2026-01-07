/**
 * Socket Token Cache - Shared utility for caching socket.io auth tokens
 *
 * Uses sessionStorage to persist tokens across HMR and page navigation.
 * Token is valid for 24 hours server-side; we refresh 1 hour before expiry.
 */

const SOCKET_TOKEN_STORAGE_KEY = "sorcery:socketToken";
const TOKEN_REFRESH_BUFFER_MS = 60 * 60 * 1000; // Refresh 1 hour before expiry
const TOKEN_LIFETIME_MS = 24 * 60 * 60 * 1000; // 24 hours

interface CachedSocketToken {
  token: string;
  expiresAt: number; // timestamp in ms
}

// Singleton promise for in-flight fetch - ensures only ONE fetch happens at a time
let activeFetchPromise: Promise<string | undefined> | null = null;

/**
 * Get cached token from sessionStorage if still valid
 */
function getCachedToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const stored = sessionStorage.getItem(SOCKET_TOKEN_STORAGE_KEY);
    if (!stored) return null;
    const cached: CachedSocketToken = JSON.parse(stored);
    // Check if token is still valid (with buffer time)
    if (Date.now() < cached.expiresAt - TOKEN_REFRESH_BUFFER_MS) {
      return cached.token;
    }
    // Token expired or expiring soon
    sessionStorage.removeItem(SOCKET_TOKEN_STORAGE_KEY);
  } catch {}
  return null;
}

/**
 * Store token in sessionStorage
 */
function setCachedToken(token: string): void {
  if (typeof window === "undefined") return;
  try {
    const cached: CachedSocketToken = {
      token,
      expiresAt: Date.now() + TOKEN_LIFETIME_MS,
    };
    sessionStorage.setItem(SOCKET_TOKEN_STORAGE_KEY, JSON.stringify(cached));
    console.log("[SocketTokenCache] Token stored in sessionStorage");
  } catch (e) {
    console.warn("[SocketTokenCache] Failed to store token:", e);
  }
}

/**
 * Clear cached token (call on auth errors)
 */
export function clearSocketTokenCache(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(SOCKET_TOKEN_STORAGE_KEY);
    console.log("[SocketTokenCache] Cache cleared");
  } catch {}
}

/**
 * Internal function that actually performs the fetch
 */
async function doFetch(): Promise<string | undefined> {
  console.log("[SocketTokenCache] >>> FETCH START");
  console.log("[SocketTokenCache] Stack trace:", new Error().stack);
  try {
    const res = await fetch("/api/socket-token", { credentials: "include" });
    if (res.ok) {
      const j = await res.json();
      const token = j?.token as string;
      if (token) {
        setCachedToken(token);
        console.log("[SocketTokenCache] <<< FETCH SUCCESS");
        return token;
      }
    } else if (res.status === 401) {
      console.log("[SocketTokenCache] <<< FETCH 401");
      clearSocketTokenCache();
    } else {
      console.log("[SocketTokenCache] <<< FETCH FAILED:", res.status);
    }
  } catch (e) {
    console.log("[SocketTokenCache] <<< FETCH ERROR:", e);
  }
  return undefined;
}

/**
 * Fetch socket token with caching
 *
 * @param forceRefresh - Bypass cache and fetch fresh token
 * @returns Token string or undefined if fetch fails
 */
export async function fetchSocketToken(
  forceRefresh = false
): Promise<string | undefined> {
  // ALWAYS check for active fetch first - if one is in progress, wait for it
  // This prevents multiple simultaneous fetches regardless of forceRefresh
  if (activeFetchPromise) {
    console.log("[SocketTokenCache] Waiting for existing fetch...");
    return activeFetchPromise;
  }

  // Check sessionStorage cache (unless force refresh)
  if (!forceRefresh) {
    const cached = getCachedToken();
    if (cached) {
      console.log("[SocketTokenCache] HIT - using cached token");
      return cached;
    }
    console.log("[SocketTokenCache] MISS - no cached token");
  } else {
    console.log("[SocketTokenCache] Force refresh - clearing cache");
    clearSocketTokenCache();
  }

  // Start a new fetch and store the promise so others can wait for it
  activeFetchPromise = doFetch();

  try {
    const result = await activeFetchPromise;
    return result;
  } finally {
    // Clear the active fetch AFTER it completes so subsequent calls check cache first
    activeFetchPromise = null;
  }
}

/**
 * Check if we have a valid cached token (without fetching)
 */
export function hasValidCachedToken(): boolean {
  return getCachedToken() !== null;
}

/**
 * Get cached token synchronously (returns null if expired or missing)
 * Use this for reconnection handlers that need immediate token access
 */
export function getCachedTokenSync(): string | null {
  return getCachedToken();
}
