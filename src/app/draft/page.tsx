"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";

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

function weightForRarity(r: Rarity) {
  switch (r) {
    case "Unique":
      return 12;
    case "Elite":
      return 8;
    case "Exceptional":
      return 4;
    default:
      return 1;
  }
}

function choiceWeighted<T>(items: { item: T; weight: number }[]): T | null {
  const total = items.reduce((s, x) => s + Math.max(0, x.weight), 0);
  if (total <= 0) return null;
  let r = Math.random() * total;
  for (const { item, weight } of items) {
    const w = Math.max(0, weight);
    if (r < w) return item;
    r -= w;
  }
  return items.at(-1)?.item ?? null;
}

export default function DraftPage() {
  const router = useRouter();
  const [setName, setSetName] = useState("Alpha");
  const [players, setPlayers] = useState(8);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [seatPacks, setSeatPacks] = useState<BoosterCard[][][]>([]); // [seat][packIndex][cards]
  const [currentPacks, setCurrentPacks] = useState<BoosterCard[][]>([]); // [seat][cards]
  const [packIndex, setPackIndex] = useState(0); // 0..2
  const [pickNumber, setPickNumber] = useState(1); // 1..15

  const [yourPicks, setYourPicks] = useState<BoosterCard[]>([]);
  const [botPicks, setBotPicks] = useState<BoosterCard[][]>([]); // [botIndex][cards], botIndex 0 = seat 2 overall
  const [saving, setSaving] = useState(false);
  const [deckName, setDeckName] = useState("Draft Deck");
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [isPicking, setIsPicking] = useState(false);

  const dir = useMemo(() => (packIndex === 1 ? -1 : 1), [packIndex]); // L-R-L
  const inProgress = useMemo(
    () => currentPacks.length > 0 && packIndex < 3,
    [currentPacks, packIndex]
  );

  async function startDraft() {
    try {
      setStarting(true);
      setError(null);
      setSaveMsg(null);
      setYourPicks([]);
      setBotPicks([]);
      setSeatPacks([]);
      setCurrentPacks([]);
      setPackIndex(0);
      setPickNumber(1);

      const totalPacks = players * 3;
      const res = await fetch(
        `/api/booster?set=${encodeURIComponent(setName)}&count=${totalPacks}`
      );
      const data = await res.json();
      if (!res.ok)
        throw new Error(data?.error || "Failed to generate boosters");

      const packs: BoosterCard[][] = data.packs;
      // Assign 3 packs per seat
      const seats: BoosterCard[][][] = Array.from({ length: players }, () => [
        [],
        [],
        [],
      ]);
      for (let s = 0; s < players; s++) {
        seats[s][0] = packs[s * 3 + 0] ?? [];
        seats[s][1] = packs[s * 3 + 1] ?? [];
        seats[s][2] = packs[s * 3 + 2] ?? [];
      }
      setSeatPacks(seats);
      setCurrentPacks(seats.map((seat) => [...seat[0]]));
      setBotPicks(Array.from({ length: Math.max(0, players - 1) }, () => []));
      setPackIndex(0);
      setPickNumber(1);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setStarting(false);
    }
  }

  function rotatePacks(packs: BoosterCard[][], direction: number) {
    if (!packs.length) return packs;
    const n = packs.length;
    const out = Array.from({ length: n }, () => [] as BoosterCard[]);
    for (let i = 0; i < n; i++) {
      const j = (i + direction + n) % n; // pass to neighbor
      out[j] = packs[i];
    }
    return out;
  }

  function botPickFrom(pack: BoosterCard[]): number {
    if (!pack.length) return -1;
    const weighted = pack.map((c, idx) => ({
      item: idx,
      weight: weightForRarity(c.rarity),
    }));
    const idx = choiceWeighted(weighted);
    return typeof idx === "number" ? idx : 0;
  }

  function makeHumanPick(cardIdx: number) {
    if (!inProgress || isPicking) return;
    setIsPicking(true);

    // Work on a snapshot to avoid side effects inside a state updater
    const cur = currentPacks.map((p) => [...p]);
    const myPack = cur[0];
    if (!myPack || cardIdx < 0 || cardIdx >= myPack.length) {
      setIsPicking(false);
      return;
    }

    const picked = myPack.splice(cardIdx, 1)[0];

    // Bots pick simultaneously and we record their picks
    const botChosen: { botIdx: number; card: BoosterCard | null }[] = [];
    for (let s = 1; s < cur.length; s++) {
      const idx = botPickFrom(cur[s]);
      let chosen: BoosterCard | null = null;
      if (idx >= 0 && idx < cur[s].length) {
        chosen = cur[s].splice(idx, 1)[0];
      }
      botChosen.push({ botIdx: s - 1, card: chosen });
    }
    if (botChosen.length) {
      setBotPicks((prev) => {
        const out = prev.length === botChosen.length ? prev.map((arr) => [...arr]) : Array.from({ length: botChosen.length }, (_, i) => (prev[i] ? [...prev[i]] : []));
        for (const { botIdx, card } of botChosen) {
          if (card) out[botIdx].push(card);
        }
        return out;
      });
    }

    // Determine if pack ended
    const remaining = myPack.length;
    if (remaining <= 0) {
      const nextPi = packIndex + 1;
      if (nextPi >= 3) {
        setCurrentPacks([]);
      } else {
        setCurrentPacks(seatPacks.map((seat) => [...seat[nextPi]]));
      }
      setPackIndex(nextPi);
      setPickNumber(1);
    } else {
      // Pass packs
      const passed = rotatePacks(cur, dir);
      setCurrentPacks(passed);
      setPickNumber((n) => n + 1);
    }

    setYourPicks((prevP) => [...prevP, picked]);
    setIsPicking(false);
  }

  const yourCounts = useMemo(() => {
    const map = new Map<
      number,
      { name: string; rarity: Rarity; count: number }
    >();
    for (const c of yourPicks) {
      const it = map.get(c.cardId) || {
        name: c.cardName,
        rarity: c.rarity,
        count: 0,
      };
      it.count += 1;
      map.set(c.cardId, it);
    }
    return Array.from(map.entries())
      .map(([cardId, v]) => ({ cardId, ...v }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [yourPicks]);

  async function saveDeck() {
    try {
      setSaving(true);
      setError(null);
      setSaveMsg(null);
      const cards = yourPicks.map((c) => ({
        cardId: c.cardId,
        variantId: c.variantId,
        zone: "Spellbook",
        count: 1,
      }));
      const res = await fetch("/api/decks", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: deckName || "Draft Deck",
          format: "Draft",
          set: setName,
          cards,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to save deck");

      // Auto-save first bot's deck if available
      let botMsg = "";
      const firstBot = botPicks[0] || [];
      if (firstBot.length) {
        const botCards = firstBot.map((c) => ({ cardId: c.cardId, variantId: c.variantId, zone: "Spellbook" as const, count: 1 }));
        const resBot = await fetch("/api/decks", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name: `${deckName || "Draft Deck"} (Bot)`, format: "Draft", set: setName, cards: botCards }),
        });
        const dataBot = await resBot.json();
        if (resBot.ok) botMsg = ` and bot deck ${dataBot.name} (id: ${dataBot.id})`;
      }
      setSaveMsg(`Saved deck ${data.name} (id: ${data.id})${botMsg}`);

      // Redirect to editor with the new deck loaded
      router.push(`/decks/editor?id=${encodeURIComponent(data.id)}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <h1 className="text-2xl font-semibold">Draft Mode</h1>

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
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-sm opacity-80">Players</span>
          <input
            type="number"
            min={2}
            max={12}
            value={players}
            onChange={(e) =>
              setPlayers(Math.max(2, Math.min(12, Number(e.target.value))))
            }
            className="border rounded px-3 py-2 bg-transparent w-28"
          />
        </label>

        <button
          onClick={startDraft}
          disabled={starting}
          className="h-10 px-4 rounded bg-foreground text-background disabled:opacity-50"
        >
          {starting ? "Starting..." : "Start Draft"}
        </button>
      </div>

      {error && <div className="text-red-500">Error: {error}</div>}

      {inProgress ? (
        <div className="grid grid-cols-12 gap-6">
          <div className="col-span-12 lg:col-span-8">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm opacity-80">
                Pack {packIndex + 1} / 3 • Pick {pickNumber} / 15 • Passing{" "}
                {dir === 1 ? "Left" : "Right"}
              </div>
              <div className="text-sm">Your picks: {yourPicks.length}</div>
            </div>
            {(() => {
              const pack = currentPacks[0] || [];
              const entries = pack.map((c, idx) => ({ c, idx }));
              const sites = entries.filter((e) => (e.c.type || "").toLowerCase().includes("site"));
              const spells = entries.filter((e) => !(e.c.type || "").toLowerCase().includes("site"));
              return (
                <div className="space-y-4 text-sm">
                  {!!spells.length && (
                    <div>
                      <div className="text-xs uppercase opacity-70 mb-2">Spellbook</div>
                      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
                        {spells.map(({ c, idx }) => (
                          <button
                            key={`${c.variantId}-${idx}`}
                            onClick={() => makeHumanPick(idx)}
                            disabled={isPicking}
                            className="text-left border rounded p-2 hover:bg-muted disabled:opacity-50"
                          >
                            <div className="relative aspect-[3/4] w-full overflow-hidden rounded bg-muted/40 mb-2">
                              <Image
                                src={`/api/images/${c.slug}`}
                                alt={c.cardName}
                                fill
                                sizes="(max-width:640px) 100vw, (max-width:1024px) 50vw, 33vw"
                                className="object-cover"
                              />
                            </div>
                            <div className="font-semibold">{c.cardName}</div>
                            <div className="opacity-80">{c.rarity} • {c.finish}</div>
                            <div className="opacity-70 text-xs">{c.slug}</div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  {!!sites.length && (
                    <div>
                      <div className="text-xs uppercase opacity-70 mb-2">Sites</div>
                      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
                        {sites.map(({ c, idx }) => (
                          <button
                            key={`${c.variantId}-${idx}`}
                            onClick={() => makeHumanPick(idx)}
                            disabled={isPicking}
                            className="text-left border rounded p-2 hover:bg-muted disabled:opacity-50"
                          >
                            <div className="relative aspect-[4/3] w-full overflow-hidden rounded bg-muted/40 mb-2">
                              <Image
                                src={`/api/images/${c.slug}`}
                                alt={c.cardName}
                                fill
                                sizes="(max-width:640px) 100vw, (max-width:1024px) 50vw, 33vw"
                                className="object-contain rotate-90 origin-center"
                              />
                            </div>
                            <div className="font-semibold">{c.cardName}</div>
                            <div className="opacity-80">{c.rarity} • {c.finish}</div>
                            <div className="opacity-70 text-xs">{c.slug}</div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>

          <div className="col-span-12 lg:col-span-4">
            <div className="border rounded p-3">
              <div className="font-medium mb-2">
                Your Picks ({yourPicks.length})
              </div>
              <div className="grid sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-1 gap-2 text-sm">
                {yourCounts.map((it) => (
                  <div
                    key={it.cardId}
                    className="border rounded p-2 flex justify-between"
                  >
                    <div>
                      <div className="font-semibold">{it.name}</div>
                      <div className="opacity-80 text-xs">{it.rarity}</div>
                    </div>
                    <div className="text-right">x{it.count}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="text-sm opacity-80">
          Click <i>Start Draft</i> to begin. You will draft 3 packs, passing
          Left-Right-Left. Seat 1 is you; other seats are bots.
        </div>
      )}

      {!inProgress && yourPicks.length > 0 && (
        <div className="border rounded p-4">
          <div className="font-medium mb-2">Save Drafted Deck</div>
          <div className="flex items-end gap-3">
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
              disabled={saving}
              className="h-10 px-4 rounded bg-foreground text-background disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save Deck"}
            </button>
            {saveMsg && <div className="text-sm">{saveMsg}</div>}
          </div>
        </div>
      )}
    </div>
  );
}
