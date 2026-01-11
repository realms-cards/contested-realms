/**
 * Socket Token Cache - Shared utility for caching socket.io auth tokens
 *
 * Uses localStorage to persist tokens across tabs, HMR, and page navigation.
 * Token is valid for 24 hours server-side; we refresh 1 hour before expiry.
 *
 * Rate limiting: Minimum 5 minutes between fetches to prevent API spam.
 */

const SOCKET_TOKEN_STORAGE_KEY = "sorcery:socketToken";
const TOKEN_REFRESH_BUFFER_MS = 60 * 60 * 1000; // Refresh 1 hour before expiry
const TOKEN_LIFETIME_MS = 24 * 60 * 60 * 1000; // 24 hours
const MIN_FETCH_INTERVAL_MS = 5 * 60 * 1000; // Minimum 5 minutes between fetches

interface CachedSocketToken {
  token: string;
  expiresAt: number; // timestamp in ms
  fetchedAt: number; // timestamp when token was fetched (for rate limiting)
}

// Singleton promise for in-flight fetch - ensures only ONE fetch happens at a time
let activeFetchPromise: Promise<string | undefined> | null = null;

// Track last fetch attempt time (in memory, survives across calls but not page reload)
let lastFetchAttemptTime = 0;

/**
 * Get cached token from localStorage if still valid
 */
function getCachedToken(): CachedSocketToken | null {
  if (typeof window === "undefined") return null;
  try {
    const stored = localStorage.getItem(SOCKET_TOKEN_STORAGE_KEY);
    if (!stored) return null;
    const cached: CachedSocketToken = JSON.parse(stored);
    // Check if token is still valid (with buffer time)
    if (Date.now() < cached.expiresAt - TOKEN_REFRESH_BUFFER_MS) {
      return cached;
    }
    // Token expired or expiring soon
    localStorage.removeItem(SOCKET_TOKEN_STORAGE_KEY);
  } catch {}
  return null;
}

/**
 * Store token in localStorage
 */
function setCachedToken(token: string): void {
  if (typeof window === "undefined") return;
  const now = Date.now();
  try {
    const cached: CachedSocketToken = {
      token,
      expiresAt: now + TOKEN_LIFETIME_MS,
      fetchedAt: now,
    };
    localStorage.setItem(SOCKET_TOKEN_STORAGE_KEY, JSON.stringify(cached));
    lastFetchAttemptTime = now;
    console.log("[SocketTokenCache] Token stored in localStorage");
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
    localStorage.removeItem(SOCKET_TOKEN_STORAGE_KEY);
    console.log("[SocketTokenCache] Cache cleared");
  } catch {}
}

/**
 * Check if we should rate-limit a fetch request
 * Returns true if a fetch was attempted recently and we should use cache instead
 */
function shouldRateLimitFetch(): boolean {
  const now = Date.now();
  const cached = getCachedToken();

  // If we have a valid cached token fetched within the rate limit window, rate limit
  if (cached && now - cached.fetchedAt < MIN_FETCH_INTERVAL_MS) {
    return true;
  }

  // Also check in-memory last attempt time (covers failed fetches)
  if (
    lastFetchAttemptTime &&
    now - lastFetchAttemptTime < MIN_FETCH_INTERVAL_MS
  ) {
    return true;
  }

  return false;
}

/**
 * Internal function that actually performs the fetch
 */
async function doFetch(): Promise<string | undefined> {
  console.log("[SocketTokenCache] >>> FETCH START");
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
 * Fetch socket token with caching and rate limiting
 *
 * @param forceRefresh - Request fresh token (still subject to rate limiting)
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

  // Check localStorage cache first
  const cached = getCachedToken();

  // If not forcing refresh, return cached token if valid
  if (!forceRefresh && cached) {
    console.log("[SocketTokenCache] HIT - using cached token");
    return cached.token;
  }

  // Even with forceRefresh, respect rate limiting to prevent API spam
  // Only bypass rate limit for actual auth errors (handled by caller clearing cache)
  if (forceRefresh && shouldRateLimitFetch()) {
    if (cached) {
      console.log(
        "[SocketTokenCache] RATE LIMITED - returning cached token despite forceRefresh"
      );
      return cached.token;
    }
    console.log(
      "[SocketTokenCache] RATE LIMITED - no cached token, waiting..."
    );
    // No cached token and rate limited - return undefined, caller should retry later
    return undefined;
  }

  if (!cached) {
    console.log("[SocketTokenCache] MISS - no cached token");
  } else {
    console.log("[SocketTokenCache] Force refresh requested");
  }

  // Track fetch attempt time before starting
  lastFetchAttemptTime = Date.now();

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
  const cached = getCachedToken();
  return cached?.token ?? null;
}
