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
  onPrepareComplete: (options: { enableSeer: boolean }) => void;
}

export default function DeckSelector({ onPrepareComplete }: DeckSelectorProps) {
  const [myDecks, setMyDecks] = useState<MyDeckInfo[]>([]);
  const [publicDecks, setPublicDecks] = useState<PublicDeckInfo[]>([]);
  const [includePublic, setIncludePublic] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    const stored = localStorage.getItem("sorcery:includePublicDecks");
    return stored === null ? true : stored === "1";
  });
  const [enableSeer, setEnableSeer] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("sorcery:enableSecondSeer") === "1";
  });
  const [deckIdP1, setDeckIdP1] = useState<string>("");
  const [deckIdP2, setDeckIdP2] = useState<string>("");
  const [deckErrP1, setDeckErrP1] = useState<string | null>(null);
  const [deckErrP2, setDeckErrP2] = useState<string | null>(null);
  const [decksLoaded, setDecksLoaded] = useState<boolean>(false);

  const isPreconP1 = useMemo(
    () => !!deckIdP1 && publicDecks.some((d) => d.id === deckIdP1),
    [deckIdP1, publicDecks]
  );
  const isPreconP2 = useMemo(
    () => !!deckIdP2 && publicDecks.some((d) => d.id === deckIdP2),
    [deckIdP2, publicDecks]
  );

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
      onPrepareComplete({ enableSeer });
    }
  };

  return (
    <div className="grid w-full max-w-5xl grid-cols-1 gap-6 rounded-rc-lg border border-rc-line/18 bg-[rgba(9,13,25,0.9)] p-6 text-rc-fg shadow-rc-panel md:grid-cols-2">
      <div className="md:col-span-2 flex items-center justify-between gap-4">
        <div className="font-rc-sans text-sm text-rc-fg-muted">
          Select decks for both players. Optionally include precon decks.
        </div>
        <label className="rc-check flex text-[13px]">
          <input
            type="checkbox"
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
        <div className="mb-2 font-rc-display text-[22px] leading-none text-rc-fg-strong">Player 1 Deck</div>
        {!decksLoaded ? (
          <div className="rc-hint w-full rounded-rc-md border border-rc-line/12 bg-black/45 px-3 py-2">
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
          <div className="mt-2 font-rc-mono text-xs text-rc-danger">{deckErrP1}</div>
        )}
        {!deckErrP1 && isPreconP1 && (
          <div className="rc-alert mt-2" data-tone="warning">
            Precon deck selected. These lists are for learning the game and are
            not competitive constructed-legal.
          </div>
        )}
      </div>

      <div>
        <div className="mb-2 font-rc-display text-[22px] leading-none text-rc-fg-strong">Player 2 Deck</div>
        {!decksLoaded ? (
          <div className="rc-hint w-full rounded-rc-md border border-rc-line/12 bg-black/45 px-3 py-2">
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
          <div className="mt-2 font-rc-mono text-xs text-rc-danger">{deckErrP2}</div>
        )}
        {!deckErrP2 && isPreconP2 && (
          <div className="rc-alert mt-2" data-tone="warning">
            Precon deck selected. These lists are for learning the game and are
            not competitive constructed-legal.
          </div>
        )}
      </div>

      <div className="md:col-span-2 flex items-center justify-between pt-2">
        <div className="flex items-center gap-4">
          <div className="font-rc-sans text-sm text-rc-fg-muted">
            Select both decks, then prepare opening hands.
          </div>
          <label className="rc-check flex text-[13px]">
            <input
              type="checkbox"
                checked={enableSeer}
              onChange={(e) => {
                const next = e.target.checked;
                setEnableSeer(next);
                try {
                  localStorage.setItem(
                    "sorcery:enableSecondSeer",
                    next ? "1" : "0"
                  );
                } catch {}
              }}
            />
            Enable Second Seer (2nd player scries 1)
          </label>
        </div>
        <div className="flex items-center gap-3">
          <button
            className="cursor-pointer rounded-rc-md border border-rc-accent-press bg-gradient-to-b from-rc-accent-hover to-rc-accent px-4 py-2 font-rc-sans text-sm font-medium text-rc-accent-fg shadow-rc-sm transition-transform hover:-translate-y-px disabled:pointer-events-none disabled:opacity-50"
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
