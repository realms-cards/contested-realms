"use client";

import { useVirtualizer } from "@tanstack/react-virtual";
import { useRef, useState, useEffect } from "react";
import type { CollectionCardResponse } from "@/lib/collection/types";
import CollectionCard from "./CollectionCard";

interface VirtualizedCollectionGridProps {
  cards: CollectionCardResponse[];
  loading?: boolean;
  onQuantityChange?: () => void;
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
export default function VirtualizedCollectionGrid({
  cards,
  loading,
  onQuantityChange,
}: VirtualizedCollectionGridProps) {
  // Local optimistic state for quantities
  const [localQuantities, setLocalQuantities] = useState<Map<number, number>>(
    new Map()
  );
  const refreshDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const parentRef = useRef<HTMLDivElement>(null);

  // Responsive column count based on screen size
  const [columns, setColumns] = useState(6);

  // Update column count on resize
  useEffect(() => {
    const updateColumns = () => {
      const width = window.innerWidth;
      if (width < 640) setColumns(2); // sm
      else if (width < 768) setColumns(3); // md
      else if (width < 1024) setColumns(4); // lg
      else if (width < 1280) setColumns(5); // xl
      else setColumns(6); // 2xl+
    };

    updateColumns();
    window.addEventListener("resize", updateColumns);
    return () => window.removeEventListener("resize", updateColumns);
  }, []);

  // Clear local quantities when cards prop changes (after refresh)
  useEffect(() => {
    setLocalQuantities(new Map());
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
        debouncedRefresh();
      })
      .catch((e) => {
        console.error("Failed to update notes:", e);
      });
  };

  // Filter out optimistically deleted cards and apply local quantity overrides
  const visibleCards = cards
    .filter((card) => {
      const localQty = localQuantities.get(card.id);
      return localQty !== 0; // Hide if locally marked as deleted
    })
    .map((card) => {
      const localQty = localQuantities.get(card.id);
      if (localQty !== undefined && localQty > 0) {
        return { ...card, quantity: localQty };
      }
      return card;
    });

  // Calculate rows (each row contains `columns` cards)
  const rowCount = Math.ceil(visibleCards.length / columns);

  // Virtualizer for rows (must be called before any early returns)
  const rowVirtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 280, // Approximate row height (card height + gap)
    overscan: 2, // Render 2 extra rows above/below viewport for smooth scrolling
  });

  if (loading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
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
          const startIndex = virtualRow.index * columns;
          const endIndex = Math.min(startIndex + columns, visibleCards.length);
          const rowCards = visibleCards.slice(startIndex, endIndex);

          return (
            <div
              key={virtualRow.index}
              className="absolute top-0 left-0 w-full"
              style={{
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 px-1">
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
