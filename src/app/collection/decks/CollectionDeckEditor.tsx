"use client";

import Image from "next/image";
import { useState } from "react";
import { NumberBadge } from "@/components/game/manacost";
import type { Digit } from "@/components/game/manacost";
import { PanelHeader } from "@/components/ui/page-header";
import { RcButton } from "@/components/ui/rc-button";
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
            className={`flex items-start gap-3 rounded-rc-md border p-2 transition-colors ${
              exceeded
                ? "border-rc-danger/40 bg-rc-danger/12"
                : "border-rc-line/12 bg-black/30 hover:border-rc-accent/40"
            }`}
          >
            {/* Card Image */}
            {showImages && (
              <div
                className={`relative flex-none overflow-hidden rounded-rc-sm border border-rc-line/12 bg-black/45 ${
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
                <div
                  className="truncate font-rc-display text-[15px] leading-[1.15] text-rc-fg-strong"
                  title={card.name}
                >
                  {card.name}
                </div>
                <span className="flex-none rounded-rc-sm border border-rc-line/22 bg-black/60 px-1.5 font-rc-mono text-[11px] tabular-nums text-rc-fg-strong">
                  ×{card.count}
                </span>
              </div>

              {/* Thresholds and Cost */}
              <div className="mt-1 flex items-center flex-wrap gap-2">
                {ELEMENT_ORDER.map((el) =>
                  thresholds[el] ? (
                    <span
                      key={el}
                      className="inline-flex items-center gap-1 rounded-rc-sm border border-rc-line/22 bg-black/45 px-1.5 py-0.5"
                    >
                      <Image
                        src={`/api/assets/${el}.png`}
                        alt={el}
                        width={14}
                        height={14}
                      />
                      <span className="rc-stat text-xs">{thresholds[el]}</span>
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
                      <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-rc-fg-strong font-rc-mono text-xs text-rc-accent-fg">
                        {cost}
                      </span>
                    )}
                  </span>
                )}
              </div>

              {/* Ownership warning */}
              {exceeded && (
                <div className="mt-0.5 font-rc-mono text-[10px] tracking-[0.1em] text-rc-danger">
                  Only own {card.ownedQuantity}
                </div>
              )}
            </div>

            {/* Remove button */}
            <RcButton
              variant="outline"
              size="icon"
              className="h-7 w-7 self-center"
              aria-label={`Remove one ${card.name}`}
              onClick={() => removeCardFromDeck(card.cardId)}
              disabled={updating}
            >
              −
            </RcButton>
          </div>
        );
      })}
      {cardList.length === 0 && (
        <div className="rc-hint py-4 text-center">
          no cards in {zoneName.toLowerCase()}
        </div>
      )}
    </div>
  );

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      {/* Add Cards Panel */}
      <section className="rc-panel lg:col-span-1">
        <PanelHeader title="Add Cards" meta="from collection" />
        <div className="space-y-3 px-[18px] py-3.5">
          <input
            type="text"
            placeholder="Search your collection..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              searchOwnedCards(e.target.value);
            }}
            className="rc-input h-10 w-full"
          />

          {searching ? (
            <div className="rc-hint py-4 text-center">searching…</div>
          ) : searchResults.length > 0 ? (
            <div className="thin-scrollbar max-h-96 space-y-2 overflow-y-auto">
              {searchResults.map((card, index) => {
                const available = card.owned - card.inDeck;
                const autoZone = getAutoZone(card.type);
                const isSite = card.type.toLowerCase().includes("site");
                const isAvatar = card.type.toLowerCase().includes("avatar");

                return (
                  <div
                    key={`${card.cardId}-${index}`}
                    className="flex items-start gap-2 rounded-rc-md border border-rc-line/12 bg-black/30 p-2 transition-colors hover:border-rc-accent/40"
                  >
                    {/* Card Image */}
                    <div
                      className={`relative flex-none overflow-hidden rounded-rc-sm border border-rc-line/12 bg-black/45 ${
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
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-rc-display text-[15px] leading-[1.15] text-rc-fg-strong">
                        {card.name}
                      </div>
                      <div className="font-rc-mono text-[10px] tracking-[0.1em] text-rc-fg-dim">
                        own {card.owned} · in deck {card.inDeck}
                      </div>
                      {/* Thresholds and Cost */}
                      <div className="mt-0.5 flex flex-wrap items-center gap-1">
                        {ELEMENT_ORDER.map((el) =>
                          card.thresholds[el] ? (
                            <span
                              key={el}
                              className="inline-flex items-center gap-0.5 rounded-rc-sm border border-rc-line/22 bg-black/45 px-1 py-0.5"
                            >
                              <Image
                                src={`/api/assets/${el}.png`}
                                alt={el}
                                width={10}
                                height={10}
                              />
                              <span className="rc-stat text-[9px]">
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
                              <span className="inline-flex h-3 w-3 items-center justify-center rounded-full bg-rc-fg-strong font-rc-mono text-[8px] text-rc-accent-fg">
                                {card.cost}
                              </span>
                            )}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Add Buttons */}
                    {available > 0 ? (
                      <div className="flex flex-none flex-col gap-1">
                        <RcButton
                          variant="outline"
                          size="sm"
                          className="h-7 px-2 text-[11px]"
                          onClick={() =>
                            addCardToDeck(card.cardId, autoZone, card)
                          }
                          disabled={updating}
                        >
                          + {isAvatar ? "Avatar" : isSite ? "Atlas" : "Spell"}
                        </RcButton>
                        {!isAvatar && (
                          <RcButton
                            variant="outline"
                            size="sm"
                            className="h-7 px-2 text-[11px]"
                            onClick={() =>
                              addCardToDeck(card.cardId, "Collection", card)
                            }
                            disabled={updating}
                          >
                            + Collection
                          </RcButton>
                        )}
                      </div>
                    ) : (
                      <span className="rc-hint flex-none">all used</span>
                    )}
                  </div>
                );
              })}
            </div>
          ) : searchQuery.trim() ? (
            <div className="rc-hint py-4">no cards found in your collection</div>
          ) : null}
        </div>
      </section>

      {/* Spellbook */}
      <section className="rc-panel">
        <PanelHeader
          title="Spellbook"
          meta={`${spellbook.reduce((s, c) => s + c.count, 0)} cards`}
        >
          <label className="rc-check">
            <input
              type="checkbox"
              checked={showImages}
              onChange={(e) => setShowImages(e.target.checked)}
            />
            Images
          </label>
        </PanelHeader>
        <div className="px-[18px] py-3.5">
          {renderCardList(spellbook, "Spellbook")}
        </div>
      </section>

      {/* Atlas */}
      <div className="space-y-6">
        <section className="rc-panel">
          <PanelHeader
            title="Atlas"
            meta={`${atlas.reduce((s, c) => s + c.count, 0)} cards`}
          />
          <div className="px-[18px] py-3.5">
            {renderCardList(atlas, "Atlas")}
          </div>
        </section>

        {sideboard.length > 0 && (
          <section className="rc-panel">
            <PanelHeader
              title="Sideboard"
              meta={`${sideboard.reduce((s, c) => s + c.count, 0)} cards`}
            />
            <div className="px-[18px] py-3.5">
              {renderCardList(sideboard, "Sideboard")}
            </div>
          </section>
        )}

        {/* Collection zone - max 10 cards for constructed */}
        <section className="rc-panel">
          <PanelHeader
            title="Collection"
            meta={`${collection.reduce((s, c) => s + c.count, 0)}/10`}
          />
          <div className="px-[18px] py-3.5">
            {collection.length > 0 ? (
              renderCardList(collection, "Collection")
            ) : (
              <div className="rc-hint py-2 text-center">
                no cards in collection zone
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
