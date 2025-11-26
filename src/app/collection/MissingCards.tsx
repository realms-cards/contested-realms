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

interface SetSummary {
  setName: string;
  total: number;
  byRarity: {
    ordinary: number;
    exceptional: number;
    elite: number;
    unique: number;
  };
  cards: MissingCard[];
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

function getRarityBg(rarity: string): string {
  switch (rarity?.toLowerCase()) {
    case "unique":
      return "bg-purple-500/20";
    case "elite":
      return "bg-yellow-500/20";
    case "exceptional":
      return "bg-blue-500/20";
    case "ordinary":
    default:
      return "bg-gray-500/20";
  }
}

export default function MissingCards() {
  const [allCards, setAllCards] = useState<MissingCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [expandedSet, setExpandedSet] = useState<string | null>(null);

  const fetchAllMissing = useCallback(async () => {
    setLoading(true);
    try {
      // Fetch all missing cards (no pagination for summary)
      const res = await fetch(`/api/collection/missing?limit=5000`);
      if (res.ok) {
        const data = await res.json();
        setAllCards(data.cards);
        setTotal(data.pagination.total);
      }
    } catch {
      // Ignore errors
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAllMissing();
  }, [fetchAllMissing]);

  // Build summary by set
  const summaryBySet: SetSummary[] = Object.values(
    allCards.reduce((acc, card) => {
      if (!acc[card.set]) {
        acc[card.set] = {
          setName: card.set,
          total: 0,
          byRarity: { ordinary: 0, exceptional: 0, elite: 0, unique: 0 },
          cards: [],
        };
      }
      acc[card.set].total++;
      acc[card.set].cards.push(card);
      const r = card.rarity?.toLowerCase() as keyof SetSummary["byRarity"];
      if (r in acc[card.set].byRarity) {
        acc[card.set].byRarity[r]++;
      }
      return acc;
    }, {} as Record<string, SetSummary>)
  ).sort((a, b) => b.total - a.total);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold">Missing Cards</h2>
        {total > 0 && (
          <p className="text-sm text-gray-400">
            {total} cards missing from your collection
          </p>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-8">
          <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full" />
        </div>
      ) : summaryBySet.length > 0 ? (
        <div className="space-y-2">
          {summaryBySet.map((setSummary) => (
            <div
              key={setSummary.setName}
              className="bg-gray-800/50 rounded-lg overflow-hidden"
            >
              {/* Set Header - Clickable */}
              <button
                onClick={() =>
                  setExpandedSet(
                    expandedSet === setSummary.setName
                      ? null
                      : setSummary.setName
                  )
                }
                className="w-full p-3 flex items-center justify-between hover:bg-gray-700/50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <span
                    className={`text-lg transition-transform ${
                      expandedSet === setSummary.setName ? "rotate-90" : ""
                    }`}
                  >
                    ▶
                  </span>
                  <span className="font-medium">{setSummary.setName}</span>
                  <span className="text-gray-500 text-sm">
                    ({setSummary.total} missing)
                  </span>
                </div>
                {/* Rarity breakdown */}
                <div className="flex gap-2 text-xs">
                  {setSummary.byRarity.unique > 0 && (
                    <span
                      className={`px-2 py-0.5 rounded ${getRarityBg(
                        "unique"
                      )} ${getRarityColor("unique")}`}
                    >
                      {setSummary.byRarity.unique} U
                    </span>
                  )}
                  {setSummary.byRarity.elite > 0 && (
                    <span
                      className={`px-2 py-0.5 rounded ${getRarityBg(
                        "elite"
                      )} ${getRarityColor("elite")}`}
                    >
                      {setSummary.byRarity.elite} E
                    </span>
                  )}
                  {setSummary.byRarity.exceptional > 0 && (
                    <span
                      className={`px-2 py-0.5 rounded ${getRarityBg(
                        "exceptional"
                      )} ${getRarityColor("exceptional")}`}
                    >
                      {setSummary.byRarity.exceptional} Ex
                    </span>
                  )}
                  {setSummary.byRarity.ordinary > 0 && (
                    <span
                      className={`px-2 py-0.5 rounded ${getRarityBg(
                        "ordinary"
                      )} ${getRarityColor("ordinary")}`}
                    >
                      {setSummary.byRarity.ordinary} O
                    </span>
                  )}
                </div>
              </button>

              {/* Expanded Card List */}
              {expandedSet === setSummary.setName && (
                <div className="border-t border-gray-700 p-3 bg-gray-900/50">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-x-4 gap-y-1">
                    {setSummary.cards
                      .sort((a, b) => {
                        // Sort by rarity (unique first) then name
                        const rarityOrder = {
                          unique: 0,
                          elite: 1,
                          exceptional: 2,
                          ordinary: 3,
                        };
                        const aOrder =
                          rarityOrder[
                            a.rarity?.toLowerCase() as keyof typeof rarityOrder
                          ] ?? 4;
                        const bOrder =
                          rarityOrder[
                            b.rarity?.toLowerCase() as keyof typeof rarityOrder
                          ] ?? 4;
                        if (aOrder !== bOrder) return aOrder - bOrder;
                        return a.name.localeCompare(b.name);
                      })
                      .map((card) => (
                        <div
                          key={`${card.cardId}-${card.setId}`}
                          className="flex items-center justify-between py-1 px-2 rounded hover:bg-gray-700/50"
                        >
                          <span className="text-sm truncate" title={card.name}>
                            {card.name}
                          </span>
                          <span
                            className={`text-xs ml-2 flex-shrink-0 ${getRarityColor(
                              card.rarity
                            )}`}
                          >
                            {card.rarity}
                          </span>
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-8 text-gray-400">
          🎉 You have all the cards!
        </div>
      )}
    </div>
  );
}
