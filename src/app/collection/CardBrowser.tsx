"use client";

import Image from "next/image";
import { useCallback, useEffect, useState } from "react";
import { CustomSelect } from "@/components/ui/CustomSelect";
import { Badge } from "@/components/ui/badge";
import { RcButton } from "@/components/ui/rc-button";
import { RcEmpty } from "@/components/ui/rc-empty";
import { getImageSlug } from "@/lib/utils/cardSlug";
import AddCardModal from "./AddCardModal";

// Response from /api/cards/search
interface SearchApiResult {
  variantId: number;
  slug: string;
  finish: string;
  product: string;
  cardId: number;
  cardName: string;
  set: string;
  setId: number;
  type: string | null;
  subTypes: string | null;
  rarity: string | null;
}

// Internal card representation
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
    setId: number;
  };
  meta?: {
    type: string;
    rarity: string;
  };
  owned?: number;
}

// Available card types
const CARD_TYPES = [
  "All Types",
  "Site",
  "Avatar",
  "Minion",
  "Magic",
  "Aura",
  "Artifact",
] as const;

// Available subtypes/keywords
const SUBTYPES = [
  "All Subtypes",
  "Mortal",
  "Undead",
  "Beast",
  "Dragon",
  "Knight",
  "Royalty",
  "Demon",
  "Angel",
  "Spirit",
  "Monster",
  "Giant",
  "Troll",
  "Goblin",
  "Dwarf",
  "Gnome",
  "Faerie",
  "Merfolk",
  "Sphinx",
  "Automaton",
  "Monument",
  "Tower",
  "Village",
  "River",
  "Desert",
  "Weapon",
  "Armor",
  "Relic",
  "Potion",
  "Document",
  "Device",
  "Instruments",
] as const;

// Available sets
const SETS = [
  "All Sets",
  "Alpha",
  "Beta",
  "Arthurian Legends",
  "Dragonlord",
  "Gothic",
  "Promotional",
] as const;

const SET_PILL_BASE =
  "cursor-pointer rounded-full border px-3 py-[5px] font-rc-mono text-[11px] uppercase tracking-[0.14em] transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-rc-accent-ring";

interface CardBrowserProps {
  onCardAdded?: () => void;
}

