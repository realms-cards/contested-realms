"use client";

import Image from "next/image";
import { memo, useState, useEffect } from "react";
import { CodexTooltip } from "@/components/collection/CodexTooltip";
import { useCodex } from "@/contexts/CodexContext";
import type { CollectionCardResponse } from "@/lib/collection/types";
import CardDetailOverlay from "./CardDetailOverlay";
import CardPriceTag from "./CardPriceTag";

interface CollectionCardProps {
  card: CollectionCardResponse;
  updating?: boolean;
  onQuantityChange?: (quantity: number) => void;
  onNotesChange?: (notes: string) => void;
  onDelete?: () => void;
}

// Tag definitions for parsing notes
const TAG_PATTERNS = [
  {
    tag: "promo",
    pattern: /\bpromo\b/i,
    color: "bg-purple-500",
    label: "Promo",
  },
  { tag: "mint", pattern: /\bmint\b/i, color: "bg-green-500", label: "Mint" },
  {
    tag: "nm",
    pattern: /\b(near[- ]?mint|nm)\b/i,
    color: "bg-green-400",
    label: "NM",
  },
  {
    tag: "normal",
    pattern: /\bnormal\b/i,
    color: "bg-gray-500",
    label: "Normal",
  },
  { tag: "poor", pattern: /\bpoor\b/i, color: "bg-red-500", label: "Poor" },
  {
    tag: "wanted",
    pattern: /\bwanted\b/i,
    color: "bg-blue-500",
    label: "Wanted",
  },
  {
    tag: "selling",
    pattern: /\b(selling|for sale|fs)\b/i,
    color: "bg-yellow-500 text-black",
    label: "Selling",
  },
] as const;

function parseNoteTags(notes: string | null): string[] {
  if (!notes) return [];
  return TAG_PATTERNS.filter(({ pattern }) => pattern.test(notes)).map(
    ({ tag }) => tag
  );
}

function getTagStyle(tag: string): { color: string; label: string } {
  const found = TAG_PATTERNS.find((t) => t.tag === tag);
  return found
    ? { color: found.color, label: found.label }
    : { color: "bg-gray-500", label: tag };
}

