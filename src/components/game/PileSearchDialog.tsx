"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import CardPreview from "@/components/game/CardPreview";
import { useSound } from "@/lib/contexts/SoundContext";
import {
  useCardHover,
  type CardPreviewData,
} from "@/lib/game/hooks/useCardHover";
import type { CardRef } from "@/lib/game/store";

interface PileSearchDialogProps {
  pileName: string;
  cards: CardRef[];
  onSelectCard: (card: CardRef) => void;
  onClose: () => void;
  onBanishCard?: (card: CardRef) => void;
  banishRequiresConsent?: boolean;
}

export default function PileSearchDialog({
  pileName,
  cards,
  onSelectCard,
  onClose,
  onBanishCard,
  banishRequiresConsent,
}: PileSearchDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const { playCardSelect } = useSound();

  // Enhanced card preview state using the draft-3d/editor-3d pattern
  const [hoverPreview, setHoverPreview] = useState<CardPreviewData | null>(
    null
  );
  const { showCardPreview, hideCardPreview, clearHoverTimers } = useCardHover({
    onShow: (card: CardPreviewData) => {
      setHoverPreview(card);
    },
    onHide: () => {
      setHoverPreview(null);
    },
  });

  const filteredCards = cards.filter((card) => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      card.name?.toLowerCase().includes(term) ||
      card.type?.toLowerCase().includes(term)
    );
  });

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    const handleClickOutside = (e: MouseEvent) => {
      if (dialogRef.current && !dialogRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    document.addEventListener("keydown", handleEscape);
    document.addEventListener("mousedown", handleClickOutside);

    return () => {
      document.removeEventListener("keydown", handleEscape);
      document.removeEventListener("mousedown", handleClickOutside);
      // Clean up hover timers on unmount
      clearHoverTimers();
    };
  }, [onClose, clearHoverTimers]);

  const content = (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onContextMenu={(e) => e.preventDefault()}
    >
      <div
        ref={dialogRef}
        className="bg-zinc-900/95 backdrop-blur rounded-xl ring-1 ring-white/10 shadow-2xl p-6 w-96 max-h-[80vh] text-white flex flex-col"
        onContextMenu={(e) => e.preventDefault()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Search {pileName}</h3>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-white transition-colors"
          >
            ✕
          </button>
        </div>

        <div
          className="mb-4"
          role="search"
          data-1p-ignore="true"
          data-lpignore="true"
          data-bwignore="true"
          data-dashlane-ignore="true"
          data-np-ignore="true"
          data-keeper-lock="true"
        >
          <input
            id="pile-search-input"
            type="search"
            name="pile-search"
            autoComplete="off section-pile-search"
            role="searchbox"
            inputMode="search"
            aria-autocomplete="list"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="search"
            data-1p-ignore="true"
            data-lpignore="true"
            data-bwignore="true"
            data-dashlane-ignore="true"
            data-np-ignore="true"
            data-keeper-lock="true"
            data-keepassxc-browser-skip="true"
            data-form-type="other"
            placeholder="Search by name, text, or type..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onFocus={(e) => e.currentTarget.removeAttribute("readonly")}
            onMouseDown={(e) => e.currentTarget.removeAttribute("readonly")}
            readOnly
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            autoFocus
          />
        </div>

        <div className="flex-1 overflow-y-auto">
          {filteredCards.length === 0 ? (
            <div className="text-center text-zinc-400 py-8">
              {cards.length === 0
                ? "No cards in pile"
                : "No cards match your search"}
            </div>
          ) : (
            <div className="space-y-2">
              {filteredCards.map((card, index) => (
                <div
                  key={`${card.slug}-${index}`}
                  className="bg-zinc-800/50 hover:bg-zinc-700/50 rounded-lg p-3 transition-colors"
                  onMouseEnter={() => {
                    if (card.slug) {
                      showCardPreview({
                        slug: card.slug,
                        name: card.name,
                        type: card.type || null,
                      });
                    }
                  }}
                  onMouseLeave={() => {
                    hideCardPreview();
                  }}
                >
                  <div className="font-medium text-white mb-1">
                    {card.name || "Unknown Card"}
                  </div>
                  {card.type && (
                    <div className="text-xs text-zinc-400 mb-2">
                      {card.type}
                    </div>
                  )}
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        try {
                          playCardSelect();
                        } catch {}
                        onSelectCard(card);
                      }}
                      className="flex-1 text-xs bg-blue-600/80 hover:bg-blue-500 rounded px-2 py-1 transition-colors"
                    >
                      To Hand
                    </button>
                    {onBanishCard && (
                      <button
                        onClick={() => {
                          try {
                            playCardSelect();
                          } catch {}
                          onBanishCard(card);
                        }}
                        className="flex-1 text-xs bg-red-600/80 hover:bg-red-500 rounded px-2 py-1 transition-colors"
                        title={
                          banishRequiresConsent
                            ? "Requires opponent consent"
                            : undefined
                        }
                      >
                        Banish{banishRequiresConsent ? " ⚠" : ""}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="mt-4 pt-4 border-t border-zinc-800">
          <button
            className="w-full text-sm text-zinc-400 hover:text-zinc-300 transition-colors"
            onClick={onClose}
          >
            Cancel
          </button>
        </div>
      </div>

      {/* Enhanced Card Preview Overlay */}
      {hoverPreview && (
        <CardPreview
          card={hoverPreview}
          anchor="top-left"
          zIndexClass="z-[60]"
        />
      )}
    </div>
  );

  if (typeof document === "undefined") return null;
  return createPortal(content, document.body);
}
