"use client";

import { useVirtualizer } from "@tanstack/react-virtual";
import { useMemo, useRef, useState, useEffect } from "react";
import type { CollectionCardResponse } from "@/lib/collection/types";
import CollectionCard from "./CollectionCard";

function isSiteCard(card: CollectionCardResponse): boolean {
  return (card.meta?.type || "").toLowerCase().includes("site");
}

/** Build rows accounting for site cards taking 2 column slots */
function buildRows(
  cards: CollectionCardResponse[],
  columns: number,
): CollectionCardResponse[][] {
  const rows: CollectionCardResponse[][] = [];
  let currentRow: CollectionCardResponse[] = [];
  let slotsUsed = 0;

  for (const card of cards) {
    const slots = isSiteCard(card) ? 2 : 1;

    // If this card won't fit, start a new row
    if (slotsUsed + slots > columns && currentRow.length > 0) {
      rows.push(currentRow);
      currentRow = [];
      slotsUsed = 0;
    }

    currentRow.push(card);
    slotsUsed += slots;
  }

  if (currentRow.length > 0) {
    rows.push(currentRow);
  }

  return rows;
}

interface VirtualizedCollectionGridProps {
  cards: CollectionCardResponse[];
  loading?: boolean;
  onQuantityChange?: () => void;
  zoom?: number; // 50-150, default 100
}

/**
 * Virtualized collection grid that only renders visible cards
 * Improves performance with large collections (100+ cards)
 *
 * Performance benefits:
 * - Only renders ~20-30 cards at once (visible viewport)
 * - Reduces DOM nodes from 500+ to ~30
 * - Smooth scrolling with 60fps maintained
 * - Memory efficient - only active elements in memory
 */
// Calculate grid columns based on zoom level
function getGridCols(zoom: number): { className: string; count: number } {
  if (zoom <= 60)
    return {
      className:
        "grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10",
      count: 10,
    };
  if (zoom <= 80)
    return {
      className:
        "grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8",
      count: 8,
    };
  if (zoom <= 100)
    return {
      className:
        "grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6",
      count: 6,
    };
  if (zoom <= 120)
    return {
      className:
        "grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5",
      count: 5,
    };
  return {
    className:
      "grid-cols-1 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4",
    count: 4,
  };
}