function CollectionCardInner({
  card,
  updating,
  onQuantityChange,
  onNotesChange,
  onDelete,
}: CollectionCardProps) {
  const { showCodex, showNotes } = useCodex();

  // Toggle a tag in the notes text
  const toggleTag = (tagLabel: string) => {
    const lower = tagLabel.toLowerCase();
    const pattern = new RegExp(`\\b${lower}\\b`, "i");
    if (pattern.test(notesValue)) {
      // Remove tag
      setNotesValue(
        notesValue.replace(pattern, "").replace(/\s+/g, " ").trim()
      );
    } else {
      // Add tag
      setNotesValue((notesValue + " " + lower).trim());
    }
  };

  // Check if a tag is active in current notes value
  const isTagActive = (tagLabel: string) => {
    const lower = tagLabel.toLowerCase();
    return new RegExp(`\\b${lower}\\b`, "i").test(notesValue);
  };
  const [imageError, setImageError] = useState(false);
  const [editingNotes, setEditingNotes] = useState(false);
  const [notesValue, setNotesValue] = useState(card.notes || "");
  const [showMobileModal, setShowMobileModal] = useState(false);
  const [showDetail, setShowDetail] = useState(false);
  const [isTouchDevice, setIsTouchDevice] = useState(false);

  // Detect touch device
  useEffect(() => {
    setIsTouchDevice("ontouchstart" in window || navigator.maxTouchPoints > 0);
  }, []);

  // Parse tags from notes
  const tags = parseNoteTags(card.notes);

  // Build image URL - only use variant slug if available
  // Cards without variants (e.g., promo/special products) use placeholder
  const imageSlug = card.variant?.slug;
  const hasValidImage = !!imageSlug;
  const primaryUrl = hasValidImage
    ? `/api/images/${imageSlug}`
    : "/api/assets/cardback_spellbook.png"; // No CDN fallback - use cardback for cards without variant

  // Use placeholder if image failed to load
  const imageUrl = imageError
    ? "/api/assets/cardback_spellbook.png"
    : primaryUrl;

  const isFoil = card.finish === "Foil";
  const isSite = (card.meta?.type || "").toLowerCase().includes("site");

  // Handle card click - open details on both desktop and mobile
  const handleCardClick = () => {
    setShowDetail(true);
  };

  return (
    <>
      <div
        className={`relative group rounded-lg overflow-hidden bg-gray-800 hover:z-50 ${
          isSite ? "col-span-2" : ""
        } ${isFoil ? "foil-card" : ""} ${updating ? "opacity-50 pointer-events-none" : ""}`}
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
        onClick={handleCardClick}
      >
        {/* Card Image */}
        <div className={`${isSite ? "aspect-[3.5/2.5] overflow-hidden" : "aspect-[2.5/3.5]"} relative`}>
          <Image
            src={imageUrl}
            alt={card.card.name}
            fill
            className={isSite ? "object-contain rotate-90 scale-[1.4]" : "object-cover"}
            sizes="(max-width: 640px) 50vw, (max-width: 768px) 33vw, (max-width: 1024px) 25vw, 16vw"
            onError={() => {
              // Use state to switch to placeholder (prevents flicker from direct src manipulation)
              if (!imageError) setImageError(true);
            }}
            unoptimized
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

          {/* Tags from notes */}
          {tags.length > 0 && (
            <div className="absolute top-2 left-2 flex flex-wrap gap-1">
              {tags.map((tag) => {
                const { color, label } = getTagStyle(tag);
                return (
                  <span
                    key={tag}
                    className={`${color} text-xs px-1.5 py-0.5 rounded font-medium`}
                  >
                    {label}
                  </span>
                );
              })}
            </div>
          )}
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
          {/* Notes preview */}
          {showNotes && card.notes && (
            <div
              className="text-xs text-gray-500 truncate mt-0.5"
              title={card.notes}
            >
              📝 {card.notes}
            </div>
          )}
          {/* Codex errata info */}
          {showCodex && (
            <CodexTooltip cardName={card.card.name} className="mt-1" />
          )}
        </div>

        {/* Hover Actions - hidden on touch devices */}
        <div
          className={`absolute inset-0 bg-black/70 rounded-lg flex-col items-center justify-center gap-2 p-2 transition-opacity ${
            showCodex ? "pt-16" : ""
          } ${
            isTouchDevice
              ? "hidden"
              : "hidden group-hover:flex group-hover:opacity-100 opacity-0"
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

          {/* Notes editing */}
          {editingNotes ? (
            <div className="w-full px-2">
              <textarea
                value={notesValue}
                onChange={(e) => setNotesValue(e.target.value)}
                placeholder="Add notes... (promo, mint, nm, poor, wanted, selling)"
                className="w-full bg-gray-800 border border-gray-600 rounded px-2 py-1 text-xs text-white resize-none"
                rows={2}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    onNotesChange?.(notesValue);
                    setEditingNotes(false);
                  } else if (e.key === "Escape") {
                    setNotesValue(card.notes || "");
                    setEditingNotes(false);
                  }
                }}
              />
              {/* Quick tag buttons */}
              <div className="flex flex-wrap gap-1 mt-1">
                {TAG_PATTERNS.map(({ tag, label, color }) => (
                  <button
                    key={tag}
                    onClick={() => toggleTag(label)}
                    className={`text-xs px-1.5 py-0.5 rounded transition-all ${
                      isTagActive(label)
                        ? `${color} ring-2 ring-white/50`
                        : "bg-gray-700 hover:bg-gray-600 text-gray-300"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="flex gap-1 mt-1">
                <button
                  onClick={() => {
                    onNotesChange?.(notesValue);
                    setEditingNotes(false);
                  }}
                  className="text-xs bg-green-600 hover:bg-green-500 px-2 py-0.5 rounded"
                >
                  Save
                </button>
                <button
                  onClick={() => {
                    setNotesValue(card.notes || "");
                    setEditingNotes(false);
                  }}
                  className="text-xs bg-gray-600 hover:bg-gray-500 px-2 py-0.5 rounded"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setEditingNotes(true)}
              className="text-cyan-400 hover:text-cyan-300 text-xs"
            >
              {card.notes ? "📝 Edit Notes" : "📝 Add Notes"}
            </button>
          )}

          <button
            onClick={() => setShowDetail(true)}
            className="text-white bg-gray-600 hover:bg-gray-500 text-xs px-3 py-1 rounded"
          >
            Details
          </button>

          <button
            onClick={onDelete}
            className="text-red-400 hover:text-red-300 text-xs underline"
          >
            Remove
          </button>

          <CardPriceTag
            cardId={card.cardId}
            cardName={card.card.name}
            variantId={card.variantId}
            finish={card.finish}
          />
        </div>
      </div>

      {/* Mobile Fullscreen Modal */}
      {showMobileModal && (
        <div
          className="fixed inset-0 z-[100] bg-black/95 flex flex-col items-center justify-center p-4"
          onClick={() => setShowMobileModal(false)}
        >
          {/* Close button */}
          <button
            className="absolute top-4 right-4 text-white text-2xl p-2"
            onClick={() => setShowMobileModal(false)}
          >
            ✕
          </button>

          {/* Card Image - large */}
          <div className={`relative w-full max-w-sm ${isSite ? "aspect-[3.5/2.5] overflow-hidden" : "aspect-[2.5/3.5]"} mb-4`}>
            <Image
              src={imageUrl}
              alt={card.card.name}
              fill
              className={isSite ? "object-contain rotate-90 scale-[1.4]" : "object-contain"}
              sizes="100vw"
              unoptimized
            />
            {isFoil && (
              <div className="absolute top-2 right-2 bg-yellow-500 text-black text-xs px-2 py-0.5 rounded font-bold">
                FOIL
              </div>
            )}
          </div>

          {/* Card Info */}
          <div className="text-center mb-4">
            <h2 className="text-xl font-bold text-white">{card.card.name}</h2>
            <p className="text-gray-400">
              {card.set?.name || "Unknown Set"}
              {card.meta?.rarity && (
                <span className={`ml-2 ${getRarityColor(card.meta.rarity)}`}>
                  • {card.meta.rarity}
                </span>
              )}
            </p>
            {card.notes && (
              <p className="text-gray-500 text-sm mt-1">📝 {card.notes}</p>
            )}
          </div>

          {/* Actions */}
          <div
            className="flex flex-col items-center gap-3 w-full max-w-xs"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Quantity controls */}
            <div className="flex items-center gap-4">
              <button
                onClick={() => onQuantityChange?.(card.quantity - 1)}
                disabled={card.quantity <= 1}
                className="w-12 h-12 bg-gray-700 hover:bg-gray-600 rounded-full text-2xl font-bold disabled:opacity-50"
              >
                −
              </button>
              <span className="text-3xl font-bold w-12 text-center text-white">
                {card.quantity}
              </span>
              <button
                onClick={() => onQuantityChange?.(card.quantity + 1)}
                disabled={card.quantity >= 99}
                className="w-12 h-12 bg-gray-700 hover:bg-gray-600 rounded-full text-2xl font-bold disabled:opacity-50"
              >
                +
              </button>
            </div>

            {/* Notes */}
            {editingNotes ? (
              <div className="w-full">
                <textarea
                  value={notesValue}
                  onChange={(e) => setNotesValue(e.target.value)}
                  placeholder="Add notes..."
                  className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-sm text-white resize-none"
                  rows={2}
                  autoFocus
                />
                <div className="flex flex-wrap gap-1 mt-2">
                  {TAG_PATTERNS.map(({ tag, label, color }) => (
                    <button
                      key={tag}
                      onClick={() => toggleTag(label)}
                      className={`text-xs px-2 py-1 rounded transition-all ${
                        isTagActive(label)
                          ? `${color} ring-2 ring-white/50`
                          : "bg-gray-700 text-gray-300"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <div className="flex gap-2 mt-2">
                  <button
                    onClick={() => {
                      onNotesChange?.(notesValue);
                      setEditingNotes(false);
                    }}
                    className="flex-1 bg-green-600 hover:bg-green-500 px-3 py-2 rounded text-sm"
                  >
                    Save
                  </button>
                  <button
                    onClick={() => {
                      setNotesValue(card.notes || "");
                      setEditingNotes(false);
                    }}
                    className="flex-1 bg-gray-600 hover:bg-gray-500 px-3 py-2 rounded text-sm"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setEditingNotes(true)}
                className="text-cyan-400 text-sm py-2"
              >
                {card.notes ? "📝 Edit Notes" : "📝 Add Notes"}
              </button>
            )}

            {/* Details */}
            <button
              onClick={() => {
                setShowMobileModal(false);
                setShowDetail(true);
              }}
              className="w-full bg-gray-700 hover:bg-gray-600 text-white text-sm py-2 rounded"
            >
              View Details
            </button>

            {/* Delete */}
            <button
              onClick={() => {
                onDelete?.();
                setShowMobileModal(false);
              }}
              className="text-red-400 text-sm py-2"
            >
              Remove from Collection
            </button>

            <CardPriceTag
              cardId={card.cardId}
              cardName={card.card.name}
              variantId={card.variantId}
              finish={card.finish}
            />
          </div>
        </div>
      )}

      {/* Card Detail Overlay */}
      {showDetail && (
        <CardDetailOverlay
          card={card}
          onClose={() => setShowDetail(false)}
        />
      )}
    </>
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
