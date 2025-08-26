"use client";

import { useState, useEffect } from "react";
import type { PlayerKey } from "@/lib/game/store";

interface DeckInfo {
  id: string;
  name: string;
  format: string;
}

interface OnlineDeckSelectorProps {
  myPlayerKey: PlayerKey;
  playerNames: { p1: string; p2: string };
  onPrepareComplete: () => void;
}

export default function OnlineDeckSelector({ 
  myPlayerKey, 
  playerNames, 
  onPrepareComplete 
}: OnlineDeckSelectorProps) {
  const [decks, setDecks] = useState<DeckInfo[]>([]);
  const [selectedDeck, setSelectedDeck] = useState<string>("");
  const [deckError, setDeckError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/decks", { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        setDecks(Array.isArray(data) ? data : []);
      } catch {}
    })();
  }, []);

  const prepareMyDeck = async () => {
    if (!selectedDeck) return;
    
    setIsLoading(true);
    setDeckError(null);
    
    try {
      const { loadDeckFor } = await import("@/lib/game/deckLoader");
      const { useGameStore } = await import("@/lib/game/store");
      
      const success = await loadDeckFor(myPlayerKey, selectedDeck, setDeckError);
      
      if (success) {
        useGameStore.getState().setPhase("Setup");
        onPrepareComplete();
      }
    } catch (err) {
      setDeckError("Failed to load deck");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="w-full max-w-2xl bg-zinc-900/80 text-white rounded-2xl ring-1 ring-white/10 p-6">
      <div className="mb-6 text-center">
        <h2 className="text-xl font-semibold mb-2">Select Your Deck</h2>
        <p className="text-sm opacity-80">
          Playing as: <span className="font-medium text-blue-400">{playerNames[myPlayerKey]}</span>
        </p>
      </div>
      
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-2">Choose Deck</label>
          <select
            className="w-full bg-zinc-800/80 ring-1 ring-zinc-700 rounded px-3 py-2 text-white"
            value={selectedDeck}
            onChange={(e) => setSelectedDeck(e.target.value)}
            disabled={isLoading}
          >
            <option value="">Select a deck...</option>
            {decks.map((deck) => (
              <option key={deck.id} value={deck.id}>
                {deck.name} ({deck.format})
              </option>
            ))}
          </select>
        </div>

        {deckError && (
          <div className="text-red-400 text-sm bg-red-900/20 rounded px-3 py-2 ring-1 ring-red-800">
            {deckError}
          </div>
        )}

        <button
          className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed rounded px-4 py-2 font-medium transition-colors"
          onClick={prepareMyDeck}
          disabled={!selectedDeck || isLoading}
        >
          {isLoading ? "Loading Deck..." : "Ready to Play"}
        </button>
      </div>
      
      <div className="mt-6 text-xs opacity-60 text-center">
        Waiting for other players to select their decks...
      </div>
    </div>
  );
}