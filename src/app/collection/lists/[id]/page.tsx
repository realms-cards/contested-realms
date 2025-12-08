"use client";

import Image from "next/image";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { getImageSlug } from "@/lib/utils/cardSlug";

interface ListCard {
  id: number;
  cardId: number;
  variantId: number | null;
  setId: number | null;
  finish: "Standard" | "Foil";
  quantity: number;
  notes: string | null;
  card: {
    name: string;
    elements: string | null;
    subTypes: string | null;
  };
  variant: {
    slug: string;
    finish: string;
    product: string;
  } | null;
  set: { name: string } | null;
  meta: {
    type: string;
    rarity: string;
    cost: number | null;
    attack: number | null;
    defence: number | null;
  } | null;
}

interface CardListDetail {
  id: string;
  name: string;
  description: string | null;
  isPublic: boolean;
  isOwner: boolean;
  ownerName: string | null;
  createdAt: string;
  updatedAt: string;
  cards: ListCard[];
}

export default function ListDetailPage() {
  const params = useParams();
  const listId = (params?.id as string) || "";

  const [list, setList] = useState<CardListDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingName, setEditingName] = useState(false);
  const [newName, setNewName] = useState("");
  const [showAddCard, setShowAddCard] = useState(false);
  const [addingToCollection, setAddingToCollection] = useState(false);

  const fetchList = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/lists/${listId}`);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to load list");
      }
      const data = await res.json();
      setList(data);
      setNewName(data.name);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load list");
    } finally {
      setLoading(false);
    }
  }, [listId]);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  const handleUpdateName = async () => {
    if (!newName.trim() || newName === list?.name) {
      setEditingName(false);
      return;
    }

    try {
      const res = await fetch(`/api/lists/${listId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim() }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to update");
      }
      setList((prev) => (prev ? { ...prev, name: newName.trim() } : null));
      setEditingName(false);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to update name");
    }
  };

  const handleRemoveCard = async (cardId: number) => {
    if (!confirm("Remove this card from the list?")) return;

    try {
      const res = await fetch(`/api/lists/${listId}/cards/${cardId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to remove card");
      }
      setList((prev) =>
        prev
          ? { ...prev, cards: prev.cards.filter((c) => c.id !== cardId) }
          : null
      );
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to remove card");
    }
  };

  const handleUpdateQuantity = async (cardId: number, newQuantity: number) => {
    if (newQuantity <= 0) {
      handleRemoveCard(cardId);
      return;
    }

    try {
      const res = await fetch(`/api/lists/${listId}/cards/${cardId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quantity: newQuantity }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to update quantity");
      }
      setList((prev) =>
        prev
          ? {
              ...prev,
              cards: prev.cards.map((c) =>
                c.id === cardId ? { ...c, quantity: newQuantity } : c
              ),
            }
          : null
      );
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to update quantity");
    }
  };

  const handleExport = (format: "text" | "csv" | "json") => {
    window.open(`/api/lists/${listId}/export?format=${format}`, "_blank");
  };

  const handleCopyToClipboard = async () => {
    if (!list) return;
    const text = list.cards
      .map((c) => `${c.quantity}x ${c.card.name}`)
      .join("\n");
    try {
      await navigator.clipboard.writeText(text);
      alert("Copied to clipboard!");
    } catch {
      alert("Failed to copy");
    }
  };

  const handleShare = async () => {
    const url = window.location.href;

    // Try native share API first (mobile)
    if (navigator.share) {
      try {
        await navigator.share({
          title: list?.name || "Card List",
          text: list?.description || "Check out this card list",
          url,
        });
        return;
      } catch {
        // User cancelled or share failed, fall back to clipboard
      }
    }

    // Fall back to clipboard
    try {
      await navigator.clipboard.writeText(url);
      alert("Link copied to clipboard!");
    } catch {
      // Final fallback: show the URL
      prompt("Copy this link to share:", url);
    }
  };

  const handleAddAllToCollection = async () => {
    if (!list || list.cards.length === 0) return;

    const confirmed = confirm(
      `Add all ${list.cards.length} cards from "${list.name}" to your collection?`
    );
    if (!confirmed) return;

    setAddingToCollection(true);
    try {
      const res = await fetch("/api/collection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cards: list.cards.map((c) => ({
            cardId: c.cardId,
            variantId: c.variantId,
            setId: c.setId,
            finish: c.finish,
            quantity: c.quantity,
          })),
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to add to collection");
      }

      const result = await res.json();
      alert(
        `Added ${result.added?.length || 0} cards, updated ${
          result.updated?.length || 0
        } cards in your collection!`
      );
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to add to collection");
    } finally {
      setAddingToCollection(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-64 bg-gray-800 rounded animate-pulse" />
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {Array.from({ length: 10 }).map((_, i) => (
            <div
              key={i}
              className="aspect-[2.5/3.5] bg-gray-800 rounded-lg animate-pulse"
            />
          ))}
        </div>
      </div>
    );
  }

  if (error || !list) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-4">
        <div className="text-red-400 text-xl">{error || "List not found"}</div>
        <Link
          href="/collection/lists"
          className="text-blue-400 hover:underline"
        >
          ← Back to Lists
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="space-y-1">
          <Link
            href="/collection/lists"
            className="text-sm text-gray-400 hover:text-white"
          >
            ← Back to Lists
          </Link>

          {editingName && list.isOwner ? (
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="text-2xl font-bold bg-gray-800 border border-gray-600 rounded px-2 py-1"
                autoFocus
                onBlur={handleUpdateName}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleUpdateName();
                  if (e.key === "Escape") {
                    setNewName(list.name);
                    setEditingName(false);
                  }
                }}
              />
            </div>
          ) : (
            <h1
              className={`text-2xl font-bold ${
                list.isOwner ? "cursor-pointer hover:text-blue-400" : ""
              }`}
              onClick={() => list.isOwner && setEditingName(true)}
              title={list.isOwner ? "Click to edit" : undefined}
            >
              {list.name}
            </h1>
          )}

          {list.description && (
            <p className="text-gray-400">{list.description}</p>
          )}

          <div className="flex items-center gap-3 text-sm text-gray-500">
            <span>{list.cards.length} cards</span>
            {list.isPublic && (
              <span className="px-2 py-0.5 bg-green-600/20 text-green-400 rounded">
                Public
              </span>
            )}
            {!list.isOwner && list.ownerName && (
              <span>by {list.ownerName}</span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Share button - always visible for public lists */}
          {list.isPublic && (
            <button
              onClick={handleShare}
              className="px-4 py-2 bg-green-600 hover:bg-green-700 rounded-lg text-sm font-medium transition-colors"
            >
              🔗 Share
            </button>
          )}

          {/* Add Cards - owner only */}
          {list.isOwner && (
            <>
              <Link
                href={`/collection/lists/${listId}/scan`}
                className="px-4 py-2 bg-cyan-600 hover:bg-cyan-700 rounded-lg text-sm font-medium transition-colors"
              >
                📷 Scan
              </Link>
              <button
                onClick={() => setShowAddCard(true)}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm font-medium transition-colors"
              >
                + Add Cards
              </button>
            </>
          )}

          {/* Export dropdown - available to everyone */}
          <div className="relative group">
            <button className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm font-medium transition-colors">
              📤 Export
            </button>
            <div className="absolute right-0 top-full mt-1 bg-gray-800 rounded-lg shadow-lg py-1 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10 min-w-[120px]">
              <button
                onClick={handleCopyToClipboard}
                className="w-full px-4 py-2 text-left text-sm hover:bg-gray-700"
              >
                📋 Copy
              </button>
              <button
                onClick={() => handleExport("text")}
                className="w-full px-4 py-2 text-left text-sm hover:bg-gray-700"
              >
                📄 Text
              </button>
              <button
                onClick={() => handleExport("csv")}
                className="w-full px-4 py-2 text-left text-sm hover:bg-gray-700"
              >
                📊 CSV
              </button>
              <button
                onClick={() => handleExport("json")}
                className="w-full px-4 py-2 text-left text-sm hover:bg-gray-700"
              >
                🔧 JSON
              </button>
            </div>
          </div>

          {/* Add to Collection button - owner only, when list has cards */}
          {list.isOwner && list.cards.length > 0 && (
            <button
              onClick={handleAddAllToCollection}
              disabled={addingToCollection}
              className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 rounded-lg text-sm font-medium transition-colors"
              title="Add all cards from this list to your collection"
            >
              {addingToCollection ? "Adding..." : "📦 Add to Collection"}
            </button>
          )}
        </div>
      </div>

      {/* Empty State */}
      {list.cards.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 gap-4 text-center">
          <div className="text-5xl">📋</div>
          <h3 className="text-xl font-bold">This list is empty</h3>
          {list.isOwner && (
            <>
              <p className="text-gray-400 max-w-md">
                Add cards from the card browser, or paste a list to import.
              </p>
              <button
                onClick={() => setShowAddCard(true)}
                className="px-6 py-3 bg-blue-600 hover:bg-blue-700 rounded-lg font-medium transition-colors"
              >
                Add Cards
              </button>
            </>
          )}
        </div>
      )}

      {/* Cards Grid */}
      {list.cards.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          {list.cards.map((card) => (
            <ListCardItem
              key={card.id}
              card={card}
              isOwner={list.isOwner}
              onRemove={() => handleRemoveCard(card.id)}
              onUpdateQuantity={(qty) => handleUpdateQuantity(card.id, qty)}
            />
          ))}
        </div>
      )}

      {/* Add Card Modal */}
      {showAddCard && (
        <AddCardModal
          listId={listId}
          onClose={() => setShowAddCard(false)}
          onAdded={fetchList}
        />
      )}
    </div>
  );
}

