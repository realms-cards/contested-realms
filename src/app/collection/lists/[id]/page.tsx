"use client";

import Image from "next/image";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { RcButton, RcLinkButton } from "@/components/ui/rc-button";
import { RcDialog } from "@/components/ui/rc-dialog";
import { RcEmpty } from "@/components/ui/rc-empty";
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
        <div className="h-8 w-64 animate-pulse rounded-rc-md border border-rc-line/12 bg-black/30" />
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {Array.from({ length: 10 }).map((_, i) => (
            <div
              key={i}
              className="aspect-[2.5/3.5] animate-pulse rounded-rc-md border border-rc-line/12 bg-black/30"
            />
          ))}
        </div>
      </div>
    );
  }

  if (error || !list) {
    return (
      <div className="space-y-4">
        <div className="rc-alert" data-tone="danger">
          {error || "List not found"}
        </div>
        <Link href="/collection/lists" className="rc-link text-sm">
          ← Back to Lists
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Link href="/collection/lists" className="rc-link text-sm">
        ← Back to Lists
      </Link>

      <section className="rc-panel">
        <div className="rc-panel-head">
          <div className="min-w-0">
            {editingName && list.isOwner ? (
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="rc-input h-10 w-full max-w-sm"
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
            ) : (
              <h2
                className={`m-0 truncate font-rc-display text-[26px] leading-none text-rc-fg-strong ${
                  list.isOwner ? "cursor-pointer hover:text-rc-accent-ring" : ""
                }`}
                onClick={() => list.isOwner && setEditingName(true)}
                title={list.isOwner ? "Click to edit" : undefined}
              >
                {list.name}
              </h2>
            )}
          </div>
          <div className="flex-1" />

          <div className="flex flex-wrap items-center gap-2">
            {/* Share button - always visible for public lists */}
            {list.isPublic && (
              <RcButton variant="outline" size="sm" onClick={handleShare}>
                Share
              </RcButton>
            )}

            {/* Add Cards - owner only */}
            {list.isOwner && (
              <>
                <RcLinkButton
                  variant="outline"
                  size="sm"
                  href={`/collection/lists/${listId}/scan`}
                >
                  Scan
                </RcLinkButton>
                <RcButton size="sm" onClick={() => setShowAddCard(true)}>
                  Add Cards
                </RcButton>
              </>
            )}

            {/* Export dropdown - available to everyone */}
            <div className="group relative">
              <RcButton variant="outline" size="sm">
                Export
              </RcButton>
              <div className="rc-panel invisible absolute right-0 top-full z-10 mt-1 min-w-[140px] py-1 opacity-0 transition-all group-hover:visible group-hover:opacity-100">
                <button
                  type="button"
                  onClick={handleCopyToClipboard}
                  className="w-full cursor-pointer px-4 py-2 text-left font-rc-mono text-xs tracking-[0.1em] text-rc-fg-muted transition-colors hover:bg-rc-accent/6 hover:text-rc-fg-strong"
                >
                  Copy
                </button>
                <button
                  type="button"
                  onClick={() => handleExport("text")}
                  className="w-full cursor-pointer px-4 py-2 text-left font-rc-mono text-xs tracking-[0.1em] text-rc-fg-muted transition-colors hover:bg-rc-accent/6 hover:text-rc-fg-strong"
                >
                  Text
                </button>
                <button
                  type="button"
                  onClick={() => handleExport("csv")}
                  className="w-full cursor-pointer px-4 py-2 text-left font-rc-mono text-xs tracking-[0.1em] text-rc-fg-muted transition-colors hover:bg-rc-accent/6 hover:text-rc-fg-strong"
                >
                  CSV
                </button>
                <button
                  type="button"
                  onClick={() => handleExport("json")}
                  className="w-full cursor-pointer px-4 py-2 text-left font-rc-mono text-xs tracking-[0.1em] text-rc-fg-muted transition-colors hover:bg-rc-accent/6 hover:text-rc-fg-strong"
                >
                  JSON
                </button>
              </div>
            </div>

            {/* Add to Collection button - owner only, when list has cards */}
            {list.isOwner && list.cards.length > 0 && (
              <RcButton
                variant="outline"
                size="sm"
                onClick={handleAddAllToCollection}
                disabled={addingToCollection}
                title="Add all cards from this list to your collection"
              >
                {addingToCollection ? "Adding..." : "Add to Collection"}
              </RcButton>
            )}
          </div>
        </div>

        <div className="space-y-2 px-[18px] py-3.5">
          {list.description && (
            <p className="m-0 max-w-[68ch] text-sm leading-relaxed text-rc-fg-muted">
              {list.description}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <span className="rc-hint">
              <span className="rc-stat">{list.cards.length}</span> cards
            </span>
            {list.isPublic && <Badge tone="ok">Public</Badge>}
            {!list.isOwner && list.ownerName && (
              <span className="rc-hint">by {list.ownerName}</span>
            )}
          </div>
        </div>
      </section>

      {/* Empty State */}
      {list.cards.length === 0 && (
        <RcEmpty
          title="This list is empty."
          action={
            list.isOwner ? (
              <RcButton variant="outline" onClick={() => setShowAddCard(true)}>
                Add Cards
              </RcButton>
            ) : undefined
          }
        >
          {list.isOwner
            ? "add cards from the card browser, or paste a list to import"
            : "no cards in this list"}
        </RcEmpty>
      )}

      {/* Cards Grid */}
      {list.cards.length > 0 && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
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
      className={`group relative overflow-hidden rounded-rc-md border border-rc-line/12 bg-black/30 transition-colors hover:border-rc-accent/40 ${
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
            (e.target as HTMLImageElement).src =
              "/api/assets/cardback_spellbook.png";
          }}
          unoptimized
        />

        {/* Foil Indicator */}
        {isFoil && (
          <div className="absolute right-2 top-2 rounded-rc-sm border border-rc-accent/35 bg-rc-accent/85 px-2 py-0.5 font-rc-mono text-[10px] uppercase tracking-[0.18em] text-rc-accent-fg">
            Foil
          </div>
        )}

        {/* Quantity Badge */}
        <div className="absolute bottom-2 right-2 min-w-[2rem] rounded-rc-sm border border-rc-line/22 bg-black/60 px-2 py-1 text-center font-rc-mono text-[12px] tabular-nums text-rc-fg-strong">
          ×{card.quantity}
        </div>
      </div>

      {/* Card Info */}
      <div className="p-2">
        <div
          className="truncate font-rc-display text-[15px] leading-[1.15] text-rc-fg-strong"
          title={card.card.name}
        >
          {card.card.name}
        </div>
        <div className="flex items-center gap-1 truncate font-rc-mono text-[11px] tracking-[0.1em] text-rc-fg-subtle">
          {card.set?.name || "Unknown Set"}
          {card.meta?.rarity && (
            <span className={`ml-1 ${getRarityColor(card.meta.rarity)}`}>
              · {card.meta.rarity}
            </span>
          )}
        </div>
        {card.notes && (
          <div className="mt-1 truncate rc-hint" title={card.notes}>
            {card.notes}
          </div>
        )}
      </div>

      {/* Hover Actions */}
      {isOwner && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/80 p-2 opacity-0 transition-opacity group-hover:opacity-100">
          <div className="flex items-center gap-2">
            <RcButton
              variant="outline"
              size="icon"
              className="h-7 w-7"
              aria-label="Decrease quantity"
              onClick={() => onUpdateQuantity(card.quantity - 1)}
              disabled={card.quantity <= 1}
            >
              −
            </RcButton>
            <span className="w-8 text-center rc-stat text-lg">
              {card.quantity}
            </span>
            <RcButton
              variant="outline"
              size="icon"
              className="h-7 w-7"
              aria-label="Increase quantity"
              onClick={() => onUpdateQuantity(card.quantity + 1)}
              disabled={card.quantity >= 99}
            >
              +
            </RcButton>
          </div>
          <RcButton
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-[11px] text-rc-danger hover:text-rc-danger-hover"
            onClick={onRemove}
          >
            Remove
          </RcButton>
        </div>
      )}
    </div>
  );
}

function getRarityColor(rarity: string): string {
  switch (rarity.toLowerCase()) {
    case "unique":
      return "text-rc-moonlight";
    case "elite":
      return "text-rc-accent-link";
    case "exceptional":
      return "text-rc-info";
    case "ordinary":
    default:
      return "text-rc-fg-subtle";
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
    <RcDialog
      title="Add Cards to List"
      eyebrow="card lists"
      onClose={onClose}
      size="md"
      actions={
        <>
          <RcButton variant="outline" onClick={onClose}>
            {result ? "Close" : "Cancel"}
          </RcButton>
          {!result && (
            <RcButton
              type="submit"
              form="add-cards-form"
              disabled={submitting || !text.trim()}
            >
              {submitting ? "Adding..." : "Add Cards"}
            </RcButton>
          )}
        </>
      }
    >
      <form id="add-cards-form" onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="rc-field-label mb-1">Card List</label>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={`Enter cards, one per line:\n4 Lightning Bolt\n2x Fireball\nBlack Lotus`}
            className="rc-textarea h-48 w-full resize-none"
            autoFocus
          />
          <p className="m-0 mt-1 rc-hint">
            format: &quot;quantity card name&quot; or just &quot;card name&quot;
          </p>
        </div>

        {error && (
          <div className="rc-alert" data-tone="danger">
            {error}
          </div>
        )}

        {result && (
          <div className="rc-alert" data-tone="success">
            Added {result.added}, updated {result.updated}
          </div>
        )}
      </form>
    </RcDialog>
  );
}
