"use client";

import Image from "next/image";
import { memo, useState } from "react";
import { CodexTooltip } from "@/components/collection/CodexTooltip";
import { useCodex } from "@/contexts/CodexContext";
import type { CollectionCardResponse } from "@/lib/collection/types";
import CardPriceTag from "./CardPriceTag";

interface CollectionCardProps {
  card: CollectionCardResponse;
  updating?: boolean;
  onQuantityChange?: (quantity: number) => void;
  onDelete?: () => void;
}

function CollectionCardInner({
  card,
  updating,
  onQuantityChange,
  onDelete,
}: CollectionCardProps) {
  const { showCodex } = useCodex();
  const [imageError, setImageError] = useState(false);

  // Build image URL - only use variant slug if available
  // Cards without variants (e.g., promo/special products) use placeholder
  const imageSlug = card.variant?.slug;
  const hasValidImage = !!imageSlug;
  const primaryUrl = hasValidImage
    ? `/api/images/${imageSlug}`
    : "/placeholder-card.png"; // No CDN fallback - use placeholder for cards without variant

  // Use placeholder if image failed to load
  const imageUrl = imageError ? "/placeholder-card.png" : primaryUrl;

  const isFoil = card.finish === "Foil";
  const isSite = card.meta?.type?.toLowerCase().includes("site") || false;

  return (
    <div
      className={`relative group rounded-lg overflow-hidden bg-gray-800 ${
        isSite ? "col-span-2" : ""
      } ${isFoil ? "foil-card" : ""} ${
        updating ? "opacity-50 pointer-events-none" : ""
      }`}
      style={
        isFoil
          ? {
              // Iridescent foil border glow
              boxShadow: `
                0 0 0 2px rgba(255,255,255,0.15),
                0 0 10px 2px rgba(255,215,0,0.4),
                0 0 15px 4px rgba(255,105,180,0.25),
                0 0 20px 6px rgba(0,191,255,0.2)
              `,
            }
          : undefined
      }
    >
      {/* Card Image */}
      <div
        className={
          isSite
            ? "aspect-[3.5/2.5] relative bg-black"
            : "aspect-[2.5/3.5] relative"
        }
      >
        <Image
          src={imageUrl}
          alt={card.card.name}
          fill
          className={isSite ? "object-contain rotate-90" : "object-cover"}
          sizes="(max-width: 640px) 50vw, (max-width: 768px) 33vw, (max-width: 1024px) 25vw, 16vw"
          onError={() => {
            // Use state to switch to placeholder (prevents flicker from direct src manipulation)
            if (!imageError) setImageError(true);
          }}
        />

        {/* Foil Indicator */}
        {isFoil && (
          <div className="absolute top-2 right-2 bg-yellow-500 text-black text-xs px-2 py-0.5 rounded font-bold">
            FOIL
          </div>
        )}

        {/* No Image Warning */}
        {!hasValidImage && (
          <div
            className="absolute top-2 left-2 bg-orange-500 text-white text-xs px-2 py-0.5 rounded font-bold"
            title="This card has no image - it may be from a special product not in our database"
          >
            ⚠️
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
        {/* Codex errata info */}
        {showCodex && (
          <CodexTooltip cardName={card.card.name} className="mt-1" />
        )}
      </div>

      {/* Hover Actions */}
      <div
        className={`absolute inset-0 bg-black/70 flex flex-col items-center justify-center gap-2 p-2 opacity-0 group-hover:opacity-100 transition-opacity ${
          showCodex ? "pt-16" : ""
        }`}
      >
        {/* Quantity controls */}
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

// Memoize to prevent unnecessary re-renders when parent updates
const CollectionCard = memo(CollectionCardInner);
export default CollectionCard;
