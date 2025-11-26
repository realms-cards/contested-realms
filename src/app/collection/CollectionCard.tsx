"use client";

import { useState } from "react";
import Image from "next/image";
import type { CollectionCardResponse } from "@/lib/collection/types";
import CardPriceTag from "./CardPriceTag";

interface CollectionCardProps {
  card: CollectionCardResponse;
  updating?: boolean;
  onQuantityChange?: (quantity: number) => void;
  onDelete?: () => void;
}

export default function CollectionCard({
  card,
  updating,
  onQuantityChange,
  onDelete,
}: CollectionCardProps) {
  const [showActions, setShowActions] = useState(false);

  // Build image URL
  const imageSlug =
    card.variant?.slug ||
    `${card.card.name.toLowerCase().replace(/\s+/g, "_")}_b_s`;
  const imageUrl = `/api/assets/cards/${imageSlug}.webp`;

  const isFoil = card.finish === "Foil";

  return (
    <div
      className={`relative group rounded-lg overflow-hidden bg-gray-800 ${
        isFoil ? "ring-2 ring-yellow-500/50" : ""
      } ${updating ? "opacity-50 pointer-events-none" : ""}`}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
    >
      {/* Card Image */}
      <div className="aspect-[2.5/3.5] relative">
        <Image
          src={imageUrl}
          alt={card.card.name}
          fill
          className="object-cover"
          sizes="(max-width: 640px) 50vw, (max-width: 768px) 33vw, (max-width: 1024px) 25vw, 16vw"
          onError={(e) => {
            // Fallback to placeholder
            (e.target as HTMLImageElement).src = "/placeholder-card.png";
          }}
        />

        {/* Foil Indicator */}
        {isFoil && (
          <div className="absolute top-2 right-2 bg-yellow-500 text-black text-xs px-2 py-0.5 rounded font-bold">
            FOIL
          </div>
        )}

        {/* Quantity Badge */}
        <div className="absolute bottom-2 right-2 bg-black/80 text-white px-2 py-1 rounded-full text-sm font-bold min-w-[2rem] text-center">
          ×{card.quantity}
        </div>
      </div>

      {/* Card Info */}
      <div className="p-2">
        <div className="text-sm font-medium truncate" title={card.card.name}>
          {card.card.name}
        </div>
        <div className="text-xs text-gray-400 flex items-center gap-1">
          {card.set?.name || "Unknown Set"}
          {card.meta?.rarity && (
            <span className={`ml-1 ${getRarityColor(card.meta.rarity)}`}>
              • {card.meta.rarity}
            </span>
          )}
        </div>
      </div>

      {/* Hover Actions */}
      {showActions && (
        <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center gap-2 p-2">
          <div className="flex items-center gap-2">
            <button
              onClick={() => onQuantityChange?.(card.quantity - 1)}
              disabled={card.quantity <= 1}
              className="w-8 h-8 bg-gray-700 hover:bg-gray-600 rounded-full font-bold disabled:opacity-50"
            >
              −
            </button>
            <span className="text-xl font-bold w-8 text-center">
              {card.quantity}
            </span>
            <button
              onClick={() => onQuantityChange?.(card.quantity + 1)}
              disabled={card.quantity >= 99}
              className="w-8 h-8 bg-gray-700 hover:bg-gray-600 rounded-full font-bold disabled:opacity-50"
            >
              +
            </button>
          </div>

          <button
            onClick={onDelete}
            className="text-red-400 hover:text-red-300 text-xs underline"
          >
            Remove
          </button>

          {/* Price/Buy Link */}
          <CardPriceTag
            cardId={card.cardId}
            cardName={card.card.name}
            variantId={card.variantId}
            finish={card.finish}
          />
        </div>
      )}
    </div>
  );
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
