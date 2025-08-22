"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";

type BoosterCard = {
  variantId: number;
  slug: string;
  finish: "Standard" | "Foil";
  product: string;
  rarity: "Ordinary" | "Exceptional" | "Elite" | "Unique";
  type: string | null;
  cardId: number;
  cardName: string;
};

export default function BoosterPage() {
  const [setName, setSetName] = useState("Alpha");
  const [count, setCount] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [packs, setPacks] = useState<BoosterCard[][]>([]);

  const canFetch = useMemo(() => count >= 1 && count <= 12 && !!setName, [count, setName]);

  async function fetchPacks() {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`/api/booster?set=${encodeURIComponent(setName)}&count=${count}`);
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
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <h1 className="text-2xl font-semibold">Booster Simulator</h1>

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
          <span className="text-sm opacity-80">Packs</span>
          <input
            type="number"
            min={1}
            max={12}
            value={count}
            onChange={(e) => setCount(Number(e.target.value))}
            className="border rounded px-3 py-2 bg-transparent w-28"
          />
        </label>

        <button
          onClick={fetchPacks}
          disabled={!canFetch || loading}
          className="h-10 px-4 rounded bg-foreground text-background disabled:opacity-50"
        >
          {loading ? "Generating..." : "Generate"}
        </button>
      </div>

      {error && (
        <div className="text-red-500">Error: {error}</div>
      )}

      <div className="grid gap-6">
        {packs.map((pack, idx) => (
          <div key={idx} className="border rounded p-4">
            <div className="font-medium mb-3">Pack {idx + 1}</div>
            {(() => {
              const sites = pack.filter((c) => (c.type || "").toLowerCase().includes("site"));
              const spells = pack.filter((c) => !(c.type || "").toLowerCase().includes("site"));
              return (
                <div className="space-y-4">
                  {!!spells.length && (
                    <div>
                      <div className="text-xs uppercase opacity-70 mb-2">Spellbook</div>
                      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2 text-sm">
                        {spells.map((c) => (
                          <div key={c.variantId} className="border rounded p-2">
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
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {!!sites.length && (
                    <div>
                      <div className="text-xs uppercase opacity-70 mb-2">Sites</div>
                      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2 text-sm">
                        {sites.map((c) => (
                          <div key={c.variantId} className="border rounded p-2">
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
    </div>
  );
}

