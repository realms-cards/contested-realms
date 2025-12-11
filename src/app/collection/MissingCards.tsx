"use client";

import Image from "next/image";
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

type RarityFilter = "unique" | "elite" | "exceptional" | "ordinary" | null;

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

function getRarityBg(rarity: string, active?: boolean): string {
  const opacity = active ? "/50" : "/20";
  switch (rarity?.toLowerCase()) {
    case "unique":
      return `bg-purple-500${opacity}`;
    case "elite":
      return `bg-yellow-500${opacity}`;
    case "exceptional":
      return `bg-blue-500${opacity}`;
    case "ordinary":
    default:
      return `bg-gray-500${opacity}`;
  }
}

// Generate slug from card name and set
// Uses hyphen format expected by /api/images route: set-cardname-b-s
function getCardSlug(name: string, setName: string): string {
  const lower = setName.toLowerCase();
  const setPrefix = lower.startsWith("alpha")
    ? "alp"
    : lower.startsWith("beta")
    ? "bet"
    : lower.startsWith("arthurian")
    ? "art"
    : lower.startsWith("dragon")
    ? "dra"
    : lower.startsWith("gothic")
    ? "got"
    : lower.startsWith("promo") || lower.includes("organized")
    ? "pro"
    : "bet";
  // Card names use underscores for spaces, but set prefix uses hyphen
  const cardPart = name
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "");
  // Return hyphen format: alp-cardname-b-s (API normalizes to alp_cardname_b_s internally)
  return `${setPrefix}-${cardPart}-b-s`;
}

