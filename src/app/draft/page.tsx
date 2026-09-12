"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import AppShell from "@/components/ui/AppShell";
import { CustomSelect } from "@/components/ui/CustomSelect";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { PageHeader, PanelHeader } from "@/components/ui/page-header";
import { RcButton } from "@/components/ui/rc-button";
import { RcEmpty } from "@/components/ui/rc-empty";
import {
  type BoosterCard,
  type Rarity,
  weightForRarity,
  choiceWeighted,
} from "@/lib/game/cardSorting";

/** Rarity pill tone: Unique reads gold, Elite reads as a highlight. */
function rarityTone(rarity: Rarity): BadgeTone {
  if (rarity === "Unique") return "gold";
  if (rarity === "Elite") return "ok";
  return "default";
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

    // Bots pick simultaneously
    for (let s = 1; s < cur.length; s++) {
      const idx = botPickFrom(cur[s]);
      if (idx >= 0 && idx < cur[s].length) {
        cur[s].splice(idx, 1);
      }
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

      setSaveMsg(`Saved deck ${data.name} (id: ${data.id})`);

      // Redirect to editor with the new deck loaded
      router.push(`/decks/editor?id=${encodeURIComponent(data.id)}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  const renderPickable = (c: BoosterCard, idx: number, site: boolean) => (
    <button
      key={`${c.variantId}-${idx}`}
      type="button"
      onClick={() => makeHumanPick(idx)}
      disabled={isPicking}
      className="rounded-rc-md border border-rc-line/12 bg-black/30 p-2 text-left transition-colors hover:border-rc-accent/50 hover:bg-rc-accent/6 disabled:opacity-50"
    >
      <div
        className={`relative mb-2 w-full overflow-hidden rounded-rc-sm bg-black/40 ${
          site ? "aspect-[4/3]" : "aspect-[3/4]"
        }`}
      >
        <Image
          src={`/api/images/${c.slug}`}
          alt={c.cardName}
          fill
          sizes="(max-width:640px) 100vw, (max-width:1024px) 50vw, 33vw"
          className={
            site ? "object-contain rotate-90 origin-center" : "object-cover"
          }
          unoptimized
        />
      </div>
      <div className="font-rc-display text-[19px] leading-[1.1] text-rc-fg-strong">
        {c.cardName}
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        <Badge tone={rarityTone(c.rarity)}>{c.rarity}</Badge>
        <Badge>{c.finish}</Badge>
      </div>
      <div className="rc-hint mt-1.5 truncate">{c.slug}</div>
    </button>
  );

  const pack = currentPacks[0] || [];
  const entries = pack.map((c, idx) => ({ c, idx }));
  const sites = entries.filter((e) =>
    (e.c.type || "").toLowerCase().includes("site")
  );
  const spells = entries.filter(
    (e) => !(e.c.type || "").toLowerCase().includes("site")
  );

  return (
    <AppShell width="wide">
      <PageHeader
        eyebrow="limited"
        title="Draft"
        description="Draft three packs against bot seats, then save what you picked as a deck."
      />

      <section className="rc-panel">
        <PanelHeader title="Table setup" meta={setName} />
        <div className="flex flex-wrap items-end gap-4 px-[18px] py-3.5">
          <label className="flex flex-col gap-1.5">
            <span className="rc-eyebrow">Set</span>
            <CustomSelect
              value={setName}
              onChange={(v) => setSetName(v)}
              options={[
                { value: "Alpha", label: "Alpha" },
                { value: "Beta", label: "Beta" },
                { value: "Arthurian Legends", label: "Arthurian Legends" },
              ]}
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="rc-eyebrow">Players</span>
            <input
              type="number"
              min={2}
              max={12}
              value={players}
              onChange={(e) =>
                setPlayers(Math.max(2, Math.min(12, Number(e.target.value))))
              }
              className="rc-input h-9 w-28"
            />
          </label>

          <RcButton onClick={startDraft} disabled={starting}>
            {starting ? "Starting…" : "Start draft"}
          </RcButton>
        </div>
      </section>

      {error && (
        <div className="rc-alert" data-tone="danger">
          Error: {error}
        </div>
      )}

      {inProgress ? (
        <div className="grid grid-cols-12 gap-6">
          <div className="col-span-12 lg:col-span-8">
            <section className="rc-panel">
              <div className="rc-panel-head">
                <div>
                  <div className="rc-hint uppercase">Pack</div>
                  <div className="rc-stat text-xl">{packIndex + 1} / 3</div>
                </div>
                <div>
                  <div className="rc-hint uppercase">Pick</div>
                  <div className="rc-stat text-xl">{pickNumber} / 15</div>
                </div>
                <div>
                  <div className="rc-hint uppercase">Passing</div>
                  <div className="font-rc-mono text-sm text-rc-fg">
                    {dir === 1 ? "Left" : "Right"}
                  </div>
                </div>
                <div className="flex-1" />
                <div className="text-right">
                  <div className="rc-hint uppercase">Your picks</div>
                  <div className="rc-stat text-xl">{yourPicks.length}</div>
                </div>
              </div>
              <div className="space-y-4 px-[18px] py-3.5">
                {!!spells.length && (
                  <div>
                    <div className="rc-eyebrow mb-2">Spellbook</div>
                    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                      {spells.map(({ c, idx }) => renderPickable(c, idx, false))}
                    </div>
                  </div>
                )}
                {!!sites.length && (
                  <div>
                    <div className="rc-eyebrow mb-2">Sites</div>
                    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                      {sites.map(({ c, idx }) => renderPickable(c, idx, true))}
                    </div>
                  </div>
                )}
              </div>
            </section>
          </div>

          <div className="col-span-12 lg:col-span-4">
            <section className="rc-panel">
              <PanelHeader
                title="Your picks"
                meta={<span className="rc-stat text-sm">{yourPicks.length}</span>}
              />
              <div className="grid gap-2 px-[18px] py-3.5 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-1">
                {yourCounts.map((it) => (
                  <div
                    key={it.cardId}
                    className="flex items-center justify-between gap-3 rounded-rc-md border border-rc-line/12 bg-black/30 p-2"
                  >
                    <div className="min-w-0">
                      <div className="truncate font-rc-display text-[19px] leading-[1.1] text-rc-fg-strong">
                        {it.name}
                      </div>
                      <div className="mt-1">
                        <Badge tone={rarityTone(it.rarity)}>{it.rarity}</Badge>
                      </div>
                    </div>
                    <div className="rc-stat shrink-0 text-right">
                      ×{it.count}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </div>
      ) : (
        <RcEmpty title="No draft in progress.">
          Start a draft to begin. You will draft 3 packs, passing
          Left-Right-Left. Seat 1 is you; other seats are bots.
        </RcEmpty>
      )}

      {!inProgress && yourPicks.length > 0 && (
        <section className="rc-panel">
          <PanelHeader
            title="Save drafted deck"
            meta={<span className="rc-stat text-sm">{yourPicks.length} cards</span>}
          />
          <div className="flex flex-wrap items-end gap-3 px-[18px] py-3.5">
            <label className="flex flex-col gap-1.5">
              <span className="rc-eyebrow">Deck name</span>
              <input
                value={deckName}
                onChange={(e) => setDeckName(e.target.value)}
                className="rc-input h-10"
              />
            </label>
            <RcButton onClick={saveDeck} disabled={saving} className="h-10">
              {saving ? "Saving…" : "Save deck"}
            </RcButton>
            {saveMsg && (
              <div className="rc-alert" data-tone="success">
                {saveMsg}
              </div>
            )}
          </div>
        </section>
      )}
    </AppShell>
  );
}
