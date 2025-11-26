"use client";

import Image from "next/image";
import { useCallback, useEffect, useState } from "react";
import AddCardModal from "./AddCardModal";

interface CardResult {
  id: number;
  name: string;
  elements: string | null;
  subTypes: string | null;
  variant?: {
    id: number;
    slug: string;
    finish: string;
    setName: string;
  };
  meta?: {
    type: string;
    rarity: string;
  };
  owned?: number;
}

interface CardBrowserProps {
  onCardAdded?: () => void;
}

export default function CardBrowser({ onCardAdded }: CardBrowserProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CardResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedCard, setSelectedCard] = useState<CardResult | null>(null);
  const [ownedCards, setOwnedCards] = useState<Map<number, number>>(new Map());

  // Fetch user's collection to show owned status
  useEffect(() => {
    fetch("/api/collection?limit=1000")
      .then((res) => res.json())
      .then((data) => {
        if (data.cards) {
          const owned = new Map<number, number>();
          for (const card of data.cards) {
            owned.set(
              card.cardId,
              (owned.get(card.cardId) || 0) + card.quantity
            );
          }
          setOwnedCards(owned);
        }
      })
      .catch(() => {});
  }, []);

  const searchCards = useCallback(async (searchQuery: string) => {
    if (!searchQuery.trim()) {
      setResults([]);
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(
        `/api/cards/search?q=${encodeURIComponent(searchQuery)}`
      );
      if (res.ok) {
        const data = await res.json();
        setResults(data.slice(0, 50)); // Limit results
      }
    } catch (e) {
      console.error("Search failed:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  // Debounced search
  useEffect(() => {
    const timeout = setTimeout(() => {
      searchCards(query);
    }, 300);
    return () => clearTimeout(timeout);
  }, [query, searchCards]);

  const handleCardAdded = () => {
    setSelectedCard(null);
    // Refresh owned cards
    fetch("/api/collection?limit=1000")
      .then((res) => res.json())
      .then((data) => {
        if (data.cards) {
          const owned = new Map<number, number>();
          for (const card of data.cards) {
            owned.set(
              card.cardId,
              (owned.get(card.cardId) || 0) + card.quantity
            );
          }
          setOwnedCards(owned);
        }
      })
      .catch(() => {});
    onCardAdded?.();
  };

  return (
    <div className="space-y-4">
      {/* Search Input */}
      <div>
        <input
          type="text"
          placeholder="Search all cards..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 text-lg"
          autoFocus
        />
      </div>

      {/* Results */}
      {loading ? (
        <div className="flex justify-center py-8">
          <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full" />
        </div>
      ) : results.length > 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          {results.map((card) => {
            const ownedQty = ownedCards.get(card.id) || 0;
            const imageSlug =
              card.variant?.slug ||
              `${card.name.toLowerCase().replace(/\s+/g, "_")}_b_s`;

            return (
              <div
                key={`${card.id}-${card.variant?.id || "base"}`}
                className="relative group rounded-lg overflow-hidden bg-gray-800 cursor-pointer hover:ring-2 hover:ring-blue-500 transition-all"
                onClick={() => setSelectedCard(card)}
              >
                {/* Card Image */}
                <div className="aspect-[2.5/3.5] relative">
                  <Image
                    src={`/api/assets/cards/${imageSlug}.webp`}
                    alt={card.name}
                    fill
                    className="object-cover"
                    sizes="(max-width: 640px) 50vw, (max-width: 768px) 33vw, 16vw"
                  />

                  {/* Owned Badge */}
                  {ownedQty > 0 && (
                    <div className="absolute top-2 left-2 bg-green-600 text-white text-xs px-2 py-0.5 rounded">
                      Owned: {ownedQty}
                    </div>
                  )}
                </div>

                {/* Card Info */}
                <div className="p-2">
                  <div className="text-sm font-medium truncate">
                    {card.name}
                  </div>
                  <div className="text-xs text-gray-400">
                    {card.variant?.setName || "Unknown Set"}
                  </div>
                </div>

                {/* Hover Overlay */}
                <div className="absolute inset-0 bg-blue-600/0 group-hover:bg-blue-600/20 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                  <span className="bg-blue-600 px-3 py-1 rounded text-sm font-medium">
                    + Add to Collection
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      ) : query.trim() ? (
        <div className="text-center py-8 text-gray-400">
          No cards found for &quot;{query}&quot;
        </div>
      ) : (
        <div className="text-center py-8 text-gray-400">
          Start typing to search for cards
        </div>
      )}

      {/* Add Card Modal */}
      {selectedCard && (
        <AddCardModal
          card={selectedCard}
          onClose={() => setSelectedCard(null)}
          onAdded={handleCardAdded}
        />
      )}
    </div>
  );
}
