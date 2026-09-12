"use client";

import { Info, RefreshCw } from "lucide-react";
import Image from "next/image";
import { useCallback, useEffect, useState } from "react";
import AppShell from "@/components/ui/AppShell";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { RcButton } from "@/components/ui/rc-button";

type RandomSpell = {
  cardId: number;
  variantId: number;
  name: string;
  type: string;
  slug: string;
  set: string;
  rarity: string | null;
  rulesText: string | null;
  cost: number | null;
  attack: number | null;
  defence: number | null;
  thresholds: Record<string, number> | null;
  elements: string | null;
  subTypes: string | null;
  finish: string;
  artist: string | null;
  flavorText: string | null;
};

export default function RandomSpellPage() {
  const [spell, setSpell] = useState<RandomSpell | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showInfo, setShowInfo] = useState(false);

  const fetchRandomSpell = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/cards/random-spell");
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to fetch");
      }
      const data = await res.json();
      setSpell(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRandomSpell();
  }, [fetchRandomSpell]);

  return (
    <AppShell width="narrow">
      <PageHeader eyebrow="draw one" title="Random Spell" />

      {loading && (
        <div className="rc-hint flex items-center justify-center gap-2 py-6">
          <RefreshCw className="h-4 w-4 animate-spin text-rc-fg-muted" />
          drawing a random spell…
        </div>
      )}

      {error && (
        <div className="mx-auto w-full max-w-lg">
          <div className="rc-alert" data-tone="danger">
            {error}
          </div>
          <div className="mt-3 flex justify-center">
            <RcButton variant="outline" onClick={fetchRandomSpell}>
              Try Again
            </RcButton>
          </div>
        </div>
      )}

      {spell && !loading && (
        <div className="mx-auto flex w-full max-w-lg flex-col items-center gap-5">
          {/* Card Image */}
          <div className="relative aspect-[3/4] w-full max-w-[20rem] overflow-hidden rounded-rc-lg border border-rc-line/18 shadow-rc-panel">
            <Image
              src={`/api/images/${spell.slug}`}
              alt={spell.name}
              fill
              className="object-contain"
              priority
              unoptimized
            />
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center justify-center gap-3">
            <RcButton
              onClick={fetchRandomSpell}
              title="Draw another random spell"
            >
              <RefreshCw className="h-4 w-4" />
              Draw again
            </RcButton>
            <RcButton
              variant={showInfo ? "secondary" : "outline"}
              onClick={() => setShowInfo((v) => !v)}
              title={showInfo ? "Hide card details" : "Show card details"}
            >
              <Info className="h-4 w-4" />
              {showInfo ? "Hide Info" : "Show Info"}
            </RcButton>
          </div>

          {/* Card Info (collapsible) */}
          {showInfo && (
            <section className="rc-panel w-full p-[18px] text-center">
              <h2 className="m-0 font-rc-display text-[26px] leading-[1.1] text-rc-fg-strong">
                {spell.name}
              </h2>
              <p className="mt-1.5 font-rc-sans text-sm text-rc-fg-muted">
                {spell.type}
                {spell.subTypes && ` — ${spell.subTypes}`}
              </p>
              <div className="rc-hint mt-2 flex items-center justify-center gap-3">
                <span>{spell.set}</span>
                {spell.rarity && (
                  <>
                    <span>·</span>
                    <span>{spell.rarity}</span>
                  </>
                )}
              </div>

              {/* Stats */}
              <div className="mt-3.5 flex flex-wrap items-center justify-center gap-2">
                {spell.cost !== null && (
                  <Badge tone="gold">Cost {spell.cost}</Badge>
                )}
                {spell.attack !== null && (
                  <Badge tone="warn">Atk {spell.attack}</Badge>
                )}
                {spell.defence !== null && (
                  <Badge tone="default">Def {spell.defence}</Badge>
                )}
              </div>

              {/* Thresholds */}
              {spell.thresholds && (
                <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
                  {Object.entries(spell.thresholds)
                    .filter(([, v]) => v > 0)
                    .map(([element, count]) => (
                      <Badge key={element} tone="default">
                        {element} {count}
                      </Badge>
                    ))}
                </div>
              )}

              {/* Rules Text */}
              {spell.rulesText && (
                <div className="mx-auto mt-4 max-w-sm whitespace-pre-wrap rounded-rc-md border border-rc-line/12 bg-black/30 p-3.5 text-left font-rc-sans text-sm leading-[1.6] text-rc-fg">
                  {spell.rulesText}
                </div>
              )}

              {/* Artist */}
              {spell.artist && (
                <p className="rc-hint mt-3">art by {spell.artist}</p>
              )}
            </section>
          )}
        </div>
      )}
    </AppShell>
  );
}
