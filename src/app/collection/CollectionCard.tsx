"use client";

import Image from "next/image";
import { memo, useState, useEffect } from "react";
import { CodexTooltip } from "@/components/collection/CodexTooltip";
import { RcButton } from "@/components/ui/rc-button";
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
    color: "border border-rc-accent/35 bg-rc-accent/18 text-rc-accent-link",
    label: "Promo",
  },
  {
    tag: "mint",
    pattern: /\bmint\b/i,
    color: "border border-rc-success/35 bg-rc-success/22 text-[#c5d6a8]",
    label: "Mint",
  },
  {
    tag: "nm",
    pattern: /\b(near[- ]?mint|nm)\b/i,
    color: "border border-rc-success/25 bg-rc-success/14 text-[#c5d6a8]",
    label: "NM",
  },
  {
    tag: "normal",
    pattern: /\bnormal\b/i,
    color: "border border-rc-line/22 bg-rc-line/10 text-rc-fg-muted",
    label: "Normal",
  },
  {
    tag: "poor",
    pattern: /\bpoor\b/i,
    color: "border border-rc-danger/40 bg-rc-danger/20 text-[#f0c2b5]",
    label: "Poor",
  },
  {
    tag: "wanted",
    pattern: /\bwanted\b/i,
    color: "border border-rc-info/40 bg-rc-info/18 text-[#d5deec]",
    label: "Wanted",
  },
  {
    tag: "selling",
    pattern: /\b(selling|for sale|fs)\b/i,
    color: "border border-rc-accent/35 bg-[rgba(112,65,22,0.55)] text-[#f3e0b3]",
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
    : { color: "border border-rc-line/22 bg-rc-line/10 text-rc-fg-muted", label: tag };
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
        className={`group relative overflow-hidden rounded-rc-md border border-rc-line/12 bg-black/30 transition-colors hover:z-50 hover:border-rc-accent/40 ${
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
            <div className="absolute right-2 top-2 rounded-rc-sm border border-rc-accent/35 bg-rc-accent/85 px-2 py-0.5 font-rc-mono text-[10px] uppercase tracking-[0.18em] text-rc-accent-fg">
              Foil
            </div>
          )}

          {/* No Image Warning */}
          {!hasValidImage && (
            <div
              className="absolute left-2 top-2 rounded-rc-sm border border-rc-ember/45 bg-rc-ember/85 px-2 py-0.5 font-rc-mono text-[10px] uppercase tracking-[0.18em] text-[#fbf6e8]"
              title="This card has no image - it may be from a special product not in our database"
            >
              No art
            </div>
          )}

          {/* Quantity Badge */}
          <div className="absolute bottom-2 right-2 min-w-[2rem] rounded-rc-sm border border-rc-line/22 bg-black/60 px-2 py-1 text-center font-rc-mono text-[12px] tabular-nums text-rc-fg-strong">
            ×{card.quantity}
          </div>

          {/* Tags from notes */}
          {tags.length > 0 && (
            <div className="absolute left-2 top-2 flex flex-wrap gap-1">
              {tags.map((tag) => {
                const { color, label } = getTagStyle(tag);
                return (
                  <span
                    key={tag}
                    className={`${color} rounded-rc-sm px-1.5 py-0.5 font-rc-mono text-[10px] uppercase tracking-[0.12em]`}
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
          <div
            className="truncate font-rc-display text-[15px] leading-[1.15] text-rc-fg-strong"
            title={card.card.name}
          >
            {card.card.name}
          </div>
          <div className="flex items-center gap-1 truncate font-rc-mono text-[11px] tracking-[0.1em] text-rc-fg-subtle">
            {card.set?.name || "Unknown Set"}
            {card.meta?.rarity && (
              <span className={`ml-1 ${getRarityColor(card.meta.rarity)}`}>
                · {card.meta.rarity}
              </span>
            )}
          </div>
          {/* Notes preview */}
          {showNotes && card.notes && (
            <div className="mt-0.5 truncate rc-hint" title={card.notes}>
              {card.notes}
            </div>
          )}
          {/* Codex errata info */}
          {showCodex && (
            <CodexTooltip cardName={card.card.name} className="mt-1" />
          )}
        </div>

        {/* Hover Actions - hidden on touch devices */}
        <div
          className={`absolute inset-0 flex-col items-center justify-center gap-2 rounded-rc-md bg-black/80 p-2 transition-opacity ${
            showCodex ? "pt-16" : ""
          } ${
            isTouchDevice
              ? "hidden"
              : "hidden group-hover:flex group-hover:opacity-100 opacity-0"
          }`}
        >
          {/* Quantity controls */}
          <div className="flex items-center gap-2">
            <RcButton
              variant="outline"
              size="icon"
              className="h-7 w-7"
              aria-label="Decrease quantity"
              onClick={() => onQuantityChange?.(card.quantity - 1)}
              disabled={card.quantity <= 1}
            >
              −
            </RcButton>
            <span className="w-8 text-center rc-stat text-lg">
              {card.quantity}
            </span>
            <RcButton
              variant="outline"
              size="icon"
              className="h-7 w-7"
              aria-label="Increase quantity"
              onClick={() => onQuantityChange?.(card.quantity + 1)}
              disabled={card.quantity >= 99}
            >
              +
            </RcButton>
          </div>

          {/* Notes editing */}
          {editingNotes ? (
            <div className="w-full px-2">
              <textarea
                value={notesValue}
                onChange={(e) => setNotesValue(e.target.value)}
                placeholder="Add notes... (promo, mint, nm, poor, wanted, selling)"
                className="rc-textarea w-full resize-none px-2 py-1 text-xs"
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
                    type="button"
                    onClick={() => toggleTag(label)}
                    className={`cursor-pointer rounded-rc-sm px-1.5 py-0.5 font-rc-mono text-[10px] uppercase tracking-[0.12em] transition-all ${
                      isTagActive(label)
                        ? `${color} ring-1 ring-rc-accent-ring`
                        : "border border-rc-line/22 bg-rc-line/6 text-rc-fg-muted hover:bg-rc-line/12"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="mt-1 flex gap-1">
                <RcButton
                  size="sm"
                  className="h-7 px-2 text-[11px]"
                  onClick={() => {
                    onNotesChange?.(notesValue);
                    setEditingNotes(false);
                  }}
                >
                  Save
                </RcButton>
                <RcButton
                  variant="outline"
                  size="sm"
                  className="h-7 px-2 text-[11px]"
                  onClick={() => {
                    setNotesValue(card.notes || "");
                    setEditingNotes(false);
                  }}
                >
                  Cancel
                </RcButton>
              </div>
            </div>
          ) : (
            <RcButton
              variant="link"
              size="sm"
              className="h-auto px-0 text-[11px]"
              onClick={() => setEditingNotes(true)}
            >
              {card.notes ? "Edit notes" : "Add notes"}
            </RcButton>
          )}

          <RcButton
            variant="outline"
            size="sm"
            className="h-7 px-3 text-[11px]"
            onClick={() => setShowDetail(true)}
          >
            Details
          </RcButton>

          <RcButton
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-[11px] text-rc-danger hover:text-rc-danger-hover"
            onClick={onDelete}
          >
            Remove
          </RcButton>

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
          className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-[rgba(6,10,20,0.94)] p-4"
          onClick={() => setShowMobileModal(false)}
        >
          {/* Close button */}
          <button
            type="button"
            aria-label="Close"
            className="absolute right-4 top-4 cursor-pointer rounded-rc-md p-2 text-2xl leading-none text-rc-fg-muted transition-colors hover:text-rc-fg-strong"
            onClick={() => setShowMobileModal(false)}
          >
            ×
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
              <div className="absolute right-2 top-2 rounded-rc-sm border border-rc-accent/35 bg-rc-accent/85 px-2 py-0.5 font-rc-mono text-[10px] uppercase tracking-[0.18em] text-rc-accent-fg">
                Foil
              </div>
            )}
          </div>

          {/* Card Info */}
          <div className="mb-4 text-center">
            <h2 className="m-0 font-rc-display text-[28px] leading-[1.1] text-rc-fg-strong">
              {card.card.name}
            </h2>
            <p className="font-rc-mono text-xs tracking-[0.1em] text-rc-fg-subtle">
              {card.set?.name || "Unknown Set"}
              {card.meta?.rarity && (
                <span className={`ml-2 ${getRarityColor(card.meta.rarity)}`}>
                  · {card.meta.rarity}
                </span>
              )}
            </p>
            {card.notes && <p className="mt-1 rc-hint">{card.notes}</p>}
          </div>

          {/* Actions */}
          <div
            className="flex flex-col items-center gap-3 w-full max-w-xs"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Quantity controls */}
            <div className="flex items-center gap-4">
              <RcButton
                variant="outline"
                size="icon"
                className="h-11 w-11 text-xl"
                aria-label="Decrease quantity"
                onClick={() => onQuantityChange?.(card.quantity - 1)}
                disabled={card.quantity <= 1}
              >
                −
              </RcButton>
              <span className="w-12 text-center rc-stat text-3xl">
                {card.quantity}
              </span>
              <RcButton
                variant="outline"
                size="icon"
                className="h-11 w-11 text-xl"
                aria-label="Increase quantity"
                onClick={() => onQuantityChange?.(card.quantity + 1)}
                disabled={card.quantity >= 99}
              >
                +
              </RcButton>
            </div>

            {/* Notes */}
            {editingNotes ? (
              <div className="w-full">
                <textarea
                  value={notesValue}
                  onChange={(e) => setNotesValue(e.target.value)}
                  placeholder="Add notes..."
                  className="rc-textarea w-full resize-none"
                  rows={2}
                  autoFocus
                />
                <div className="mt-2 flex flex-wrap gap-1">
                  {TAG_PATTERNS.map(({ tag, label, color }) => (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => toggleTag(label)}
                      className={`cursor-pointer rounded-rc-sm px-2 py-1 font-rc-mono text-[10px] uppercase tracking-[0.12em] transition-all ${
                        isTagActive(label)
                          ? `${color} ring-1 ring-rc-accent-ring`
                          : "border border-rc-line/22 bg-rc-line/6 text-rc-fg-muted"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <div className="mt-2 flex gap-2">
                  <RcButton
                    className="flex-1"
                    onClick={() => {
                      onNotesChange?.(notesValue);
                      setEditingNotes(false);
                    }}
                  >
                    Save
                  </RcButton>
                  <RcButton
                    variant="outline"
                    className="flex-1"
                    onClick={() => {
                      setNotesValue(card.notes || "");
                      setEditingNotes(false);
                    }}
                  >
                    Cancel
                  </RcButton>
                </div>
              </div>
            ) : (
              <RcButton
                variant="link"
                size="sm"
                onClick={() => setEditingNotes(true)}
              >
                {card.notes ? "Edit notes" : "Add notes"}
              </RcButton>
            )}

            {/* Details */}
            <RcButton
              variant="outline"
              className="w-full"
              onClick={() => {
                setShowMobileModal(false);
                setShowDetail(true);
              }}
            >
              View Details
            </RcButton>

            {/* Delete */}
            <RcButton
              variant="ghost"
              size="sm"
              className="text-rc-danger hover:text-rc-danger-hover"
              onClick={() => {
                onDelete?.();
                setShowMobileModal(false);
              }}
            >
              Remove from Collection
            </RcButton>

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

// Memoize to prevent unnecessary re-renders when parent updates
const CollectionCard = memo(CollectionCardInner);
export default CollectionCard;
