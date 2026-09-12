"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import AppShell from "@/components/ui/AppShell";
import { CustomSelect } from "@/components/ui/CustomSelect";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { PageHeader, PanelHeader } from "@/components/ui/page-header";
import { RcButton } from "@/components/ui/rc-button";

type Rarity = "Ordinary" | "Exceptional" | "Elite" | "Unique";

type BoosterCard = {
  variantId: number;
  slug: string;
  finish: "Standard" | "Foil";
  product: string;
  rarity: Rarity;
  type: string | null;
  cardId: number;
  cardName: string;
};

/** Rarity pill tone: Unique reads gold, Elite reads as a highlight. */
function rarityTone(rarity: Rarity): BadgeTone {
  if (rarity === "Unique") return "gold";
  if (rarity === "Elite") return "ok";
  return "default";
}

function BoosterCardTile({ card, site }: { card: BoosterCard; site: boolean }) {
  return (
    <div className="rounded-rc-md border border-rc-line/12 bg-black/30 p-2">
      <div
        className={`relative mb-2 w-full overflow-hidden rounded-rc-sm bg-black/40 ${
          site ? "aspect-[4/3]" : "aspect-[3/4]"
        }`}
      >
        <Image
          src={`/api/images/${card.slug}`}
          alt={card.cardName}
          fill
          sizes="(max-width:640px) 100vw, (max-width:1024px) 50vw, 33vw"
          className={
            site ? "object-contain rotate-90 origin-center" : "object-cover"
          }
          unoptimized
        />
      </div>
      <div className="font-rc-display text-[19px] leading-[1.1] text-rc-fg-strong">
        {card.cardName}
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        <Badge tone={rarityTone(card.rarity)}>{card.rarity}</Badge>
        <Badge>{card.finish}</Badge>
      </div>
      <div className="rc-hint mt-1.5 truncate">{card.slug}</div>
    </div>
  );
}

export default function BoosterPage() {
  const [setName, setSetName] = useState("Alpha");
  const [count, setCount] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [packs, setPacks] = useState<BoosterCard[][]>([]);

  const canFetch = useMemo(
    () => count >= 1 && count <= 12 && !!setName,
    [count, setName]
  );

  async function fetchPacks() {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(
        `/api/booster?set=${encodeURIComponent(setName)}&count=${count}`
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Request failed");
      setPacks(data.packs as BoosterCard[][]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPacks([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // initial demo fetch
    fetchPacks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <AppShell width="wide">
      <PageHeader
        eyebrow="limited"
        title="Booster"
        description="Generate booster packs from a set and look at what comes out."
      />

      <section className="rc-panel">
        <PanelHeader title="Generate packs" meta={setName} />
        <div className="flex flex-wrap items-end gap-4 px-[18px] py-3.5">
          <label className="flex flex-col gap-1.5">
            <span className="rc-eyebrow">Set</span>
            <CustomSelect
              value={setName}
              onChange={(v) => setSetName(v)}
              options={[
                { value: "Alpha", label: "Alpha" },
                { value: "Beta", label: "Beta" },
              ]}
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="rc-eyebrow">Packs</span>
            <input
              type="number"
              min={1}
              max={12}
              value={count}
              onChange={(e) => setCount(Number(e.target.value))}
              className="rc-input h-9 w-28"
            />
          </label>

          <RcButton onClick={fetchPacks} disabled={!canFetch || loading}>
            {loading ? "Generating…" : "Open packs"}
          </RcButton>
        </div>
      </section>

      {error && (
        <div className="rc-alert" data-tone="danger">
          Error: {error}
        </div>
      )}

      <div className="grid gap-6">
        {packs.map((pack, idx) => {
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
                    {idx + 1} / {packs.length}
                  </span>
                }
              />
              <div className="space-y-4 px-[18px] py-3.5">
                {!!spells.length && (
                  <div>
                    <div className="rc-eyebrow mb-2">Spellbook</div>
                    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                      {spells.map((c) => (
                        <BoosterCardTile
                          key={c.variantId}
                          card={c}
                          site={false}
                        />
                      ))}
                    </div>
                  </div>
                )}
                {!!sites.length && (
                  <div>
                    <div className="rc-eyebrow mb-2">Sites</div>
                    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                      {sites.map((c) => (
                        <BoosterCardTile key={c.variantId} card={c} site />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </section>
          );
        })}
      </div>
    </AppShell>
  );
}
