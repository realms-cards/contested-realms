"use client";

import { useState, useEffect, useMemo } from "react";
import { CustomSelect } from "@/components/ui/CustomSelect";
import { RcButton } from "@/components/ui/rc-button";
import {
  fetchPublicDecks,
  fetchTopDecks,
  isTop8Value,
  resolveDeckLink,
  top8Label,
  top8Title,
  top8Url,
  top8Value,
  type PublicDeckListEntry,
  type SummitTopDecks,
} from "@/lib/decks/deckCategories";
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

/** picker entries that are actions, not decks */
const LOAD_PUBLIC = "__load_public__";
const NO_PUBLIC = "__no_public__";

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
  // the latest offline event's top 8 (links, resolved when loaded) and, only once asked for,
  // other players' public decks
  const [topDecks, setTopDecks] = useState<SummitTopDecks | null>(null);
  const [otherPublic, setOtherPublic] = useState<PublicDeckListEntry[] | null>(null);
  const [otherPublicLoading, setOtherPublicLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void fetchTopDecks().then((top) => {
      if (!cancelled) setTopDecks(top);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const loadOtherPublic = async () => {
    if (otherPublicLoading || otherPublic) return;
    setOtherPublicLoading(true);
    try {
      setOtherPublic(await fetchPublicDecks());
    } catch {
      setOtherPublic([]);
    } finally {
      setOtherPublicLoading(false);
    }
  };

  /** Your decks, the latest top 8, the precons and other players' public decks (once asked for). */
  const options = useMemo(
    () => [
      ...myDecks.map((d) => ({ value: d.id, label: `${d.name} (${d.format})`, group: "Your decks" })),
      ...(topDecks
        ? topDecks.decks.map((d) => ({ value: top8Value(d), label: top8Label(d), group: top8Title(topDecks) }))
        : []),
      ...(includePublic
        ? publicDecks.map((d) => ({ value: d.id, label: `${d.name} (${d.format})`, group: "Precons" }))
        : []),
      ...(otherPublic === null
        ? [{
            value: LOAD_PUBLIC,
            label: otherPublicLoading ? "Loading public decks…" : "Show other players' public decks…",
            group: "Public decks",
          }]
        : otherPublic.length
          ? otherPublic.map((d) => ({ value: d.id, label: `${d.name} — ${d.userName} (${d.format})`, group: "Public decks" }))
          : [{ value: NO_PUBLIC, label: "No public decks from other players yet", group: "Public decks" }]),
    ],
    [myDecks, publicDecks, includePublic, topDecks, otherPublic, otherPublicLoading],
  );

  const pick = (set: (v: string) => void) => (v: string) => {
    if (v === LOAD_PUBLIC) return void loadOtherPublic();
    if (v === NO_PUBLIC) return;
    set(v);
  };

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

  /** A saved deck loads by id; a top-8 deck is resolved from its link (nothing is saved). */
  const loadSelected = async (who: PlayerKey, value: string, setErr: (e: string | null) => void) => {
    const { loadDeckFor, loadDeckFromData } = await import("@/lib/game/deckLoader");
    if (!isTop8Value(value)) return loadDeckFor(who, value, setErr);
    try {
      return await loadDeckFromData(who, await resolveDeckLink(top8Url(value)), setErr);
    } catch (err) {
      setErr(err instanceof Error ? err.message : "Could not load deck");
      return false;
    }
  };

  const prepareHands = async () => {
    const { useGameStore } = await import("@/lib/game/store");

    setDeckErrP1(null);
    setDeckErrP2(null);

    if (!deckIdP1 || !deckIdP2) return;

    const ok1 = await loadSelected("p1", deckIdP1, setDeckErrP1);
    const ok2 = await loadSelected("p2", deckIdP2, setDeckErrP2);

    if (ok1 && ok2) {
      useGameStore.getState().setPhase("Start");
      onPrepareComplete({ enableSeer });
    }
  };

  return (
    <div className="grid w-full max-w-5xl grid-cols-1 gap-6 rounded-rc-lg border border-rc-line/18 bg-[rgba(9,13,25,0.9)] p-6 text-rc-fg shadow-rc-panel md:grid-cols-2">
      <div className="md:col-span-2 flex items-center justify-between gap-4">
        <div className="font-rc-sans text-sm text-rc-fg-muted">
          Select decks for both players: your own, the precons, the latest top 8 or other
          players&apos; public decks.
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
          Include precons
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
            onChange={pick(setDeckIdP1)}
            placeholder="Select…"
            options={options}
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
            onChange={pick(setDeckIdP2)}
            placeholder="Select…"
            options={options}
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
          <RcButton
            disabled={!deckIdP1 || !deckIdP2}
            onClick={prepareHands}
          >
            Prepare Hands
          </RcButton>
        </div>
      </div>
    </div>
  );
}
