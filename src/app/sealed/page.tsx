"use client";

import Image from "next/image";
import { useMemo, useState } from "react";

type Rarity = "Ordinary" | "Exceptional" | "Elite" | "Unique";
type Finish = "Standard" | "Foil";

type BoosterCard = {
  variantId: number;
  slug: string;
  finish: Finish;
  product: string;
  rarity: Rarity;
  type: string | null;
  cardId: number;
  cardName: string;
};

type Zone = "Spellbook" | "Atlas" | "Sideboard";

export default function SealedPage() {
  const [setName, setSetName] = useState("Alpha");
  const [packsCount, setPacksCount] = useState(6);
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [boosters, setBoosters] = useState<BoosterCard[][]>([]);

  const [deckName, setDeckName] = useState("Sealed Deck");
  const [saving, setSaving] = useState(false);
  const [saveResult, setSaveResult] = useState<{
    id: string;
    name: string;
  } | null>(null);

  type PickKey = string; // `${cardId}:${zone}`
  const [picks, setPicks] = useState<
    Record<
      PickKey,
      {
        cardId: number;
        name: string;
        rarity: Rarity;
        zone: Zone;
        count: number;
      }
    >
  >({});

  const canOpen = useMemo(
    () => packsCount >= 1 && packsCount <= 12 && !!setName,
    [packsCount, setName]
  );

  async function openPacks() {
    try {
      setOpening(true);
      setError(null);
      setSaveResult(null);
      const res = await fetch(
        `/api/sealed?set=${encodeURIComponent(setName)}&packs=${packsCount}`
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Request failed");
      setBoosters(data.boosters as BoosterCard[][]);
      setPicks({});
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBoosters([]);
      setPicks({});
    } finally {
      setOpening(false);
    }
  }

  function addCard(c: BoosterCard, zone: Zone) {
    setPicks((prev) => {
      const key = `${c.cardId}:${zone}`;
      const next = { ...prev };
      if (next[key]) {
        next[key] = { ...next[key], count: next[key].count + 1 };
      } else {
        next[key] = {
          cardId: c.cardId,
          name: c.cardName,
          rarity: c.rarity,
          zone,
          count: 1,
        };
      }
      return next;
    });
  }

  function removeOne(key: PickKey) {
    setPicks((prev) => {
      const next = { ...prev };
      const it = next[key];
      if (!it) return prev;
      if (it.count <= 1) delete next[key];
      else next[key] = { ...it, count: it.count - 1 };
      return next;
    });
  }

  function changeZone(key: PickKey, newZone: Zone) {
    setPicks((prev) => {
      const it = prev[key];
      if (!it) return prev;
      const [cardIdStr] = key.split(":");
      const newKey = `${cardIdStr}:${newZone}`;
      const next = { ...prev } as typeof prev;
      delete next[key];
      if (next[newKey]) {
        next[newKey] = {
          ...next[newKey],
          count: next[newKey].count + it.count,
        };
      } else {
        next[newKey] = { ...it, zone: newZone };
      }
      return next;
    });
  }

  const zoneCounts = useMemo(() => {
    const res: Record<Zone, number> = { Spellbook: 0, Atlas: 0, Sideboard: 0 };
    for (const it of Object.values(picks)) res[it.zone] += it.count;
    return res;
  }, [picks]);

  async function saveDeck() {
    try {
      setSaving(true);
      setError(null);
      setSaveResult(null);
      const cards = Object.values(picks).map((p) => ({
        cardId: p.cardId,
        zone: p.zone,
        count: p.count,
      }));
      const res = await fetch("/api/decks", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: deckName || "Sealed Deck",
          format: "Sealed",
          set: setName,
          cards,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to save deck");
      setSaveResult({ id: data.id, name: data.name });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <h1 className="text-2xl font-semibold">Sealed Mode</h1>

      <div className="flex flex-wrap items-end gap-4">
        <label className="flex flex-col gap-1">
          <span className="text-sm opacity-80">Set</span>
          <select
            value={setName}
            onChange={(e) => setSetName(e.target.value)}
            className="border rounded px-3 py-2 bg-transparent"
          >
            <option value="Alpha">Alpha</option>
            <option value="Beta">Beta</option>
            <option value="Arthurian Legends">Arthurian Legends</option>
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-sm opacity-80">Packs</span>
          <input
            type="number"
            min={1}
            max={12}
            value={packsCount}
            onChange={(e) => setPacksCount(Number(e.target.value))}
            className="border rounded px-3 py-2 bg-transparent w-28"
          />
        </label>

        <button
          onClick={openPacks}
          disabled={!canOpen || opening}
          className="h-10 px-4 rounded bg-foreground text-background disabled:opacity-50"
        >
          {opening ? "Opening..." : "Open Packs"}
        </button>
      </div>

      {error && <div className="text-red-500">Error: {error}</div>}

      {!!boosters.length && (
        <div className="grid gap-6">
          {boosters.map((pack, idx) => (
            <div key={idx} className="border rounded p-4">
              <div className="font-medium mb-3">Pack {idx + 1}</div>
              {(() => {
                const sites = pack.filter((c) =>
                  (c.type || "").toLowerCase().includes("site")
                );
                const spells = pack.filter(
                  (c) => !(c.type || "").toLowerCase().includes("site")
                );
                return (
                  <div className="space-y-4">
                    {!!spells.length && (
                      <div>
                        <div className="text-xs uppercase opacity-70 mb-2">
                          Spellbook
                        </div>
                        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2 text-sm">
                          {spells.map((c) => (
                            <div
                              key={c.variantId}
                              className="border rounded p-2"
                            >
                              <div className="relative aspect-[3/4] w-full overflow-hidden rounded bg-muted/40 mb-2">
                                <Image
                                  src={`/api/images/${c.slug}`}
                                  alt={c.cardName}
                                  fill
                                  sizes="(max-width:640px) 100vw, (max-width:1024px) 50vw, 33vw"
                                  className="object-cover"
                                  unoptimized
                                />
                              </div>
                              <div className="font-semibold">{c.cardName}</div>
                              <div className="opacity-80">
                                {c.rarity} • {c.finish}
                              </div>
                              <div className="opacity-70 text-xs mb-2">
                                {c.slug}
                              </div>
                              <div className="flex gap-2 text-xs">
                                <button
                                  className="px-2 py-1 border rounded"
                                  onClick={() => addCard(c, "Spellbook")}
                                >
                                  + Spellbook
                                </button>
                                <button
                                  className="px-2 py-1 border rounded"
                                  onClick={() => addCard(c, "Atlas")}
                                >
                                  + Atlas
                                </button>
                                <button
                                  className="px-2 py-1 border rounded"
                                  onClick={() => addCard(c, "Sideboard")}
                                >
                                  + Side
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {!!sites.length && (
                      <div>
                        <div className="text-xs uppercase opacity-70 mb-2">
                          Sites
                        </div>
                        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2 text-sm">
                          {sites.map((c) => (
                            <div
                              key={c.variantId}
                              className="border rounded p-2"
                            >
                              <div className="relative aspect-[4/3] w-full overflow-hidden rounded bg-muted/40 mb-2">
                                <Image
                                  src={`/api/images/${c.slug}`}
                                  alt={c.cardName}
                                  fill
                                  sizes="(max-width:640px) 100vw, (max-width:1024px) 50vw, 33vw"
                                  className="object-contain rotate-90 origin-center"
                                  unoptimized
                                />
                              </div>
                              <div className="font-semibold">{c.cardName}</div>
                              <div className="opacity-80">
                                {c.rarity} • {c.finish}
                              </div>
                              <div className="opacity-70 text-xs mb-2">
                                {c.slug}
                              </div>
                              <div className="flex gap-2 text-xs">
                                <button
                                  className="px-2 py-1 border rounded"
                                  onClick={() => addCard(c, "Atlas")}
                                >
                                  + Atlas
                                </button>
                                <button
                                  className="px-2 py-1 border rounded"
                                  onClick={() => addCard(c, "Spellbook")}
                                >
                                  + Spellbook
                                </button>
                                <button
                                  className="px-2 py-1 border rounded"
                                  onClick={() => addCard(c, "Sideboard")}
                                >
                                  + Side
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          ))}
        </div>
      )}

      <div className="border rounded p-4">
        <div className="font-medium mb-2">Deck Build</div>
        <div className="text-sm opacity-80 mb-3">
          Totals — Spellbook: {zoneCounts.Spellbook} • Atlas: {zoneCounts.Atlas}{" "}
          • Sideboard: {zoneCounts.Sideboard}
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {Object.entries(picks).map(([key, it]) => (
            <div
              key={key}
              className="border rounded p-2 text-sm flex flex-col gap-2"
            >
              <div className="font-semibold">{it.name}</div>
              <div className="opacity-80">{it.rarity}</div>
              <div className="flex items-center gap-2">
                <select
                  value={it.zone}
                  onChange={(e) => changeZone(key, e.target.value as Zone)}
                  className="border rounded px-2 py-1"
                >
                  <option value="Spellbook">Spellbook</option>
                  <option value="Atlas">Atlas</option>
                  <option value="Sideboard">Sideboard</option>
                </select>
                <div className="ml-auto flex items-center gap-2">
                  <button
                    className="px-2 py-1 border rounded"
                    onClick={() => removeOne(key)}
                  >
                    -
                  </button>
                  <div className="min-w-6 text-center">{it.count}</div>
                  <button
                    className="px-2 py-1 border rounded"
                    onClick={() =>
                      setPicks((prev) => ({
                        ...prev,
                        [key]: { ...it, count: it.count + 1 },
                      }))
                    }
                  >
                    +
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-sm opacity-80">Deck name</span>
          <input
            value={deckName}
            onChange={(e) => setDeckName(e.target.value)}
            className="border rounded px-3 py-2 bg-transparent"
          />
        </label>
        <button
          onClick={saveDeck}
          disabled={!Object.keys(picks).length || saving}
          className="h-10 px-4 rounded bg-foreground text-background disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save Deck"}
        </button>
        {saveResult && (
          <div className="text-sm">
            Saved deck <span className="font-semibold">{saveResult.name}</span>{" "}
            (id: {saveResult.id})
          </div>
        )}
      </div>
    </div>
  );
}
