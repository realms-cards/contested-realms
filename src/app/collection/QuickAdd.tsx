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
    <Modal onClose={handleClose} backdropClassName="items-start pt-20">
      <div className="flex gap-4 items-start">
        {/* Main modal */}
        <div className="bg-gray-900 rounded-xl max-w-lg w-full overflow-hidden">
          {/* Header */}
          <div className="p-4 border-b border-gray-800 flex items-center justify-between">
            <h3 className="text-lg font-bold">Quick Add Cards</h3>
            <button
              onClick={handleClose}
              className="text-gray-400 hover:text-white"
            >
              ✕
            </button>
          </div>

          {/* Finish Toggle */}
          <div className="px-4 py-2 border-b border-gray-800 flex gap-2">
            <button
              onClick={() => setFinish("Standard")}
              className={`px-3 py-1 rounded text-sm ${
                finish === "Standard" ? "bg-blue-600" : "bg-gray-800"
              }`}
            >
              Standard
            </button>
            <button
              onClick={() => setFinish("Foil")}
              className={`px-3 py-1 rounded text-sm ${
                finish === "Foil" ? "bg-yellow-600" : "bg-gray-800"
              }`}
            >
              ✨ Foil
            </button>
          </div>

          {/* Search */}
          <div className="p-4">
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
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Results */}
          <div className="max-h-64 overflow-y-auto">
            {indexLoading ? (
              <div className="p-4 text-center text-gray-400">
                Loading cards...
              </div>
            ) : results.length > 0 ? (
              <div className="divide-y divide-gray-800">
                {results
                  .filter((card) => card.cardName)
                  .map((card) => (
                    <button
                      key={`${card.cardId}-${card.variantId}`}
                      onClick={() => handleQuickAdd(card)}
                      onMouseEnter={() => setHoverCard(card)}
                      onMouseLeave={() => setHoverCard(null)}
                      className="w-full p-3 flex items-center gap-3 hover:bg-gray-800 transition-colors"
                    >
                      <div
                        className={`relative rounded overflow-hidden flex-shrink-0 bg-black ${
                          card.isSite ? "w-14 h-10" : "w-10 h-14"
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
                      <div className="flex-1 text-left">
                        <div className="font-medium">{card.cardName}</div>
                        <div className="text-xs text-gray-400">
                          {card.set || "Unknown Set"}
                        </div>
                      </div>
                      <div className="text-blue-400 text-sm">+ Add</div>
                    </button>
                  ))}
              </div>
            ) : query.trim() ? (
              <div className="p-4 text-center text-gray-400">
                No cards found
              </div>
            ) : null}
          </div>

          {/* Tip */}
          <div className="p-4 border-t border-gray-800 text-center text-xs text-gray-500">
            Click a card to add 1 copy. Search and add another!
          </div>
        </div>

        {/* Hover preview panel */}
        {hoverCard && (
          <div className="hidden md:block w-48 flex-shrink-0">
            <div
              className={`relative rounded-lg overflow-hidden bg-black shadow-xl ${
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
              <div className="font-medium text-sm">{hoverCard.cardName}</div>
              <div className="text-xs text-gray-400">{hoverCard.set}</div>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
