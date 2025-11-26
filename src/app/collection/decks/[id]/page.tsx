"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import CollectionDeckEditor from "../CollectionDeckEditor";

interface DeckCard {
  cardId: number;
  variantId: number | null;
  name: string;
  zone: string;
  count: number;
  ownedQuantity: number;
  availableQuantity: number;
}

interface DeckData {
  id: string;
  name: string;
  cards: DeckCard[];
  validation: {
    isValid: boolean;
    errors: Array<{ code: string; message: string }>;
  };
  stats: {
    spellbookCount: number;
    atlasCount: number;
    sideboardCount: number;
    hasAvatar: boolean;
  };
}

export default function CollectionDeckEditorPage() {
  const params = useParams();
  const router = useRouter();
  const deckId = params?.id as string;

  const [deck, setDeck] = useState<DeckData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const fetchDeck = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/collection/decks/${deckId}`);
      if (!res.ok) {
        if (res.status === 404) {
          setError("Deck not found");
        } else {
          const data = await res.json();
          setError(data.error || "Failed to load deck");
        }
        return;
      }
      const data = await res.json();
      setDeck(data);
    } catch {
      setError("Failed to load deck");
    } finally {
      setLoading(false);
    }
  }, [deckId]);

  useEffect(() => {
    fetchDeck();
  }, [fetchDeck]);

  const handleExport = async () => {
    if (!deck?.validation.isValid) {
      alert(
        "Cannot export an invalid deck. Please fix validation errors first."
      );
      return;
    }

    setExporting(true);
    try {
      const res = await fetch(`/api/collection/decks/${deckId}/export`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      if (res.ok) {
        const data = await res.json();
        alert(
          `Deck exported! You can now use "${data.name}" in any game mode.`
        );
        router.push("/decks");
      } else {
        const data = await res.json();
        alert(data.error || "Failed to export deck");
      }
    } catch {
      alert("Failed to export deck");
    } finally {
      setExporting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <div className="text-red-400 mb-4">{error}</div>
        <Link
          href="/collection/decks"
          className="text-blue-400 hover:underline"
        >
          ← Back to decks
        </Link>
      </div>
    );
  }

  if (!deck) return null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <Link
            href="/collection/decks"
            className="text-gray-400 hover:text-white text-sm"
          >
            ← Back to decks
          </Link>
          <h1 className="text-2xl font-bold mt-1">{deck.name}</h1>
        </div>
        <button
          onClick={handleExport}
          disabled={exporting || !deck.validation.isValid}
          className="px-6 py-2 bg-green-600 hover:bg-green-700 rounded-lg font-medium disabled:opacity-50"
        >
          {exporting ? "Exporting..." : "Export to Simulator"}
        </button>
      </div>

      {/* Stats Bar */}
      <div className="flex gap-4 flex-wrap">
        <div
          className={`px-3 py-1 rounded text-sm ${
            deck.stats.hasAvatar
              ? "bg-green-900 text-green-300"
              : "bg-red-900 text-red-300"
          }`}
        >
          Avatar: {deck.stats.hasAvatar ? "✓" : "✗"}
        </div>
        <div
          className={`px-3 py-1 rounded text-sm ${
            deck.stats.spellbookCount >= 40
              ? "bg-green-900 text-green-300"
              : "bg-yellow-900 text-yellow-300"
          }`}
        >
          Spellbook: {deck.stats.spellbookCount}/40
        </div>
        <div
          className={`px-3 py-1 rounded text-sm ${
            deck.stats.atlasCount >= 12
              ? "bg-green-900 text-green-300"
              : "bg-yellow-900 text-yellow-300"
          }`}
        >
          Atlas: {deck.stats.atlasCount}/12
        </div>
        {deck.stats.sideboardCount > 0 && (
          <div className="px-3 py-1 rounded text-sm bg-gray-700">
            Sideboard: {deck.stats.sideboardCount}
          </div>
        )}
      </div>

      {/* Validation Errors */}
      {deck.validation.errors.length > 0 && (
        <div className="bg-red-900/30 border border-red-700 rounded-lg p-4">
          <div className="font-medium text-red-300 mb-2">
            Validation Errors:
          </div>
          <ul className="text-sm text-red-200 space-y-1">
            {deck.validation.errors.map((err, i) => (
              <li key={i}>• {err.message}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Deck Editor */}
      <CollectionDeckEditor
        deckId={deckId}
        cards={deck.cards}
        onUpdate={fetchDeck}
      />
    </div>
  );
}
