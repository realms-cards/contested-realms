"use client";

import { ChevronRight } from "lucide-react";
import Image from "next/image";
import { useCallback, useEffect, useState } from "react";
import { PanelHeader } from "@/components/ui/page-header";
import { RcEmpty } from "@/components/ui/rc-empty";

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
      return "text-rc-spark";
    case "elite":
      return "text-rc-accent-link";
    case "exceptional":
      return "text-rc-info";
    case "ordinary":
    default:
      return "text-rc-fg-muted";
  }
}

// Mono pill used for the per-rarity filter chips
function getRarityChipClass(rarity: string, active?: boolean): string {
  const base =
    "inline-flex cursor-pointer items-center rounded-full border px-2.5 py-[3px] font-rc-mono text-[11px] uppercase tracking-[0.12em] transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-rc-accent-ring";
  const tone = (() => {
    switch (rarity?.toLowerCase()) {
      case "unique":
        return "border-rc-spark/35 bg-rc-spark/12 text-rc-spark";
      case "elite":
        return "border-rc-accent/35 bg-rc-accent/16 text-rc-accent-link";
      case "exceptional":
        return "border-rc-info/40 bg-rc-info/16 text-rc-info";
      case "ordinary":
      default:
        return "border-rc-line/14 bg-rc-line/8 text-rc-fg-muted";
    }
  })();
  const state = active
    ? "ring-1 ring-rc-accent-ring"
    : "hover:border-rc-accent hover:text-rc-accent-ring";
  return `${base} ${tone} ${state}`;
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

  const rarityChips: Array<{
    key: Exclude<RarityFilter, null>;
    short: string;
  }> = [
    { key: "unique", short: "U" },
    { key: "elite", short: "E" },
    { key: "exceptional", short: "Ex" },
    { key: "ordinary", short: "O" },
  ];

  return (
    <section className="rc-panel">
      <PanelHeader
        title="Missing Cards"
        meta={total > 0 ? `${total} missing from your collection` : undefined}
      />

      <div className="px-[18px] py-3.5">
        {loading ? (
          <div className="rc-hint py-6 text-center">loading…</div>
        ) : summaryBySet.length > 0 ? (
          <div className="space-y-2">
            {summaryBySet.map((setSummary) => (
              <div
                key={setSummary.setName}
                className="overflow-hidden rounded-rc-md border border-rc-line/12 bg-black/30"
              >
                {/* Set Header - Clickable */}
                <div className="flex flex-wrap items-center justify-between gap-2 p-3">
                  <button
                    type="button"
                    onClick={() => {
                      if (expandedSet === setSummary.setName) {
                        setExpandedSet(null);
                        setRarityFilter(null);
                      } else {
                        setExpandedSet(setSummary.setName);
                        setRarityFilter(null);
                      }
                    }}
                    aria-expanded={expandedSet === setSummary.setName}
                    className="flex cursor-pointer items-center gap-3 text-left transition-colors hover:text-rc-accent-ring"
                  >
                    <ChevronRight
                      className={`h-4 w-4 text-rc-fg-muted transition-transform ${
                        expandedSet === setSummary.setName ? "rotate-90" : ""
                      }`}
                    />
                    <span className="font-rc-display text-[19px] leading-[1.1] text-rc-fg-strong">
                      {setSummary.setName}
                    </span>
                    <span className="font-rc-mono text-xs tracking-[0.1em] text-rc-fg-subtle">
                      {setSummary.total} missing
                    </span>
                  </button>
                  {/* Rarity breakdown - clickable filters */}
                  <div className="flex flex-wrap gap-2">
                    {rarityChips.map(({ key, short }) => {
                      const count = setSummary.byRarity[key];
                      if (count <= 0) return null;
                      const active =
                        rarityFilter === key &&
                        expandedSet === setSummary.setName;
                      return (
                        <button
                          key={key}
                          type="button"
                          aria-pressed={active}
                          onClick={() => {
                            setExpandedSet(setSummary.setName);
                            setRarityFilter(active ? null : key);
                          }}
                          className={getRarityChipClass(key, active)}
                        >
                          {count} {short}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Expanded Card List */}
                {expandedSet === setSummary.setName && (
                  <div className="relative border-t border-rc-line/12 bg-black/30 p-3">
                    {/* Card preview tooltip - fixed to left side of viewport */}
                    {hoveredCard &&
                      (() => {
                        const isSite = hoveredCard.type
                          ?.toLowerCase()
                          .includes("site");
                        return (
                          <div className="pointer-events-none fixed left-8 top-1/2 z-50 -translate-y-1/2">
                            <div
                              className={`relative overflow-hidden rounded-rc-lg border border-rc-line/22 bg-black shadow-rc-panel ${
                                isSite
                                  ? "w-[400px] aspect-[7/5]"
                                  : "w-72 aspect-[5/7]"
                              }`}
                            >
                              {isSite ? (
                                <div className="absolute inset-0 flex items-center justify-center">
                                  <div className="relative h-[400px] w-[286px] rotate-90">
                                    <Image
                                      src={`/api/images/${getCardSlug(
                                        hoveredCard.name,
                                        hoveredCard.set
                                      )}`}
                                      alt={hoveredCard.name}
                                      fill
                                      className="rounded object-cover"
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
                            <div className="mt-2 text-center font-rc-display text-[17px] text-rc-fg-strong">
                              {hoveredCard.name}
                            </div>
                          </div>
                        );
                      })()}

                    {/* Filter indicator */}
                    {rarityFilter && (
                      <div className="rc-hint mb-2">
                        Showing {rarityFilter} cards only ·{" "}
                        <button
                          type="button"
                          onClick={() => setRarityFilter(null)}
                          className="rc-link cursor-pointer"
                        >
                          Show all
                        </button>
                      </div>
                    )}

                    {/* Cards list - single column when filtered */}
                    <div
                      className={
                        rarityFilter
                          ? "thin-scrollbar max-h-96 space-y-0.5 overflow-y-auto"
                          : "thin-scrollbar grid max-h-96 grid-cols-1 gap-x-4 gap-y-1 overflow-y-auto sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
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
                            className={`cursor-pointer rounded-rc-sm px-2 py-1 font-rc-sans text-sm transition-colors hover:bg-rc-accent/6 ${getRarityColor(
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
          <RcEmpty title="You have every card.">
            nothing missing from your collection
          </RcEmpty>
        )}
      </div>
    </section>
  );
}
