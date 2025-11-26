"use client";

import Image from "next/image";
import { useState } from "react";

interface DeckCard {
  cardId: number;
  variantId: number | null;
  name: string;
  zone: string;
  count: number;
  ownedQuantity: number;
  availableQuantity: number;
}

interface CollectionDeckEditorProps {
  deckId: string;
  cards: DeckCard[];
  onUpdate: () => void;
}

export default function CollectionDeckEditor({
  deckId,
  cards,
  onUpdate,
}: CollectionDeckEditorProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<
    Array<{
      cardId: number;
      name: string;
      owned: number;
      inDeck: number;
      slug: string;
    }>
  >([]);
  const [searching, setSearching] = useState(false);
  const [updating, setUpdating] = useState(false);

  // Group cards by zone
  const spellbook = cards.filter((c) => c.zone === "Spellbook");
  const atlas = cards.filter((c) => c.zone === "Atlas");
  const sideboard = cards.filter((c) => c.zone === "Sideboard");

  const searchOwnedCards = async (query: string) => {
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }

    setSearching(true);
    try {
      // Search in collection
      const res = await fetch(
        `/api/collection?search=${encodeURIComponent(query)}&limit=20`
      );
      if (res.ok) {
        const data = await res.json();
        const results = data.cards.map(
          (c: {
            cardId: number;
            card: { name: string };
            variant?: { slug: string };
            quantity: number;
          }) => {
            const inDeck = cards
              .filter((dc) => dc.cardId === c.cardId)
              .reduce((sum, dc) => sum + dc.count, 0);
            return {
              cardId: c.cardId,
              name: c.card.name,
              owned: c.quantity,
              inDeck,
              slug:
                c.variant?.slug ||
                `${c.card.name.toLowerCase().replace(/\s+/g, "_")}_b_s`,
            };
          }
        );
        setSearchResults(results);
      }
    } catch {
      // Ignore errors
    } finally {
      setSearching(false);
    }
  };

  const addCardToDeck = async (cardId: number, zone: string) => {
    setUpdating(true);
    try {
      // Get current deck cards and add the new one
      const existingCard = cards.find((c) => c.cardId === cardId);
      const newCards = existingCard
        ? cards.map((c) =>
            c.cardId === cardId ? { ...c, count: c.count + 1 } : c
          )
        : [...cards, { cardId, variantId: null, zone, count: 1 }];

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
    <div className="space-y-2">
      {cardList.map((card) => {
        const exceeded = card.count > card.ownedQuantity;
        return (
          <div
            key={card.cardId}
            className={`flex items-center gap-2 p-2 rounded ${
              exceeded ? "bg-red-900/30" : "bg-gray-800"
            }`}
          >
            <span className="text-gray-400 w-6">{card.count}×</span>
            <span className="flex-1 truncate">{card.name}</span>
            {exceeded && (
              <span className="text-red-400 text-xs">
                Own: {card.ownedQuantity}
              </span>
            )}
            <button
              onClick={() => removeCardFromDeck(card.cardId)}
              disabled={updating}
              className="text-red-400 hover:text-red-300 px-2"
            >
              −
            </button>
          </div>
        );
      })}
      {cardList.length === 0 && (
        <div className="text-gray-500 text-sm py-2">No cards in {zoneName}</div>
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
            {searchResults.map((card) => {
              const available = card.owned - card.inDeck;
              return (
                <div
                  key={card.cardId}
                  className="flex items-center gap-2 p-2 bg-gray-800 rounded"
                >
                  <div className="w-8 h-11 relative rounded overflow-hidden flex-shrink-0">
                    <Image
                      src={`/api/assets/cards/${card.slug}.webp`}
                      alt={card.name}
                      fill
                      className="object-cover"
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm truncate">{card.name}</div>
                    <div className="text-xs text-gray-400">
                      Own: {card.owned} | In deck: {card.inDeck}
                    </div>
                  </div>
                  {available > 0 ? (
                    <div className="flex gap-1">
                      <button
                        onClick={() => addCardToDeck(card.cardId, "Spellbook")}
                        disabled={updating}
                        className="px-2 py-1 bg-blue-600 hover:bg-blue-700 rounded text-xs"
                      >
                        +Spell
                      </button>
                      <button
                        onClick={() => addCardToDeck(card.cardId, "Atlas")}
                        disabled={updating}
                        className="px-2 py-1 bg-green-600 hover:bg-green-700 rounded text-xs"
                      >
                        +Atlas
                      </button>
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
      <div className="space-y-4">
        <h3 className="font-bold">
          Spellbook ({spellbook.reduce((s, c) => s + c.count, 0)})
        </h3>
        {renderCardList(spellbook, "Spellbook")}
      </div>

      {/* Atlas */}
      <div className="space-y-4">
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
      </div>
    </div>
  );
}
