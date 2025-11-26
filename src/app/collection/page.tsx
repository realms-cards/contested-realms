"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type {
  CollectionListResponse,
  CollectionFilters as FilterType,
  CollectionSortField,
  SortOrder,
} from "@/lib/collection/types";
import CollectionFilters from "./CollectionFilters";
import CollectionGrid from "./CollectionGrid";
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

  const fetchCollection = useCallback(async () => {
    try {
      setLoading(true);

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

      const res = await fetch(`/api/collection?${params.toString()}`);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to load collection");
      }

      const result = await res.json();
      setData(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load collection");
    } finally {
      setLoading(false);
    }
  }, [page, sort, order, filters]);

  useEffect(() => {
    fetchCollection();
  }, [fetchCollection]);

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
    fetchCollection();
  };

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
          <div className="bg-gray-800 rounded-lg p-4 flex items-center justify-center">
            <button
              onClick={() => setShowQuickAdd(true)}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm font-medium transition-colors"
            >
              + Quick Add
            </button>
          </div>
        </div>
      )}

      {/* Filters */}
      <CollectionFilters
        filters={filters}
        sort={sort}
        order={order}
        onFiltersChange={handleFiltersChange}
        onSortChange={handleSortChange}
      />

      {/* Error State */}
      {error && (
        <div className="bg-red-900/50 border border-red-700 rounded-lg p-4 text-center">
          {error}
          <button
            onClick={() => {
              setError(null);
              fetchCollection();
            }}
            className="ml-4 underline"
          >
            Retry
          </button>
        </div>
      )}

      {/* Collection Grid */}
      <CollectionGrid
        cards={data?.cards || []}
        loading={loading}
        onQuantityChange={fetchCollection}
      />

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
