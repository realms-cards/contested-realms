"use client";

import { useCallback, useEffect, useState } from "react";

interface MissingCard {
  cardId: number;
  setId: number;
  name: string;
  set: string;
  rarity: string;
  type: string;
}

// Rarity colors
function getRarityColor(rarity: string): string {
  switch (rarity?.toLowerCase()) {
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

export default function MissingCards() {
  const [cards, setCards] = useState<MissingCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [setFilter] = useState<string>("");
  const [rarityFilter, setRarityFilter] = useState<string>("");

  const fetchMissing = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("limit", "100"); // Show more in list view
      if (setFilter) params.set("setId", setFilter);
      if (rarityFilter) params.set("rarity", rarityFilter);

      const res = await fetch(`/api/collection/missing?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setCards(data.cards);
        setTotalPages(data.pagination.totalPages);
        setTotal(data.pagination.total);
      }
    } catch {
      // Ignore errors
    } finally {
      setLoading(false);
    }
  }, [page, setFilter, rarityFilter]);

  useEffect(() => {
    fetchMissing();
  }, [fetchMissing]);

  // Group cards by set for better organization
  const cardsBySet = cards.reduce((acc, card) => {
    if (!acc[card.set]) acc[card.set] = [];
    acc[card.set].push(card);
    return acc;
  }, {} as Record<string, MissingCard[]>);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-xl font-bold">Missing Cards</h2>
          {total > 0 && (
            <p className="text-sm text-gray-400">
              {total} cards missing from your collection
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <select
            value={rarityFilter}
            onChange={(e) => {
              setRarityFilter(e.target.value);
              setPage(1);
            }}
            className="bg-gray-800 border border-gray-700 rounded px-3 py-1 text-sm"
          >
            <option value="">All Rarities</option>
            <option value="Ordinary">Ordinary</option>
            <option value="Exceptional">Exceptional</option>
            <option value="Elite">Elite</option>
            <option value="Unique">Unique</option>
          </select>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-8">
          <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full" />
        </div>
      ) : cards.length > 0 ? (
        <>
          {/* List view grouped by set */}
          <div className="space-y-6">
            {Object.entries(cardsBySet).map(([setName, setCards]) => (
              <div key={setName} className="bg-gray-800/50 rounded-lg p-4">
                <h3 className="font-semibold text-sm text-gray-300 mb-3 border-b border-gray-700 pb-2">
                  {setName}{" "}
                  <span className="text-gray-500">({setCards.length})</span>
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-x-4 gap-y-1">
                  {setCards.map((card) => (
                    <div
                      key={`${card.cardId}-${card.setId}`}
                      className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-gray-700/50 transition-colors"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-sm truncate" title={card.name}>
                          {card.name}
                        </span>
                      </div>
                      <span
                        className={`text-xs flex-shrink-0 ${getRarityColor(
                          card.rarity
                        )}`}
                      >
                        {card.rarity}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 pt-4">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-2 bg-gray-700 rounded disabled:opacity-50"
              >
                Previous
              </button>
              <span className="px-4">
                Page {page} of {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-3 py-2 bg-gray-700 rounded disabled:opacity-50"
              >
                Next
              </button>
            </div>
          )}
        </>
      ) : (
        <div className="text-center py-8 text-gray-400">
          🎉 You have all the cards! (Or no cards match your filters)
        </div>
      )}
    </div>
  );
}
