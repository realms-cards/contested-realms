/**
 * useSocket Hook - Socket.io Integration for React Components
 * Provides socket connection management with automatic reconnection and state tracking
 */

import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { io, Socket } from "socket.io-client";
import {
  fetchSocketToken,
  getCachedTokenSync,
} from "@/lib/net/socketTokenCache";

interface UseSocketOptions {
  url?: string;
  autoConnect?: boolean;
  reconnection?: boolean;
  reconnectionDelay?: number;
  reconnectionDelayMax?: number;
  reconnectionAttempts?: number;
  timeout?: number;
  path?: string; // Optional custom socket.io path (e.g., '/api/socket')
  transports?: Array<"polling" | "websocket">; // Force transports to avoid proxy issues
}

interface SocketState {
  isConnected: boolean;
  isConnecting: boolean;
  error: string | null;
  reconnectAttempts: number;
}

const DEFAULT_OPTIONS: UseSocketOptions = (() => {
  const url = process.env.NEXT_PUBLIC_WS_URL || "http://localhost:3010";
  const path = process.env.NEXT_PUBLIC_WS_PATH || undefined;
  const transportsEnv = (process.env.NEXT_PUBLIC_WS_TRANSPORTS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean) as Array<"polling" | "websocket">;
  const reconnectAttemptsEnv = Number(
    process.env.NEXT_PUBLIC_WS_RECONNECT_ATTEMPTS
  );
  const timeoutEnv = Number(process.env.NEXT_PUBLIC_WS_TIMEOUT_MS);
  const reconnectDelayMaxEnv = Number(
    process.env.NEXT_PUBLIC_WS_RECONNECT_DELAY_MAX
  );
  return {
    url,
    autoConnect: true,
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax:
      Number.isFinite(reconnectDelayMaxEnv) && reconnectDelayMaxEnv > 0
        ? reconnectDelayMaxEnv
        : 30000,
    reconnectionAttempts:
      Number.isFinite(reconnectAttemptsEnv) && reconnectAttemptsEnv > 0
        ? reconnectAttemptsEnv
        : Number.POSITIVE_INFINITY,
    timeout:
      Number.isFinite(timeoutEnv) && timeoutEnv > 5000 ? timeoutEnv : 45000,
    path,
    // Allow polling fallback by default to ensure server bootstraps via HTTP before WS upgrade
    transports: transportsEnv.length ? transportsEnv : ["websocket", "polling"],
  } as UseSocketOptions;
})();

// Global singleton socket instance - prevents reconnections on page navigation
let globalSocket: Socket | null = null;
let globalSocketRefCount = 0;

// Token caching is handled by socketTokenCache.ts (shared with SocketTransport)

// Auth failure tracking - uses exponential backoff instead of hard stop
let authFailureCount = 0;
let lastAuthFailureTime = 0;
const AUTH_FAILURE_RESET_MS = 300000; // Reset failure count after 5 minutes of no failures

// Backoff delays: 2s, 5s, 10s, 30s, 60s, then stay at 60s
const AUTH_BACKOFF_DELAYS = [2000, 5000, 10000, 30000, 60000];

/**
 * Get the current backoff delay based on failure count
 */
function getAuthBackoffDelay(): number {
  const index = Math.min(authFailureCount, AUTH_BACKOFF_DELAYS.length - 1);
  return AUTH_BACKOFF_DELAYS[index];
}

/**
 * Check if we should delay reconnection (exponential backoff)
 * Returns true if we should wait before trying again
 */
function shouldDelayReconnection(): boolean {
  // Reset failure count if enough time has passed
  if (Date.now() - lastAuthFailureTime > AUTH_FAILURE_RESET_MS) {
    authFailureCount = 0;
    return false;
  }

  // If we have failures, check if enough time has passed since last failure
  if (authFailureCount > 0) {
    const backoffDelay = getAuthBackoffDelay();
    const timeSinceLastFailure = Date.now() - lastAuthFailureTime;
    return timeSinceLastFailure < backoffDelay;
  }

  return false;
}

/**
 * Record an auth failure and return the backoff delay
 */
function _recordAuthFailure(): number {
  authFailureCount++;
  lastAuthFailureTime = Date.now();
  const delay = getAuthBackoffDelay();
  if (authFailureCount > 2) {
    console.warn(
      `[useSocket] Auth failure #${authFailureCount}, backing off for ${
        delay / 1000
      }s`
    );
  }
  return delay;
}

/**
 * Reset auth failure tracking (call on successful connection)
 */