// Card Item Component
function ListCardItem({
  card,
  isOwner,
  onRemove,
  onUpdateQuantity,
}: {
  card: ListCard;
  isOwner: boolean;
  onRemove: () => void;
  onUpdateQuantity: (qty: number) => void;
}) {
  const imageSlug = getImageSlug(
    card.variant?.slug,
    card.card.name,
    card.set?.name
  );
  const imageUrl = `/api/images/${imageSlug}`;

  const isFoil = card.finish === "Foil";
  const isSite = card.meta?.type?.toLowerCase().includes("site") || false;

  return (
    <div
      className={`relative group rounded-lg overflow-hidden bg-gray-800 ${
        isSite ? "col-span-2" : ""
      } ${isFoil ? "foil-card" : ""}`}
      style={
        isFoil
          ? {
              boxShadow: `
                0 0 0 2px rgba(255,255,255,0.15),
                0 0 10px 2px rgba(255,215,0,0.4)
              `,
            }
          : undefined
      }
    >
      {/* Card Image */}
      <div
        className={
          isSite
            ? "aspect-[3.5/2.5] relative bg-black"
            : "aspect-[2.5/3.5] relative"
        }
      >
        <Image
          src={imageUrl}
          alt={card.card.name}
          fill
          className={isSite ? "object-contain rotate-90" : "object-cover"}
          sizes="(max-width: 640px) 50vw, (max-width: 768px) 33vw, (max-width: 1024px) 25vw, 16vw"
          onError={(e) => {
            (e.target as HTMLImageElement).src = "/placeholder-card.png";
          }}
        />

        {/* Foil Indicator */}
        {isFoil && (
          <div className="absolute top-2 right-2 bg-yellow-500 text-black text-xs px-2 py-0.5 rounded font-bold">
            FOIL
          </div>
        )}

        {/* Quantity Badge */}
        <div className="absolute bottom-2 right-2 bg-black/80 text-white px-2 py-1 rounded-full text-sm font-bold min-w-[2rem] text-center">
          ×{card.quantity}
        </div>
      </div>

      {/* Card Info */}
      <div className="p-2">
        <div className="text-sm font-medium truncate" title={card.card.name}>
          {card.card.name}
        </div>
        <div className="text-xs text-gray-400 flex items-center gap-1">
          {card.set?.name || "Unknown Set"}
          {card.meta?.rarity && (
            <span className={`ml-1 ${getRarityColor(card.meta.rarity)}`}>
              • {card.meta.rarity}
            </span>
          )}
        </div>
        {card.notes && (
          <div
            className="text-xs text-gray-500 mt-1 truncate"
            title={card.notes}
          >
            📝 {card.notes}
          </div>
        )}
      </div>

      {/* Hover Actions */}
      {isOwner && (
        <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center gap-2 p-2 opacity-0 group-hover:opacity-100 transition-opacity">
          <div className="flex items-center gap-2">
            <button
              onClick={() => onUpdateQuantity(card.quantity - 1)}
              disabled={card.quantity <= 1}
              className="w-8 h-8 bg-gray-700 hover:bg-gray-600 rounded-full font-bold disabled:opacity-50"
            >
              −
            </button>
            <span className="text-xl font-bold w-8 text-center">
              {card.quantity}
            </span>
            <button
              onClick={() => onUpdateQuantity(card.quantity + 1)}
              disabled={card.quantity >= 99}
              className="w-8 h-8 bg-gray-700 hover:bg-gray-600 rounded-full font-bold disabled:opacity-50"
            >
              +
            </button>
          </div>
          <button
            onClick={onRemove}
            className="text-red-400 hover:text-red-300 text-xs underline"
          >
            Remove
          </button>
        </div>
      )}
    </div>
  );
}

