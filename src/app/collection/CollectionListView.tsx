"use client";

import Image from "next/image";
import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { CustomSelect } from "@/components/ui/CustomSelect";
import { RcButton } from "@/components/ui/rc-button";
import { RcEmpty } from "@/components/ui/rc-empty";
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
      return "text-rc-moonlight";
    case "elite":
      return "text-rc-accent-link";
    case "exceptional":
      return "text-rc-info";
    case "ordinary":
    default:
      return "text-rc-fg-subtle";
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
      className={`${center ? "text-center" : "text-left"} ${
        disabled
          ? "cursor-default"
          : "cursor-pointer transition-colors hover:text-rc-accent-ring"
      } ${className}`}
      onClick={handleClick}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {!disabled && isActive && (
          <span className="text-rc-accent-link">
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
          <div
            key={i}
            className="h-16 animate-pulse rounded-rc-md border border-rc-line/12 bg-black/30"
          />
        ))}
      </div>
    );
  }

  if (cards.length === 0) {
    return (
      <RcEmpty title="No cards found.">
        no cards match your filters
      </RcEmpty>
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
              <div className="pointer-events-none fixed right-4 top-20 z-[9999]">
                <div
                  className={`overflow-hidden rounded-rc-lg border border-rc-line/18 bg-black/60 shadow-rc-md ${
                    isSite ? "w-96 aspect-[4/3]" : "w-72 aspect-[2.5/3.5]"
                  }`}
                >
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
                <div className="mt-2 text-center">
                  <div className="font-rc-display text-[19px] leading-[1.1] text-rc-fg-strong">
                    {previewCard.name}
                  </div>
                  {previewCard.type && (
                    <div className="rc-hint">{previewCard.type}</div>
                  )}
                </div>
              </div>
            );
          })(),
          document.body,
        )}

      {/* Bulk Actions Bar */}
      <div className="flex flex-wrap items-center gap-4 rounded-rc-md border border-rc-line/12 bg-black/30 p-3">
        <label className="rc-check">
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
          />
          {selectedIds.size > 0
            ? `${selectedIds.size} selected`
            : "Select all"}
        </label>

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

            <RcButton
              size="sm"
              onClick={handleBulkAction}
              disabled={!bulkAction || isProcessing}
            >
              {isProcessing ? "Processing..." : "Apply"}
            </RcButton>

            <RcButton variant="ghost" size="sm" onClick={clearSelection}>
              Clear
            </RcButton>
          </>
        )}
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-rc-md border border-rc-line/12">
        <table className="rc-table">
          <thead>
            <tr>
              <th className="w-10" />
              <th className="w-16" />
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
              <th className="hidden text-left sm:table-cell">Finish</th>
              <SortableHeader
                label="Qty"
                field="quantity"
                currentSort={sort}
                currentOrder={order}
                onSort={onSortChange}
                className="w-28"
                center
              />
              <th className="w-24 text-center">Actions</th>
            </tr>
          </thead>
          <tbody>
            {visibleCards.map((card) => {
              const imageSlug = card.variant?.slug;
              const imageUrl = imageSlug
                ? `/api/images/${imageSlug}`
                : "/api/assets/cardback_spellbook.png";

              return (
                <tr
                  key={card.id}
                  className={
                    selectedIds.has(card.id)
                      ? "bg-rc-accent/10 shadow-[inset_2px_0_0_#d4a94a]"
                      : ""
                  }
                  onMouseEnter={() => handleRowHover(card)}
                  onMouseLeave={() => handleRowHover(null)}
                >
                  <td>
                    <input
                      type="checkbox"
                      checked={selectedIds.has(card.id)}
                      onChange={() => toggleSelect(card.id)}
                      className="h-4 w-4 accent-rc-accent"
                    />
                  </td>
                  <td>
                    <div className="relative h-14 w-10 overflow-hidden rounded-rc-sm border border-rc-line/12 bg-black/30">
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
                  <td>
                    <div className="font-rc-display text-[19px] leading-[1.1] text-rc-fg-strong">
                      {card.card.name}
                    </div>
                    {card.notes && (
                      <div className="max-w-xs truncate rc-hint">
                        {card.notes}
                      </div>
                    )}
                  </td>
                  <td className="hidden text-rc-fg-muted md:table-cell">
                    {card.set?.name || "—"}
                  </td>
                  <td
                    className={`hidden lg:table-cell ${getRarityColor(
                      card.meta?.rarity || "",
                    )}`}
                  >
                    {card.meta?.rarity || "—"}
                  </td>
                  <td className="hidden sm:table-cell">
                    {card.finish === "Foil" ? (
                      <span className="text-rc-accent-link">Foil</span>
                    ) : (
                      <span className="text-rc-fg-muted">Normal</span>
                    )}
                  </td>
                  <td>
                    <div className="flex items-center justify-center gap-1">
                      <RcButton
                        variant="outline"
                        size="icon"
                        className="h-7 w-7"
                        aria-label="Decrease quantity"
                        onClick={() =>
                          handleQuantityUpdate(card.id, card.quantity - 1)
                        }
                        disabled={card.quantity <= 1}
                      >
                        −
                      </RcButton>
                      <span className="w-8 text-center rc-stat">
                        {card.quantity}
                      </span>
                      <RcButton
                        variant="outline"
                        size="icon"
                        className="h-7 w-7"
                        aria-label="Increase quantity"
                        onClick={() =>
                          handleQuantityUpdate(card.id, card.quantity + 1)
                        }
                        disabled={card.quantity >= 99}
                      >
                        +
                      </RcButton>
                    </div>
                  </td>
                  <td className="text-center">
                    <RcButton
                      variant="ghost"
                      size="sm"
                      className="text-rc-danger hover:text-rc-danger-hover"
                      onClick={() => {
                        if (confirm("Remove this card from your collection?")) {
                          handleDelete(card.id);
                        }
                      }}
                    >
                      Remove
                    </RcButton>
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
