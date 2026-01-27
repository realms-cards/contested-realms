"use client";

import Image from "next/image";
import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { CustomSelect } from "@/components/ui/CustomSelect";

interface DeckOption {
  id: string;
  name: string;
  format: string | null;
  cardCount?: number;
}

interface DeckCard {
  cardId: number;
  name: string;
  slug: string | null;
  type: string | null;
  rarity: string | null;
  set: string | null;
  zone: string;
  needed: number;
  owned: number;
  missing: number;
}

interface DiffResult {
  deckName: string;
  totalCards: number;
  uniqueCards: number;
  missingCards: DeckCard[];
  ownedCards: DeckCard[];
  summary: {
    totalMissing: number;
    uniqueMissing: number;
    completionPercent: number;
  };
  unresolved?: string[];
}

function getRarityColor(rarity: string | null): string {
  switch (rarity?.toLowerCase()) {
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

function getRarityBg(rarity: string | null): string {
  switch (rarity?.toLowerCase()) {
    case "unique":
      return "bg-purple-500/20";
    case "elite":
      return "bg-yellow-500/20";
    case "exceptional":
      return "bg-blue-500/20";
    case "ordinary":
    default:
      return "bg-gray-500/20";
  }
}

export default function DeckDiff() {
  const [isOpen, setIsOpen] = useState(false);
  const [mode, setMode] = useState<"simulator" | "text">("simulator");
  const [decks, setDecks] = useState<DeckOption[]>([]);
  const [selectedDeckId, setSelectedDeckId] = useState<string>("");
  const [loadingDecks, setLoadingDecks] = useState(false);
  const [textInput, setTextInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<DiffResult | null>(null);
  const [hoveredCard, setHoveredCard] = useState<DeckCard | null>(null);

  // Fetch user's simulator decks
  const fetchDecks = useCallback(async () => {
    setLoadingDecks(true);
    try {
      const res = await fetch("/api/decks");
      if (res.ok) {
        const data = await res.json();
        const myDecks = (data.myDecks || []).map(
          (d: { id: string; name: string; format: string | null }) => ({
            id: d.id,
            name: d.name,
            format: d.format,
          })
        );
        setDecks(myDecks);
      }
    } catch {
      // Ignore errors
    } finally {
      setLoadingDecks(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen && mode === "simulator" && decks.length === 0) {
      fetchDecks();
    }
  }, [isOpen, mode, decks.length, fetchDecks]);

  // Compare simulator deck
  const compareDeck = async () => {
    if (!selectedDeckId) return;
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch(
        `/api/collection/deck-diff?deckId=${encodeURIComponent(selectedDeckId)}`
      );
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Comparison failed");
      }
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Comparison failed");
    } finally {
      setLoading(false);
    }
  };

  // Parse and compare text input
  const compareText = async () => {
    if (!textInput.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      // Parse text input: "4 Card Name" or "4x Card Name" format
      const lines = textInput.trim().split("\n");
      const cards: Array<{ name: string; count: number }> = [];

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        // Match patterns like "4 Card Name", "4x Card Name", "Card Name"
        const match = trimmed.match(/^(\d+)x?\s+(.+)$/i);
        if (match) {
          cards.push({
            count: parseInt(match[1], 10),
            name: match[2].trim(),
          });
        } else if (trimmed && !trimmed.match(/^[#/]/)) {
          // Single card without count (assume 1)
          cards.push({ count: 1, name: trimmed });
        }
      }

      if (cards.length === 0) {
        throw new Error("No cards found in text");
      }

      const res = await fetch("/api/collection/deck-diff", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ cards, deckName: "Pasted Deck" }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Comparison failed");
      }
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Comparison failed");
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setIsOpen(false);
    setResult(null);
    setError(null);
    setTextInput("");
    setSelectedDeckId("");
  };

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 rounded-lg font-medium transition-all text-sm"
        title="Compare a deck against your collection to see missing cards"
      >
        <span>🔍</span>
        <span>Deck Diff</span>
      </button>

      {isOpen &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="fixed inset-0 bg-black/80 flex items-center justify-center z-[9999] p-4"
            onClick={handleClose}
          >
            <div
              className="bg-gray-900 rounded-xl max-w-4xl w-full overflow-hidden shadow-2xl border border-gray-700 max-h-[90vh] flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="p-4 border-b border-gray-800 flex items-center justify-between flex-shrink-0">
                <div>
                  <h3 className="text-lg font-bold">Deck vs Collection</h3>
                  <p className="text-sm text-gray-400">
                    Compare a deck to see which cards you&apos;re missing
                  </p>
                </div>
                <button
                  onClick={handleClose}
                  className="text-gray-400 hover:text-white p-2"
                >
                  ✕
                </button>
              </div>

              {/* Mode Tabs */}
              {!result && (
                <div className="flex border-b border-gray-800 flex-shrink-0">
                  <button
                    onClick={() => setMode("simulator")}
                    className={`flex-1 py-3 text-sm font-medium transition-colors ${
                      mode === "simulator"
                        ? "bg-gray-800 text-white border-b-2 border-blue-500"
                        : "text-gray-400 hover:text-white"
                    }`}
                  >
                    My Decks
                  </button>
                  <button
                    onClick={() => setMode("text")}
                    className={`flex-1 py-3 text-sm font-medium transition-colors ${
                      mode === "text"
                        ? "bg-gray-800 text-white border-b-2 border-blue-500"
                        : "text-gray-400 hover:text-white"
                    }`}
                  >
                    Paste Text
                  </button>
                </div>
              )}

              {/* Content */}
              <div className="flex-1 overflow-y-auto">
                {result ? (
                  /* Results View */
                  <div className="p-4 space-y-4 relative">
                    {/* Card preview tooltip */}
                    {hoveredCard &&
                      hoveredCard.slug &&
                      (() => {
                        const isSite = hoveredCard.type
                          ?.toLowerCase()
                          .includes("site");
                        return (
                          <div className="fixed right-8 top-1/2 -translate-y-1/2 z-50 pointer-events-none">
                            <div
                              className={`relative rounded-lg overflow-hidden shadow-2xl ring-2 ring-white/20 bg-gray-900 ${
                                isSite
                                  ? "w-[400px] aspect-[7/5]"
                                  : "w-72 aspect-[5/7]"
                              }`}
                            >
                              {isSite ? (
                                <div className="absolute inset-0 flex items-center justify-center">
                                  <div className="w-[286px] h-[400px] relative rotate-90">
                                    <Image
                                      src={`/api/images/${hoveredCard.slug}`}
                                      alt={hoveredCard.name}
                                      fill
                                      className="object-cover rounded"
                                      sizes="400px"
                                      unoptimized
                                    />
                                  </div>
                                </div>
                              ) : (
                                <Image
                                  src={`/api/images/${hoveredCard.slug}`}
                                  alt={hoveredCard.name}
                                  fill
                                  className="object-cover"
                                  sizes="288px"
                                  unoptimized
                                />
                              )}
                            </div>
                          </div>
                        );
                      })()}

                    {/* Back button */}
                    <button
                      onClick={() => setResult(null)}
                      className="text-gray-400 hover:text-white text-sm flex items-center gap-1"
                    >
                      ← Back to selection
                    </button>

                    {/* Summary */}
                    <div className="bg-gray-800/50 rounded-lg p-4">
                      <h4 className="font-bold text-lg mb-2">
                        {result.deckName}
                      </h4>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
                        <div>
                          <div className="text-2xl font-bold">
                            {result.summary.completionPercent}%
                          </div>
                          <div className="text-xs text-gray-400">Complete</div>
                        </div>
                        <div>
                          <div className="text-2xl font-bold text-green-400">
                            {result.totalCards - result.summary.totalMissing}
                          </div>
                          <div className="text-xs text-gray-400">Owned</div>
                        </div>
                        <div>
                          <div className="text-2xl font-bold text-red-400">
                            {result.summary.totalMissing}
                          </div>
                          <div className="text-xs text-gray-400">Missing</div>
                        </div>
                        <div>
                          <div className="text-2xl font-bold">
                            {result.uniqueCards}
                          </div>
                          <div className="text-xs text-gray-400">
                            Unique Cards
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Unresolved names */}
                    {result.unresolved && result.unresolved.length > 0 && (
                      <div className="bg-yellow-900/30 border border-yellow-700 rounded-lg p-3">
                        <div className="text-yellow-400 text-sm font-medium mb-1">
                          ⚠️ Could not find these cards:
                        </div>
                        <div className="text-xs text-yellow-300/80">
                          {result.unresolved.join(", ")}
                        </div>
                      </div>
                    )}

                    {/* Missing Cards */}
                    {result.missingCards.length > 0 && (
                      <div>
                        <h5 className="font-medium mb-2 text-red-400">
                          Missing Cards ({result.summary.uniqueMissing})
                        </h5>
                        <div className="space-y-1">
                          {result.missingCards.map((card) => (
                            <div
                              key={card.cardId}
                              className={`flex items-center justify-between p-2 rounded cursor-pointer hover:bg-gray-700/50 ${getRarityBg(
                                card.rarity
                              )}`}
                              onMouseEnter={() => setHoveredCard(card)}
                              onMouseLeave={() => setHoveredCard(null)}
                            >
                              <div className="flex items-center gap-3">
                                <span
                                  className={`font-medium ${getRarityColor(
                                    card.rarity
                                  )}`}
                                >
                                  {card.name}
                                </span>
                                {card.set && (
                                  <span className="text-xs text-gray-500">
                                    {card.set}
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-3 text-sm">
                                <span className="text-gray-400">
                                  Own: {card.owned}
                                </span>
                                <span className="text-white">
                                  Need: {card.needed}
                                </span>
                                <span className="text-red-400 font-bold">
                                  −{card.missing}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Owned Cards (collapsed by default) */}
                    {result.ownedCards.length > 0 && (
                      <details className="bg-gray-800/30 rounded-lg">
                        <summary className="p-3 cursor-pointer text-green-400 font-medium">
                          ✓ Owned Cards ({result.ownedCards.length})
                        </summary>
                        <div className="p-2 space-y-1">
                          {result.ownedCards.map((card) => (
                            <div
                              key={card.cardId}
                              className="flex items-center justify-between p-2 rounded hover:bg-gray-700/50 text-sm"
                              onMouseEnter={() => setHoveredCard(card)}
                              onMouseLeave={() => setHoveredCard(null)}
                            >
                              <span className={getRarityColor(card.rarity)}>
                                {card.name}
                              </span>
                              <span className="text-gray-400">
                                {card.owned}/{card.needed}
                              </span>
                            </div>
                          ))}
                        </div>
                      </details>
                    )}

                    {/* No missing cards */}
                    {result.missingCards.length === 0 && (
                      <div className="text-center py-8 text-green-400">
                        <div className="text-4xl mb-2">🎉</div>
                        <div className="font-bold">
                          You have all the cards for this deck!
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  /* Input Views */
                  <div className="p-4 space-y-4">
                    {mode === "simulator" && (
                      <>
                        <p className="text-sm text-gray-400">
                          Select one of your simulator decks to compare against
                          your collection.
                        </p>
                        {loadingDecks ? (
                          <div className="flex justify-center py-8">
                            <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full" />
                          </div>
                        ) : decks.length > 0 ? (
                          <div className="space-y-2">
                            <label className="text-sm text-gray-300">
                              Select a deck:
                            </label>
                            <CustomSelect
                              value={selectedDeckId}
                              onChange={(v) => setSelectedDeckId(v)}
                              placeholder="-- Choose a deck --"
                              className="w-full"
                              options={decks.map((d) => ({
                                value: d.id,
                                label: d.name + (d.format ? ` (${d.format})` : ""),
                              }))}
                            />
                            <button
                              onClick={compareDeck}
                              disabled={loading || !selectedDeckId}
                              className="w-full px-4 py-3 bg-blue-600 hover:bg-blue-700 rounded-lg font-medium disabled:opacity-50 flex items-center justify-center gap-2"
                            >
                              {loading && (
                                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                              )}
                              {loading ? "Comparing..." : "Compare Deck"}
                            </button>
                          </div>
                        ) : (
                          <div className="text-center py-8 text-gray-400">
                            <div className="text-4xl mb-2">🃏</div>
                            <div>No simulator decks found</div>
                            <div className="text-sm mt-1">
                              Create a deck in the simulator first, or paste a
                              deck list using the Paste Text tab.
                            </div>
                          </div>
                        )}
                      </>
                    )}

                    {mode === "text" && (
                      <>
                        <p className="text-sm text-gray-400">
                          Paste a decklist in text format to compare against
                          your collection.
                        </p>
                        <div className="space-y-3">
                          <textarea
                            placeholder="4 Apprentice Wizard&#10;2 Black Obelisk&#10;1 Queen Guinevere&#10;..."
                            value={textInput}
                            onChange={(e) => setTextInput(e.target.value)}
                            className="w-full h-48 bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 font-mono text-sm"
                            disabled={loading}
                          />
                          <p className="text-xs text-gray-500">
                            Format: &quot;4 Card Name&quot; or &quot;4x Card
                            Name&quot; per line
                          </p>
                          <button
                            onClick={compareText}
                            disabled={loading || !textInput.trim()}
                            className="w-full px-4 py-3 bg-blue-600 hover:bg-blue-700 rounded-lg font-medium disabled:opacity-50 flex items-center justify-center gap-2"
                          >
                            {loading && (
                              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            )}
                            {loading ? "Comparing..." : "Compare Deck"}
                          </button>
                        </div>
                      </>
                    )}

                    {error && (
                      <div className="bg-red-900/30 border border-red-700 rounded-lg p-3 text-red-400 text-sm">
                        {error}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