export default function VirtualizedCollectionGrid({
  cards,
  loading,
  onQuantityChange,
  zoom = 100,
}: VirtualizedCollectionGridProps) {
  // Local optimistic state for quantities and notes
  const [localQuantities, setLocalQuantities] = useState<Map<number, number>>(
    new Map()
  );
  const [localNotes, setLocalNotes] = useState<Map<number, string>>(new Map());
  const refreshDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const parentRef = useRef<HTMLDivElement>(null);

  // Responsive column count based on screen size and zoom
  const [columns, setColumns] = useState(6);
  const [gridClassName, setGridClassName] = useState(
    "grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6"
  );

  // Update column count on resize or zoom change
  useEffect(() => {
    const updateColumns = () => {
      const width = window.innerWidth;
      const { count, className } = getGridCols(zoom);
      setGridClassName(className);

      // Adjust actual column count based on viewport and zoom
      if (width < 640) {
        setColumns(
          zoom <= 60
            ? 4
            : zoom <= 80
            ? 3
            : zoom <= 100
            ? 2
            : zoom <= 120
            ? 2
            : 1
        );
      } else if (width < 768) {
        setColumns(
          zoom <= 60
            ? 5
            : zoom <= 80
            ? 4
            : zoom <= 100
            ? 3
            : zoom <= 120
            ? 2
            : 2
        );
      } else if (width < 1024) {
        setColumns(
          zoom <= 60
            ? 6
            : zoom <= 80
            ? 5
            : zoom <= 100
            ? 4
            : zoom <= 120
            ? 3
            : 2
        );
      } else if (width < 1280) {
        setColumns(
          zoom <= 60
            ? 8
            : zoom <= 80
            ? 6
            : zoom <= 100
            ? 5
            : zoom <= 120
            ? 4
            : 3
        );
      } else {
        setColumns(count);
      }
    };

    updateColumns();
    window.addEventListener("resize", updateColumns);
    return () => window.removeEventListener("resize", updateColumns);
  }, [zoom]);

  // Clear local state when cards prop changes (after refresh)
  useEffect(() => {
    setLocalQuantities(new Map());
    setLocalNotes(new Map());
  }, [cards]);

  const debouncedRefresh = () => {
    if (refreshDebounceRef.current) {
      clearTimeout(refreshDebounceRef.current);
    }
    refreshDebounceRef.current = setTimeout(() => {
      onQuantityChange?.();
      refreshDebounceRef.current = null;
    }, 500);
  };

  const handleQuantityUpdate = (id: number, newQuantity: number) => {
    // Optimistic update - immediately reflect in UI
    setLocalQuantities((prev) => {
      const next = new Map(prev);
      if (newQuantity <= 0) {
        next.set(id, 0); // Mark as deleted
      } else {
        next.set(id, newQuantity);
      }
      return next;
    });

    // Fire API call async
    fetch(`/api/collection/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ quantity: newQuantity }),
    })
      .then((res) => {
        if (!res.ok) {
          res.json().then((err) => {
            console.error("Failed to update quantity:", err.error);
          });
        }
        debouncedRefresh();
      })
      .catch((e) => {
        console.error("Failed to update quantity:", e);
      });
  };

  const handleDelete = (id: number) => {
    if (!confirm("Remove this card from your collection?")) return;

    // Optimistic update - hide card immediately
    setLocalQuantities((prev) => {
      const next = new Map(prev);
      next.set(id, 0);
      return next;
    });

    // Fire API call async
    fetch(`/api/collection/${id}`, {
      method: "DELETE",
    })
      .then((res) => {
        if (!res.ok) {
          res.json().then((err) => {
            console.error("Failed to delete:", err.error);
          });
        }
        debouncedRefresh();
      })
      .catch((e) => {
        console.error("Failed to delete:", e);
      });
  };

  const handleNotesUpdate = (id: number, notes: string) => {
    // Optimistic update - immediately reflect in UI
    setLocalNotes((prev) => {
      const next = new Map(prev);
      next.set(id, notes);
      return next;
    });

    // Fire API call async (no refresh needed)
    fetch(`/api/collection/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notes }),
    })
      .then((res) => {
        if (!res.ok) {
          res.json().then((err) => {
            console.error("Failed to update notes:", err.error);
          });
        }
        // No refresh - notes are purely local UI metadata
      })
      .catch((e) => {
        console.error("Failed to update notes:", e);
      });
  };

  // Filter out optimistically deleted cards and apply local overrides
  const visibleCards = cards
    .filter((card) => {
      const localQty = localQuantities.get(card.id);
      return localQty !== 0; // Hide if locally marked as deleted
    })
    .map((card) => {
      const localQty = localQuantities.get(card.id);
      const localNote = localNotes.get(card.id);
      let updated = card;
      if (localQty !== undefined && localQty > 0) {
        updated = { ...updated, quantity: localQty };
      }
      if (localNote !== undefined) {
        updated = { ...updated, notes: localNote };
      }
      return updated;
    });

  // Pre-compute rows accounting for site cards taking 2 column slots
  const rows = useMemo(
    () => buildRows(visibleCards, columns),
    [visibleCards, columns],
  );

  // Calculate row height based on zoom
  const estimatedRowHeight = Math.round(400 * (zoom / 100));

  // Virtualizer for rows (must be called before any early returns)
  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => estimatedRowHeight,
    overscan: 2,
  });

  if (loading) {
    return (
      <div className={`grid ${gridClassName} gap-4`}>
        {Array.from({ length: 12 }).map((_, i) => (
          <div
            key={i}
            className="aspect-[2.5/3.5] bg-gray-800 rounded-lg animate-pulse"
          />
        ))}
      </div>
    );
  }

  if (cards.length === 0) {
    return (
      <div className="text-center py-12 text-gray-400">
        No cards found matching your filters.
      </div>
    );
  }

  return (
    <div
      ref={parentRef}
      className="h-[calc(100vh-16rem)] overflow-auto"
      style={{ contain: "strict" }} // Optimize rendering performance
    >
      <div
        style={{
          height: `${rowVirtualizer.getTotalSize()}px`,
          width: "100%",
          position: "relative",
        }}
      >
        {rowVirtualizer.getVirtualItems().map((virtualRow) => {
          const rowCards = rows[virtualRow.index];

          return (
            <div
              key={virtualRow.index}
              className="absolute top-0 left-0 w-full"
              style={{
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              <div className={`grid ${gridClassName} gap-4 px-1`}>
                {rowCards.map((card) => (
                  <CollectionCard
                    key={card.id}
                    card={card}
                    onQuantityChange={(qty) =>
                      handleQuantityUpdate(card.id, qty)
                    }
                    onNotesChange={(notes) => handleNotesUpdate(card.id, notes)}
                    onDelete={() => handleDelete(card.id)}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
