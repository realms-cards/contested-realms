"use client";

import { useState, useEffect } from "react";

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

interface DeckSelectorProps {
  onPrepareComplete: () => void;
}

export default function DeckSelector({ onPrepareComplete }: DeckSelectorProps) {
  const [myDecks, setMyDecks] = useState<MyDeckInfo[]>([]);
  const [publicDecks, setPublicDecks] = useState<PublicDeckInfo[]>([]);
  const [includePublic, setIncludePublic] = useState<boolean>(false);
  const [deckIdP1, setDeckIdP1] = useState<string>("");
  const [deckIdP2, setDeckIdP2] = useState<string>("");
  const [deckErrP1, setDeckErrP1] = useState<string | null>(null);
  const [deckErrP2, setDeckErrP2] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/decks", { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        // Backward compatibility: older shape was an array of decks
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

  const prepareHands = async () => {
    const { loadDeckFor } = await import("@/lib/game/deckLoader");
    const { useGameStore } = await import("@/lib/game/store");
    
    setDeckErrP1(null);
    setDeckErrP2(null);
    
    if (!deckIdP1 || !deckIdP2) return;
    
    const ok1 = await loadDeckFor("p1", deckIdP1, setDeckErrP1);
    const ok2 = await loadDeckFor("p2", deckIdP2, setDeckErrP2);
    
    if (ok1 && ok2) {
      useGameStore.getState().setPhase("Start");
      onPrepareComplete();
    }
  };

  return (
    <div className="w-full max-w-5xl bg-zinc-900/80 text-white rounded-2xl ring-1 ring-white/10 p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
      <div className="md:col-span-2 flex items-center justify-between gap-4">
        <div className="text-sm opacity-80">
          Select decks for both players. Optionally include public decks from other players.
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="rounded"
            checked={includePublic}
            onChange={(e) => setIncludePublic(e.target.checked)}
          />
          Include public decks
        </label>
      </div>

      <div>
        <div className="text-lg font-semibold mb-2">Player 1 Deck</div>
        <select
          className="w-full bg-black/40 rounded px-3 py-2 outline-none"
          value={deckIdP1}
          onChange={(e) => setDeckIdP1(e.target.value)}
        >
          <option value="">Select…</option>
          {myDecks.length > 0 && (
            <optgroup label="My Decks">
              {myDecks.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} ({d.format})
                </option>
              ))}
            </optgroup>
          )}
          {includePublic && publicDecks.length > 0 && (
            <optgroup label="Public Decks">
              {publicDecks.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} ({d.format}) — {d.userName}
                </option>
              ))}
            </optgroup>
          )}
        </select>
        {deckErrP1 && (
          <div className="text-red-300 text-xs mt-2">{deckErrP1}</div>
        )}
      </div>
      
      <div>
        <div className="text-lg font-semibold mb-2">Player 2 Deck</div>
        <select
          className="w-full bg-black/40 rounded px-3 py-2 outline-none"
          value={deckIdP2}
          onChange={(e) => setDeckIdP2(e.target.value)}
        >
          <option value="">Select…</option>
          {myDecks.length > 0 && (
            <optgroup label="My Decks">
              {myDecks.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} ({d.format})
                </option>
              ))}
            </optgroup>
          )}
          {includePublic && publicDecks.length > 0 && (
            <optgroup label="Public Decks">
              {publicDecks.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} ({d.format}) — {d.userName}
                </option>
              ))}
            </optgroup>
          )}
        </select>
        {deckErrP2 && (
          <div className="text-red-300 text-xs mt-2">{deckErrP2}</div>
        )}
      </div>
      
      <div className="md:col-span-2 flex items-center justify-between pt-2">
        <div className="opacity-80 text-sm">
          Select both decks, then prepare opening hands.
        </div>
        <div className="flex items-center gap-3">
          <button
            className="rounded bg-emerald-600/90 hover:bg-emerald-500 px-4 py-2"
            disabled={!deckIdP1 || !deckIdP2}
            onClick={prepareHands}
          >
            Prepare Hands
          </button>
        </div>
      </div>
    </div>
  );
}