export default function CardBrowser({ onCardAdded }: CardBrowserProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CardResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedCard, setSelectedCard] = useState<CardResult | null>(null);
  const [ownedCards, setOwnedCards] = useState<Map<number, number>>(new Map());

  // Filter states
  const [selectedSet, setSelectedSet] = useState<string>("All Sets");
  const [selectedType, setSelectedType] = useState<string>("All Types");
  const [selectedSubtype, setSelectedSubtype] =
    useState<string>("All Subtypes");
  const [showFilters, setShowFilters] = useState(false);
  const [displayLimit, setDisplayLimit] = useState(60);

  // Zoom level (number of base columns, sites take 2x)
  const [zoomLevel, setZoomLevel] = useState(6);

  // Fetch user's collection summary (just card IDs and quantities, not full data)
  useEffect(() => {
    // Use a lighter endpoint or smaller limit - just need owned counts
    fetch("/api/collection?limit=500&fields=cardId,quantity")
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

  const searchCards = useCallback(
    async (searchQuery: string, set: string, type: string, subtype: string) => {
      // Allow browsing by set/type even without search query
      const hasQuery = searchQuery.trim().length > 0;
      const hasSetFilter = set !== "All Sets";
      const hasTypeFilter = type !== "All Types";
      const hasSubtypeFilter = subtype !== "All Subtypes";

      if (!hasQuery && !hasSetFilter && !hasTypeFilter && !hasSubtypeFilter) {
        setResults([]);
        return;
      }

      setLoading(true);
      try {
        const params = new URLSearchParams();
        if (hasQuery) params.set("q", searchQuery.trim());
        if (hasSetFilter) params.set("set", set);
        if (hasTypeFilter) params.set("type", type.toLowerCase());

        const res = await fetch(`/api/cards/search?${params.toString()}`);
        if (res.ok) {
          const data: SearchApiResult[] = await res.json();

          // Transform API response to CardResult format
          let transformed: CardResult[] = data.map((item) => ({
            id: item.cardId,
            name: item.cardName,
            elements: null, // API doesn't return this yet
            subTypes: item.subTypes,
            variant: {
              id: item.variantId,
              slug: item.slug,
              finish: item.finish,
              setName: item.set,
              setId: item.setId,
            },
            meta: {
              type: item.type || "",
              rarity: item.rarity || "",
            },
          }));

          // Apply subtype filter client-side (API doesn't support it)
          if (hasSubtypeFilter) {
            const subtypeLower = subtype.toLowerCase();
            transformed = transformed.filter((card) => {
              const cardSubtypes = (card.subTypes || "").toLowerCase();
              return cardSubtypes.includes(subtypeLower);
            });
          }

          // Dedupe by cardId, prioritizing non-promo sets and Standard finish
          const isPromoSet = (setName: string) => {
            const lower = setName.toLowerCase();
            return lower === "promotional" || lower === "promo";
          };
          const byCard = new Map<
            number,
            { card: CardResult; isPromo: boolean; isStandard: boolean }
          >();
          for (const card of transformed) {
            const setName = card.variant?.setName || "";
            const currIsPromo = isPromoSet(setName);
            const currIsStandard = card.variant?.finish === "Standard";
            const existing = byCard.get(card.id);

            if (!existing) {
              byCard.set(card.id, {
                card,
                isPromo: currIsPromo,
                isStandard: currIsStandard,
              });
            } else {
              // Prefer non-promo over promo
              const shouldReplace =
                (existing.isPromo && !currIsPromo) ||
                (!existing.isPromo === !currIsPromo &&
                  !existing.isStandard &&
                  currIsStandard);
              if (shouldReplace) {
                byCard.set(card.id, {
                  card,
                  isPromo: currIsPromo,
                  isStandard: currIsStandard,
                });
              }
            }
          }
          transformed = Array.from(byCard.values()).map((v) => v.card);

          setResults(transformed);
          setDisplayLimit(60); // Reset to initial limit on new search
        }
      } catch (e) {
        console.error("Search failed:", e);
      } finally {
        setLoading(false);
      }
    },
    []
  );

  // Debounced search
  useEffect(() => {
    const timeout = setTimeout(() => {
      searchCards(query, selectedSet, selectedType, selectedSubtype);
    }, 300);
    return () => clearTimeout(timeout);
  }, [query, selectedSet, selectedType, selectedSubtype, searchCards]);

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

  const hasActiveFilters =
    selectedSet !== "All Sets" ||
    selectedType !== "All Types" ||
    selectedSubtype !== "All Subtypes";

  return (
    <div className="space-y-4">
      {/* Search Input */}
      <div className="flex flex-wrap gap-2">
        <input
          type="text"
          placeholder="Search cards by name..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="rc-input h-11 min-w-[240px] flex-1 text-sm"
          autoFocus
        />
        <RcButton
          variant="outline"
          size="lg"
          aria-pressed={showFilters}
          onClick={() => setShowFilters(!showFilters)}
        >
          Filters
          {hasActiveFilters && (
            <span
              aria-hidden="true"
              className="h-1.5 w-1.5 rounded-full bg-rc-accent"
            />
          )}
        </RcButton>
      </div>

      {/* Filter Controls */}
      {showFilters && (
        <div className="grid grid-cols-1 gap-3 rounded-rc-md border border-rc-line/18 bg-black/30 p-4 sm:grid-cols-3">
          {/* Set Filter */}
          <div>
            <div className="rc-eyebrow mb-1.5">Set</div>
            <CustomSelect
              value={selectedSet}
              onChange={(v) => setSelectedSet(v)}
              className="w-full"
              options={SETS.map((set) => ({
                value: set,
                label: set,
              }))}
            />
          </div>

          {/* Type Filter */}
          <div>
            <div className="rc-eyebrow mb-1.5">Type</div>
            <CustomSelect
              value={selectedType}
              onChange={(v) => setSelectedType(v)}
              className="w-full"
              options={CARD_TYPES.map((type) => ({
                value: type,
                label: type,
              }))}
            />
          </div>

          {/* Subtype Filter */}
          <div>
            <div className="rc-eyebrow mb-1.5">Subtype/Keyword</div>
            <CustomSelect
              value={selectedSubtype}
              onChange={(v) => setSelectedSubtype(v)}
              className="w-full"
              options={SUBTYPES.map((subtype) => ({
                value: subtype,
                label: subtype,
              }))}
            />
          </div>

          {/* Clear Filters */}
          {hasActiveFilters && (
            <div className="sm:col-span-3">
              <RcButton
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSelectedSet("All Sets");
                  setSelectedType("All Types");
                  setSelectedSubtype("All Subtypes");
                }}
              >
                Clear all filters
              </RcButton>
            </div>
          )}
        </div>
      )}

      {/* Quick Set Buttons + Zoom Slider */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex flex-1 flex-wrap items-center gap-2">
          <span className="rc-hint">Browse set</span>
          {SETS.slice(1).map((set) => {
            const active = selectedSet === set;
            return (
              <button
                key={set}
                type="button"
                aria-pressed={active}
                onClick={() => {
                  setSelectedSet(set);
                  setShowFilters(true);
                }}
                className={`${SET_PILL_BASE} ${
                  active
                    ? "border-rc-accent-press bg-rc-accent text-rc-accent-fg"
                    : "border-rc-line/22 bg-transparent text-rc-fg-muted hover:border-rc-accent hover:text-rc-accent-ring"
                }`}
              >
                {set}
              </button>
            );
          })}
        </div>

        {/* Zoom Slider */}
        <div className="flex items-center gap-2">
          <span className="rc-hint">Size</span>
          <input
            type="range"
            min="4"
            max="10"
            value={zoomLevel}
            onChange={(e) => setZoomLevel(Number(e.target.value))}
            aria-label="Card size"
            className="h-1.5 w-24 cursor-pointer appearance-none rounded-full bg-black/45 accent-rc-accent"
          />
          <span className="rc-hint w-4 tabular-nums">{zoomLevel}</span>
        </div>
      </div>

      {/* Results */}
      {loading ? (
        <div className="rc-hint py-6 text-center">loading…</div>
      ) : results.length > 0 ? (
        <>
          <div
            className="grid gap-4"
            style={{
              gridTemplateColumns: `repeat(${zoomLevel}, minmax(0, 1fr))`,
            }}
          >
            {results.slice(0, displayLimit).map((card) => {
              const ownedQty = ownedCards.get(card.id) || 0;
              const imageSlug = getImageSlug(
                card.variant?.slug,
                card.name || "unknown",
                card.variant?.setName
              );

              // Sites are landscape cards - detect by type
              const isSite = (card.meta?.type || "")
                .toLowerCase()
                .includes("site");

              return (
                <div
                  key={`${card.id}-${card.variant?.id || "base"}`}
                  className={`group relative cursor-pointer overflow-hidden rounded-rc-md border border-rc-line/18 bg-black/30 transition-colors hover:border-rc-accent ${
                    isSite ? "col-span-2" : ""
                  }`}
                  onClick={() => setSelectedCard(card)}
                >
                  {/* Card Image - Sites display in landscape */}
                  <div
                    className={
                      isSite
                        ? "aspect-[3.5/2.5] relative bg-black"
                        : "aspect-[2.5/3.5] relative"
                    }
                  >
                    <Image
                      src={`/api/images/${imageSlug}`}
                      alt={card.name || "Card"}
                      fill
                      className={
                        isSite ? "object-contain rotate-90" : "object-cover"
                      }
                      sizes={
                        isSite
                          ? "(max-width: 640px) 100vw, 25vw"
                          : "(max-width: 640px) 50vw, 12.5vw"
                      }
                      unoptimized
                    />

                    {/* Owned Badge */}
                    {ownedQty > 0 && (
                      <Badge tone="ok" className="absolute left-2 top-2 z-10">
                        Owned {ownedQty}
                      </Badge>
                    )}
                  </div>

                  {/* Card Info */}
                  <div className="space-y-1.5 p-2">
                    <div className="truncate font-rc-display text-[19px] leading-[1.1] text-rc-fg-strong">
                      {card.name || "Unknown Card"}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <Badge>{card.variant?.setName || "Unknown Set"}</Badge>
                      {card.meta?.rarity && (
                        <Badge tone="gold">{card.meta.rarity}</Badge>
                      )}
                    </div>
                  </div>

                  {/* Hover Overlay */}
                  <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition-opacity group-hover:bg-black/55 group-hover:opacity-100">
                    <RcButton size="sm" tabIndex={-1}>
                      + Add to Collection
                    </RcButton>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Show More Button */}
          {results.length > displayLimit && (
            <div className="mt-6 flex justify-center">
              <RcButton
                variant="outline"
                onClick={() => setDisplayLimit((prev) => prev + 60)}
              >
                Show More ({results.length - displayLimit} remaining)
              </RcButton>
            </div>
          )}
        </>
      ) : query.trim() || hasActiveFilters ? (
        <RcEmpty title="No cards found">
          nothing matches your current criteria
        </RcEmpty>
      ) : (
        <RcEmpty title="Start typing to search">
          or select a set/filter above to browse an expansion
        </RcEmpty>
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
