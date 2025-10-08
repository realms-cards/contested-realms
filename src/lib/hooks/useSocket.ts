/**
 * useSocket Hook - Socket.io Integration for React Components
 * Provides socket connection management with automatic reconnection and state tracking
 */

import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { io, Socket } from 'socket.io-client';

interface UseSocketOptions {
  url?: string;
  autoConnect?: boolean;
  reconnection?: boolean;
  reconnectionDelay?: number;
  reconnectionAttempts?: number;
  timeout?: number;
  path?: string; // Optional custom socket.io path (e.g., '/api/socket')
  transports?: Array<'polling' | 'websocket'>; // Force transports to avoid proxy issues
}

interface SocketState {
  isConnected: boolean;
  isConnecting: boolean;
  error: string | null;
  reconnectAttempts: number;
}

const DEFAULT_OPTIONS: UseSocketOptions = (() => {
  const url = process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:3010';
  const path = process.env.NEXT_PUBLIC_WS_PATH || undefined;
  const transportsEnv = (process.env.NEXT_PUBLIC_WS_TRANSPORTS || '').split(',').map(s => s.trim()).filter(Boolean) as Array<'polling' | 'websocket'>;
  return {
    url,
    autoConnect: true,
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionAttempts: 5,
    timeout: 20000,
    path,
    // Allow polling fallback by default to ensure server bootstraps via HTTP before WS upgrade
    transports: transportsEnv.length ? transportsEnv : ['websocket', 'polling'],
  } as UseSocketOptions;
})();

// Global singleton socket instance - prevents reconnections on page navigation
let globalSocket: Socket | null = null;
let globalSocketRefCount = 0;

/**
 * useSocket hook provides Socket.io connection management
 * Returns the socket instance and connection state
 */
