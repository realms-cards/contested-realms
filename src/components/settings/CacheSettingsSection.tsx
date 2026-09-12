"use client";

import { RefreshCw } from "lucide-react";
import { useState, useCallback } from "react";
import { RcButton } from "@/components/ui/rc-button";
import { useCacheContextOptional } from "@/contexts/CacheContext";

interface DownloadProgress {
  status: "idle" | "fetching" | "downloading" | "complete" | "error";
  total: number;
  cached: number;
  message?: string;
}

/**
 * Cache settings section for the user settings modal.
 * Shows cache statistics and provides controls for managing cached card images.
 */
export default function CacheSettingsSection() {
  const cache = useCacheContextOptional();
  const [isClearing, setIsClearing] = useState(false);
  const [clearSuccess, setClearSuccess] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState<DownloadProgress>({
    status: "idle",
    total: 0,
    cached: 0,
  });
  const [abortController, setAbortController] =
    useState<AbortController | null>(null);

  const handleClearCards = useCallback(async () => {
    if (!cache || isClearing) return;
    setIsClearing(true);
    setClearSuccess(null);
    try {
      const success = await cache.clearCards();
      if (success) {
        setClearSuccess("Card cache cleared");
        setTimeout(() => setClearSuccess(null), 3000);
      }
    } finally {
      setIsClearing(false);
    }
  }, [cache, isClearing]);

  const handleRefresh = useCallback(async () => {
    if (!cache) return;
    await cache.refreshStats();
  }, [cache]);

  const handleDownloadAll = useCallback(async () => {
    if (!cache || downloadProgress.status === "downloading") return;

    const controller = new AbortController();
    setAbortController(controller);

    setDownloadProgress({ status: "fetching", total: 0, cached: 0 });

    try {
      // Fetch all card slugs
      const response = await fetch("/api/cards/slugs", {
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error("Failed to fetch card list");
      }

      const { slugs } = (await response.json()) as { slugs: string[] };
      if (!slugs?.length) {
        setDownloadProgress({
          status: "complete",
          total: 0,
          cached: 0,
          message: "No cards to download",
        });
        return;
      }

      setDownloadProgress({
        status: "downloading",
        total: slugs.length,
        cached: 0,
      });

      // Pre-cache all cards
      await cache.preCacheCollection(slugs);

      setDownloadProgress({
        status: "complete",
        total: slugs.length,
        cached: slugs.length,
        message: `Downloaded ${slugs.length} cards for offline play`,
      });

      // Refresh stats after download
      await cache.refreshStats();
    } catch (error) {
      if ((error as Error).name === "AbortError") {
        setDownloadProgress({
          status: "idle",
          total: 0,
          cached: 0,
          message: "Download cancelled",
        });
      } else {
        setDownloadProgress({
          status: "error",
          total: 0,
          cached: 0,
          message: error instanceof Error ? error.message : "Download failed",
        });
      }
    } finally {
      setAbortController(null);
    }
  }, [cache, downloadProgress.status]);

  const handleCancelDownload = useCallback(() => {
    abortController?.abort();
    setAbortController(null);
  }, [abortController]);

  // Don't render if cache context isn't available or SW not supported
  if (!cache || !cache.isSupported) {
    return null;
  }

  const { stats, isLoading, isPreCaching, preCacheProgress, formatBytes } =
    cache;
  const isDownloading =
    downloadProgress.status === "downloading" || isPreCaching;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <span className="rc-eyebrow">Card image cache</span>
        <button
          type="button"
          onClick={handleRefresh}
          disabled={isLoading}
          className="cursor-pointer rounded-rc-sm p-1 text-rc-fg-muted transition-colors hover:text-rc-accent-ring disabled:opacity-50"
          title="Refresh stats"
          aria-label="Refresh stats"
        >
          <RefreshCw
            className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`}
          />
        </button>
      </div>

      {stats ? (
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-rc-md border border-rc-line/12 bg-black/30 px-2 py-1.5">
            <div className="rc-hint">cached cards</div>
            <div className="rc-stat text-sm">{stats.cardCount}</div>
          </div>
          <div className="rounded-rc-md border border-rc-line/12 bg-black/30 px-2 py-1.5">
            <div className="rc-hint">cache size</div>
            <div className="rc-stat text-sm">
              {formatBytes(stats.cardCacheSize)}
            </div>
          </div>
        </div>
      ) : (
        <div className="rc-hint">
          {isLoading ? "loading cache stats..." : "cache stats unavailable"}
        </div>
      )}

      <div className="mt-1 flex items-center justify-between gap-2">
        <span className="min-w-0 flex-1 font-rc-sans text-[11px] leading-tight text-rc-fg-muted">
          Card images are cached automatically for faster loading.
        </span>
        <RcButton
          variant="destructive"
          size="sm"
          onClick={handleClearCards}
          disabled={isClearing || !stats?.cardCount}
          title="Clear cached card images"
          className="shrink-0"
        >
          Clear
        </RcButton>
      </div>

      {clearSuccess && (
        <div className="rc-alert" data-tone="success">
          {clearSuccess}
        </div>
      )}

      {/* Download all cards section */}
      <div className="mt-2 border-t border-rc-line/12 pt-2">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="rc-eyebrow">Offline mode</div>
            <div className="mt-0.5 font-rc-sans text-[11px] leading-tight text-rc-fg-muted">
              Download all cards for offline play (~50-150MB)
            </div>
          </div>
          {isDownloading ? (
            <RcButton
              variant="outline"
              size="sm"
              onClick={handleCancelDownload}
              title="Cancel download"
              className="shrink-0"
            >
              Cancel
            </RcButton>
          ) : (
            <RcButton
              variant="outline"
              size="sm"
              onClick={handleDownloadAll}
              disabled={downloadProgress.status === "fetching"}
              title="Download all cards for offline play"
              className="shrink-0"
            >
              Download all
            </RcButton>
          )}
        </div>

        {/* Progress bar */}
        {(isDownloading || downloadProgress.status === "fetching") && (
          <div className="mt-2">
            <div className="rc-progress">
              <span
                style={{
                  width: `${
                    downloadProgress.status === "fetching"
                      ? 0
                      : preCacheProgress
                  }%`,
                }}
              />
            </div>
            <div className="rc-hint mt-1 flex items-center justify-between gap-2">
              <span>
                {downloadProgress.status === "fetching"
                  ? "fetching card list..."
                  : `downloading... ${preCacheProgress}%`}
              </span>
              {downloadProgress.total > 0 && (
                <span>
                  {Math.round(
                    (preCacheProgress / 100) * downloadProgress.total
                  )}{" "}
                  / {downloadProgress.total}
                </span>
              )}
            </div>
          </div>
        )}

        {/* Status messages */}
        {downloadProgress.status === "complete" && downloadProgress.message && (
          <div className="rc-alert mt-2" data-tone="success">
            {downloadProgress.message}
          </div>
        )}
        {downloadProgress.status === "error" && downloadProgress.message && (
          <div className="rc-alert mt-2" data-tone="danger">
            {downloadProgress.message}
          </div>
        )}
        {downloadProgress.status === "idle" && downloadProgress.message && (
          <div className="rc-alert mt-2" data-tone="info">
            {downloadProgress.message}
          </div>
        )}
      </div>
    </div>
  );
}
