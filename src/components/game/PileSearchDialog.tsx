"use client";

import { Icon } from "@iconify/react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import CardPreview from "@/components/game/CardPreview";
import { RcButton } from "@/components/ui/rc-button";
import { useSound } from "@/lib/contexts/SoundContext";
import {
  useCardHover,
  type CardPreviewData,
} from "@/lib/game/hooks/useCardHover";
import type { CardRef } from "@/lib/game/store";
import { useMobileDevice } from "@/lib/hooks/useTouchDevice";

interface PileSearchDialogProps {
  pileName: string;
  cards: CardRef[];
  onSelectCard: (card: CardRef) => void;
  onClose: () => void;
  onBanishCard?: (card: CardRef) => void;
  banishRequiresConsent?: boolean;
  // Imposter mask support
  onMaskCard?: (card: CardRef) => void;
  canMask?: (card: CardRef | null | undefined) => boolean;
}

export default function PileSearchDialog({
  pileName,
  cards,
  onSelectCard,
  onClose,
  onBanishCard,
  banishRequiresConsent,
  onMaskCard,
  canMask,
}: PileSearchDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const { playCardSelect } = useSound();
  const { isMobile } = useMobileDevice();

  // Enhanced card preview state using the draft-3d/editor-3d pattern
  const [hoverPreview, setHoverPreview] = useState<CardPreviewData | null>(
    null,
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
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-[rgba(6,10,20,0.5)] backdrop-blur-sm"
      onContextMenu={(e) => e.preventDefault()}
    >
      <div
        ref={dialogRef}
        className="rounded-rc-md sm:rounded-rc-lg border border-rc-line/18 bg-[rgba(9,13,25,0.95)] backdrop-blur shadow-rc-panel p-3 sm:p-6 w-[95vw] sm:w-96 max-h-[85vh] font-rc-sans text-rc-fg flex flex-col"
        onContextMenu={(e) => e.preventDefault()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="m-0 font-rc-display text-[22px] leading-none text-rc-fg-strong">Search {pileName}</h3>
          <button
            onClick={onClose}
            className="rounded-rc-md px-1.5 text-rc-fg-muted transition-colors hover:bg-rc-line/6 hover:text-rc-fg-strong"
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
            onTouchStart={(e) => e.currentTarget.removeAttribute("readonly")}
            readOnly={!isMobile}
            className="rc-input h-9 w-full placeholder:text-rc-fg-subtle"
            autoFocus
          />
        </div>

        <div className="thin-scrollbar flex-1 overflow-y-auto">
          {filteredCards.length === 0 ? (
            <div className="rc-hint text-center py-8 text-rc-fg-subtle">
              {cards.length === 0
                ? "No cards in pile"
                : "No cards match your search"}
            </div>
          ) : (
            <div className="space-y-2">
              {filteredCards.map((card, index) => (
                <div
                  key={`${card.slug}-${index}`}
                  className="rounded-rc-md border border-rc-line/12 bg-black/30 p-3 transition-colors hover:border-rc-accent/35 hover:bg-rc-accent/8 flex gap-3"
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
                  onClick={() => {
                    // Touch has no hover: tapping the row previews the card.
                    if (card.slug) {
                      showCardPreview({
                        slug: card.slug,
                        name: card.name,
                        type: card.type || null,
                      });
                    }
                  }}
                >
                  {/* Card thumbnail */}
                  <div className="flex-shrink-0 w-12 h-[67px] rounded-rc-sm overflow-hidden bg-black/45 ring-1 ring-rc-line/18">
                    {card.slug ? (
                      <img
                        src={`/api/images/${card.slug}`}
                        alt=""
                        className="w-full h-full object-cover"
                        loading="lazy"
                        draggable={false}
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center font-rc-mono text-rc-fg-dim text-xs">
                        ?
                      </div>
                    )}
                  </div>
                  {/* Card info and actions */}
                  <div className="flex-1 min-w-0">
                    <div className="mb-1 truncate font-rc-display text-[16px] leading-tight text-rc-fg-strong">
                      {card.name || "Unknown Card"}
                    </div>
                    {card.type && (
                      <div className="text-xs text-rc-fg-muted mb-2">
                        {card.type}
                      </div>
                    )}
                    <div className="flex gap-2">
                      <RcButton
                        onClick={() => {
                          try {
                            playCardSelect();
                          } catch {}
                          onSelectCard(card);
                        }}
                        variant="outline"
                        size="sm"
                        className="h-auto flex-1 px-2 py-1 text-xs"
                      >
                        To Hand
                      </RcButton>
                      {onMaskCard && canMask?.(card) && (
                        <RcButton
                          onClick={() => {
                            try {
                              playCardSelect();
                            } catch {}
                            onMaskCard(card);
                          }}
                          variant="quiet"
                          size="xs"
                          className="h-auto flex-1 gap-0 px-2 py-1"
                          title="Imposter: Mask yourself as this avatar (3 mana)"
                        >
                          Mask (
                          <span className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full bg-white text-black text-[9px] font-bold align-text-bottom">
                            3
                          </span>
                          )
                        </RcButton>
                      )}
                      {onBanishCard && (
                        <RcButton
                          onClick={() => {
                            try {
                              playCardSelect();
                            } catch {}
                            onBanishCard(card);
                          }}
                          variant="danger-soft"
                          size="xs"
                          className="h-auto flex-1 gap-0 px-2 py-1"
                          title={
                            banishRequiresConsent
                              ? "Requires opponent consent"
                              : undefined
                          }
                        >
                          Banish
                          {banishRequiresConsent && (
                            <Icon
                              icon="game-icons:hazard-sign"
                              width={12}
                              height={12}
                              className="ml-1 inline-block align-[-1px]"
                            />
                          )}
                        </RcButton>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="mt-4 pt-4 border-t border-rc-line/12">
          <button
            className="w-full text-sm text-rc-fg-muted transition-colors hover:text-rc-fg-strong"
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
          zIndexClass="z-[10000]"
        />
      )}
    </div>
  );

  if (typeof document === "undefined") return null;
  return createPortal(content, document.body);
}
