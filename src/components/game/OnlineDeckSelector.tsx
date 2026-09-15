"use client";

import { useState, useEffect, useMemo } from "react";
import { useOnline } from "@/app/online/online-context";
import GoldfishCoverage from "@/components/game/GoldfishCoverage";
import { CustomSelect } from "@/components/ui/CustomSelect";
import { RcButton } from "@/components/ui/rc-button";
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
      const { getConstructedDeckSummary } = await import("@/lib/game/deckLoader");
      const deckCards = getConstructedDeckSummary(myPlayerKey);
      if (deckCards.length > 0 && transport) {
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
    <div className="w-full max-w-2xl rounded-rc-lg border border-rc-line/18 bg-[rgba(9,13,25,0.9)] p-6 text-rc-fg shadow-rc-panel">
      <div className="mb-6 text-center">
        <h2 className="m-0 font-rc-display text-[28px] leading-none text-rc-fg-strong">
          {isPrecon ? "Select a Precon Deck" : "Select Your Deck"}
        </h2>
        <p className="mt-2 font-rc-sans text-sm text-rc-fg-muted">
          Playing as:{" "}
          <span className="font-rc-mono font-medium text-rc-info">
            {playerNames[myPlayerKey]}
          </span>
        </p>
      </div>

      <div className="space-y-4">
        {goldfishTesting && lastTest && <div className="space-y-2 rounded-rc-md border border-rc-accent/35 bg-black/30 p-3">
          <p className="font-rc-sans text-sm text-rc-fg-muted">Previous test: <span className="text-rc-fg-strong">{lastTest.name}</span>. Reuse the saved list with a fresh shuffle, even if the original deck has changed.</p>
          <RcButton variant="outline" size="sm" disabled={isLoading} onClick={() => {setDeckError(null);setReview(lastTest);}}>Reuse previous test deck</RcButton>
        </div>}
        {/* Guests: load a list on the fly (nothing is saved) */}
        {isGuest && !isPrecon && (
          <div className="space-y-2 rounded-rc-md border border-rc-line/12 bg-black/30 p-3">
            <div className="font-rc-sans text-sm font-medium text-rc-fg-strong">
              Load a deck from sorcerytcg.com or Four Cores
            </div>
            <div className="flex gap-2">
              <input
                className="rc-input h-9 min-w-0 flex-1"
                placeholder="https://sorcerytcg.com/decks/..."
                value={guestUrl}
                onChange={(e) => setGuestUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void prepareGuestDeck();
                }}
                disabled={isLoading}
              />
              <RcButton
                variant="outline"
                className="h-9 shrink-0"
                onClick={prepareGuestDeck}
                disabled={!guestUrl.trim() || isLoading}
              >
                {isLoading ? "Loading..." : "Load & Play"}
              </RcButton>
            </div>
            <p className="rc-hint leading-relaxed">
              Playing as a guest: the list is used for this match only. Sign
              in to keep decks in your collection.
            </p>
          </div>
        )}

        {/* Deck URL import inline panel - hidden for precon matches and guests */}
        {curiosaEnabled && !isPrecon && !isGuest && (
          <div className="space-y-2 rounded-rc-md border border-rc-line/12 bg-black/30 p-3">
            <div className="font-rc-sans text-sm font-medium text-rc-fg-strong">
              Import from Sorcerytcg or Four Cores
            </div>
            <div className="grid gap-2 sm:grid-cols-5">
              <input
                className="rc-input h-9 w-full sm:col-span-3"
                placeholder="Sorcerytcg or Four Cores deck URL"
                value={impUrl}
                onChange={(e) => setImpUrl(e.target.value)}
                disabled={impLoading || isLoading}
              />
              <input
                className="rc-input h-9 w-full sm:col-span-2"
                placeholder="Optional name"
                value={impName}
                onChange={(e) => setImpName(e.target.value)}
                disabled={impLoading || isLoading}
              />
            </div>
            {impError && (
              <div className="rc-alert" data-tone="danger">
                {impError}
              </div>
            )}
            <div className="flex gap-2">
              <RcButton
                variant="outline"
                className="h-9"
                onClick={importFromCuriosa}
                disabled={!impUrl.trim() || impLoading || isLoading}
              >
                {impLoading ? "Importing..." : "Import"}
              </RcButton>
            </div>
          </div>
        )}

        <div>
          <label className="rc-field-label mb-2">
            {isGuest && !isPrecon ? "Or choose a precon deck" : "Choose Deck"}
          </label>
          {/* Hide deck options for precon mode - only precon decks available.
              Guests only ever see precons, so the toggle is pointless for them. */}
          {!isPrecon && !isGuest && (
            <div className="mb-2 flex items-center justify-between gap-3">
              <span className="rc-hint">
                Your own decks are always shown.
              </span>
              <label className="rc-check">
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
          )}
          {!decksLoaded ? (
            <div className="rc-hint w-full rounded-rc-md border border-rc-line/12 bg-black/45 px-3 py-2">
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
          <div className="rc-alert" data-tone="danger">
            {deckError}
          </div>
        )}

        {/* Warning for precon decks in constructed mode (not for precon matches) */}
        {isConstructed && !isPrecon && isPreconSelected && (
          <div className="rc-alert" data-tone="warning">
            You selected a Precon deck. These lists are for learning the game
            and are not competitive constructed-legal.
          </div>
        )}

        {/* Helpful info for precon matches */}
        {isPrecon && (
          <div className="rc-alert">
            Precon Match: Both players use prebuilt element decks. Great for
            learning the game!
          </div>
        )}

        <RcButton
          size="lg"
          className="w-full"
          onClick={prepareMyDeck}
          disabled={!selectedDeck || isLoading}
        >
          {isLoading ? "Loading Deck..." : "Ready to Play"}
        </RcButton>
      </div>

      <div className="rc-hint mt-6 text-center">
        Waiting for other players to select their decks...
      </div>
    </div>
  );
}
