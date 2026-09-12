"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { PanelHeader } from "@/components/ui/page-header";
import { RcButton } from "@/components/ui/rc-button";
import CollectionDeckEditor from "../CollectionDeckEditor";

interface DeckCard {
  cardId: number;
  variantId: number | null;
  name: string;
  zone: string;
  count: number;
  ownedQuantity: number;
  availableQuantity: number;
  slug?: string;
  meta?: {
    type?: string;
    cost?: number;
    thresholds?: Record<string, number>;
  } | null;
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
    collectionCount: number;
    sideboardCount: number;
    avatarCount: number;
    hasAvatar: boolean;
  };
  requirements?: {
    minSpellbook: number;
    minAtlas: number;
    maxCollection: number | null;
    avatarCount: number;
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
    return <div className="rc-hint py-6 text-center">loading…</div>;
  }

  if (error) {
    return (
      <div className="space-y-4">
        <div className="rc-alert" data-tone="danger">
          {error}
        </div>
        <Link href="/collection/decks" className="rc-link text-sm">
          ← Back to decks
        </Link>
      </div>
    );
  }

  if (!deck) return null;

  return (
    <div className="space-y-6">
      <Link href="/collection/decks" className="rc-link text-sm">
        ← Back to decks
      </Link>

      <section className="rc-panel">
        <PanelHeader
          title={deck.name}
          meta={`${deck.stats.spellbookCount + deck.stats.atlasCount} cards`}
        >
          <RcButton
            onClick={handleExport}
            disabled={exporting || !deck.validation.isValid}
          >
            {exporting ? "Exporting..." : "Export to Simulator"}
          </RcButton>
        </PanelHeader>

        {/* Stats Bar */}
        <div className="flex flex-wrap gap-2 px-[18px] py-3.5">
          <Badge tone={deck.stats.hasAvatar ? "ok" : "warn"}>
            Avatar {deck.stats.avatarCount}/
            {deck.requirements?.avatarCount ?? 1}
          </Badge>
          <Badge
            tone={
              deck.stats.spellbookCount >=
              (deck.requirements?.minSpellbook ?? 50)
                ? "ok"
                : "warn"
            }
          >
            Spellbook {deck.stats.spellbookCount}/
            {deck.requirements?.minSpellbook ?? 50}
          </Badge>
          <Badge
            tone={
              deck.stats.atlasCount >= (deck.requirements?.minAtlas ?? 30)
                ? "ok"
                : "warn"
            }
          >
            Atlas {deck.stats.atlasCount}/{deck.requirements?.minAtlas ?? 30}
          </Badge>
          {(deck.requirements?.maxCollection ?? 0) > 0 && (
            <Badge
              tone={
                deck.stats.collectionCount <=
                (deck.requirements?.maxCollection ?? 10)
                  ? "default"
                  : "warn"
              }
            >
              Collection {deck.stats.collectionCount}/
              {deck.requirements?.maxCollection ?? 10}
            </Badge>
          )}
          {deck.stats.sideboardCount > 0 && (
            <Badge>Sideboard {deck.stats.sideboardCount}</Badge>
          )}
        </div>
      </section>

      {/* Validation Errors */}
      {deck.validation.errors.length > 0 && (
        <div className="rc-alert" data-tone="danger">
          <div className="mb-2">Validation errors</div>
          <ul className="m-0 list-none space-y-1 p-0">
            {deck.validation.errors.map((err, i) => (
              <li key={i}>· {err.message}</li>
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
