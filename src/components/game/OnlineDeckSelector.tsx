"use client";

import { useState, useEffect } from "react";
import type { PlayerKey } from "@/lib/game/store";

type MyDeckInfo = {
  id: string;
  name: string;
  format: string;
  isPublic?: boolean;
  imported?: boolean;
};

type PublicDeckInfo = {
  id: string;
  name: string;
  format: string;
  imported?: boolean;
  userName: string;
};

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
  const curiosaEnabled = process.env.NEXT_PUBLIC_ENABLE_CURIOSA_IMPORT === "true";
  const [myDecks, setMyDecks] = useState<MyDeckInfo[]>([]);
  const [publicDecks, setPublicDecks] = useState<PublicDeckInfo[]>([]);
  const [includePublic, setIncludePublic] = useState<boolean>(false);
  const [selectedDeck, setSelectedDeck] = useState<string>("");
  const [deckError, setDeckError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [impUrl, setImpUrl] = useState("");
  const [impName, setImpName] = useState("");
  const [impTts, setImpTts] = useState("");
  const [impLoading, setImpLoading] = useState(false);
  const [impError, setImpError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/decks", { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        // Backward compatibility: older API returned a flat array
        if (Array.isArray(data)) {
          setMyDecks(data as MyDeckInfo[]);
          setPublicDecks([]);
        } else {
          setMyDecks(Array.isArray(data?.myDecks) ? data.myDecks : []);
          setPublicDecks(Array.isArray(data?.publicDecks) ? data.publicDecks : []);
        }
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
    } catch {
      setDeckError("Failed to load deck");
    } finally {
      setIsLoading(false);
    }
  };

  const importFromCuriosa = async () => {
    if (!impUrl.trim() && !impTts.trim()) return;
    setImpLoading(true);
    setImpError(null);
    try {
      const res = await fetch("/api/decks/import/curiosa", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: impUrl.trim(), name: impName.trim() || undefined, tts: impTts.trim() || undefined }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = (data && data.error) || "Import failed";
        setImpError(typeof msg === "string" ? msg : "Import failed");
        return;
      }
      // data: { id, name, format }
      const newDeck: MyDeckInfo = { id: String(data.id), name: String(data.name), format: String(data.format) };
      setMyDecks((prev) => [newDeck, ...prev]);
      setSelectedDeck(newDeck.id);
      setImpUrl("");
      setImpName("");
      setImpTts("");
    } catch {
      setImpError("Network error during import");
    } finally {
      setImpLoading(false);
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
        {/* Curiosa import inline panel */}
        {curiosaEnabled && (
        <div className="bg-zinc-900/60 ring-1 ring-zinc-700 rounded p-3 space-y-2">
          <div className="text-sm font-medium">Import from Curiosa</div>
          <div className="grid gap-2 sm:grid-cols-5">
            <input
              className="sm:col-span-3 w-full bg-zinc-800/80 ring-1 ring-zinc-700 rounded px-3 py-2 text-white"
              placeholder="Curiosa deck URL"
              value={impUrl}
              onChange={(e) => setImpUrl(e.target.value)}
              disabled={impLoading || isLoading}
            />
            <input
              className="sm:col-span-2 w-full bg-zinc-800/80 ring-1 ring-zinc-700 rounded px-3 py-2 text-white"
              placeholder="Optional name"
              value={impName}
              onChange={(e) => setImpName(e.target.value)}
              disabled={impLoading || isLoading}
            />
          </div>
          <details className="bg-zinc-900/50 rounded ring-1 ring-zinc-700 p-2">
            <summary className="cursor-pointer text-xs font-medium">Paste TTS JSON (fallback if the deck is private)</summary>
            <textarea
              className="mt-2 w-full h-24 bg-zinc-800/80 ring-1 ring-zinc-700 rounded px-2 py-2 text-white font-mono text-xs"
              placeholder="Paste the Tabletop Simulator JSON exported from Curiosa"
              value={impTts}
              onChange={(e) => setImpTts(e.target.value)}
              disabled={impLoading || isLoading}
            />
          </details>
          {impError && (
            <div className="text-red-400 text-xs bg-red-900/20 rounded px-3 py-2 ring-1 ring-red-800">{impError}</div>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              className="px-3 py-2 rounded bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
              onClick={importFromCuriosa}
              disabled={(!impUrl.trim() && !impTts.trim()) || impLoading || isLoading}
            >
              {impLoading ? "Importing..." : "Import"}
            </button>
          </div>
        </div>
        )}

        <div>
          <label className="block text-sm font-medium mb-2">Choose Deck</label>
          <div className="flex items-center justify-between mb-2 text-xs">
            <span className="opacity-60">Your own decks are always shown.</span>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                className="rounded"
                checked={includePublic}
                onChange={(e) => setIncludePublic(e.target.checked)}
              />
              Include public decks
            </label>
          </div>
          <select
            className="w-full bg-zinc-800/80 ring-1 ring-zinc-700 rounded px-3 py-2 text-white"
            value={selectedDeck}
            onChange={(e) => setSelectedDeck(e.target.value)}
            disabled={isLoading}
          >
            <option value="">Select a deck...</option>
            {myDecks.length > 0 && (
              <optgroup label="My Decks">
                {myDecks.map((deck) => (
                  <option key={deck.id} value={deck.id}>
                    {deck.name} ({deck.format})
                  </option>
                ))}
              </optgroup>
            )}
            {includePublic && publicDecks.length > 0 && (
              <optgroup label="Public Decks">
                {publicDecks.map((deck) => (
                  <option key={deck.id} value={deck.id}>
                    {deck.name} ({deck.format}) — {deck.userName}
                  </option>
                ))}
              </optgroup>
            )}
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