export function useSocket(options: UseSocketOptions = {}): Socket | null {
  const opts = useMemo(() => ({ ...DEFAULT_OPTIONS, ...options }), [options]);

  const [socket, setSocket] = useState<Socket | null>(null);
  const socketRef = useRef<Socket | null>(null);

  // Initialize socket connection
  useEffect(() => {
    if (!opts.autoConnect) return;

    let cancelled = false;

    async function init() {
      // Return existing global socket if available
      if (globalSocket) {
        console.log(`[useSocket] Reusing existing socket connection (refCount: ${globalSocketRefCount + 1})`);
        globalSocketRefCount++;
        socketRef.current = globalSocket;
        setSocket(globalSocket);
        return;
      }

      console.log(`[useSocket] Initializing socket connection to ${opts.url}`);
      // Fetch short-lived auth token from app API (signed by NEXTAUTH_SECRET)
      let token: string | undefined = undefined;
      try {
        const res = await fetch('/api/socket-token', { credentials: 'include' });
        if (res.ok) {
          const j = await res.json();
          token = j?.token as string | undefined;
        }
      } catch {}
      if (cancelled) return;

      // Connect directly to the main game server (server/index.js)
      // No warmup needed - the server runs independently in Docker

      const socketInstance = io(opts.url as string, {
        autoConnect: opts.autoConnect,
        reconnection: opts.reconnection,
        reconnectionDelay: opts.reconnectionDelay,
        reconnectionAttempts: opts.reconnectionAttempts,
        timeout: opts.timeout,
        path: opts.path,
        transports: opts.transports,
        auth: token ? { token } : undefined,
      });

      globalSocket = socketInstance;
      globalSocketRefCount = 1;
      socketRef.current = socketInstance;
      setSocket(socketInstance);

    const handleConnect = () => console.log('[useSocket] Connected to server');
    const handleDisconnect = (reason: string) => console.log(`[useSocket] Disconnected: ${reason}`);
    const handleConnecting = () => console.log('[useSocket] Connecting...');
    const handleConnectError = async (error: Error | { message?: string }) => {
      console.error('[useSocket] Connection error:', error);
      // If token expired/unauthorized, refresh token for the next attempt
      try {
        const msg = (error as { message?: string })?.message || String(error);
        if (msg?.toLowerCase().includes('jwt') || msg?.toLowerCase().includes('unauthor')) {
          const res = await fetch('/api/socket-token', { credentials: 'include' });
          if (res.ok) {
            const j = await res.json();
            const mgr = socketInstance.io as unknown as { opts: { auth?: Record<string, unknown> } };
            mgr.opts.auth = { token: j?.token as string };
            // Nudge a reconnect attempt if currently disconnected
            try { if (!socketInstance.connected) socketInstance.connect(); } catch {}
          }
        }
      } catch {}
    };
    const handleReconnect = (attemptNumber: number) => console.log(`[useSocket] Reconnected after ${attemptNumber} attempts`);
    const handleReconnectAttempt = (attemptNumber: number) => console.log(`[useSocket] Reconnection attempt ${attemptNumber}`);
    const handleReconnectError = (error: Error) => console.error('[useSocket] Reconnection error:', error);
    const handleReconnectFailed = () => console.error('[useSocket] Reconnection failed - max attempts reached');

    // Attach minimal event listeners
    socketInstance.on('connect', handleConnect);
    socketInstance.on('disconnect', handleDisconnect);
    socketInstance.on('connecting', handleConnecting);
    socketInstance.on('connect_error', handleConnectError);
    socketInstance.on('reconnect', handleReconnect);
    socketInstance.on('reconnect_attempt', handleReconnectAttempt);
    socketInstance.on('reconnect_error', handleReconnectError);
    socketInstance.on('reconnect_failed', handleReconnectFailed);

      // Refresh token before reconnect attempts
      // Refresh token before reconnect attempts
      type ManagerWithOpts = { opts: { auth?: Record<string, unknown> } };
      socketInstance.io.on('reconnect_attempt', async () => {
        try {
          const res = await fetch('/api/socket-token', { credentials: 'include' });
          if (res.ok) {
            const j = await res.json();
            // Update auth token for next engine attempt
            const mgr = socketInstance.io as unknown as ManagerWithOpts;
            mgr.opts.auth = { token: j?.token as string };
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
        console.log('[useSocket] Last reference removed, disconnecting socket');
        socketInstance.off('connect', handleConnect);
        socketInstance.off('disconnect', handleDisconnect);
        socketInstance.off('connecting', handleConnecting);
        socketInstance.off('connect_error', handleConnectError);
        socketInstance.off('reconnect', handleReconnect);
        socketInstance.off('reconnect_attempt', handleReconnectAttempt);
        socketInstance.off('reconnect_error', handleReconnectError);
        socketInstance.off('reconnect_failed', handleReconnectFailed);

        socketInstance.disconnect();
        globalSocket = null;
      }

      setSocket(null);
      socketRef.current = null;
      };
    }

    init();

    return () => { cancelled = true; };
  }, [opts.url, opts.autoConnect, opts.reconnection, opts.reconnectionDelay, opts.reconnectionAttempts, opts.timeout, opts.path, opts.transports]);

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
    reconnectAttempts: 0
  });

  useEffect(() => {
    if (!socket) return;

    const updateState = (updates: Partial<SocketState>) => {
      setState(prev => ({ ...prev, ...updates }));
    };

    const handleConnect = () => updateState({
      isConnected: true,
      isConnecting: false,
      error: null,
      reconnectAttempts: 0
    });

    const handleDisconnect = (reason: string) => updateState({
      isConnected: false,
      isConnecting: false,
      error: reason
    });

    const handleConnecting = () => updateState({
      isConnecting: true,
      error: null
    });

    const handleConnectError = (error: Error) => updateState({
      isConnected: false,
      isConnecting: false,
      error: error.message
    });

    const handleReconnectAttempt = (attemptNumber: number) => updateState({
      reconnectAttempts: attemptNumber
    });

    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    socket.on('connecting', handleConnecting);
    socket.on('connect_error', handleConnectError);
    socket.on('reconnect_attempt', handleReconnectAttempt);

    return () => {
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      socket.off('connecting', handleConnecting);
      socket.off('connect_error', handleConnectError);
      socket.off('reconnect_attempt', handleReconnectAttempt);
    };
  }, [socket]);

  // Manual connection controls
  const connect = useCallback(() => {
    if (socket && !socket.connected) {
      console.log('[useSocketConnection] Manual connect');
      socket.connect();
    }
  }, [socket]);

  const disconnect = useCallback(() => {
    if (socket && socket.connected) {
      console.log('[useSocketConnection] Manual disconnect');
      socket.disconnect();
    }
  }, [socket]);

  const reconnect = useCallback(() => {
    if (socket) {
      console.log('[useSocketConnection] Manual reconnect');
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
    reconnect
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
        console.error(`[useSocketEvent] Error in handler for ${eventName}:`, error);
      }
    };

    socket.on(eventName, wrappedHandler);

    return () => {
      console.log(`[useSocketEvent] Unregistering handler for event: ${eventName}`);
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
          reject(new Error('Socket not connected'));
          return;
        }

        const timeout = setTimeout(() => {
          reject(new Error(`Timeout waiting for acknowledgment of ${eventName}`));
        }, 10000); // 10 second timeout

        socket.emit(eventName, data, (response: unknown) => {
          clearTimeout(timeout);
          console.log(`[useSocketEmit] Received acknowledgment for ${eventName}:`, response);
          resolve(response);
        });

        console.log(`[useSocketEmit] Emitted event: ${eventName}`, data);
      });
    },
    [socket]
  );
}

// Export socket.io types for convenience
export type { Socket } from 'socket.io-client';
export { io } from 'socket.io-client';

// Default export
export default useSocket;
