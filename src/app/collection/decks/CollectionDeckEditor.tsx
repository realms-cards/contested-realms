"use client";

import Image from "next/image";
import { useState } from "react";
import { NumberBadge } from "@/components/game/manacost";
import type { Digit } from "@/components/game/manacost";
import { getImageSlug } from "@/lib/utils/cardSlug";

interface DeckCard {
  cardId: number;
  variantId: number | null;
  name: string;
  zone: string;
  count: number;
  ownedQuantity: number;
  availableQuantity: number;
  meta?: {
    type?: string;
    cost?: number;
    thresholds?: Record<string, number>;
  } | null;
  slug?: string;
}

interface SearchResult {
  cardId: number;
  name: string;
  owned: number;
  inDeck: number;
  slug: string;
  type: string;
  cost: number | null;
  thresholds: Record<string, number>;
}

interface CollectionDeckEditorProps {
  deckId: string;
  cards: DeckCard[];
  onUpdate: () => void;
}

const ELEMENT_ORDER = ["air", "water", "earth", "fire"] as const;

export default function CollectionDeckEditor({
  deckId,
  cards,
  onUpdate,
}: CollectionDeckEditorProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [showImages, setShowImages] = useState(true);

  // Group cards by zone
  const spellbook = cards.filter((c) => c.zone === "Spellbook");
  const atlas = cards.filter((c) => c.zone === "Atlas");
  const sideboard = cards.filter((c) => c.zone === "Sideboard");
  const collection = cards.filter((c) => c.zone === "Collection");

  const searchOwnedCards = async (query: string) => {
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }

    setSearching(true);
    try {
      // Search in collection
      const res = await fetch(
        `/api/collection?search=${encodeURIComponent(query)}&limit=50`
      );
      if (res.ok) {
        const data = await res.json();

        // Consolidate duplicates by cardId
        const cardMap = new Map<number, SearchResult>();

        for (const c of data.cards as Array<{
          cardId: number;
          card: { name: string };
          variant?: { slug: string };
          set?: { name: string };
          quantity: number;
          meta?: {
            type?: string;
            cost?: number;
            thresholds?: Record<string, number>;
          };
        }>) {
          const existing = cardMap.get(c.cardId);
          const inDeck = cards
            .filter((dc) => dc.cardId === c.cardId)
            .reduce((sum, dc) => sum + dc.count, 0);

          if (existing) {
            // Add quantity to existing entry
            existing.owned += c.quantity;
          } else {
            // Create new entry
            cardMap.set(c.cardId, {
              cardId: c.cardId,
              name: c.card.name,
              owned: c.quantity,
              inDeck,
              slug: getImageSlug(c.variant?.slug, c.card.name, c.set?.name),
              type: c.meta?.type || "",
              cost: c.meta?.cost ?? null,
              thresholds: (c.meta?.thresholds as Record<string, number>) || {},
            });
          }
        }

        setSearchResults(Array.from(cardMap.values()));
      }
    } catch {
      // Ignore errors
    } finally {
      setSearching(false);
    }
  };

  // Auto-detect zone based on card type
  const getAutoZone = (type: string): string => {
    const t = type.toLowerCase();
    if (t.includes("site")) return "Atlas";
    if (t.includes("avatar")) return "Avatar";
    return "Spellbook";
  };

  const addCardToDeck = async (
    cardId: number,
    zone: string,
    searchResult?: SearchResult
  ) => {
    setUpdating(true);
    try {
      // Check if card already exists in THIS zone
      const existingCardInZone = cards.find(
        (c) => c.cardId === cardId && c.zone === zone
      );

      let newCards;
      if (existingCardInZone) {
        // Increment count in the same zone
        newCards = cards.map((c) =>
          c.cardId === cardId && c.zone === zone
            ? { ...c, count: c.count + 1 }
            : c
        );
      } else {
        // Add new entry for this zone with slug/meta from search
        newCards = [
          ...cards,
          {
            cardId,
            variantId: null,
            zone,
            count: 1,
            name: searchResult?.name || "",
            slug: searchResult?.slug,
            meta: searchResult
              ? {
                  type: searchResult.type,
                  cost: searchResult.cost ?? undefined,
                  thresholds: searchResult.thresholds,
                }
              : undefined,
            ownedQuantity: searchResult?.owned || 0,
            availableQuantity: 0,
          },
        ];
      }

      const res = await fetch(`/api/collection/decks/${deckId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cards: newCards.map((c) => ({
            cardId: c.cardId,
            variantId: c.variantId,
            zone: c.zone,
            count: c.count,
          })),
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        alert(data.error || "Failed to add card");
        return;
      }

      onUpdate();
      setSearchQuery("");
      setSearchResults([]);
    } catch {
      alert("Failed to add card");
    } finally {
      setUpdating(false);
    }
  };

  const removeCardFromDeck = async (cardId: number) => {
    setUpdating(true);
    try {
      const newCards = cards
        .map((c) => (c.cardId === cardId ? { ...c, count: c.count - 1 } : c))
        .filter((c) => c.count > 0);

      const res = await fetch(`/api/collection/decks/${deckId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cards: newCards.map((c) => ({
            cardId: c.cardId,
            variantId: c.variantId,
            zone: c.zone,
            count: c.count,
          })),
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        alert(data.error || "Failed to remove card");
        return;
      }

      onUpdate();
    } catch {
      alert("Failed to remove card");
    } finally {
      setUpdating(false);
    }
  };

  const renderCardList = (cardList: DeckCard[], zoneName: string) => (
    <div className="space-y-1">
      {cardList.map((card) => {
        const exceeded = card.count > card.ownedQuantity;
        const isSite = card.meta?.type?.toLowerCase().includes("site");
        const thresholds =
          (card.meta?.thresholds as Record<string, number>) || {};
        const cost = card.meta?.cost;
        // Use pre-computed slug from search results
        const imageSlug = card.slug;

        return (
          <div
            key={card.cardId}
            className={`flex items-start gap-3 p-2 rounded ${
              exceeded
                ? "bg-red-900/30 ring-1 ring-red-500/30"
                : "bg-gray-800/80"
            }`}
          >
            {/* Card Image */}
            {showImages && (
              <div
                className={`relative flex-none rounded overflow-hidden ring-1 ring-white/10 bg-black/40 ${
                  isSite ? "aspect-[4/3] w-14" : "aspect-[3/4] w-12"
                }`}
              >
                <Image
                  src={`/api/images/${imageSlug}`}
                  alt={card.name}
                  fill
                  className={
                    isSite ? "object-contain rotate-90" : "object-cover"
                  }
                  sizes="56px"
                  unoptimized
                />
              </div>
            )}

            {/* Card Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-1">
                <div className="font-medium text-sm truncate" title={card.name}>
                  {card.name}
                </div>
                <span className="text-gray-400 text-sm flex-none">
                  ×{card.count}
                </span>
              </div>

              {/* Thresholds and Cost */}
              <div className="mt-1 flex items-center flex-wrap gap-2">
                {ELEMENT_ORDER.map((el) =>
                  thresholds[el] ? (
                    <span
                      key={el}
                      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-white/10"
                    >
                      <Image
                        src={`/api/assets/${el}.png`}
                        alt={el}
                        width={14}
                        height={14}
                      />
                      <span className="text-xs font-medium">
                        {thresholds[el]}
                      </span>
                    </span>
                  ) : null
                )}
                {cost != null && !isSite && (
                  <span className="ml-auto">
                    {cost >= 0 && cost <= 9 ? (
                      <NumberBadge
                        value={cost as Digit}
                        size={20}
                        strokeWidth={8}
                      />
                    ) : (
                      <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-white text-black text-xs font-bold">
                        {cost}
                      </span>
                    )}
                  </span>
                )}
              </div>

              {/* Ownership warning */}
              {exceeded && (
                <div className="text-red-400 text-[10px] mt-0.5">
                  Only own {card.ownedQuantity}
                </div>
              )}
            </div>

            {/* Remove button */}
            <button
              onClick={() => removeCardFromDeck(card.cardId)}
              disabled={updating}
              className="text-red-400 hover:text-red-300 px-1 text-lg leading-none self-center"
            >
              −
            </button>
          </div>
        );
      })}
      {cardList.length === 0 && (
        <div className="text-gray-500 text-sm py-4 text-center">
          No cards in {zoneName}
        </div>
      )}
    </div>
  );

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Add Cards Panel */}
      <div className="lg:col-span-1 space-y-4">
        <h3 className="font-bold">Add Cards from Collection</h3>
        <input
          type="text"
          placeholder="Search your collection..."
          value={searchQuery}
          onChange={(e) => {
            setSearchQuery(e.target.value);
            searchOwnedCards(e.target.value);
          }}
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2"
        />

        {searching ? (
          <div className="text-center py-4 text-gray-400">Searching...</div>
        ) : searchResults.length > 0 ? (
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {searchResults.map((card, index) => {
              const available = card.owned - card.inDeck;
              const autoZone = getAutoZone(card.type);
              const isSite = card.type.toLowerCase().includes("site");
              const isAvatar = card.type.toLowerCase().includes("avatar");

              return (
                <div
                  key={`${card.cardId}-${index}`}
                  className="flex items-start gap-2 p-2 bg-gray-800/80 rounded"
                >
                  {/* Card Image */}
                  <div
                    className={`relative flex-none rounded overflow-hidden ring-1 ring-white/10 bg-black/40 ${
                      isSite ? "aspect-[4/3] w-10" : "aspect-[3/4] w-8"
                    }`}
                  >
                    <Image
                      src={`/api/images/${card.slug}`}
                      alt={card.name}
                      fill
                      className={
                        isSite ? "object-contain rotate-90" : "object-cover"
                      }
                      sizes="40px"
                      unoptimized
                    />
                  </div>

                  {/* Card Info */}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">
                      {card.name}
                    </div>
                    <div className="text-[10px] text-gray-400">
                      Own: {card.owned} | In deck: {card.inDeck}
                    </div>
                    {/* Thresholds and Cost */}
                    <div className="mt-0.5 flex items-center flex-wrap gap-1">
                      {ELEMENT_ORDER.map((el) =>
                        card.thresholds[el] ? (
                          <span
                            key={el}
                            className="inline-flex items-center gap-0.5 px-1 py-0.5 rounded bg-white/10"
                          >
                            <Image
                              src={`/api/assets/${el}.png`}
                              alt={el}
                              width={10}
                              height={10}
                            />
                            <span className="text-[9px]">
                              {card.thresholds[el]}
                            </span>
                          </span>
                        ) : null
                      )}
                      {card.cost != null && !isSite && (
                        <span className="ml-auto">
                          {card.cost >= 0 && card.cost <= 9 ? (
                            <NumberBadge
                              value={card.cost as Digit}
                              size={12}
                              strokeWidth={5}
                            />
                          ) : (
                            <span className="inline-flex items-center justify-center w-3 h-3 rounded-full bg-white text-black text-[8px] font-bold">
                              {card.cost}
                            </span>
                          )}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Add Buttons */}
                  {available > 0 ? (
                    <div className="flex flex-col gap-1">
                      <button
                        onClick={() =>
                          addCardToDeck(card.cardId, autoZone, card)
                        }
                        disabled={updating}
                        className={`px-2 py-1 rounded text-xs font-medium ${
                          isAvatar
                            ? "bg-purple-600 hover:bg-purple-700"
                            : isSite
                            ? "bg-green-600 hover:bg-green-700"
                            : "bg-blue-600 hover:bg-blue-700"
                        }`}
                      >
                        + {isAvatar ? "Avatar" : isSite ? "Atlas" : "Spell"}
                      </button>
                      {!isAvatar && (
                        <button
                          onClick={() =>
                            addCardToDeck(card.cardId, "Collection", card)
                          }
                          disabled={updating}
                          className="px-2 py-1 rounded text-xs font-medium bg-amber-600/80 hover:bg-amber-600"
                        >
                          + Collection
                        </button>
                      )}
                    </div>
                  ) : (
                    <span className="text-gray-500 text-xs">All used</span>
                  )}
                </div>
              );
            })}
          </div>
        ) : searchQuery.trim() ? (
          <div className="text-gray-400 text-sm py-4">
            No cards found in your collection
          </div>
        ) : null}
      </div>

      {/* Spellbook */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-bold">
            Spellbook ({spellbook.reduce((s, c) => s + c.count, 0)})
          </h3>
          <label className="flex items-center gap-1.5 text-xs text-gray-400 cursor-pointer">
            <input
              type="checkbox"
              checked={showImages}
              onChange={(e) => setShowImages(e.target.checked)}
              className="w-3 h-3 rounded"
            />
            Images
          </label>
        </div>
        {renderCardList(spellbook, "Spellbook")}
      </div>

      {/* Atlas */}
      <div className="space-y-3">
        <h3 className="font-bold">
          Atlas ({atlas.reduce((s, c) => s + c.count, 0)})
        </h3>
        {renderCardList(atlas, "Atlas")}

        {sideboard.length > 0 && (
          <>
            <h3 className="font-bold mt-6">
              Sideboard ({sideboard.reduce((s, c) => s + c.count, 0)})
            </h3>
            {renderCardList(sideboard, "Sideboard")}
          </>
        )}

        {/* Collection zone - max 10 cards for constructed */}
        <div className="mt-6 p-3 bg-amber-900/20 rounded-lg border border-amber-700/30">
          <h3 className="font-bold text-amber-200">
            Collection ({collection.reduce((s, c) => s + c.count, 0)}/10)
          </h3>
          {collection.length > 0 ? (
            renderCardList(collection, "Collection")
          ) : (
            <div className="text-amber-400/50 text-sm py-2 text-center">
              No cards in collection zone
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
