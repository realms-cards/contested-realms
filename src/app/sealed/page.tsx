"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import AppShell from "@/components/ui/AppShell";
import { CustomSelect } from "@/components/ui/CustomSelect";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { PageHeader, PanelHeader } from "@/components/ui/page-header";
import { RcButton } from "@/components/ui/rc-button";

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

const ZONES: Zone[] = ["Spellbook", "Atlas", "Sideboard"];

/** Rarity pill tone: Unique reads gold, Elite reads as a highlight. */
function rarityTone(rarity: Rarity): BadgeTone {
  if (rarity === "Unique") return "gold";
  if (rarity === "Elite") return "ok";
  return "default";
}

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

  const pickEntries = Object.entries(picks);

  const renderCard = (c: BoosterCard, zones: Zone[], site: boolean) => (
    <div
      key={c.variantId}
      className="rounded-rc-md border border-rc-line/12 bg-black/30 p-2"
    >
      <div
        className={`relative w-full overflow-hidden rounded-rc-sm bg-black/40 mb-2 ${
          site ? "aspect-[4/3]" : "aspect-[3/4]"
        }`}
      >
        <Image
          src={`/api/images/${c.slug}`}
          alt={c.cardName}
          fill
          sizes="(max-width:640px) 100vw, (max-width:1024px) 50vw, 33vw"
          className={
            site
              ? "object-contain rotate-90 origin-center"
              : "object-cover"
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
      <div className="rc-hint mt-1.5 mb-2 truncate">{c.slug}</div>
      <div className="flex flex-wrap gap-1.5">
        {zones.map((zone) => (
          <RcButton
            key={zone}
            variant="outline"
            size="sm"
            onClick={() => addCard(c, zone)}
          >
            + {zone}
          </RcButton>
        ))}
      </div>
    </div>
  );

  return (
    <AppShell width="wide">
      <PageHeader
        eyebrow="limited"
        title="Sealed"
        description="Open a pool of packs, then build a deck from what you pulled."
      />

      <section className="rc-panel">
        <PanelHeader title="Open a pool" meta={setName} />
        <div className="flex flex-wrap items-end gap-4 px-[18px] py-3.5">
          <label className="flex flex-col gap-1.5">
            <span className="rc-field-label">Set</span>
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
            <span className="rc-field-label">Packs</span>
            <input
              type="number"
              min={1}
              max={12}
              value={packsCount}
              onChange={(e) => setPacksCount(Number(e.target.value))}
              className="rc-input h-9 w-28"
            />
          </label>

          <RcButton
            variant={pickEntries.length > 0 ? "outline" : "default"}
            onClick={openPacks}
            disabled={!canOpen || opening}
          >
            {opening ? "Opening…" : "Open packs"}
          </RcButton>
        </div>
      </section>

      {error && (
        <div className="rc-alert" data-tone="danger">
          Error: {error}
        </div>
      )}

      {!!boosters.length && (
        <div className="grid gap-6">
          {boosters.map((pack, idx) => {
            const sites = pack.filter((c) =>
              (c.type || "").toLowerCase().includes("site")
            );
            const spells = pack.filter(
              (c) => !(c.type || "").toLowerCase().includes("site")
            );
            return (
              <section key={idx} className="rc-panel">
                <PanelHeader
                  title="Pack"
                  meta={
                    <span className="rc-stat text-sm">
                      {idx + 1} / {boosters.length}
                    </span>
                  }
                />
                <div className="space-y-4 px-[18px] py-3.5">
                  {!!spells.length && (
                    <div>
                      <div className="rc-eyebrow mb-2">Spellbook</div>
                      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                        {spells.map((c) =>
                          renderCard(
                            c,
                            ["Spellbook", "Atlas", "Sideboard"],
                            false
                          )
                        )}
                      </div>
                    </div>
                  )}
                  {!!sites.length && (
                    <div>
                      <div className="rc-eyebrow mb-2">Sites</div>
                      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                        {sites.map((c) =>
                          renderCard(
                            c,
                            ["Atlas", "Spellbook", "Sideboard"],
                            true
                          )
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </section>
            );
          })}
        </div>
      )}

      <section className="rc-panel">
        <PanelHeader
          title="Deck build"
          meta={`${pickEntries.length} entries`}
        />
        <div className="px-[18px] py-3.5">
          <div className="mb-3 flex flex-wrap gap-6">
            {ZONES.map((zone) => (
              <div key={zone}>
                <div className="rc-hint uppercase">{zone}</div>
                <div className="rc-stat text-xl">{zoneCounts[zone]}</div>
              </div>
            ))}
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {pickEntries.map(([key, it]) => (
              <div
                key={key}
                className="flex flex-col gap-2 rounded-rc-md border border-rc-line/12 bg-black/30 p-2"
              >
                <div className="font-rc-display text-[19px] leading-[1.1] text-rc-fg-strong">
                  {it.name}
                </div>
                <div>
                  <Badge tone={rarityTone(it.rarity)}>{it.rarity}</Badge>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="rc-segment">
                    {ZONES.map((zone) => (
                      <button
                        key={zone}
                        type="button"
                        aria-pressed={it.zone === zone}
                        onClick={() => changeZone(key, zone)}
                      >
                        {zone}
                      </button>
                    ))}
                  </div>
                  <div className="ml-auto flex items-center gap-2">
                    <RcButton
                      variant="outline"
                      size="sm"
                      aria-label={`Remove one ${it.name}`}
                      onClick={() => removeOne(key)}
                    >
                      −
                    </RcButton>
                    <div className="rc-stat min-w-6 text-center">
                      {it.count}
                    </div>
                    <RcButton
                      variant="outline"
                      size="sm"
                      aria-label={`Add one ${it.name}`}
                      onClick={() =>
                        setPicks((prev) => ({
                          ...prev,
                          [key]: { ...it, count: it.count + 1 },
                        }))
                      }
                    >
                      +
                    </RcButton>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1.5">
          <span className="rc-field-label">Deck name</span>
          <input
            value={deckName}
            onChange={(e) => setDeckName(e.target.value)}
            className="rc-input h-10"
          />
        </label>
        <RcButton
          variant={pickEntries.length > 0 ? "default" : "outline"}
          onClick={saveDeck}
          disabled={!pickEntries.length || saving}
          className="h-10"
        >
          {saving ? "Saving…" : "Save deck"}
        </RcButton>
        {saveResult && (
          <div className="rc-alert" data-tone="success">
            Saved deck{" "}
            <span className="text-rc-fg-strong">{saveResult.name}</span> (id:{" "}
            {saveResult.id})
          </div>
        )}
      </div>
    </AppShell>
  );
}
