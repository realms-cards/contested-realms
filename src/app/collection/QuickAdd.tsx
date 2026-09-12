"use client";

import type { Finish } from "@prisma/client";
import Image from "next/image";
import { useEffect, useState, useRef, useMemo } from "react";
import { Modal } from "@/components/ui/Modal";
import {
  useCardSearch,
  type CardSearchResult,
} from "@/lib/collection/useCardSearch";

// Use CardSearchResult from the hook
type CardResult = CardSearchResult;

interface QuickAddProps {
  onClose: () => void;
  onCardAdded?: () => void; // Called when modal closes if cards were added
}

export default function QuickAdd({ onClose, onCardAdded }: QuickAddProps) {
  const [query, setQuery] = useState("");
  const [finish, setFinish] = useState<Finish>("Standard");
  const [cardsAddedCount, setCardsAddedCount] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const [hoverCard, setHoverCard] = useState<CardResult | null>(null);

  // Use local search index for instant results
  const { search, loading: indexLoading } = useCardSearch();

  // Search results computed instantly from local index
  const results = useMemo(() => {
    if (!query.trim()) return [];
    return search(query, 8);
  }, [query, search]);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // No debounce needed - search is instant now

  const handleQuickAdd = async (card: CardResult) => {
    // Optimistic update - show success immediately
    setCardsAddedCount((c) => c + 1);
    setQuery("");
    inputRef.current?.focus();

    // Fire and forget - don't block UI
    fetch("/api/collection", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        cards: [
          {
            cardId: card.cardId,
            variantId: card.variantId,
            setId: card.setId,
            finish,
            quantity: 1,
          },
        ],
      }),
    })
      .then((res) => {
        if (!res.ok) {
          res.json().then((data) => {
            console.error("Failed to add card:", data.error);
          });
        }
        // Don't refresh collection while modal is open - will refresh on close
      })
      .catch((e) => {
        console.error("Failed to add card:", e);
      });
  };

  const handleClose = () => {
    // Refresh collection only if cards were added
    if (cardsAddedCount > 0) {
      onCardAdded?.();
    }
    onClose();
  };

  return (
    <Modal
      onClose={handleClose}
      backdropClassName="items-start pt-20 bg-[rgba(6,10,20,0.82)] backdrop-blur-[4px]"
    >
      <div className="flex items-start gap-4">
        {/* Main modal */}
        <div className="rc-panel w-full max-w-lg overflow-hidden">
          {/* Header */}
          <div className="rc-panel-head">
            <h2 className="m-0 font-rc-display text-[26px] leading-none text-rc-fg-strong">
              Quick Add Cards
            </h2>
            <div className="flex-1" />
            <button
              type="button"
              onClick={handleClose}
              aria-label="Close"
              className="cursor-pointer rounded-rc-md px-2 py-0.5 text-xl leading-none text-rc-fg-muted transition-colors hover:bg-rc-line/6 hover:text-rc-fg-strong focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-rc-accent-ring"
            >
              ×
            </button>
          </div>

          {/* Finish Toggle */}
          <div className="border-b border-rc-line/12 px-[18px] py-3">
            <div className="rc-segment">
              <button
                type="button"
                aria-pressed={finish === "Standard"}
                onClick={() => setFinish("Standard")}
              >
                Standard
              </button>
              <button
                type="button"
                aria-pressed={finish === "Foil"}
                onClick={() => setFinish("Foil")}
              >
                Foil
              </button>
            </div>
          </div>

          {/* Search */}
          <div className="px-[18px] py-3.5">
            <input
              ref={inputRef}
              type="text"
              placeholder="Type card name and click to add..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              className="rc-input h-11 w-full"
            />
          </div>

          {/* Results */}
          <div className="thin-scrollbar max-h-64 overflow-y-auto">
            {indexLoading ? (
              <div className="rc-hint py-6 text-center">loading cards…</div>
            ) : results.length > 0 ? (
              <div>
                {results
                  .filter((card) => card.cardName)
                  .map((card) => (
                    <button
                      type="button"
                      key={`${card.cardId}-${card.variantId}`}
                      onClick={() => handleQuickAdd(card)}
                      onMouseEnter={() => setHoverCard(card)}
                      onMouseLeave={() => setHoverCard(null)}
                      className="flex w-full cursor-pointer items-center gap-3 border-t border-rc-line/8 px-[18px] py-3 text-left transition-colors hover:bg-rc-accent/6"
                    >
                      <div
                        className={`relative flex-shrink-0 overflow-hidden rounded-rc-sm bg-black ${
                          card.isSite ? "h-10 w-14" : "h-14 w-10"
                        }`}
                      >
                        <Image
                          src={`/api/images/${card.slug}`}
                          alt={card.cardName}
                          fill
                          className={
                            card.isSite
                              ? "object-contain rotate-90"
                              : "object-cover"
                          }
                          unoptimized
                        />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-rc-display text-[19px] leading-[1.1] text-rc-fg-strong">
                          {card.cardName}
                        </div>
                        <div className="rc-hint mt-1">
                          {card.set || "Unknown Set"}
                        </div>
                      </div>
                      <span className="font-rc-mono text-[11px] uppercase tracking-[0.16em] text-rc-accent-link">
                        + Add
                      </span>
                    </button>
                  ))}
              </div>
            ) : query.trim() ? (
              <div className="rc-hint py-6 text-center">No cards found</div>
            ) : null}
          </div>

          {/* Tip */}
          <div className="rc-hint border-t border-rc-line/12 px-[18px] py-3 text-center">
            Click a card to add 1 copy. Search and add another!
          </div>
        </div>

        {/* Hover preview panel */}
        {hoverCard && (
          <div className="hidden w-48 flex-shrink-0 md:block">
            <div
              className={`relative overflow-hidden rounded-rc-lg bg-black shadow-rc-panel ${
                hoverCard.isSite ? "aspect-[3.5/2.5]" : "aspect-[2.5/3.5]"
              }`}
            >
              <Image
                src={`/api/images/${hoverCard.slug}`}
                alt={hoverCard.cardName}
                fill
                className={
                  hoverCard.isSite ? "object-contain rotate-90" : "object-cover"
                }
                sizes="192px"
                priority
                unoptimized
              />
            </div>
            <div className="mt-2 text-center">
              <div className="font-rc-display text-[17px] leading-[1.1] text-rc-fg-strong">
                {hoverCard.cardName}
              </div>
              <div className="rc-hint mt-1">{hoverCard.set}</div>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
