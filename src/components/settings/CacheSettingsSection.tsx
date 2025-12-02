"use client";

import { Download, HardDrive, RefreshCw, Trash2, X } from "lucide-react";
import { useState, useCallback } from "react";
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
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs text-slate-300">
          <HardDrive className="w-4 h-4" />
          <span>Card Image Cache</span>
        </div>
        <button
          type="button"
          onClick={handleRefresh}
          disabled={isLoading}
          className="p-1 rounded hover:bg-white/10 text-slate-400 hover:text-slate-200 disabled:opacity-50"
          title="Refresh stats"
        >
          <RefreshCw
            className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`}
          />
        </button>
      </div>

      {stats ? (
        <div className="grid grid-cols-2 gap-2 text-[11px]">
          <div className="px-2 py-1.5 rounded bg-slate-800/50">
            <div className="text-slate-400">Cached Cards</div>
            <div className="text-slate-200 font-medium">{stats.cardCount}</div>
          </div>
          <div className="px-2 py-1.5 rounded bg-slate-800/50">
            <div className="text-slate-400">Cache Size</div>
            <div className="text-slate-200 font-medium">
              {formatBytes(stats.cardCacheSize)}
            </div>
          </div>
        </div>
      ) : (
        <div className="text-[11px] text-slate-500">
          {isLoading ? "Loading cache stats..." : "Cache stats unavailable"}
        </div>
      )}

      <div className="flex items-center justify-between gap-2 mt-1">
        <span className="text-[11px] text-slate-400 leading-tight">
          Card images are cached automatically for faster loading.
        </span>
        <button
          type="button"
          onClick={handleClearCards}
          disabled={isClearing || !stats?.cardCount}
          className={`
            inline-flex items-center gap-1 px-2 py-1 rounded text-[11px]
            bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white
            disabled:opacity-50 disabled:cursor-not-allowed
            transition-colors
          `}
          title="Clear cached card images"
        >
          <Trash2 className="w-3 h-3" />
          Clear
        </button>
      </div>

      {clearSuccess && (
        <p className="text-[11px] text-emerald-300">{clearSuccess}</p>
      )}

      {/* Download all cards section */}
      <div className="mt-2 pt-2 border-t border-slate-700/50">
        <div className="flex items-center justify-between gap-2">
          <div className="flex-1">
            <div className="text-[11px] text-slate-300 font-medium">
              Offline Mode
            </div>
            <div className="text-[11px] text-slate-400 leading-tight mt-0.5">
              Download all cards for offline play (~50-150MB)
            </div>
          </div>
          {isDownloading ? (
            <button
              type="button"
              onClick={handleCancelDownload}
              className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] bg-rose-500/20 text-rose-300 hover:bg-rose-500/30 transition-colors"
              title="Cancel download"
            >
              <X className="w-3 h-3" />
              Cancel
            </button>
          ) : (
            <button
              type="button"
              onClick={handleDownloadAll}
              disabled={downloadProgress.status === "fetching"}
              className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] bg-purple-500/20 text-purple-300 hover:bg-purple-500/30 disabled:opacity-50 transition-colors"
              title="Download all cards for offline play"
            >
              <Download className="w-3 h-3" />
              Download All
            </button>
          )}
        </div>

        {/* Progress bar */}
        {(isDownloading || downloadProgress.status === "fetching") && (
          <div className="mt-2">
            <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-purple-500 transition-all duration-300"
                style={{
                  width: `${
                    downloadProgress.status === "fetching"
                      ? 0
                      : preCacheProgress
                  }%`,
                }}
              />
            </div>
            <div className="flex items-center justify-between mt-1 text-[10px] text-slate-400">
              <span>
                {downloadProgress.status === "fetching"
                  ? "Fetching card list..."
                  : `Downloading... ${preCacheProgress}%`}
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
          <p className="mt-1 text-[11px] text-emerald-300">
            {downloadProgress.message}
          </p>
        )}
        {downloadProgress.status === "error" && downloadProgress.message && (
          <p className="mt-1 text-[11px] text-rose-300">
            {downloadProgress.message}
          </p>
        )}
        {downloadProgress.status === "idle" && downloadProgress.message && (
          <p className="mt-1 text-[11px] text-slate-400">
            {downloadProgress.message}
          </p>
        )}
      </div>
    </div>
  );
}