function getRarityColor(rarity: string): string {
  switch (rarity.toLowerCase()) {
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

// Add Card Modal
function AddCardModal({
  listId,
  onClose,
  onAdded,
}: {
  listId: string;
  onClose: () => void;
  onAdded: () => void;
}) {
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    added: number;
    updated: number;
    errors: string[];
  } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;

    setSubmitting(true);
    setError(null);
    setResult(null);

    // Parse the text into cards
    const lines = text
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("#"));

    const cardsToAdd: { name: string; quantity: number }[] = [];

    for (const line of lines) {
      const match =
        line.match(/^(\d+)\s*[xX]?\s*(.+)$/) || line.match(/^(.+)$/);
      if (match) {
        const hasQuantity = match.length === 3;
        const quantity = hasQuantity ? parseInt(match[1], 10) : 1;
        const cardName = hasQuantity ? match[2].trim() : match[1].trim();
        if (cardName) {
          cardsToAdd.push({ name: cardName, quantity });
        }
      }
    }

    if (cardsToAdd.length === 0) {
      setError("No valid cards found");
      setSubmitting(false);
      return;
    }

    try {
      // Look up card IDs first
      const cardNames = [
        ...new Set(cardsToAdd.map((c) => c.name.toLowerCase())),
      ];
      const lookupRes = await fetch("/api/cards/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ names: cardNames }),
      });

      let cardMap: Map<
        string,
        { id: number; variantId?: number; setId?: number }
      > = new Map();

      if (lookupRes.ok) {
        const lookupData = await lookupRes.json();
        cardMap = new Map(
          lookupData.cards?.map(
            (c: {
              name: string;
              id: number;
              variantId?: number;
              setId?: number;
            }) => [c.name.toLowerCase(), c]
          ) || []
        );
      }

      // Add cards to list
      const cardsPayload = cardsToAdd
        .map((c) => {
          const found = cardMap.get(c.name.toLowerCase());
          if (!found) return null;
          return {
            cardId: found.id,
            variantId: found.variantId,
            setId: found.setId,
            quantity: c.quantity,
          };
        })
        .filter(Boolean);

      if (cardsPayload.length === 0) {
        setError("No matching cards found in database");
        setSubmitting(false);
        return;
      }

      const res = await fetch(`/api/lists/${listId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cards: cardsPayload }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to add cards");
      }

      const data = await res.json();
      setResult({
        added: data.added,
        updated: data.updated,
        errors: data.errors || [],
      });

      onAdded();

      // Close after delay
      setTimeout(onClose, 1500);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add cards");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 rounded-lg p-6 max-w-lg w-full">
        <h2 className="text-xl font-bold mb-4">Add Cards to List</h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Card List</label>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={`Enter cards, one per line:\n4 Lightning Bolt\n2x Fireball\nBlack Lotus`}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 h-48 resize-none font-mono text-sm"
              autoFocus
            />
            <p className="text-xs text-gray-500 mt-1">
              Format: &quot;quantity card name&quot; or just &quot;card
              name&quot;
            </p>
          </div>

          {error && <div className="text-red-400 text-sm">{error}</div>}

          {result && (
            <div className="bg-gray-800 rounded-lg p-3 text-sm">
              <p className="text-green-400">
                ✓ Added {result.added}, updated {result.updated}
              </p>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors"
            >
              {result ? "Close" : "Cancel"}
            </button>
            {!result && (
              <button
                type="submit"
                disabled={submitting || !text.trim()}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50"
              >
                {submitting ? "Adding..." : "Add Cards"}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
