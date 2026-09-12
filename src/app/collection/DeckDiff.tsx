"use client";

import Image from "next/image";
import { useCallback, useEffect, useState } from "react";
import { CustomSelect } from "@/components/ui/CustomSelect";
import { PanelHeader } from "@/components/ui/page-header";
import { RcButton } from "@/components/ui/rc-button";
import { RcDialog } from "@/components/ui/rc-dialog";
import { RcEmpty } from "@/components/ui/rc-empty";

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
      return "text-rc-moonlight";
    case "elite":
      return "text-rc-accent-link";
    case "exceptional":
      return "text-rc-info";
    case "ordinary":
    default:
      return "text-rc-fg-strong";
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
      <RcButton
        variant="outline"
        size="sm"
        onClick={() => setIsOpen(true)}
        title="Compare a deck against your collection to see missing cards"
      >
        Deck Diff
      </RcButton>

      {isOpen && (
        <RcDialog
          title="Deck vs Collection"
          eyebrow="deck diff"
          onClose={handleClose}
          size="xl"
        >
          {/* Card preview tooltip */}
          {result &&
            hoveredCard &&
            hoveredCard.slug &&
            (() => {
              const isSite = hoveredCard.type?.toLowerCase().includes("site");
              return (
                <div className="pointer-events-none fixed right-8 top-1/2 z-50 -translate-y-1/2">
                  <div
                    className={`relative overflow-hidden rounded-rc-lg border border-rc-line/18 bg-black/60 shadow-rc-md ${
                      isSite
                        ? "w-[400px] aspect-[7/5]"
                        : "w-72 aspect-[5/7]"
                    }`}
                  >
                    {isSite ? (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="relative h-[400px] w-[286px] rotate-90">
                          <Image
                            src={`/api/images/${hoveredCard.slug}`}
                            alt={hoveredCard.name}
                            fill
                            className="rounded-rc-sm object-cover"
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

          {result ? (
            /* Results View */
            <div className="space-y-4">
              <RcButton
                variant="ghost"
                size="sm"
                onClick={() => setResult(null)}
              >
                ← Back to selection
              </RcButton>

              {/* Summary */}
              <section className="rc-panel">
                <PanelHeader
                  title={result.deckName}
                  meta={`${result.uniqueCards} unique`}
                />
                <div className="grid grid-cols-2 gap-4 px-[18px] py-3.5 text-center sm:grid-cols-4">
                  <div>
                    <div className="rc-stat text-2xl">
                      {result.summary.completionPercent}%
                    </div>
                    <div className="rc-hint">complete</div>
                  </div>
                  <div>
                    <div className="rc-stat text-2xl text-rc-success">
                      {result.totalCards - result.summary.totalMissing}
                    </div>
                    <div className="rc-hint">owned</div>
                  </div>
                  <div>
                    <div className="rc-stat text-2xl text-rc-danger">
                      {result.summary.totalMissing}
                    </div>
                    <div className="rc-hint">missing</div>
                  </div>
                  <div>
                    <div className="rc-stat text-2xl">{result.uniqueCards}</div>
                    <div className="rc-hint">unique cards</div>
                  </div>
                </div>
              </section>

              {/* Unresolved names */}
              {result.unresolved && result.unresolved.length > 0 && (
                <div className="rc-alert" data-tone="warning">
                  <div className="mb-1">Could not find these cards:</div>
                  <div className="text-[11px] tracking-[0.1em]">
                    {result.unresolved.join(", ")}
                  </div>
                </div>
              )}

              {/* Missing / Owned columns */}
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                {/* Missing Cards */}
                <section className="rc-panel">
                  <PanelHeader
                    title="Missing"
                    meta={`${result.summary.uniqueMissing} unique`}
                  />
                  {result.missingCards.length > 0 ? (
                    <div className="max-h-72 overflow-y-auto thin-scrollbar">
                      {result.missingCards.map((card) => (
                        <div
                          key={card.cardId}
                          className="flex cursor-pointer items-center justify-between gap-3 border-b border-rc-line/8 px-[18px] py-2 transition-colors hover:bg-rc-accent/6"
                          onMouseEnter={() => setHoveredCard(card)}
                          onMouseLeave={() => setHoveredCard(null)}
                        >
                          <div className="min-w-0">
                            <div
                              className={`truncate font-rc-display text-[19px] leading-[1.1] ${getRarityColor(
                                card.rarity
                              )}`}
                            >
                              {card.name}
                            </div>
                            {card.set && (
                              <div className="truncate rc-hint">{card.set}</div>
                            )}
                          </div>
                          <div className="flex flex-none items-center gap-3 font-rc-mono text-[12px] tabular-nums">
                            <span className="text-rc-fg-dim">
                              own {card.owned}
                            </span>
                            <span className="text-rc-fg-strong">
                              need {card.needed}
                            </span>
                            <span className="text-rc-danger">
                              −{card.missing}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="px-[18px] py-6 text-center">
                      <div className="font-rc-display text-[19px] text-rc-success">
                        You have all the cards for this deck.
                      </div>
                    </div>
                  )}
                </section>

                {/* Owned Cards */}
                <section className="rc-panel">
                  <PanelHeader
                    title="Owned"
                    meta={`${result.ownedCards.length} unique`}
                  />
                  {result.ownedCards.length > 0 ? (
                    <div className="max-h-72 overflow-y-auto thin-scrollbar">
                      {result.ownedCards.map((card) => (
                        <div
                          key={card.cardId}
                          className="flex cursor-pointer items-center justify-between gap-3 border-b border-rc-line/8 px-[18px] py-2 transition-colors hover:bg-rc-accent/6"
                          onMouseEnter={() => setHoveredCard(card)}
                          onMouseLeave={() => setHoveredCard(null)}
                        >
                          <span
                            className={`truncate font-rc-display text-[19px] leading-[1.1] ${getRarityColor(
                              card.rarity
                            )}`}
                          >
                            {card.name}
                          </span>
                          <span className="flex-none font-rc-mono text-[12px] tabular-nums text-rc-success">
                            {card.owned}/{card.needed}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="rc-hint px-[18px] py-6 text-center">
                      no owned cards in this list
                    </div>
                  )}
                </section>
              </div>
            </div>
          ) : (
            /* Input Views */
            <div className="space-y-4">
              <p className="m-0 text-sm text-rc-fg-muted">
                Compare a deck to see which cards you&apos;re missing.
              </p>

              <div className="rc-segment">
                <button
                  type="button"
                  aria-pressed={mode === "simulator"}
                  onClick={() => setMode("simulator")}
                >
                  My Decks
                </button>
                <button
                  type="button"
                  aria-pressed={mode === "text"}
                  onClick={() => setMode("text")}
                >
                  Paste Text
                </button>
              </div>

              {mode === "simulator" && (
                <>
                  <p className="m-0 text-sm text-rc-fg-muted">
                    Select one of your simulator decks to compare against your
                    collection.
                  </p>
                  {loadingDecks ? (
                    <div className="rc-hint py-6 text-center">loading…</div>
                  ) : decks.length > 0 ? (
                    <div className="space-y-2">
                      <label className="rc-eyebrow block">Select a deck</label>
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
                      <RcButton
                        className="w-full"
                        onClick={compareDeck}
                        disabled={loading || !selectedDeckId}
                      >
                        {loading ? "Comparing..." : "Compare Deck"}
                      </RcButton>
                    </div>
                  ) : (
                    <RcEmpty title="No simulator decks found.">
                      create a deck in the simulator, or paste a deck list in
                      the Paste Text tab
                    </RcEmpty>
                  )}
                </>
              )}

              {mode === "text" && (
                <>
                  <p className="m-0 text-sm text-rc-fg-muted">
                    Paste a decklist in text format to compare against your
                    collection.
                  </p>
                  <div className="space-y-3">
                    <textarea
                      placeholder="4 Apprentice Wizard&#10;2 Black Obelisk&#10;1 Queen Guinevere&#10;..."
                      value={textInput}
                      onChange={(e) => setTextInput(e.target.value)}
                      className="rc-textarea h-48 w-full"
                      disabled={loading}
                    />
                    <p className="m-0 rc-hint">
                      format: &quot;4 Card Name&quot; or &quot;4x Card
                      Name&quot; per line
                    </p>
                    <RcButton
                      className="w-full"
                      onClick={compareText}
                      disabled={loading || !textInput.trim()}
                    >
                      {loading ? "Comparing..." : "Compare Deck"}
                    </RcButton>
                  </div>
                </>
              )}

              {error && (
                <div className="rc-alert" data-tone="danger">
                  {error}
                </div>
              )}
            </div>
          )}
        </RcDialog>
      )}
    </>
  );
}
