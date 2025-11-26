"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";

interface MissingCard {
  cardId: number;
  name: string;
  set: string;
  rarity: string;
  type: string;
}

export default function MissingCards() {
  const [cards, setCards] = useState<MissingCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [setFilter, setSetFilter] = useState<string>("");
  const [rarityFilter, setRarityFilter] = useState<string>("");

  const fetchMissing = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("limit", "50");
      if (setFilter) params.set("setId", setFilter);
      if (rarityFilter) params.set("rarity", rarityFilter);

      const res = await fetch(`/api/collection/missing?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setCards(data.cards);
        setTotalPages(data.pagination.totalPages);
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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">Missing Cards</h2>
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
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {cards.map((card) => {
              const imageSlug = `${card.name
                .toLowerCase()
                .replace(/\s+/g, "_")}_b_s`;
              return (
                <div
                  key={card.cardId}
                  className="rounded-lg overflow-hidden bg-gray-800 opacity-75 hover:opacity-100 transition-opacity"
                >
                  <div className="aspect-[2.5/3.5] relative">
                    <Image
                      src={`/api/assets/cards/${imageSlug}.webp`}
                      alt={card.name}
                      fill
                      className="object-cover grayscale"
                      sizes="(max-width: 640px) 50vw, 16vw"
                    />
                  </div>
                  <div className="p-2">
                    <div className="text-sm font-medium truncate">
                      {card.name}
                    </div>
                    <div className="text-xs text-gray-400">
                      {card.set} • {card.rarity}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2">
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
