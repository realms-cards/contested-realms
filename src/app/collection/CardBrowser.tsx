"use client";

import Image from "next/image";
import { useCallback, useEffect, useState } from "react";
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
] as const;

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

  // Zoom level (number of base columns, sites take 2x)
  const [zoomLevel, setZoomLevel] = useState(6);

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

          // Dedupe by cardId, keeping first (prefer Standard finish)
          const seen = new Set<number>();
          transformed = transformed.filter((card) => {
            if (seen.has(card.id)) return false;
            seen.add(card.id);
            return true;
          });

          setResults(transformed.slice(0, 100)); // Limit results
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

  return (
    <div className="space-y-4">
      {/* Search Input */}
      <div className="flex gap-2">
        <input
          type="text"
          placeholder="Search cards by name..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 text-lg"
          autoFocus
        />
        <button
          onClick={() => setShowFilters(!showFilters)}
          className={`px-4 py-2 rounded-lg border transition-colors ${
            showFilters ||
            selectedSet !== "All Sets" ||
            selectedType !== "All Types" ||
            selectedSubtype !== "All Subtypes"
              ? "bg-blue-600 border-blue-500 text-white"
              : "bg-gray-800 border-gray-700 hover:bg-gray-700"
          }`}
        >
          Filters
          {(selectedSet !== "All Sets" ||
            selectedType !== "All Types" ||
            selectedSubtype !== "All Subtypes") && (
            <span className="ml-1 text-xs">●</span>
          )}
        </button>
      </div>

      {/* Filter Controls */}
      {showFilters && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-4 bg-gray-800/50 rounded-lg border border-gray-700">
          {/* Set Filter */}
          <div>
            <label className="block text-sm text-gray-400 mb-1">Set</label>
            <select
              value={selectedSet}
              onChange={(e) => setSelectedSet(e.target.value)}
              className="w-full bg-gray-900 border border-gray-600 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {SETS.map((set) => (
                <option key={set} value={set}>
                  {set}
                </option>
              ))}
            </select>
          </div>

          {/* Type Filter */}
          <div>
            <label className="block text-sm text-gray-400 mb-1">Type</label>
            <select
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value)}
              className="w-full bg-gray-900 border border-gray-600 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {CARD_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </div>

          {/* Subtype Filter */}
          <div>
            <label className="block text-sm text-gray-400 mb-1">
              Subtype/Keyword
            </label>
            <select
              value={selectedSubtype}
              onChange={(e) => setSelectedSubtype(e.target.value)}
              className="w-full bg-gray-900 border border-gray-600 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {SUBTYPES.map((subtype) => (
                <option key={subtype} value={subtype}>
                  {subtype}
                </option>
              ))}
            </select>
          </div>

          {/* Clear Filters */}
          {(selectedSet !== "All Sets" ||
            selectedType !== "All Types" ||
            selectedSubtype !== "All Subtypes") && (
            <button
              onClick={() => {
                setSelectedSet("All Sets");
                setSelectedType("All Types");
                setSelectedSubtype("All Subtypes");
              }}
              className="sm:col-span-3 text-sm text-blue-400 hover:text-blue-300 underline"
            >
              Clear all filters
            </button>
          )}
        </div>
      )}

      {/* Quick Set Buttons + Zoom Slider */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex flex-wrap gap-2 flex-1">
          <span className="text-sm text-gray-400 py-1">Browse set:</span>
          {SETS.slice(1).map((set) => (
            <button
              key={set}
              onClick={() => {
                setSelectedSet(set);
                setShowFilters(true);
              }}
              className={`px-3 py-1 text-sm rounded-full border transition-colors ${
                selectedSet === set
                  ? "bg-blue-600 border-blue-500 text-white"
                  : "bg-gray-800 border-gray-600 hover:bg-gray-700"
              }`}
            >
              {set}
            </button>
          ))}
        </div>

        {/* Zoom Slider */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-400">Size:</span>
          <input
            type="range"
            min="4"
            max="10"
            value={zoomLevel}
            onChange={(e) => setZoomLevel(Number(e.target.value))}
            className="w-24 accent-blue-500"
          />
          <span className="text-xs text-gray-500 w-4">{zoomLevel}</span>
        </div>
      </div>

      {/* Results */}
      {loading ? (
        <div className="flex justify-center py-8">
          <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full" />
        </div>
      ) : results.length > 0 ? (
        <div
          className="grid gap-4"
          style={{
            gridTemplateColumns: `repeat(${zoomLevel}, minmax(0, 1fr))`,
          }}
        >
          {results.map((card) => {
            const ownedQty = ownedCards.get(card.id) || 0;
            const imageSlug =
              card.variant?.slug ||
              `${(card.name || "unknown")
                .toLowerCase()
                .replace(/\s+/g, "_")}_b_s`;

            // Sites are landscape cards - detect by type
            const isSite = (card.meta?.type || "")
              .toLowerCase()
              .includes("site");

            return (
              <div
                key={`${card.id}-${card.variant?.id || "base"}`}
                className={`relative group rounded-lg overflow-hidden bg-gray-800 cursor-pointer hover:ring-2 hover:ring-blue-500 transition-all ${
                  isSite ? "col-span-2" : ""
                }`}
                onClick={() => setSelectedCard(card)}
              >
                {/* Card Image - Sites need rotation since stored portrait but display landscape */}
                <div
                  className={
                    isSite
                      ? "aspect-[3.5/2.5] relative overflow-hidden"
                      : "aspect-[2.5/3.5] relative"
                  }
                >
                  <Image
                    src={`/api/images/${imageSlug}`}
                    alt={card.name || "Card"}
                    fill
                    className={
                      isSite
                        ? "object-cover rotate-90 scale-[1.4]"
                        : "object-cover"
                    }
                    sizes={
                      isSite
                        ? "(max-width: 640px) 100vw, 25vw"
                        : "(max-width: 640px) 50vw, 12.5vw"
                    }
                  />

                  {/* Owned Badge */}
                  {ownedQty > 0 && (
                    <div className="absolute top-2 left-2 bg-green-600 text-white text-xs px-2 py-0.5 rounded z-10">
                      Owned: {ownedQty}
                    </div>
                  )}

                  {/* Site indicator */}
                  {isSite && (
                    <div className="absolute top-2 right-2 bg-amber-600 text-white text-xs px-2 py-0.5 rounded z-10">
                      Site
                    </div>
                  )}
                </div>

                {/* Card Info */}
                <div className="p-2">
                  <div className="text-sm font-medium truncate">
                    {card.name || "Unknown Card"}
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
      ) : query.trim() ||
        selectedSet !== "All Sets" ||
        selectedType !== "All Types" ||
        selectedSubtype !== "All Subtypes" ? (
        <div className="text-center py-8 text-gray-400">
          No cards found matching your criteria
        </div>
      ) : (
        <div className="text-center py-8 text-gray-400">
          <p>Start typing to search, or select a set/filter above to browse</p>
          <p className="text-sm mt-2">
            Tip: Select a set to browse all cards from that expansion
          </p>
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
