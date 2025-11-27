"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
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
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">Collection Decks</h2>
        <DeckDiff />
      </div>

      <p className="text-gray-400">
        Build decks using only cards you own. Compare any deck against your
        collection to see which cards you&apos;re missing.
      </p>

      {/* Create New Deck */}
      <div className="flex gap-2">
        <input
          type="text"
          placeholder="New deck name..."
          value={newDeckName}
          onChange={(e) => setNewDeckName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleCreate()}
          className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-4 py-2"
        />
        <button
          onClick={handleCreate}
          disabled={creating || !newDeckName.trim()}
          className="px-6 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg font-medium disabled:opacity-50"
        >
          {creating ? "Creating..." : "Create Deck"}
        </button>
      </div>

      {/* Deck List */}
      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-24 bg-gray-800 rounded-lg animate-pulse"
            />
          ))}
        </div>
      ) : decks.length > 0 ? (
        <div className="space-y-4">
          {decks.map((deck) => (
            <div
              key={deck.id}
              className="bg-gray-800 rounded-lg p-4 flex items-center gap-4"
            >
              {/* Avatar Preview */}
              <div className="w-16 h-22 bg-gray-700 rounded flex-shrink-0 flex items-center justify-center text-2xl">
                {deck.avatarCard ? "🧙" : "❓"}
              </div>

              {/* Deck Info */}
              <div className="flex-1 min-w-0">
                <div className="font-bold truncate">{deck.name}</div>
                <div className="text-sm text-gray-400">
                  {deck.cardCount} cards
                  {deck.avatarCard && ` • ${deck.avatarCard.name}`}
                </div>
                {!deck.isValid && (
                  <div className="text-sm text-yellow-500">
                    ⚠️ {deck.validationErrors[0]}
                  </div>
                )}
              </div>

              {/* Status */}
              <div
                className={`px-3 py-1 rounded text-sm ${
                  deck.isValid
                    ? "bg-green-900 text-green-300"
                    : "bg-yellow-900 text-yellow-300"
                }`}
              >
                {deck.isValid ? "Valid" : "Incomplete"}
              </div>

              {/* Actions */}
              <div className="flex gap-2">
                <Link
                  href={`/collection/decks/${deck.id}`}
                  className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm"
                >
                  Edit
                </Link>
                <button
                  onClick={() => handleDelete(deck.id, deck.name)}
                  className="px-4 py-2 bg-red-900 hover:bg-red-800 rounded-lg text-sm"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-12 bg-gray-800 rounded-lg">
          <div className="text-4xl mb-4">🃏</div>
          <div className="text-gray-400">No collection decks yet</div>
          <div className="text-sm text-gray-500 mt-2">
            Create a deck above to get started
          </div>
        </div>
      )}
    </div>
  );
}
