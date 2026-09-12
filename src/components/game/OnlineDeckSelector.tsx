"use client";

import { useState, useEffect, useMemo } from "react";
import { useOnline } from "@/app/online/online-context";
import GoldfishCoverage from "@/components/game/GoldfishCoverage";
import { CustomSelect } from "@/components/ui/CustomSelect";
import { readGoldfishDeck, saveGoldfishDeck, type GoldfishDeckSnapshot } from "@/lib/game/cpu/goldfishTesting";
import { betaPrecons } from "@/lib/game/cpu/precons";
import type { DeckLoadPayload } from "@/lib/game/deckLoader";
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
  matchType?: "constructed" | "sealed" | "draft" | "precon";
  cpuPreconsOnly?: boolean;
  goldfishTesting?: boolean;
}

export default function OnlineDeckSelector({
  myPlayerKey,
  playerNames,
  onPrepareComplete,
  matchType,
  cpuPreconsOnly = false,
  goldfishTesting = false,
}: OnlineDeckSelectorProps) {
  const { transport, isGuest, me } = useOnline();
  const [review, setReview] = useState<GoldfishDeckSnapshot | null>(null);
  const [lastTest, setLastTest] = useState<GoldfishDeckSnapshot | null>(null);
  useEffect(() => {
    if (!goldfishTesting || !me?.id) { setLastTest(null); return; }
    try { setLastTest(readGoldfishDeck(sessionStorage,me.id)); } catch { setLastTest(null); }
  },[goldfishTesting,me?.id]);
  const curiosaEnabled =
    process.env.NEXT_PUBLIC_ENABLE_CURIOSA_IMPORT === "true";
  const [myDecks, setMyDecks] = useState<MyDeckInfo[]>([]);
  const [publicDecks, setPublicDecks] = useState<PublicDeckInfo[]>([]);
  const [includePublic, setIncludePublic] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    const stored = localStorage.getItem("sorcery:includePublicDecks");
    return stored === null ? true : stored === "1";
  });
  const [selectedDeck, setSelectedDeck] = useState<string>("");
  const [deckError, setDeckError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [impUrl, setImpUrl] = useState("");
  const [impName, setImpName] = useState("");
  const [impLoading, setImpLoading] = useState(false);
  const [impError, setImpError] = useState<string | null>(null);
  const [decksLoaded, setDecksLoaded] = useState<boolean>(false);
  // Guests have no saved decks: besides the precons they can paste a
  // sorcerytcg.com / Four Cores URL that is resolved on the fly, never stored.
  const [guestUrl, setGuestUrl] = useState("");

  const isConstructed = (matchType ?? "constructed") === "constructed";
  const isPrecon = cpuPreconsOnly || matchType === "precon";

  // Filter decks for precon mode - only show public decks with "precon" in name
  const preconDecks = useMemo(() => {
    if (cpuPreconsOnly) return betaPrecons;
    return publicDecks.filter((d) => d.name.toLowerCase().includes("precon"));
  }, [publicDecks, cpuPreconsOnly]);

  useEffect(() => {
    if (cpuPreconsOnly) { setDecksLoaded(true); return; }
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
          setPublicDecks(
            Array.isArray(data?.publicDecks) ? data.publicDecks : []
          );
        }
      } catch {
      } finally {
        setDecksLoaded(true);
      }
    })();
  }, [cpuPreconsOnly]);

  // Once a deck sits in the store: report it for meta stats and move to Setup
  const finishPrepare = async () => {
    const { useGameStore } = await import("@/lib/game/store");
    // Send deck card list to server for meta statistics tracking
    try {
      const state = useGameStore.getState();
      const zones = state.zones?.[myPlayerKey];
      const avatar = state.avatars?.[myPlayerKey];
      if (zones && transport) {
        type ZoneCard = { name?: string | null; type?: string | null };
        const toDeckCard = (c: ZoneCard, zone: string) => ({
          name: c.name || "",
          type: c.type || "",
          zone,
        });
        const deckCards = [
          ...(avatar?.card
            ? [{ name: avatar.card.name || "", type: avatar.card.type || "Avatar", zone: "avatar" }]
            : []),
          ...(zones.spellbook || []).map((c: ZoneCard) => toDeckCard(c, "spellbook")),
          ...(zones.hand || []).map((c: ZoneCard) => toDeckCard(c, "spellbook")),
          ...(zones.atlas || []).map((c: ZoneCard) => toDeckCard(c, "atlas")),
        ];
        transport.emit("submitConstructedDeck", { deck: deckCards });
      }
    } catch {
      // Non-critical: don't block gameplay if deck emission fails
    }

    useGameStore.getState().setPhase("Setup");
    onPrepareComplete();
  };

  const prepareMyDeck = async () => {
    if (!selectedDeck) return;

    setIsLoading(true);
    setDeckError(null);

    try {
      if (goldfishTesting) {
        const response = await fetch(`/api/decks/${encodeURIComponent(selectedDeck)}`,{cache:"no-store"});
        if (!response.ok) { setDeckError("Failed to load deck"); return; }
        await reviewDeck(await response.json(),selectedDeckMeta?.name || "Selected deck");
        return;
      }
      if (cpuPreconsOnly) {
        const response = await fetch(`/api/precons/${encodeURIComponent(selectedDeck)}`);
        const data = await response.json();
        if (!response.ok) { setDeckError(data.error || "Failed to load precon"); return; }
        const { loadDeckFromData } = await import("@/lib/game/deckLoader");
        if (await loadDeckFromData(myPlayerKey, data, setDeckError)) await finishPrepare();
        return;
      }
      const { loadDeckFor } = await import("@/lib/game/deckLoader");
      const success = await loadDeckFor(
        myPlayerKey,
        selectedDeck,
        setDeckError
      );
      if (success) await finishPrepare();
    } catch {
      setDeckError("Failed to load deck");
    } finally {
      setIsLoading(false);
    }
  };

  const prepareGuestDeck = async () => {
    const url = guestUrl.trim();
    if (!url) return;

    setIsLoading(true);
    setDeckError(null);

    try {
      const res = await fetch("/api/guest/deck", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const unresolved = Array.isArray(data?.unresolved)
          ? (data.unresolved as Array<{ name: string }>)
              .map((c) => c.name)
              .slice(0, 5)
              .join(", ")
          : "";
        const msg =
          typeof data?.error === "string" ? data.error : "Could not load deck";
        setDeckError(unresolved ? `${msg}: ${unresolved}` : msg);
        return;
      }
      const { loadDeckFromData } = await import("@/lib/game/deckLoader");
      if (goldfishTesting) { await reviewDeck(data,"Imported deck"); return; }
      const success = await loadDeckFromData(myPlayerKey, data, setDeckError);
      if (success) await finishPrepare();
    } catch {
      setDeckError("Failed to load deck");
    } finally {
      setIsLoading(false);
    }
  };

  const selectedDeckMeta = useMemo(() => {
    if (!selectedDeck) return null;
    const mine = myDecks.find((d) => d.id === selectedDeck) || null;
    if (mine) return mine;
    const pub = publicDecks.find((d) => d.id === selectedDeck) || null;
    return pub;
  }, [selectedDeck, myDecks, publicDecks]);

  const isPreconSelected = useMemo(() => {
    const name = selectedDeckMeta?.name || "";
    const lower = name.toLowerCase();
    return lower.includes("precon"); // seeded decks use "Beta Precon – <Element>"
  }, [selectedDeckMeta]);

  const importFromCuriosa = async () => {
    if (!impUrl.trim()) return;
    setImpLoading(true);
    setImpError(null);
    try {
      const res = await fetch("/api/decks/import/curiosa", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          url: impUrl.trim(),
          name: impName.trim() || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = (data && data.error) || "Import failed";
        setImpError(typeof msg === "string" ? msg : "Import failed");
        return;
      }
      // data: { id, name, format }
      const newDeck: MyDeckInfo = {
        id: String(data.id),
        name: String(data.name),
        format: String(data.format),
      };
      setMyDecks((prev) => [newDeck, ...prev]);
      setSelectedDeck(newDeck.id);
      setImpUrl("");
      setImpName("");
    } catch {
      setImpError("Network error during import");
    } finally {
      setImpLoading(false);
    }
  };

  async function reviewDeck(deck: DeckLoadPayload, name: string) {
    const { enrichCardRefs } = await import("@/lib/game/cardMetadataLoader");
    const [spellbook,atlas,collection] = await Promise.all([
      enrichCardRefs(deck.spellbook || []),enrichCardRefs(deck.atlas || []),enrichCardRefs(deck.collection || []),
    ]);
    setReview({name,deck:{...deck,spellbook,atlas,collection}});
  }

  async function confirmReview() {
    if (!review || isLoading) return;
    setIsLoading(true); setDeckError(null);
    try {
      const { loadDeckFromData } = await import("@/lib/game/deckLoader");
      // The loader shuffles a fresh copy; retain the original list, not live zones.
      const saved = JSON.parse(JSON.stringify(review)) as GoldfishDeckSnapshot;
      if (!await loadDeckFromData(myPlayerKey,review.deck,setDeckError)) return;
      if (me?.id) { try { saveGoldfishDeck(sessionStorage,me.id,saved); } catch {} }
      await finishPrepare();
    } catch { setDeckError("Failed to load deck"); }
    finally { setIsLoading(false); }
  }

  if (goldfishTesting && review) return <GoldfishCoverage snapshot={review} busy={isLoading} error={deckError} onConfirm={confirmReview} onBack={() => {setReview(null);setDeckError(null);}} />;

  return (
    <div className="w-full max-w-2xl bg-zinc-900/80 text-white rounded-2xl ring-1 ring-white/10 p-6">
      <div className="mb-6 text-center">
        <h2 className="text-xl font-semibold mb-2">
          {isPrecon ? "Select a Precon Deck" : "Select Your Deck"}
        </h2>
        <p className="text-sm opacity-80">
          Playing as:{" "}
          <span className="font-medium text-blue-400">
            {playerNames[myPlayerKey]}
          </span>
        </p>
      </div>

      <div className="space-y-4">
        {goldfishTesting && lastTest && <div className="rounded border border-amber-700/40 p-3 space-y-2">
          <p className="text-sm">Previous test: {lastTest.name}. Reuse the saved list with a fresh shuffle, even if the original deck has changed.</p>
          <button disabled={isLoading} onClick={() => {setDeckError(null);setReview(lastTest);}} className="rounded bg-indigo-600 px-4 py-2">Reuse previous test deck</button>
        </div>}
        {/* Guests: load a list on the fly (nothing is saved) */}
        {isGuest && !isPrecon && (
          <div className="bg-zinc-900/60 ring-1 ring-zinc-700 rounded p-3 space-y-2">
            <div className="text-sm font-medium">
              Load a deck from sorcerytcg.com or Four Cores
            </div>
            <div className="flex gap-2">
              <input
                className="flex-1 min-w-0 bg-zinc-800/80 ring-1 ring-zinc-700 rounded px-3 py-2 text-white"
                placeholder="https://sorcerytcg.com/decks/..."
                value={guestUrl}
                onChange={(e) => setGuestUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void prepareGuestDeck();
                }}
                disabled={isLoading}
              />
              <button
                type="button"
                className="px-3 py-2 rounded bg-blue-600 hover:bg-blue-700 disabled:opacity-50 shrink-0"
                onClick={prepareGuestDeck}
                disabled={!guestUrl.trim() || isLoading}
              >
                {isLoading ? "Loading..." : "Load & Play"}
              </button>
            </div>
            <p className="text-xs opacity-60">
              Playing as a guest: the list is used for this match only. Sign
              in to keep decks in your collection.
            </p>
          </div>
        )}

        {/* Deck URL import inline panel - hidden for precon matches and guests */}
        {curiosaEnabled && !isPrecon && !isGuest && (
          <div className="bg-zinc-900/60 ring-1 ring-zinc-700 rounded p-3 space-y-2">
            <div className="text-sm font-medium">
              Import from Sorcerytcg or Four Cores
            </div>
            <div className="grid gap-2 sm:grid-cols-5">
              <input
                className="sm:col-span-3 w-full bg-zinc-800/80 ring-1 ring-zinc-700 rounded px-3 py-2 text-white"
                placeholder="Sorcerytcg or Four Cores deck URL"
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
            {impError && (
              <div className="text-red-400 text-xs bg-red-900/20 rounded px-3 py-2 ring-1 ring-red-800">
                {impError}
              </div>
            )}
            <div className="flex gap-2">
              <button
                type="button"
                className="px-3 py-2 rounded bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
                onClick={importFromCuriosa}
                disabled={!impUrl.trim() || impLoading || isLoading}
              >
                {impLoading ? "Importing..." : "Import"}
              </button>
            </div>
          </div>
        )}

        <div>
          <label className="block text-sm font-medium mb-2">
            {isGuest && !isPrecon ? "Or choose a precon deck" : "Choose Deck"}
          </label>
          {/* Hide deck options for precon mode - only precon decks available.
              Guests only ever see precons, so the toggle is pointless for them. */}
          {!isPrecon && !isGuest && (
            <div className="flex items-center justify-between mb-2 text-xs">
              <span className="opacity-60">
                Your own decks are always shown.
              </span>
              <label className="flex items-center gap-2">
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
          )}
          {!decksLoaded ? (
            <div className="w-full bg-zinc-800/80 ring-1 ring-zinc-700 rounded px-3 py-2 text-gray-400">
              Loading decks...
            </div>
          ) : isPrecon ? (
            /* Precon mode: only show precon decks */
            <CustomSelect
              className="w-full"
              value={selectedDeck}
              onChange={(v) => setSelectedDeck(v)}
              disabled={isLoading}
              placeholder={preconDecks.length > 0 ? "Select a precon deck..." : "No precon decks available"}
              options={preconDecks.map((deck) => ({
                value: deck.id,
                label: deck.name,
              }))}
            />
          ) : (
            /* Normal mode: show user's decks and optionally public decks */
            <CustomSelect
              className="w-full"
              value={selectedDeck}
              onChange={(v) => setSelectedDeck(v)}
              disabled={isLoading}
              placeholder="Select a deck..."
              options={[
                ...myDecks.map((deck) => ({
                  value: deck.id,
                  label: `${deck.name} (${deck.format})`,
                })),
                ...(includePublic || isGuest
                  ? publicDecks.map((deck) => ({
                      value: deck.id,
                      label: `[Precon] ${deck.name} (${deck.format})`,
                    }))
                  : []),
              ]}
            />
          )}
        </div>

        {deckError && (
          <div className="text-red-400 text-sm bg-red-900/20 rounded px-3 py-2 ring-1 ring-red-800">
            {deckError}
          </div>
        )}

        {/* Warning for precon decks in constructed mode (not for precon matches) */}
        {isConstructed && !isPrecon && isPreconSelected && (
          <div className="mt-2 text-amber-300 text-xs bg-amber-900/20 rounded px-3 py-2 ring-1 ring-amber-800">
            You selected a Precon deck. These lists are for learning the game
            and are not competitive constructed-legal.
          </div>
        )}

        {/* Helpful info for precon matches */}
        {isPrecon && (
          <div className="mt-2 text-blue-300 text-xs bg-blue-900/20 rounded px-3 py-2 ring-1 ring-blue-800">
            Precon Match: Both players use prebuilt element decks. Great for
            learning the game!
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