export default function MissingCards() {
  const [allCards, setAllCards] = useState<MissingCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [expandedSet, setExpandedSet] = useState<string | null>(null);
  const [rarityFilter, setRarityFilter] = useState<RarityFilter>(null);
  const [hoveredCard, setHoveredCard] = useState<MissingCard | null>(null);

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
              <div className="p-3 flex items-center justify-between">
                <button
                  onClick={() => {
                    if (expandedSet === setSummary.setName) {
                      setExpandedSet(null);
                      setRarityFilter(null);
                    } else {
                      setExpandedSet(setSummary.setName);
                      setRarityFilter(null);
                    }
                  }}
                  className="flex items-center gap-3 hover:text-white transition-colors"
                >
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
                </button>
                {/* Rarity breakdown - clickable filters */}
                <div className="flex gap-2 text-xs">
                  {setSummary.byRarity.unique > 0 && (
                    <button
                      onClick={() => {
                        setExpandedSet(setSummary.setName);
                        setRarityFilter(
                          rarityFilter === "unique" &&
                            expandedSet === setSummary.setName
                            ? null
                            : "unique"
                        );
                      }}
                      className={`px-2 py-0.5 rounded transition-all ${getRarityBg(
                        "unique",
                        rarityFilter === "unique" &&
                          expandedSet === setSummary.setName
                      )} ${getRarityColor("unique")} ${
                        rarityFilter === "unique" &&
                        expandedSet === setSummary.setName
                          ? "ring-1 ring-purple-400"
                          : "hover:ring-1 hover:ring-purple-400/50"
                      }`}
                    >
                      {setSummary.byRarity.unique} U
                    </button>
                  )}
                  {setSummary.byRarity.elite > 0 && (
                    <button
                      onClick={() => {
                        setExpandedSet(setSummary.setName);
                        setRarityFilter(
                          rarityFilter === "elite" &&
                            expandedSet === setSummary.setName
                            ? null
                            : "elite"
                        );
                      }}
                      className={`px-2 py-0.5 rounded transition-all ${getRarityBg(
                        "elite",
                        rarityFilter === "elite" &&
                          expandedSet === setSummary.setName
                      )} ${getRarityColor("elite")} ${
                        rarityFilter === "elite" &&
                        expandedSet === setSummary.setName
                          ? "ring-1 ring-yellow-400"
                          : "hover:ring-1 hover:ring-yellow-400/50"
                      }`}
                    >
                      {setSummary.byRarity.elite} E
                    </button>
                  )}
                  {setSummary.byRarity.exceptional > 0 && (
                    <button
                      onClick={() => {
                        setExpandedSet(setSummary.setName);
                        setRarityFilter(
                          rarityFilter === "exceptional" &&
                            expandedSet === setSummary.setName
                            ? null
                            : "exceptional"
                        );
                      }}
                      className={`px-2 py-0.5 rounded transition-all ${getRarityBg(
                        "exceptional",
                        rarityFilter === "exceptional" &&
                          expandedSet === setSummary.setName
                      )} ${getRarityColor("exceptional")} ${
                        rarityFilter === "exceptional" &&
                        expandedSet === setSummary.setName
                          ? "ring-1 ring-blue-400"
                          : "hover:ring-1 hover:ring-blue-400/50"
                      }`}
                    >
                      {setSummary.byRarity.exceptional} Ex
                    </button>
                  )}
                  {setSummary.byRarity.ordinary > 0 && (
                    <button
                      onClick={() => {
                        setExpandedSet(setSummary.setName);
                        setRarityFilter(
                          rarityFilter === "ordinary" &&
                            expandedSet === setSummary.setName
                            ? null
                            : "ordinary"
                        );
                      }}
                      className={`px-2 py-0.5 rounded transition-all ${getRarityBg(
                        "ordinary",
                        rarityFilter === "ordinary" &&
                          expandedSet === setSummary.setName
                      )} ${getRarityColor("ordinary")} ${
                        rarityFilter === "ordinary" &&
                        expandedSet === setSummary.setName
                          ? "ring-1 ring-gray-400"
                          : "hover:ring-1 hover:ring-gray-400/50"
                      }`}
                    >
                      {setSummary.byRarity.ordinary} O
                    </button>
                  )}
                </div>
              </div>

              {/* Expanded Card List */}
              {expandedSet === setSummary.setName && (
                <div className="border-t border-gray-700 p-3 bg-gray-900/50 relative">
                  {/* Card preview tooltip - fixed to left side of viewport */}
                  {hoveredCard &&
                    (() => {
                      const isSite = hoveredCard.type
                        ?.toLowerCase()
                        .includes("site");
                      return (
                        <div className="fixed left-8 top-1/2 -translate-y-1/2 z-50 pointer-events-none">
                          <div
                            className={`relative rounded-lg overflow-hidden shadow-2xl ring-2 ring-white/20 bg-gray-900 ${
                              isSite
                                ? "w-[400px] aspect-[7/5]"
                                : "w-72 aspect-[5/7]"
                            }`}
                          >
                            {isSite ? (
                              <div className="absolute inset-0 flex items-center justify-center">
                                <div className="w-[286px] h-[400px] relative rotate-90">
                                  <Image
                                    src={`/api/images/${getCardSlug(
                                      hoveredCard.name,
                                      hoveredCard.set
                                    )}`}
                                    alt={hoveredCard.name}
                                    fill
                                    className="object-cover rounded"
                                    sizes="400px"
                                    unoptimized
                                  />
                                </div>
                              </div>
                            ) : (
                              <Image
                                src={`/api/images/${getCardSlug(
                                  hoveredCard.name,
                                  hoveredCard.set
                                )}`}
                                alt={hoveredCard.name}
                                fill
                                className="object-cover"
                                sizes="288px"
                                unoptimized
                              />
                            )}
                          </div>
                          <div className="mt-2 text-center text-sm font-medium text-white">
                            {hoveredCard.name}
                          </div>
                        </div>
                      );
                    })()}

                  {/* Filter indicator */}
                  {rarityFilter && (
                    <div className="mb-2 text-xs text-gray-400">
                      Showing {rarityFilter} cards only •{" "}
                      <button
                        onClick={() => setRarityFilter(null)}
                        className="text-blue-400 hover:underline"
                      >
                        Show all
                      </button>
                    </div>
                  )}

                  {/* Cards list - single column when filtered */}
                  <div
                    className={
                      rarityFilter
                        ? "space-y-0.5 max-h-96 overflow-y-auto"
                        : "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-x-4 gap-y-1 max-h-96 overflow-y-auto"
                    }
                  >
                    {setSummary.cards
                      .filter(
                        (card) =>
                          !rarityFilter ||
                          card.rarity?.toLowerCase() === rarityFilter
                      )
                      .sort((a, b) => a.name.localeCompare(b.name))
                      .map((card) => (
                        <div
                          key={`${card.cardId}-${card.setId}`}
                          className={`py-1 px-2 rounded hover:bg-gray-700/50 cursor-pointer text-sm ${getRarityColor(
                            card.rarity
                          )}`}
                          onMouseEnter={() => setHoveredCard(card)}
                          onMouseLeave={() => setHoveredCard(null)}
                        >
                          {card.name}
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
