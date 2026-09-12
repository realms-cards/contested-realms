"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { PanelHeader } from "@/components/ui/page-header";
import { RcButton, RcLinkButton } from "@/components/ui/rc-button";
import { RcEmpty } from "@/components/ui/rc-empty";
import DeckDiff from "../DeckDiff";

interface CollectionDeck {
  id: string;
  name: string;
  cardCount: number;
  isValid: boolean;
  validationErrors: string[];
  avatarCard: { name: string; slug: string | null } | null;
  updatedAt: string;
}

export default function CollectionDecksPage() {
  const [decks, setDecks] = useState<CollectionDeck[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newDeckName, setNewDeckName] = useState("");

  const fetchDecks = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/collection/decks");
      if (res.ok) {
        const data = await res.json();
        setDecks(data.decks || []);
      }
    } catch {
      // Ignore errors
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDecks();
  }, [fetchDecks]);

  const handleCreate = async () => {
    if (!newDeckName.trim()) return;

    setCreating(true);
    try {
      const res = await fetch("/api/collection/decks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newDeckName.trim() }),
      });

      if (res.ok) {
        setNewDeckName("");
        fetchDecks();
      } else {
        const data = await res.json();
        alert(data.error || "Failed to create deck");
      }
    } catch {
      alert("Failed to create deck");
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Delete deck "${name}"?`)) return;

    try {
      const res = await fetch(`/api/collection/decks/${id}`, {
        method: "DELETE",
      });

      if (res.ok) {
        fetchDecks();
      }
    } catch {
      alert("Failed to delete deck");
    }
  };

  return (
    <div className="space-y-6">
      <section className="rc-panel">
        <PanelHeader
          title="Collection Decks"
          meta={loading ? undefined : `${decks.length} decks`}
        >
          <DeckDiff />
        </PanelHeader>

        <div className="space-y-4 px-[18px] py-3.5">
          <p className="m-0 max-w-[68ch] text-sm leading-relaxed text-rc-fg-muted">
            Build decks using only cards you own. Compare any deck against your
            collection to see which cards you&apos;re missing.
          </p>

          {/* Create New Deck */}
          <div className="flex flex-wrap gap-2">
            <input
              type="text"
              placeholder="New deck name..."
              value={newDeckName}
              onChange={(e) => setNewDeckName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
              className="rc-input h-10 min-w-0 flex-1"
            />
            <RcButton
              onClick={handleCreate}
              disabled={creating || !newDeckName.trim()}
            >
              {creating ? "Creating..." : "Create Deck"}
            </RcButton>
          </div>
        </div>
      </section>

      {/* Deck List */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-20 animate-pulse rounded-rc-md border border-rc-line/12 bg-black/30"
            />
          ))}
        </div>
      ) : decks.length > 0 ? (
        <section className="rc-panel">
          {decks.map((deck) => (
            <div
              key={deck.id}
              className="flex flex-wrap items-center gap-4 border-b border-rc-line/8 px-[18px] py-3 transition-colors last:border-b-0 hover:bg-rc-accent/6"
            >
              {/* Deck Info */}
              <div className="min-w-0 flex-1">
                <div
                  className="truncate font-rc-display text-[19px] leading-[1.1] text-rc-fg-strong"
                  title={deck.name}
                >
                  {deck.name}
                </div>
                <div className="truncate rc-hint">
                  <span className="rc-stat">{deck.cardCount}</span> cards
                  {deck.avatarCard && ` · ${deck.avatarCard.name}`}
                </div>
                {!deck.isValid && deck.validationErrors[0] && (
                  <div className="mt-0.5 truncate font-rc-mono text-[11px] tracking-[0.1em] text-rc-warning">
                    {deck.validationErrors[0]}
                  </div>
                )}
              </div>

              {/* Status */}
              <Badge tone={deck.isValid ? "ok" : "warn"}>
                {deck.isValid ? "Valid" : "Incomplete"}
              </Badge>

              {/* Actions */}
              <div className="flex flex-wrap items-center gap-2">
                <RcLinkButton
                  variant="outline"
                  size="sm"
                  href={`/collection/decks/${deck.id}`}
                >
                  Edit
                </RcLinkButton>
                <RcButton
                  variant="destructive"
                  size="sm"
                  onClick={() => handleDelete(deck.id, deck.name)}
                >
                  Delete
                </RcButton>
              </div>
            </div>
          ))}
        </section>
      ) : (
        <RcEmpty title="No collection decks yet.">
          create a deck above to get started
        </RcEmpty>
      )}
    </div>
  );
}