function resetAuthFailures(): void {
  if (authFailureCount > 0) {
    console.log("[useSocket] Auth failures reset after successful connection");
  }
  authFailureCount = 0;
  lastAuthFailureTime = 0;
}

/**
 * useSocket hook provides Socket.io connection management
 * Returns the socket instance and connection state
 */
export function useSocket(options: UseSocketOptions = {}): Socket | null {
  const opts = useMemo(() => ({ ...DEFAULT_OPTIONS, ...options }), [options]);

  const [socket, setSocket] = useState<Socket | null>(null);
  const socketRef = useRef<Socket | null>(null);

  // Handle visibility change - reconnect when tab becomes visible
  useEffect(() => {
    if (typeof document === "undefined") return;

    const handleVisibilityChange = async () => {
      if (document.visibilityState !== "visible") return;

      // Check if we have a socket but it's disconnected
      if (globalSocket && !globalSocket.connected) {
        console.log(
          "[useSocket] Tab became visible, socket disconnected - attempting reconnect"
        );

        // Refresh token before reconnecting
        try {
          const token = await fetchSocketToken(true); // Force refresh
          if (token) {
            type ManagerWithOpts = {
              opts: { auth?: Record<string, unknown> };
              reconnection: boolean;
            };
            const mgr = globalSocket.io as unknown as ManagerWithOpts;
            mgr.opts.auth = { token };
            mgr.reconnection = true;
            globalSocket.connect();
          }
        } catch (e) {
          console.warn(
            "[useSocket] Failed to refresh token on visibility change:",
            e
          );
          // Still try to reconnect with existing auth
          globalSocket.connect();
        }
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []); // Empty deps - we want this listener to persist

  // Initialize socket connection
  useEffect(() => {
    if (!opts.autoConnect) return;

    let cancelled = false;

    async function init() {
      // Return existing global socket if available
      if (globalSocket) {
        console.log(
          `[useSocket] Reusing existing socket connection (refCount: ${
            globalSocketRefCount + 1
          })`
        );
        globalSocketRefCount++;
        socketRef.current = globalSocket;
        setSocket(globalSocket);
        return;
      }

      console.log(`[useSocket] Initializing socket connection to ${opts.url}`);
      // Fetch short-lived auth token from app API (signed by NEXTAUTH_SECRET)
      const token = await fetchSocketToken();
      if (cancelled) return;

      // Connect directly to the main game server (server/index.js)
      // No warmup needed - the server runs independently in Docker

      const socketInstance = io(opts.url as string, {
        autoConnect: opts.autoConnect,
        reconnection: opts.reconnection,
        reconnectionDelay: opts.reconnectionDelay,
        reconnectionAttempts: opts.reconnectionAttempts,
        reconnectionDelayMax: opts.reconnectionDelayMax,
        timeout: opts.timeout,
        path: opts.path,
        transports: opts.transports,
        withCredentials: true,
        auth: token ? { token } : undefined,
      });

      globalSocket = socketInstance;
      globalSocketRefCount = 1;
      socketRef.current = socketInstance;
      setSocket(socketInstance);

      const handleConnect = () => {
        console.log("[useSocket] Connected to server");
        resetAuthFailures(); // Reset auth failure tracking on successful connection
      };
      const handleDisconnect = (reason: string) =>
        console.log(`[useSocket] Disconnected: ${reason}`);
      const handleConnecting = () => console.log("[useSocket] Connecting...");
      const handleConnectError = async (
        error: Error | { message?: string }
      ) => {
        const msg = (error as { message?: string })?.message || String(error);
        const isAuthError =
          msg?.toLowerCase().includes("jwt") ||
          msg?.toLowerCase().includes("unauthor") ||
          msg?.toLowerCase().includes("invalid_token") ||
          msg?.toLowerCase().includes("token");

        // Only log non-auth errors at error level (auth errors are expected during token refresh)
        if (isAuthError) {
          console.warn("[useSocket] Auth error, refreshing token...");
        } else {
          console.error("[useSocket] Connection error:", error);
        }

        if (!isAuthError) return;

        // CRITICAL: Temporarily disable socket.io's auto-reconnection to prevent
        // it from racing ahead with the old token while we fetch a new one
        type ManagerWithOpts = {
          opts: { auth?: Record<string, unknown> };
          reconnection: boolean;
        };
        const mgr = socketInstance.io as unknown as ManagerWithOpts;
        mgr.reconnection = false;

        // Check if we should wait before trying again (exponential backoff)
        if (shouldDelayReconnection()) {
          const delay = getAuthBackoffDelay();
          console.log(
            `[useSocket] Backing off for ${delay / 1000}s before retry`
          );
          setTimeout(() => {
            mgr.reconnection = true;
            if (!socketInstance.connected) socketInstance.connect();
          }, delay);
          return;
        }

        try {
          const token = await fetchSocketToken(true); // Force refresh on auth errors
          if (token) {
            mgr.opts.auth = { token };
            console.log("[useSocket] Token refreshed, reconnecting...");
            // Re-enable reconnection and connect
            mgr.reconnection = true;
            if (!socketInstance.connected) socketInstance.connect();
          } else {
            // Token fetch failed (401) - back off before trying again
            const delay = getAuthBackoffDelay();
            console.log(
              `[useSocket] Token refresh failed, backing off for ${
                delay / 1000
              }s`
            );
            setTimeout(() => {
              mgr.reconnection = true;
              if (!socketInstance.connected) socketInstance.connect();
            }, delay);
          }
        } catch (e) {
          console.warn("[useSocket] Error during token refresh:", e);
          // Re-enable reconnection after delay
          const delay = getAuthBackoffDelay();
          setTimeout(() => {
            mgr.reconnection = true;
          }, delay);
        }
      };
      const handleReconnect = (attemptNumber: number) => {
        console.log(`[useSocket] Reconnected after ${attemptNumber} attempts`);
        resetAuthFailures(); // Reset auth failure tracking on successful reconnection
      };
      const handleReconnectAttempt = (attemptNumber: number) =>
        console.log(`[useSocket] Reconnection attempt ${attemptNumber}`);
      const handleReconnectError = (error: Error) =>
        console.error("[useSocket] Reconnection error:", error);
      const handleReconnectFailed = () =>
        console.error("[useSocket] Reconnection failed - max attempts reached");

      // Attach minimal event listeners
      socketInstance.on("connect", handleConnect);
      socketInstance.on("disconnect", handleDisconnect);
      socketInstance.on("connecting", handleConnecting);
      socketInstance.on("connect_error", handleConnectError);
      socketInstance.on("reconnect", handleReconnect);
      socketInstance.on("reconnect_attempt", handleReconnectAttempt);
      socketInstance.on("reconnect_error", handleReconnectError);
      socketInstance.on("reconnect_failed", handleReconnectFailed);

      // Refresh token before reconnect attempts
      // CRITICAL: Use synchronous token check first to prevent stale token reconnection
      type ManagerWithOpts = {
        opts: { auth?: Record<string, unknown> };
        reconnection: boolean;
      };
      socketInstance.io.on("reconnect_attempt", async () => {
        const mgr = socketInstance.io as unknown as ManagerWithOpts;

        // First, try to use cached token synchronously (updates opts.auth before reconnect)
        const cachedToken = getCachedTokenSync();
        if (cachedToken) {
          mgr.opts.auth = { token: cachedToken };
          return; // Let reconnection proceed with cached token
        }

        // No valid cached token - disable reconnection until we get a fresh one
        console.log(
          "[useSocket] No valid cached token for reconnect, fetching fresh..."
        );
        mgr.reconnection = false;

        try {
          const token = await fetchSocketToken();
          if (token) {
            mgr.opts.auth = { token };
            mgr.reconnection = true;
            // Manually trigger reconnect since we disabled it
            if (!socketInstance.connected) {
              socketInstance.connect();
            }
          }
        } catch {}
      });

      // Cleanup function - use reference counting
      return () => {
        if (!socketInstance) return;

        globalSocketRefCount = Math.max(0, globalSocketRefCount - 1);
        console.log(`[useSocket] Cleanup (refCount: ${globalSocketRefCount})`);

        // Only disconnect when all components have unmounted
        if (globalSocketRefCount === 0 && globalSocket) {
          console.log(
            "[useSocket] Last reference removed, disconnecting socket"
          );
          socketInstance.off("connect", handleConnect);
          socketInstance.off("disconnect", handleDisconnect);
          socketInstance.off("connecting", handleConnecting);
          socketInstance.off("connect_error", handleConnectError);
          socketInstance.off("reconnect", handleReconnect);
          socketInstance.off("reconnect_attempt", handleReconnectAttempt);
          socketInstance.off("reconnect_error", handleReconnectError);
          socketInstance.off("reconnect_failed", handleReconnectFailed);

          socketInstance.disconnect();
          globalSocket = null;
        }

        setSocket(null);
        socketRef.current = null;
      };
    }

    init();

    return () => {
      cancelled = true;
    };
  }, [
    opts.url,
    opts.autoConnect,
    opts.reconnection,
    opts.reconnectionDelay,
    opts.reconnectionDelayMax,
    opts.reconnectionAttempts,
    opts.timeout,
    opts.path,
    opts.transports,
  ]);

  return socket;
}

/**
 * useSocketConnection hook provides detailed connection state
 */
export function useSocketConnection(options: UseSocketOptions = {}) {
  const socket = useSocket(options);
  const [state, setState] = useState<SocketState>({
    isConnected: false,
    isConnecting: false,
    error: null,
    reconnectAttempts: 0,
  });

  useEffect(() => {
    if (!socket) return;

    const updateState = (updates: Partial<SocketState>) => {
      setState((prev) => ({ ...prev, ...updates }));
    };

    const handleConnect = () =>
      updateState({
        isConnected: true,
        isConnecting: false,
        error: null,
        reconnectAttempts: 0,
      });

    const handleDisconnect = (reason: string) =>
      updateState({
        isConnected: false,
        isConnecting: false,
        error: reason,
      });

    const handleConnecting = () =>
      updateState({
        isConnecting: true,
        error: null,
      });

    const handleConnectError = (error: Error) =>
      updateState({
        isConnected: false,
        isConnecting: false,
        error: error.message,
      });

    const handleReconnectAttempt = (attemptNumber: number) =>
      updateState({
        reconnectAttempts: attemptNumber,
      });

    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);
    socket.on("connecting", handleConnecting);
    socket.on("connect_error", handleConnectError);
    socket.on("reconnect_attempt", handleReconnectAttempt);

    return () => {
      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
      socket.off("connecting", handleConnecting);
      socket.off("connect_error", handleConnectError);
      socket.off("reconnect_attempt", handleReconnectAttempt);
    };
  }, [socket]);

  // Manual connection controls
  const connect = useCallback(() => {
    if (socket && !socket.connected) {
      console.log("[useSocketConnection] Manual connect");
      socket.connect();
    }
  }, [socket]);

  const disconnect = useCallback(() => {
    if (socket && socket.connected) {
      console.log("[useSocketConnection] Manual disconnect");
      socket.disconnect();
    }
  }, [socket]);

  const reconnect = useCallback(() => {
    if (socket) {
      console.log("[useSocketConnection] Manual reconnect");
      socket.disconnect();
      setTimeout(() => {
        socket.connect();
      }, 1000);
    }
  }, [socket]);

  return {
    socket,
    ...state,
    connect,
    disconnect,
    reconnect,
  };
}

/**
 * useSocketEvent hook for listening to specific socket events
 */
export function useSocketEvent<T = unknown>(
  socket: Socket | null,
  eventName: string,
  handler: (data: T) => void
) {
  useEffect(() => {
    if (!socket || !eventName || !handler) return;

    console.log(`[useSocketEvent] Registering handler for event: ${eventName}`);

    const wrappedHandler = (data: T) => {
      try {
        handler(data);
      } catch (error) {
        console.error(
          `[useSocketEvent] Error in handler for ${eventName}:`,
          error
        );
      }
    };

    socket.on(eventName, wrappedHandler);

    return () => {
      console.log(
        `[useSocketEvent] Unregistering handler for event: ${eventName}`
      );
      socket.off(eventName, wrappedHandler);
    };
  }, [socket, eventName, handler]);
}

/**
 * useSocketEmit hook for emitting events with acknowledgment
 */
export function useSocketEmit(socket: Socket | null) {
  return useCallback(
    <T = unknown>(eventName: string, data?: T): Promise<unknown> => {
      return new Promise((resolve, reject) => {
        if (!socket) {
          reject(new Error("Socket not connected"));
          return;
        }

        const timeout = setTimeout(() => {
          reject(
            new Error(`Timeout waiting for acknowledgment of ${eventName}`)
          );
        }, 10000); // 10 second timeout

        socket.emit(eventName, data, (response: unknown) => {
          clearTimeout(timeout);
          console.log(
            `[useSocketEmit] Received acknowledgment for ${eventName}:`,
            response
          );
          resolve(response);
        });

        console.log(`[useSocketEmit] Emitted event: ${eventName}`, data);
      });
    },
    [socket]
  );
}

// Export socket.io types for convenience
export type { Socket } from "socket.io-client";
export { io } from "socket.io-client";

// Default export
export default useSocket;
