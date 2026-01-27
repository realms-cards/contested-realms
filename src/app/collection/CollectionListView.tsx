"use client";

import Image from "next/image";
import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { CustomSelect } from "@/components/ui/CustomSelect";
import type {
  CollectionCardResponse,
  CollectionSortField,
  SortOrder,
} from "@/lib/collection/types";
import type { CardPreviewData } from "@/lib/game/card-preview.types";

interface CollectionListViewProps {
  cards: CollectionCardResponse[];
  loading?: boolean;
  onQuantityChange?: () => void;
  sort?: CollectionSortField;
  order?: SortOrder;
  onSortChange?: (sort: CollectionSortField, order: SortOrder) => void;
}

function getRarityColor(rarity: string): string {
  switch (rarity.toLowerCase()) {
    case "unique":
      return "text-purple-400";
    case "elite":
      return "text-yellow-400";
    case "exceptional":
      return "text-blue-400";
    case "ordinary":
    default:
      return "text-gray-400";
  }
}

// Sortable column header component
function SortableHeader({
  label,
  field,
  currentSort,
  currentOrder,
  onSort,
  className = "",
  disabled = false,
  center = false,
}: {
  label: string;
  field: CollectionSortField;
  currentSort: CollectionSortField;
  currentOrder: SortOrder;
  onSort?: (sort: CollectionSortField, order: SortOrder) => void;
  className?: string;
  disabled?: boolean;
  center?: boolean;
}) {
  const isActive = currentSort === field;
  const handleClick = () => {
    if (disabled || !onSort) return;
    // Toggle order if same field, otherwise default to asc
    const newOrder = isActive && currentOrder === "asc" ? "desc" : "asc";
    onSort(field, newOrder);
  };

  return (
    <th
      className={`px-3 py-3 text-sm font-medium ${
        center ? "text-center" : "text-left"
      } ${
        disabled
          ? "text-gray-500 cursor-default"
          : "text-gray-400 cursor-pointer hover:text-white transition-colors"
      } ${className}`}
      onClick={handleClick}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {!disabled && isActive && (
          <span className="text-blue-400">
            {currentOrder === "asc" ? "↑" : "↓"}
          </span>
        )}
      </span>
    </th>
  );
}

