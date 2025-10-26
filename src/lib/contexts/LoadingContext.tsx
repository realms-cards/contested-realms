"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { createContext, useContext, useCallback, useRef, useEffect, useState, type ReactNode } from "react";

/**
 * Loading context value type
 */
export interface LoadingContextValue {
  /** Current loading state */
  isLoading: boolean;
  /** Start a loading operation (increments reference count) */
  startLoading: () => void;
  /** Stop a loading operation (decrements reference count) */
  stopLoading: () => void;
}

const LoadingContext = createContext<LoadingContextValue | null>(null);

/**
 * LoadingProvider manages global loading state with reference counting,
 * debouncing, and automatic cleanup.
 *
 * Features:
 * - Reference counting for concurrent operations
 * - 100ms debounce before showing indicator
 * - 300ms minimum display time once visible
 * - 30-second timeout fallback for stuck operations
 * - Automatic navigation loading detection
 *
 * @example
 * ```tsx
 * <LoadingProvider>
 *   <App />
 * </LoadingProvider>
 * ```
 */
export function LoadingProvider({ children }: { children: ReactNode }) {
  const [isLoading, setIsLoading] = useState(false);
  const refCount = useRef(0);
  const debounceTimer = useRef<NodeJS.Timeout | null>(null);
  const minDisplayTimer = useRef<NodeJS.Timeout | null>(null);
  const timeoutTimer = useRef<NodeJS.Timeout | null>(null);
  const isVisible = useRef(false);
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Navigation tracking refs
  const lastPathRef = useRef<string | null>(null);
  const navigationLoadingRef = useRef(false);

  const actuallyHideIndicator = useCallback(() => {
    if (timeoutTimer.current) {
      clearTimeout(timeoutTimer.current);
      timeoutTimer.current = null;
    }

    // Enforce minimum display time
    if (isVisible.current) {
      if (minDisplayTimer.current) {
        clearTimeout(minDisplayTimer.current);
      }
      minDisplayTimer.current = setTimeout(() => {
        isVisible.current = false;
        setIsLoading(false);
        minDisplayTimer.current = null;
      }, 300);
    } else {
      setIsLoading(false);
    }
  }, [setIsLoading]);

  const actuallyShowIndicator = useCallback(() => {
    isVisible.current = true;
    setIsLoading(true);

    // Set 30-second timeout fallback
    if (timeoutTimer.current) {
      clearTimeout(timeoutTimer.current);
    }
    timeoutTimer.current = setTimeout(() => {
      console.warn("[LoadingContext] Loading timeout reached (30s), auto-stopping");
      refCount.current = 0;
      actuallyHideIndicator();
    }, 30000);
  }, [actuallyHideIndicator]);

  const startLoading = useCallback(() => {
    refCount.current += 1;

    if (refCount.current === 1) {
      // First loading operation, start debounce timer
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
      }
      debounceTimer.current = setTimeout(() => {
        if (refCount.current > 0) {
          actuallyShowIndicator();
        }
        debounceTimer.current = null;
      }, 50);
    }
  }, [actuallyShowIndicator]);

  const stopLoading = useCallback(() => {
    refCount.current = Math.max(0, refCount.current - 1);

    if (refCount.current === 0) {
      // All loading operations complete
      if (debounceTimer.current) {
        // Loading stopped before debounce completed, cancel showing indicator
        clearTimeout(debounceTimer.current);
        debounceTimer.current = null;
      } else if (isVisible.current) {
        // Indicator is visible, hide it
        actuallyHideIndicator();
      }
    }
  }, [actuallyHideIndicator]);

  // Detect navigation changes and trigger loading
  useEffect(() => {
    const currentPath = `${pathname}?${searchParams?.toString() ?? ""}`;

    if (lastPathRef.current === null) {
      // Initial mount, don't trigger loading
      lastPathRef.current = currentPath;
      return undefined;
    }

    if (lastPathRef.current !== currentPath) {
      // Navigation detected, stop any previous navigation loading
      if (navigationLoadingRef.current) {
        stopLoading();
        navigationLoadingRef.current = false;
      }

      // Start loading for new navigation
      startLoading();
      navigationLoadingRef.current = true;

      // Auto-stop after navigation completes (give React time to render)
      const timer = setTimeout(() => {
        if (navigationLoadingRef.current) {
          stopLoading();
          navigationLoadingRef.current = false;
        }
      }, 100);

      lastPathRef.current = currentPath;

      return () => clearTimeout(timer);
    }

    return undefined;
  }, [pathname, searchParams, startLoading, stopLoading]);

  useEffect(() => {
    const onStart = () => startLoading();
    const onStop = () => stopLoading();
    if (typeof document !== "undefined") {
      document.addEventListener("app:loading:start", onStart as unknown as EventListener);
      document.addEventListener("app:loading:stop", onStop as unknown as EventListener);
    }
    return () => {
      if (typeof document !== "undefined") {
        document.removeEventListener("app:loading:start", onStart as unknown as EventListener);
        document.removeEventListener("app:loading:stop", onStop as unknown as EventListener);
      }
    };
  }, [startLoading, stopLoading]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      if (minDisplayTimer.current) clearTimeout(minDisplayTimer.current);
      if (timeoutTimer.current) clearTimeout(timeoutTimer.current);
    };
  }, []);

  const value: LoadingContextValue = {
    isLoading,
    startLoading,
    stopLoading,
  };

  return (
    <LoadingContext.Provider value={value}>
      {children}
    </LoadingContext.Provider>
  );
}

/**
 * Hook to access loading context
 *
 * @throws Error if used outside LoadingProvider
 *
 * @example
 * ```tsx
 * const { isLoading, startLoading, stopLoading } = useLoadingContext();
 *
 * async function handleSubmit() {
 *   startLoading();
 *   try {
 *     await api.createTournament(...);
 *   } finally {
 *     stopLoading();
 *   }
 * }
 * ```
 */
export function useLoadingContext(): LoadingContextValue {
  const context = useContext(LoadingContext);
  if (!context) {
    throw new Error("useLoadingContext must be used within LoadingProvider");
  }
  return context;
}
