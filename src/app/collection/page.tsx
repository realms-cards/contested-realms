"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, useRef } from "react";
import type {
  CollectionListResponse,
  CollectionFilters as FilterType,
  CollectionSortField,
  SortOrder,
} from "@/lib/collection/types";
import CollectionFilters from "./CollectionFilters";
import CollectionGrid from "./CollectionGrid";
import CollectionListView from "./CollectionListView";
import CollectionViewControls, {
  type ViewMode,
} from "./CollectionViewControls";
import QuickAdd from "./QuickAdd";

export default function CollectionPage() {
  const [data, setData] = useState<CollectionListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showQuickAdd, setShowQuickAdd] = useState(false);

  // Filter state
  const [filters, setFilters] = useState<FilterType>({});
  const [sort, setSort] = useState<CollectionSortField>("name");
  const [order, setOrder] = useState<SortOrder>("asc");
  const [page, setPage] = useState(1);

  // View controls - initialize with defaults, then hydrate from localStorage
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [zoom, setZoom] = useState(100);
  const [viewHydrated, setViewHydrated] = useState(false);

  // Hydrate view preferences from localStorage after mount (avoids SSR mismatch)
  useEffect(() => {
    const savedMode = localStorage.getItem(
      "sorcery:collectionViewMode"
    ) as ViewMode;
    const savedZoom = localStorage.getItem("sorcery:collectionZoom");
    if (savedMode === "grid" || savedMode === "list") {
      setViewMode(savedMode);
    }
    if (savedZoom) {
      setZoom(Number(savedZoom));
    }
    setViewHydrated(true);
  }, []);

  // Persist view preferences
  const handleViewModeChange = (mode: ViewMode) => {
    setViewMode(mode);
    localStorage.setItem("sorcery:collectionViewMode", mode);
  };

  const handleZoomChange = (newZoom: number) => {
    setZoom(newZoom);
    localStorage.setItem("sorcery:collectionZoom", String(newZoom));
  };

  // Track fetch state to avoid duplicate fetches
  const abortRef = useRef<AbortController | null>(null);
  const lastParamsRef = useRef<string>("");
  const refreshDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Build params and fetch when dependencies change
  useEffect(() => {
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("limit", "50");
    params.set("sort", sort);
    params.set("order", order);

    if (filters.setId) params.set("setId", String(filters.setId));
    if (filters.element) params.set("element", filters.element);
    if (filters.type) params.set("type", filters.type);
    if (filters.rarity) params.set("rarity", filters.rarity);
    if (filters.search) params.set("search", filters.search);

    const paramsStr = params.toString();

    // Skip if params haven't changed
    if (paramsStr === lastParamsRef.current) {
      return;
    }

    // Abort any pending request
    if (abortRef.current) {
      abortRef.current.abort();
    }

    const controller = new AbortController();
    abortRef.current = controller;

    // Fetch immediately on first load, debounce subsequent changes
    const isFirstLoad = lastParamsRef.current === "";
    lastParamsRef.current = paramsStr;

    const doFetch = async () => {
      try {
        setLoading(true);
        const res = await fetch(`/api/collection?${paramsStr}`, {
          signal: controller.signal,
        });
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || "Failed to load collection");
        }
        const result = await res.json();
        setData(result);
        setError(null);
      } catch (e) {
        if (e instanceof Error && e.name === "AbortError") {
          return;
        }
        setError(e instanceof Error ? e.message : "Failed to load collection");
      } finally {
        setLoading(false);
      }
    };

    if (isFirstLoad) {
      doFetch();
      return () => {};
    } else {
      const timer = setTimeout(doFetch, 150);
      return () => clearTimeout(timer);
    }
  }, [
    page,
    sort,
    order,
    filters.setId,
    filters.element,
    filters.type,
    filters.rarity,
    filters.search,
  ]);

  // Manual refresh function for after card updates
  const refreshCollection = useCallback(async () => {
    // Abort current and trigger new fetch
    if (abortRef.current) {
      abortRef.current.abort();
    }
    const controller = new AbortController();
    abortRef.current = controller;

    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("limit", "50");
    params.set("sort", sort);
    params.set("order", order);
    if (filters.setId) params.set("setId", String(filters.setId));
    if (filters.element) params.set("element", filters.element);
    if (filters.type) params.set("type", filters.type);
    if (filters.rarity) params.set("rarity", filters.rarity);
    if (filters.search) params.set("search", filters.search);

    const paramsStr = params.toString();
    lastParamsRef.current = paramsStr;

    try {
      setLoading(true);
      const res = await fetch(`/api/collection?${paramsStr}`, {
        signal: controller.signal,
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to load collection");
      }
      const result = await res.json();
      setData(result);
      setError(null);
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") {
        return;
      }
      setError(e instanceof Error ? e.message : "Failed to load collection");
    } finally {
      setLoading(false);
    }
  }, [
    page,
    sort,
    order,
    filters.setId,
    filters.element,
    filters.type,
    filters.rarity,
    filters.search,
  ]);

  const handleFiltersChange = (newFilters: FilterType) => {
    setFilters(newFilters);
    setPage(1); // Reset to first page on filter change
  };

  const handleSortChange = (
    newSort: CollectionSortField,
    newOrder: SortOrder
  ) => {
    setSort(newSort);
    setOrder(newOrder);
    setPage(1);
  };

  const handleCardAdded = () => {
    // Debounce refreshes when adding cards rapidly
    if (refreshDebounceRef.current) {
      clearTimeout(refreshDebounceRef.current);
    }
    refreshDebounceRef.current = setTimeout(() => {
      refreshCollection();
      refreshDebounceRef.current = null;
    }, 500);
  };

  // Listen for collection:refresh events from import/export
  useEffect(() => {
    const handleRefresh = () => refreshCollection();
    window.addEventListener("collection:refresh", handleRefresh);
    return () =>
      window.removeEventListener("collection:refresh", handleRefresh);
  }, [refreshCollection]);

  // Empty state
  if (
    !loading &&
    data?.cards.length === 0 &&
    !Object.values(filters).some(Boolean)
  ) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-6">
        <div className="text-6xl">📦</div>
        <h2 className="text-2xl font-bold">Your Collection is Empty</h2>
        <p className="text-gray-400 text-center max-w-md">
          Start tracking your physical Sorcery cards! Add cards to see set
          completion, build decks from your collection, and view pricing.
        </p>
        <div className="flex gap-4">
          <button
            onClick={() => setShowQuickAdd(true)}
            className="px-6 py-3 bg-blue-600 hover:bg-blue-700 rounded-lg font-medium transition-colors"
          >
            Quick Add Cards
          </button>
          <Link
            href="/collection/scan"
            className="px-6 py-3 bg-cyan-600 hover:bg-cyan-700 rounded-lg font-medium transition-colors flex items-center gap-2"
          >
            📷 Scan Cards
          </Link>
          <Link
            href="/collection/browser"
            className="px-6 py-3 bg-gray-700 hover:bg-gray-600 rounded-lg font-medium transition-colors"
          >
            Browse All Cards
          </Link>
        </div>

        {showQuickAdd && (
          <QuickAdd
            onClose={() => setShowQuickAdd(false)}
            onCardAdded={handleCardAdded}
          />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats Summary */}
      {data?.stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-gray-800 rounded-lg p-4">
            <div className="text-2xl font-bold">{data.stats.totalCards}</div>
            <div className="text-gray-400 text-sm">Total Cards</div>
          </div>
          <div className="bg-gray-800 rounded-lg p-4">
            <div className="text-2xl font-bold">{data.stats.uniqueCards}</div>
            <div className="text-gray-400 text-sm">Unique Cards</div>
          </div>
          <div className="bg-gray-800 rounded-lg p-4">
            <div className="text-2xl font-bold">
              {data.stats.totalValue != null
                ? `$${data.stats.totalValue.toFixed(2)}`
                : "N/A"}
            </div>
            <div className="text-gray-400 text-sm">Est. Value</div>
          </div>
          <div className="bg-gray-800 rounded-lg p-4 flex items-center justify-center gap-2">
            <button
              onClick={() => setShowQuickAdd(true)}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm font-medium transition-colors"
            >
              + Quick Add
            </button>
            <Link
              href="/collection/scan"
              className="px-4 py-2 bg-cyan-600 hover:bg-cyan-700 rounded-lg text-sm font-medium transition-colors"
            >
              📷 Scan
            </Link>
          </div>
        </div>
      )}

      {/* Filters and View Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <CollectionFilters
          filters={filters}
          sort={sort}
          order={order}
          onFiltersChange={handleFiltersChange}
          onSortChange={handleSortChange}
        />
        <CollectionViewControls
          viewMode={viewMode}
          onViewModeChange={handleViewModeChange}
          zoom={zoom}
          onZoomChange={handleZoomChange}
        />
      </div>

      {/* Error State */}
      {error && (
        <div className="bg-red-900/50 border border-red-700 rounded-lg p-4 text-center">
          {error}
          <button
            onClick={() => {
              setError(null);
              refreshCollection();
            }}
            className="ml-4 underline"
          >
            Retry
          </button>
        </div>
      )}

      {/* Collection View */}
      {viewMode === "grid" ? (
        <CollectionGrid
          cards={data?.cards || []}
          loading={loading}
          onQuantityChange={refreshCollection}
          zoom={zoom}
        />
      ) : (
        <CollectionListView
          cards={data?.cards || []}
          loading={loading}
          onQuantityChange={refreshCollection}
        />
      )}

      {/* Pagination */}
      {data?.pagination && data.pagination.totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-3 py-2 bg-gray-700 rounded disabled:opacity-50"
          >
            Previous
          </button>
          <span className="px-4">
            Page {page} of {data.pagination.totalPages}
          </span>
          <button
            onClick={() =>
              setPage((p) => Math.min(data.pagination.totalPages, p + 1))
            }
            disabled={page === data.pagination.totalPages}
            className="px-3 py-2 bg-gray-700 rounded disabled:opacity-50"
          >
            Next
          </button>
        </div>
      )}

      {/* Quick Add Modal */}
      {showQuickAdd && (
        <QuickAdd
          onClose={() => setShowQuickAdd(false)}
          onCardAdded={handleCardAdded}
        />
      )}
    </div>
  );
}
