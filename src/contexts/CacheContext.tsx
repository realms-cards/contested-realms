"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useMemo,
  type ReactNode,
} from "react";
import {
  registerServiceWorker,
  getCacheStats,
  clearCardCache,
  clearAllCaches,
  preCacheCards,
  formatBytes,
  isServiceWorkerSupported,
  type CacheStats,
} from "@/lib/service-worker/registration";

interface CacheContextValue {
  /** Whether service workers are supported */
  isSupported: boolean;
  /** Whether SW is registered and ready */
  isReady: boolean;
  /** Current cache statistics */
  stats: CacheStats | null;
  /** Whether stats are loading */
  isLoading: boolean;
  /** Whether a pre-cache operation is in progress */
  isPreCaching: boolean;
  /** Pre-cache progress (0-100) */
  preCacheProgress: number;
  /** Refresh cache stats */
  refreshStats: () => Promise<void>;
  /** Clear card image cache */
  clearCards: () => Promise<boolean>;
  /** Clear all caches */
  clearAll: () => Promise<boolean>;
  /** Pre-cache card images for a collection/deck */
  preCacheCollection: (slugs: string[]) => Promise<void>;
  /** Format bytes helper */
  formatBytes: (bytes: number) => string;
}

const CacheContext = createContext<CacheContextValue | null>(null);

export function useCacheContext(): CacheContextValue {
  const ctx = useContext(CacheContext);
  if (!ctx) {
    throw new Error("useCacheContext must be used within CacheProvider");
  }
  return ctx;
}

// Optional hook that doesn't throw if outside provider
export function useCacheContextOptional(): CacheContextValue | null {
  return useContext(CacheContext);
}

interface CacheProviderProps {
  children: ReactNode;
}

export function CacheProvider({ children }: CacheProviderProps) {
  const [isSupported] = useState(() => isServiceWorkerSupported());
  const [isReady, setIsReady] = useState(false);
  const [stats, setStats] = useState<CacheStats | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isPreCaching, setIsPreCaching] = useState(false);
  const [preCacheProgress, setPreCacheProgress] = useState(0);

  // Register service worker on mount
  useEffect(() => {
    if (!isSupported) return;

    let mounted = true;

    async function init() {
      const result = await registerServiceWorker();
      if (mounted && result.success) {
        setIsReady(true);
        // Fetch initial stats after a short delay to ensure SW is active
        setTimeout(async () => {
          if (mounted) {
            const newStats = await getCacheStats();
            if (mounted) setStats(newStats);
          }
        }, 500);
      }
    }

    init();

    // Listen for SW messages
    const handleMessage = (event: MessageEvent) => {
      const { type, payload } = event.data || {};
      if (type === "CARD_CACHED") {
        // A card was cached - could update stats here
        console.log("[CacheContext] Card cached:", payload?.url);
      } else if (type === "PRE_CACHE_PROGRESS") {
        const { cached, total } = payload || {};
        if (total > 0) {
          setPreCacheProgress(Math.round((cached / total) * 100));
        }
      }
    };

    navigator.serviceWorker?.addEventListener("message", handleMessage);

    return () => {
      mounted = false;
      navigator.serviceWorker?.removeEventListener("message", handleMessage);
    };
  }, [isSupported]);

  const refreshStats = useCallback(async () => {
    if (!isSupported) return;
    setIsLoading(true);
    try {
      const newStats = await getCacheStats();
      setStats(newStats);
    } finally {
      setIsLoading(false);
    }
  }, [isSupported]);

  const clearCards = useCallback(async () => {
    const success = await clearCardCache();
    if (success) {
      await refreshStats();
    }
    return success;
  }, [refreshStats]);

  const clearAll = useCallback(async () => {
    const success = await clearAllCaches();
    if (success) {
      await refreshStats();
    }
    return success;
  }, [refreshStats]);

  const preCacheCollection = useCallback(
    async (slugs: string[]) => {
      if (!slugs.length || isPreCaching) return;

      setIsPreCaching(true);
      setPreCacheProgress(0);

      try {
        // Convert slugs to image URLs
        const urls = slugs.map(
          (slug) => `/api/images/${encodeURIComponent(slug)}`
        );

        await preCacheCards(urls, ({ cached, total }) => {
          setPreCacheProgress(Math.round((cached / total) * 100));
        });

        await refreshStats();
      } finally {
        setIsPreCaching(false);
        setPreCacheProgress(0);
      }
    },
    [isPreCaching, refreshStats]
  );

  const value = useMemo<CacheContextValue>(
    () => ({
      isSupported,
      isReady,
      stats,
      isLoading,
      isPreCaching,
      preCacheProgress,
      refreshStats,
      clearCards,
      clearAll,
      preCacheCollection,
      formatBytes,
    }),
    [
      isSupported,
      isReady,
      stats,
      isLoading,
      isPreCaching,
      preCacheProgress,
      refreshStats,
      clearCards,
      clearAll,
      preCacheCollection,
    ]
  );

  return (
    <CacheContext.Provider value={value}>{children}</CacheContext.Provider>
  );
}
