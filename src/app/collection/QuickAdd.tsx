"use client";

import type { Finish } from "@prisma/client";
import Image from "next/image";
import { useCallback, useEffect, useState, useRef } from "react";

interface CardResult {
  id: number;
  name: string;
  variant?: {
    id: number;
    slug: string;
    setName: string;
  };
}

interface RecentCard {
  cardId: number;
  name: string;
  slug: string;
  addedAt: number;
}

interface QuickAddProps {
  onClose: () => void;
  onCardAdded: () => void;
}

const MAX_RECENT = 10;

export default function QuickAdd({ onClose, onCardAdded }: QuickAddProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CardResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState<number | null>(null);
  const [finish, setFinish] = useState<Finish>("Standard");
  const [recentCards, setRecentCards] = useState<RecentCard[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  // Load recent cards from localStorage
  useEffect(() => {
    const stored = localStorage.getItem("collection:recentAdds");
    if (stored) {
      try {
        setRecentCards(JSON.parse(stored));
      } catch {
        // Ignore parse errors
      }
    }
    inputRef.current?.focus();
  }, []);

  const saveRecentCard = (card: CardResult) => {
    const recent: RecentCard = {
      cardId: card.id,
      name: card.name,
      slug:
        card.variant?.slug ||
        `${card.name.toLowerCase().replace(/\s+/g, "_")}_b_s`,
      addedAt: Date.now(),
    };

    setRecentCards((prev) => {
      const filtered = prev.filter((r) => r.cardId !== card.id);
      const updated = [recent, ...filtered].slice(0, MAX_RECENT);
      localStorage.setItem("collection:recentAdds", JSON.stringify(updated));
      return updated;
    });
  };

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
        setResults(data.slice(0, 8));
      }
    } catch {
      // Ignore search errors
    } finally {
      setLoading(false);
    }
  }, []);

  // Debounced search
  useEffect(() => {
    const timeout = setTimeout(() => {
      searchCards(query);
    }, 200);
    return () => clearTimeout(timeout);
  }, [query, searchCards]);

  const handleQuickAdd = async (card: CardResult) => {
    setAdding(card.id);

    try {
      const res = await fetch("/api/collection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cards: [
            {
              cardId: card.id,
              variantId: card.variant?.id || null,
              finish,
              quantity: 1,
            },
          ],
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to add");
      }

      saveRecentCard(card);
      onCardAdded();

      // Clear search and refocus
      setQuery("");
      setResults([]);
      inputRef.current?.focus();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to add card");
    } finally {
      setAdding(null);
    }
  };

  const handleRecentAdd = async (recent: RecentCard) => {
    setAdding(recent.cardId);

    try {
      const res = await fetch("/api/collection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cards: [
            {
              cardId: recent.cardId,
              finish,
              quantity: 1,
            },
          ],
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to add");
      }

      onCardAdded();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to add card");
    } finally {
      setAdding(null);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 flex items-start justify-center z-50 p-4 pt-20">
      <div className="bg-gray-900 rounded-xl max-w-lg w-full overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b border-gray-800 flex items-center justify-between">
          <h3 className="text-lg font-bold">Quick Add Cards</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
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
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Results */}
        <div className="max-h-64 overflow-y-auto">
          {loading ? (
            <div className="p-4 text-center text-gray-400">Searching...</div>
          ) : results.length > 0 ? (
            <div className="divide-y divide-gray-800">
              {results.map((card) => {
                const imageSlug =
                  card.variant?.slug ||
                  `${card.name.toLowerCase().replace(/\s+/g, "_")}_b_s`;
                return (
                  <button
                    key={`${card.id}-${card.variant?.id || "base"}`}
                    onClick={() => handleQuickAdd(card)}
                    disabled={adding === card.id}
                    className="w-full p-3 flex items-center gap-3 hover:bg-gray-800 transition-colors disabled:opacity-50"
                  >
                    <div className="w-10 h-14 relative rounded overflow-hidden flex-shrink-0">
                      <Image
                        src={`/api/images/${imageSlug}`}
                        alt={card.name}
                        fill
                        className="object-cover"
                      />
                    </div>
                    <div className="flex-1 text-left">
                      <div className="font-medium">{card.name}</div>
                      <div className="text-xs text-gray-400">
                        {card.variant?.setName || "Unknown Set"}
                      </div>
                    </div>
                    <div className="text-blue-400 text-sm">
                      {adding === card.id ? "Adding..." : "+ Add"}
                    </div>
                  </button>
                );
              })}
            </div>
          ) : query.trim() ? (
            <div className="p-4 text-center text-gray-400">No cards found</div>
          ) : null}
        </div>

        {/* Recent Cards */}
        {recentCards.length > 0 && !query.trim() && (
          <div className="border-t border-gray-800">
            <div className="px-4 py-2 text-xs text-gray-500 uppercase">
              Recently Added
            </div>
            <div className="flex gap-2 px-4 pb-4 overflow-x-auto">
              {recentCards.map((recent) => (
                <button
                  key={recent.cardId}
                  onClick={() => handleRecentAdd(recent)}
                  disabled={adding === recent.cardId}
                  className="flex-shrink-0 w-16 disabled:opacity-50"
                >
                  <div className="w-16 h-22 relative rounded overflow-hidden">
                    <Image
                      src={`/api/images/${recent.slug}`}
                      alt={recent.name}
                      fill
                      className="object-cover"
                    />
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Tip */}
        <div className="p-4 border-t border-gray-800 text-center text-xs text-gray-500">
          Click a card to add 1 copy. Search and add another!
        </div>
      </div>
    </div>
  );
}