export default function CollectionListView({
  cards,
  loading,
  onQuantityChange,
  sort = "name",
  order = "asc",
  onSortChange,
}: CollectionListViewProps) {
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [localQuantities, setLocalQuantities] = useState<Map<number, number>>(
    new Map(),
  );
  const refreshDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [bulkAction, setBulkAction] = useState<string>("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [previewCard, setPreviewCard] = useState<CardPreviewData | null>(null);

  // Clear local state when cards prop changes
  useEffect(() => {
    setLocalQuantities(new Map());
    setSelectedIds(new Set());
    setPreviewCard(null);
  }, [cards]);

  // Create preview data from card
  const handleRowHover = useCallback((card: CollectionCardResponse | null) => {
    if (!card) {
      setPreviewCard(null);
      return;
    }
    const slug = card.variant?.slug;
    if (!slug) {
      setPreviewCard(null);
      return;
    }
    setPreviewCard({
      slug,
      name: card.card.name,
      type: card.meta?.type || null,
    });
  }, []);

  const debouncedRefresh = useCallback(() => {
    if (refreshDebounceRef.current) {
      clearTimeout(refreshDebounceRef.current);
    }
    refreshDebounceRef.current = setTimeout(() => {
      onQuantityChange?.();
      refreshDebounceRef.current = null;
    }, 500);
  }, [onQuantityChange]);

  const handleQuantityUpdate = (id: number, newQuantity: number) => {
    setLocalQuantities((prev) => {
      const next = new Map(prev);
      if (newQuantity <= 0) {
        next.set(id, 0);
      } else {
        next.set(id, newQuantity);
      }
      return next;
    });

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

  const handleDelete = async (id: number) => {
    setLocalQuantities((prev) => {
      const next = new Map(prev);
      next.set(id, 0);
      return next;
    });

    try {
      const res = await fetch(`/api/collection/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const err = await res.json();
        console.error("Failed to delete:", err.error);
      }
      debouncedRefresh();
    } catch (e) {
      console.error("Failed to delete:", e);
    }
  };

  // Toggle single selection
  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // Select all visible cards
  const selectAll = () => {
    const visibleIds = visibleCards.map((c) => c.id);
    setSelectedIds(new Set(visibleIds));
  };

  // Clear selection
  const clearSelection = () => {
    setSelectedIds(new Set());
  };

  // Bulk actions
  const handleBulkAction = async () => {
    if (!bulkAction || selectedIds.size === 0) return;

    setIsProcessing(true);

    try {
      if (bulkAction === "delete") {
        if (
          !confirm(`Remove ${selectedIds.size} card(s) from your collection?`)
        ) {
          setIsProcessing(false);
          return;
        }

        // Mark as deleted locally first
        setLocalQuantities((prev) => {
          const next = new Map(prev);
          selectedIds.forEach((id) => next.set(id, 0));
          return next;
        });

        // Delete each selected card
        await Promise.all(
          Array.from(selectedIds).map((id) =>
            fetch(`/api/collection/${id}`, { method: "DELETE" }),
          ),
        );

        setSelectedIds(new Set());
        debouncedRefresh();
      } else if (bulkAction === "increment") {
        // Increment quantity for all selected
        await Promise.all(
          Array.from(selectedIds).map((id) => {
            const card = cards.find((c) => c.id === id);
            if (card) {
              const newQty = (localQuantities.get(id) ?? card.quantity) + 1;
              setLocalQuantities((prev) => new Map(prev).set(id, newQty));
              return fetch(`/api/collection/${id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ quantity: newQty }),
              });
            }
            return Promise.resolve();
          }),
        );
        debouncedRefresh();
      } else if (bulkAction === "decrement") {
        // Decrement quantity for all selected (min 1)
        await Promise.all(
          Array.from(selectedIds).map((id) => {
            const card = cards.find((c) => c.id === id);
            if (card) {
              const currentQty = localQuantities.get(id) ?? card.quantity;
              const newQty = Math.max(1, currentQty - 1);
              setLocalQuantities((prev) => new Map(prev).set(id, newQty));
              return fetch(`/api/collection/${id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ quantity: newQty }),
              });
            }
            return Promise.resolve();
          }),
        );
        debouncedRefresh();
      } else if (bulkAction === "export") {
        // Export selected cards as CSV
        const selectedCards = visibleCards.filter((c) => selectedIds.has(c.id));
        const csvRows = [
          ["Quantity", "Name", "Set", "Rarity", "Finish", "Notes"].join(","),
          ...selectedCards.map((c) =>
            [
              c.quantity,
              `"${c.card.name}"`,
              `"${c.set?.name || ""}"`,
              c.meta?.rarity || "",
              c.finish,
              `"${(c.notes || "").replace(/"/g, '""')}"`,
            ].join(","),
          ),
        ];
        const csvContent = csvRows.join("\n");
        const blob = new Blob([csvContent], { type: "text/csv" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `collection-export-${
          new Date().toISOString().split("T")[0]
        }.csv`;
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch (e) {
      console.error("Bulk action failed:", e);
    } finally {
      setIsProcessing(false);
      setBulkAction("");
    }
  };

  // Filter out deleted cards
  const visibleCards = cards
    .filter((card) => {
      const localQty = localQuantities.get(card.id);
      return localQty !== 0;
    })
    .map((card) => {
      const localQty = localQuantities.get(card.id);
      if (localQty !== undefined && localQty > 0) {
        return { ...card, quantity: localQty };
      }
      return card;
    });

  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className="h-16 bg-gray-800 rounded-lg animate-pulse" />
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
    <div className="space-y-4">
      {/* Card Preview - portaled to body for true fixed positioning */}
      {previewCard &&
        typeof document !== "undefined" &&
        createPortal(
          (() => {
            const isSite =
              previewCard.type?.toLowerCase().includes("site") ?? false;
            return (
              <div className="fixed top-20 right-4 z-[9999] pointer-events-none">
                <div
                  className={`rounded-xl overflow-hidden bg-black/80 shadow-2xl ring-1 ring-white/10 ${
                    isSite ? "w-96 aspect-[4/3]" : "w-72 aspect-[2.5/3.5]"
                  }`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`/api/images/${previewCard.slug}`}
                    alt={previewCard.name}
                    className={`w-full h-full ${
                      isSite
                        ? "object-contain scale-150 rotate-90 origin-center"
                        : "object-cover"
                    }`}
                  />
                </div>
                <div className="mt-2 text-center text-sm text-white">
                  <div className="font-medium">{previewCard.name}</div>
                  {previewCard.type && (
                    <div className="text-xs text-gray-400">
                      {previewCard.type}
                    </div>
                  )}
                </div>
              </div>
            );
          })(),
          document.body,
        )}

      {/* Bulk Actions Bar */}
      <div className="flex items-center gap-4 bg-gray-800 rounded-lg p-3">
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={
              selectedIds.size === visibleCards.length &&
              visibleCards.length > 0
            }
            onChange={() => {
              if (selectedIds.size === visibleCards.length) {
                clearSelection();
              } else {
                selectAll();
              }
            }}
            className="w-4 h-4 rounded bg-gray-700 border-gray-600"
          />
          <span className="text-sm text-gray-400">
            {selectedIds.size > 0
              ? `${selectedIds.size} selected`
              : "Select all"}
          </span>
        </div>

        {selectedIds.size > 0 && (
          <>
            <CustomSelect
              value={bulkAction}
              onChange={(v) => setBulkAction(v)}
              placeholder="Choose action..."
              options={[
                { value: "increment", label: "+1 Quantity" },
                { value: "decrement", label: "-1 Quantity" },
                { value: "export", label: "Export CSV" },
                { value: "delete", label: "Delete" },
              ]}
            />

            <button
              onClick={handleBulkAction}
              disabled={!bulkAction || isProcessing}
              className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:opacity-50 rounded text-sm font-medium transition-colors"
            >
              {isProcessing ? "Processing..." : "Apply"}
            </button>

            <button
              onClick={clearSelection}
              className="text-gray-400 hover:text-white text-sm"
            >
              Clear
            </button>
          </>
        )}
      </div>

      {/* Table */}
      <div className="bg-gray-800 rounded-lg overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-900">
            <tr>
              <th className="w-10 px-3 py-3" />
              <th className="w-16 px-3 py-3" />
              <SortableHeader
                label="Name"
                field="name"
                currentSort={sort}
                currentOrder={order}
                onSort={onSortChange}
              />
              <SortableHeader
                label="Set"
                field="name"
                currentSort={sort}
                currentOrder={order}
                onSort={onSortChange}
                className="hidden md:table-cell"
                disabled
              />
              <SortableHeader
                label="Rarity"
                field="rarity"
                currentSort={sort}
                currentOrder={order}
                onSort={onSortChange}
                className="hidden lg:table-cell"
              />
              <th className="px-3 py-3 text-left text-sm font-medium text-gray-400 hidden sm:table-cell">
                Finish
              </th>
              <SortableHeader
                label="Qty"
                field="quantity"
                currentSort={sort}
                currentOrder={order}
                onSort={onSortChange}
                className="w-28"
                center
              />
              <th className="px-3 py-3 text-center text-sm font-medium text-gray-400 w-20">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-700">
            {visibleCards.map((card) => {
              const imageSlug = card.variant?.slug;
              const imageUrl = imageSlug
                ? `/api/images/${imageSlug}`
                : "/api/assets/cardback_spellbook.png";

              return (
                <tr
                  key={card.id}
                  className={`hover:bg-gray-700/50 transition-colors ${
                    selectedIds.has(card.id) ? "bg-blue-900/30" : ""
                  }`}
                  onMouseEnter={() => handleRowHover(card)}
                  onMouseLeave={() => handleRowHover(null)}
                >
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(card.id)}
                      onChange={() => toggleSelect(card.id)}
                      className="w-4 h-4 rounded bg-gray-700 border-gray-600"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <div className="w-10 h-14 relative rounded overflow-hidden">
                      <Image
                        src={imageUrl}
                        alt={card.card.name}
                        fill
                        className="object-cover"
                        sizes="40px"
                        unoptimized
                      />
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <div className="font-medium text-white">
                      {card.card.name}
                    </div>
                    {card.notes && (
                      <div className="text-xs text-gray-500 truncate max-w-xs">
                        📝 {card.notes}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2 text-sm text-gray-400 hidden md:table-cell">
                    {card.set?.name || "—"}
                  </td>
                  <td
                    className={`px-3 py-2 text-sm hidden lg:table-cell ${getRarityColor(
                      card.meta?.rarity || "",
                    )}`}
                  >
                    {card.meta?.rarity || "—"}
                  </td>
                  <td className="px-3 py-2 text-sm hidden sm:table-cell">
                    {card.finish === "Foil" ? (
                      <span className="text-yellow-400">✨ Foil</span>
                    ) : (
                      <span className="text-gray-400">Normal</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center justify-center gap-1">
                      <button
                        onClick={() =>
                          handleQuantityUpdate(card.id, card.quantity - 1)
                        }
                        disabled={card.quantity <= 1}
                        className="w-7 h-7 bg-gray-700 hover:bg-gray-600 rounded disabled:opacity-50 text-sm"
                      >
                        −
                      </button>
                      <span className="w-8 text-center font-medium">
                        {card.quantity}
                      </span>
                      <button
                        onClick={() =>
                          handleQuantityUpdate(card.id, card.quantity + 1)
                        }
                        disabled={card.quantity >= 99}
                        className="w-7 h-7 bg-gray-700 hover:bg-gray-600 rounded disabled:opacity-50 text-sm"
                      >
                        +
                      </button>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-center">
                    <button
                      onClick={() => {
                        if (confirm("Remove this card from your collection?")) {
                          handleDelete(card.id);
                        }
                      }}
                      className="text-red-400 hover:text-red-300 text-sm"
                    >
                      🗑️
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
