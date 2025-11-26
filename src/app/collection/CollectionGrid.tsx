"use client";

import { useState } from "react";
import CollectionCard from "./CollectionCard";
import type { CollectionCardResponse } from "@/lib/collection/types";

interface CollectionGridProps {
  cards: CollectionCardResponse[];
  loading?: boolean;
  onQuantityChange?: () => void;
}

export default function CollectionGrid({
  cards,
  loading,
  onQuantityChange,
}: CollectionGridProps) {
  const [updatingId, setUpdatingId] = useState<number | null>(null);

  const handleQuantityUpdate = async (id: number, newQuantity: number) => {
    setUpdatingId(id);
    try {
      const res = await fetch(`/api/collection/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quantity: newQuantity }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to update");
      }

      onQuantityChange?.();
    } catch (e) {
      console.error("Failed to update quantity:", e);
      alert(e instanceof Error ? e.message : "Failed to update quantity");
    } finally {
      setUpdatingId(null);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Remove this card from your collection?")) return;

    setUpdatingId(id);
    try {
      const res = await fetch(`/api/collection/${id}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to delete");
      }

      onQuantityChange?.();
    } catch (e) {
      console.error("Failed to delete:", e);
      alert(e instanceof Error ? e.message : "Failed to delete");
    } finally {
      setUpdatingId(null);
    }
  };

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
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
      {cards.map((card) => (
        <CollectionCard
          key={card.id}
          card={card}
          updating={updatingId === card.id}
          onQuantityChange={(qty) => handleQuantityUpdate(card.id, qty)}
          onDelete={() => handleDelete(card.id)}
        />
      ))}
    </div>
  );
}
