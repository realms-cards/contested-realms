"use client";

import { ChevronDown } from "lucide-react";
import { useCallback, useEffect, useState, useRef } from "react";
import { RcButton, RcLinkButton } from "@/components/ui/rc-button";
import { RcEmpty } from "@/components/ui/rc-empty";
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
  const [showDangerZone, setShowDangerZone] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");

  // Filter state
  const [filters, setFilters] = useState<FilterType>({});
  const [sort, setSort] = useState<CollectionSortField>("name");
  const [order, setOrder] = useState<SortOrder>("asc");
  const [page, setPage] = useState(1);

  // View controls - initialize with defaults, then hydrate from localStorage
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [zoom, setZoom] = useState(100);
  const [, setViewHydrated] = useState(false);
  const [showFilters, setShowFilters] = useState(true);

  // Hydrate view preferences from localStorage after mount (avoids SSR mismatch)
  useEffect(() => {
    const savedMode = localStorage.getItem(
      "sorcery:collectionViewMode",
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
    newOrder: SortOrder,
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

  const handleDeleteCollection = async () => {
    if (deleteConfirmText !== "DELETE") {
      alert('Please type "DELETE" to confirm');
      return;
    }
    setIsDeleting(true);
    try {
      const res = await fetch("/api/collection", {
        method: "DELETE",
      });
      const result = await res.json();
      if (res.ok) {
        setDeleteConfirmText("");
        setShowDangerZone(false);
        refreshCollection();
        alert(`Deleted ${result.deleted} cards from your collection.`);
      } else {
        alert(result.error || "Failed to delete collection");
      }
    } catch {
      alert("Failed to delete collection");
    } finally {
      setIsDeleting(false);
    }
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
      <>
        <RcEmpty
          title="Your Collection is Empty"
          action={
            <>
              <RcButton onClick={() => setShowQuickAdd(true)}>
                Quick Add Cards
              </RcButton>
              <RcLinkButton variant="outline" href="/collection/scan">
                Scan Cards
              </RcLinkButton>
              <RcLinkButton variant="outline" href="/collection/browser">
                Browse All Cards
              </RcLinkButton>
            </>
          }
        >
          Start tracking your physical Sorcery cards — set completion, decks
          from what you own, and pricing.
        </RcEmpty>

        {showQuickAdd && (
          <QuickAdd
            onClose={() => setShowQuickAdd(false)}
            onCardAdded={handleCardAdded}
          />
        )}
      </>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Stats Bar */}
      {data?.stats && (
        <section className="flex flex-col gap-3 lg:flex-row lg:items-stretch">
          <div className="grid flex-1 grid-cols-2 gap-3 sm:grid-cols-3">
            <div className="rc-panel px-[18px] py-3">
              <div className="rc-eyebrow">cards</div>
              <div className="rc-stat text-2xl">{data.stats.totalCards}</div>
            </div>
            <div className="rc-panel px-[18px] py-3">
              <div className="rc-eyebrow">unique</div>
              <div className="rc-stat text-2xl">{data.stats.uniqueCards}</div>
            </div>
            {data.stats.totalValue != null && (
              <div className="rc-panel px-[18px] py-3">
                <div className="rc-eyebrow">est. value</div>
                <div className="rc-stat text-2xl text-rc-success">
                  ${data.stats.totalValue.toFixed(2)}
                </div>
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2 lg:self-center">
            <RcButton size="sm" onClick={() => setShowQuickAdd(true)}>
              + Add
            </RcButton>
            <RcLinkButton variant="outline" size="sm" href="/collection/scan">
              Scan
            </RcLinkButton>
            <div className="relative">
              <RcButton
                variant="ghost"
                size="sm"
                className="text-rc-warning hover:text-rc-warning"
                onClick={() => setShowDangerZone(!showDangerZone)}
                title="Danger Zone"
              >
                Danger Zone
              </RcButton>
              {showDangerZone && (
                <div className="rc-panel absolute right-0 top-full z-50 mt-2 w-80 max-w-[calc(100vw-32px)] p-4">
                  <div className="rc-eyebrow text-rc-danger">danger zone</div>
                  <p className="mt-2 font-rc-sans text-sm text-rc-fg-muted">
                    Permanently delete your entire collection. This cannot be
                    undone.
                  </p>
                  <div className="mt-4 flex flex-col gap-3">
                    <input
                      type="text"
                      placeholder='Type "DELETE" to confirm'
                      value={deleteConfirmText}
                      onChange={(e) => setDeleteConfirmText(e.target.value)}
                      className="rc-input h-10 w-full"
                    />
                    <RcButton
                      variant="destructive"
                      onClick={handleDeleteCollection}
                      disabled={isDeleting || deleteConfirmText !== "DELETE"}
                    >
                      {isDeleting ? "Deleting..." : "Delete Entire Collection"}
                    </RcButton>
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {/* Filters Toggle + View Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <RcButton
          variant="ghost"
          size="sm"
          onClick={() => setShowFilters((v) => !v)}
        >
          <ChevronDown
            className={`h-4 w-4 transition-transform ${
              showFilters ? "" : "-rotate-90"
            }`}
          />
          Filters
        </RcButton>
        <CollectionViewControls
          viewMode={viewMode}
          onViewModeChange={handleViewModeChange}
          zoom={zoom}
          onZoomChange={handleZoomChange}
        />
      </div>

      {/* Collapsible Filters */}
      {showFilters && (
        <CollectionFilters
          filters={filters}
          sort={sort}
          order={order}
          onFiltersChange={handleFiltersChange}
          onSortChange={handleSortChange}
        />
      )}

      {/* Error State */}
      {error && (
        <div
          className="rc-alert flex flex-wrap items-center justify-center gap-3"
          data-tone="danger"
        >
          {error}
          <button
            type="button"
            onClick={() => {
              setError(null);
              refreshCollection();
            }}
            className="rc-link underline"
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
          sort={sort}
          order={order}
          onSortChange={handleSortChange}
        />
      )}

      {/* Pagination */}
      {data?.pagination && data.pagination.totalPages > 1 && (
        <div className="flex items-center justify-center gap-3">
          <RcButton
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
          >
            Previous
          </RcButton>
          <span className="font-rc-mono text-xs tracking-[0.1em] text-rc-fg-subtle">
            Page {page} of {data.pagination.totalPages}
          </span>
          <RcButton
            variant="outline"
            size="sm"
            onClick={() =>
              setPage((p) => Math.min(data.pagination.totalPages, p + 1))
            }
            disabled={page === data.pagination.totalPages}
          >
            Next
          </RcButton>
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
