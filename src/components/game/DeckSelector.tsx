"use client";

import { useState, useEffect, useMemo } from "react";
import { CustomSelect } from "@/components/ui/CustomSelect";

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
  const [includePublic, setIncludePublic] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    const stored = localStorage.getItem("sorcery:includePublicDecks");
    return stored === null ? true : stored === "1";
  });
  const [deckIdP1, setDeckIdP1] = useState<string>("");
  const [deckIdP2, setDeckIdP2] = useState<string>("");
  const [deckErrP1, setDeckErrP1] = useState<string | null>(null);
  const [deckErrP2, setDeckErrP2] = useState<string | null>(null);
  const [decksLoaded, setDecksLoaded] = useState<boolean>(false);

  const selectedDeckMetaP1 = useMemo(() => {
    if (!deckIdP1) return null;
    return (
      myDecks.find((d) => d.id === deckIdP1) ||
      publicDecks.find((d) => d.id === deckIdP1) ||
      null
    );
  }, [deckIdP1, myDecks, publicDecks]);
  const selectedDeckMetaP2 = useMemo(() => {
    if (!deckIdP2) return null;
    return (
      myDecks.find((d) => d.id === deckIdP2) ||
      publicDecks.find((d) => d.id === deckIdP2) ||
      null
    );
  }, [deckIdP2, myDecks, publicDecks]);
  const isPreconP1 = useMemo(() => {
    const name = (selectedDeckMetaP1?.name || "").toLowerCase();
    return name.includes("precon");
  }, [selectedDeckMetaP1]);
  const isPreconP2 = useMemo(() => {
    const name = (selectedDeckMetaP2?.name || "").toLowerCase();
    return name.includes("precon");
  }, [selectedDeckMetaP2]);

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
          setPublicDecks(
            Array.isArray(data?.publicDecks) ? data.publicDecks : []
          );
        }
      } catch {
      } finally {
        setDecksLoaded(true);
      }
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
          Select decks for both players. Optionally include precon decks.
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="rounded"
            checked={includePublic}
            onChange={(e) => {
              const next = e.target.checked;
              setIncludePublic(next);
              try {
                localStorage.setItem(
                  "sorcery:includePublicDecks",
                  next ? "1" : "0"
                );
              } catch {}
            }}
          />
          Include precon decks
        </label>
      </div>

      <div>
        <div className="text-lg font-semibold mb-2">Player 1 Deck</div>
        {!decksLoaded ? (
          <div className="w-full bg-black/40 rounded px-3 py-2 text-gray-400">
            Loading decks...
          </div>
        ) : (
          <CustomSelect
            className="w-full"
            value={deckIdP1}
            onChange={(v) => setDeckIdP1(v)}
            placeholder="Select…"
            options={[
              ...myDecks.map((d) => ({
                value: d.id,
                label: `${d.name} (${d.format})`,
              })),
              ...(includePublic
                ? publicDecks.map((d) => ({
                    value: d.id,
                    label: `[Precon] ${d.name} (${d.format})`,
                  }))
                : []),
            ]}
          />
        )}
        {deckErrP1 && (
          <div className="text-red-300 text-xs mt-2">{deckErrP1}</div>
        )}
        {!deckErrP1 && isPreconP1 && (
          <div className="text-amber-300 text-xs mt-2 bg-amber-900/20 ring-1 ring-amber-800 rounded px-2 py-1">
            Precon deck selected. These lists are for learning the game and are
            not competitive constructed-legal.
          </div>
        )}
      </div>

      <div>
        <div className="text-lg font-semibold mb-2">Player 2 Deck</div>
        {!decksLoaded ? (
          <div className="w-full bg-black/40 rounded px-3 py-2 text-gray-400">
            Loading decks...
          </div>
        ) : (
          <CustomSelect
            className="w-full"
            value={deckIdP2}
            onChange={(v) => setDeckIdP2(v)}
            placeholder="Select…"
            options={[
              ...myDecks.map((d) => ({
                value: d.id,
                label: `${d.name} (${d.format})`,
              })),
              ...(includePublic
                ? publicDecks.map((d) => ({
                    value: d.id,
                    label: `[Precon] ${d.name} (${d.format})`,
                  }))
                : []),
            ]}
          />
        )}
        {deckErrP2 && (
          <div className="text-red-300 text-xs mt-2">{deckErrP2}</div>
        )}
        {!deckErrP2 && isPreconP2 && (
          <div className="text-amber-300 text-xs mt-2 bg-amber-900/20 ring-1 ring-amber-800 rounded px-2 py-1">
            Precon deck selected. These lists are for learning the game and are
            not competitive constructed-legal.
          </div>
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
