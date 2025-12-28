"use client";

import { useRef, useState, useEffect } from "react";
import type { CollectionCardResponse } from "@/lib/collection/types";
import CollectionCard from "./CollectionCard";
import VirtualizedCollectionGrid from "./VirtualizedCollectionGrid";

// Threshold for enabling virtualization (improves performance with large collections)
const VIRTUALIZATION_THRESHOLD = 50;

interface CollectionGridProps {
  cards: CollectionCardResponse[];
  loading?: boolean;
  onQuantityChange?: () => void;
  zoom?: number; // 50-150, default 100
}

export default function CollectionGrid({
  cards,
  loading,
  onQuantityChange,
  zoom = 100,
}: CollectionGridProps) {
  // Always call hooks at the top level (Rules of Hooks)
  // Local optimistic state for quantities and notes
  const [localQuantities, setLocalQuantities] = useState<Map<number, number>>(
    new Map()
  );
  const [localNotes, setLocalNotes] = useState<Map<number, string>>(new Map());
  const refreshDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clear local state when cards prop changes (after refresh)
  useEffect(() => {
    setLocalQuantities(new Map());
    setLocalNotes(new Map());
  }, [cards]);

  // Use virtualization for large collections (50+ cards) to maintain 60fps
  if (!loading && cards.length >= VIRTUALIZATION_THRESHOLD) {
    return (
      <VirtualizedCollectionGrid
        cards={cards}
        loading={loading}
        onQuantityChange={onQuantityChange}
        zoom={zoom}
      />
    );
  }

  // Calculate grid columns based on zoom level
  // At zoom 100% = default, 50% = more columns (smaller), 150% = fewer columns (larger)
  const getGridCols = () => {
    if (zoom <= 60)
      return "grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10";
    if (zoom <= 80)
      return "grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8";
    if (zoom <= 100)
      return "grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6";
    if (zoom <= 120)
      return "grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5";
    return "grid-cols-1 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4";
  };

  // Standard grid for smaller collections (< 50 cards)

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

    // Fire API call async (no refresh needed - it's just metadata)
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

  if (loading) {
    return (
      <div className={`grid ${getGridCols()} gap-4`}>
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

  return (
    <div className={`grid ${getGridCols()} gap-4 pb-8`}>
      {visibleCards.map((card) => (
        <CollectionCard
          key={card.id}
          card={card}
          onQuantityChange={(qty) => handleQuantityUpdate(card.id, qty)}
          onNotesChange={(notes) => handleNotesUpdate(card.id, notes)}
          onDelete={() => handleDelete(card.id)}
        />
      ))}
    </div>
  );
}
