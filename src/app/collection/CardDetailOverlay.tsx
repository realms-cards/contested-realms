"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { NumberBadge, type Digit } from "@/components/game/manacost";
import { RcDialog } from "@/components/ui/rc-dialog";
import type { CollectionCardResponse } from "@/lib/collection/types";

interface CodexEntry {
  id: number;
  title: string;
  content: string;
}

interface CardPrices {
  standard: { marketPrice: number | null } | null;
  foil: { marketPrice: number | null } | null;
}

// Cache for codex entries and prices
const codexCache = new Map<string, CodexEntry[] | null>();
const detailPriceCache = new Map<string, CardPrices>();

interface CardDetailOverlayProps {
  card: CollectionCardResponse;
  onClose: () => void;
}

/** Element color mapping */
function getElementColor(element: string): string {
  switch (element.toLowerCase()) {
    case "fire":
      return "text-rc-ember";
    case "water":
      return "text-rc-info";
    case "earth":
      return "text-rc-success";
    case "air":
      return "text-rc-moonlight";
    default:
      return "text-rc-fg-muted";
  }
}

/** Rarity color mapping */
function getRarityColor(rarity: string): string {
  switch (rarity.toLowerCase()) {
    case "unique":
      return "text-rc-moonlight";
    case "elite":
      return "text-rc-accent-link";
    case "exceptional":
      return "text-rc-info";
    case "ordinary":
    default:
      return "text-rc-fg-subtle";
  }
}

/** Highlight [[Card Name]] references in codex content */
// SECURITY: HTML-escape content first to prevent XSS via dangerouslySetInnerHTML
function formatCodexContent(content: string): string {
  const escaped = content
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
  return escaped.replace(
    /\[\[([^\]]+)\]\]/g,
    '<span class="text-rc-accent-link font-medium">$1</span>',
  );
}

/** Check if card type is a site (needs landscape orientation) */
function isSiteType(type: string | undefined): boolean {
  return type?.toLowerCase().includes("site") === true;
}

/** Check if card type has combat stats (attack/life) — only units/minions */
function hasLifeStat(type: string | undefined): boolean {
  if (!type) return false;
  const t = type.toLowerCase();
  return t.includes("unit") || t.includes("minion");
}

export default function CardDetailOverlay({
  card,
  onClose,
}: CardDetailOverlayProps) {
  const [codexEntries, setCodexEntries] = useState<CodexEntry[] | null>(null);
  const [codexLoading, setCodexLoading] = useState(false);
  const [prices, setPrices] = useState<CardPrices | null>(null);

  const cardName = card.card.name;
  const setName = card.set?.name ?? "Unknown Set";
  const isSite = isSiteType(card.meta?.type);

  // Build image URL
  const imageSlug = card.variant?.slug;
  const imageUrl = imageSlug
    ? `/api/images/${imageSlug}`
    : "/api/assets/cardback_spellbook.png";

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  // Fetch codex entries
  useEffect(() => {
    if (codexCache.has(cardName)) {
      setCodexEntries(codexCache.get(cardName) ?? null);
      return;
    }

    setCodexLoading(true);
    fetch(`/api/codex?card=${encodeURIComponent(cardName)}`)
      .then((res) => res.json())
      .then((data) => {
        const result =
          data.entries?.length > 0 ? (data.entries as CodexEntry[]) : null;
        codexCache.set(cardName, result);
        setCodexEntries(result);
      })
      .catch(() => {
        codexCache.set(cardName, null);
      })
      .finally(() => setCodexLoading(false));
  }, [cardName]);

  // Fetch prices for both standard and foil
  useEffect(() => {
    const cacheKey = `${card.cardId}:${setName}`;
    if (detailPriceCache.has(cacheKey)) {
      setPrices(detailPriceCache.get(cacheKey) ?? null);
      return;
    }

    fetch(`/api/pricing/card/${card.cardId}`)
      .then((res) => res.json())
      .then((data) => {
        if (!data.prices) return;
        const standardPrice =
          data.prices.find(
            (p: { finish: string }) => p.finish === "Standard",
          ) ?? null;
        const foilPrice =
          data.prices.find((p: { finish: string }) => p.finish === "Foil") ??
          null;
        const result: CardPrices = {
          standard: standardPrice,
          foil: foilPrice,
        };
        detailPriceCache.set(cacheKey, result);
        setPrices(result);
      })
      .catch(() => {
        /* graceful degradation */
      });
  }, [card.cardId, setName]);

  return (
    <RcDialog title={cardName} eyebrow={setName} onClose={onClose} size="lg">
      <div className="space-y-4">
        {/* Card Image */}
        <div className="flex justify-center rounded-rc-md border border-rc-line/12 bg-black/30 p-6">
          <div
            className={`relative rounded-rc-md ${
              isSite
                ? "w-[420px] h-[300px] overflow-hidden"
                : "w-[240px] h-[336px]"
            }`}
          >
            <Image
              src={imageUrl}
              alt={cardName}
              fill
              className={`rounded-rc-md ${
                isSite
                  ? "object-contain rotate-90 scale-[1.4]"
                  : "object-contain"
              }`}
              sizes="320px"
              unoptimized
            />
            {card.finish === "Foil" && (
              <div className="absolute right-2 top-2 z-10 rounded-rc-sm border border-rc-accent/35 bg-rc-accent/85 px-2 py-0.5 font-rc-mono text-[10px] uppercase tracking-[0.18em] text-rc-accent-fg">
                Foil
              </div>
            )}
          </div>
        </div>

        {/* Header: Rarity, Type, Sub-types */}
        <div>
          <div className="flex flex-wrap items-center gap-2 font-rc-mono text-xs tracking-[0.1em]">
            {card.meta?.rarity && (
              <span className={getRarityColor(card.meta.rarity)}>
                {card.meta.rarity}
              </span>
            )}
            {card.meta?.type && (
              <span className="text-rc-fg-subtle">{card.meta.type}</span>
            )}
          </div>
          {card.card.subTypes && (
            <div className="mt-0.5 rc-hint">{card.card.subTypes}</div>
          )}
        </div>

        {/* Stats Row: Cost, Attack, Life, Elements */}
        <div className="flex flex-wrap items-center gap-3">
          {card.meta?.cost != null && (
            <div className="flex items-center gap-1.5 rounded-rc-sm border border-rc-line/22 bg-black/45 px-3 py-1.5 font-rc-mono text-xs tracking-[0.1em]">
              <span className="text-rc-fg-dim">Cost</span>
              {card.meta.cost >= 0 && card.meta.cost <= 9 ? (
                <NumberBadge
                  value={card.meta.cost as Digit}
                  size={20}
                  strokeWidth={8}
                />
              ) : (
                <span className="rc-stat">{card.meta.cost}</span>
              )}
            </div>
          )}
          {card.meta?.attack != null && hasLifeStat(card.meta?.type) && (
            <div className="rounded-rc-sm border border-rc-line/22 bg-black/45 px-3 py-1.5 font-rc-mono text-xs tracking-[0.1em]">
              <span className="text-rc-fg-dim">ATK </span>
              <span className="rc-stat text-rc-ember">{card.meta.attack}</span>
            </div>
          )}
          {hasLifeStat(card.meta?.type) && card.meta?.attack != null && (
            <div className="rounded-rc-sm border border-rc-line/22 bg-black/45 px-3 py-1.5 font-rc-mono text-xs tracking-[0.1em]">
              <span className="text-rc-fg-dim">Health </span>
              <span className="rc-stat text-rc-success">
                {card.meta?.defence ?? card.meta.attack}
              </span>
            </div>
          )}
          {card.card.elements && (
            <div className="rounded-rc-sm border border-rc-line/22 bg-black/45 px-3 py-1.5 font-rc-mono text-xs tracking-[0.1em]">
              {card.card.elements.split(",").map((el) => (
                <span
                  key={el.trim()}
                  className={`${getElementColor(el.trim())} mr-1`}
                >
                  {el.trim()}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Thresholds */}
        {card.meta?.thresholds && (
          <div className="flex items-center gap-2 font-rc-mono text-xs tracking-[0.1em]">
            <span className="text-rc-fg-dim">Threshold:</span>
            <div className="flex items-center gap-1.5">
              {(["air", "water", "earth", "fire"] as const).map((element) => {
                const count =
                  (card.meta?.thresholds as Record<string, number>)?.[
                    element
                  ] ?? 0;
                if (count <= 0) return null;
                return (
                  <span
                    key={element}
                    className="inline-flex items-center gap-0.5 rounded-rc-sm border border-rc-line/22 bg-black/45 px-1.5 py-0.5"
                  >
                    {Array.from({ length: count }).map((_, i) => (
                      <Image
                        key={i}
                        src={`/api/assets/${element}.png`}
                        alt={element}
                        width={14}
                        height={14}
                        unoptimized
                      />
                    ))}
                  </span>
                );
              })}
            </div>
          </div>
        )}

        {/* Rules Text */}
        {card.meta?.rulesText && (
          <div className="rounded-rc-md border border-rc-line/12 bg-black/30 p-4">
            <p className="m-0 whitespace-pre-wrap font-rc-sans text-sm leading-relaxed text-rc-fg">
              {card.meta.rulesText}
            </p>
          </div>
        )}

        {/* Notes */}
        {card.notes && (
          <div className="rounded-rc-md border border-rc-line/12 bg-black/30 p-3">
            <div className="rc-eyebrow">Notes</div>
            <p className="m-0 mt-1 font-rc-sans text-sm text-rc-fg">
              {card.notes}
            </p>
          </div>
        )}

        {/* Prices */}
        <div className="border-t border-rc-line/12 pt-4">
          <div className="rc-eyebrow mb-2">Market prices</div>
          <div className="flex flex-wrap gap-4">
            <div className="rounded-rc-sm border border-rc-line/22 bg-black/45 px-4 py-2">
              <div className="rc-hint">Standard</div>
              <div className="rc-stat text-lg">
                {prices?.standard?.marketPrice != null ? (
                  <span className="text-rc-accent-link">
                    ${prices.standard.marketPrice.toFixed(2)}
                  </span>
                ) : (
                  <span className="text-rc-fg-dim">—</span>
                )}
              </div>
            </div>
            <div className="rounded-rc-sm border border-rc-line/22 bg-black/45 px-4 py-2">
              <div className="font-rc-mono text-[11px] tracking-[0.1em] text-rc-accent-link">
                Foil
              </div>
              <div className="rc-stat text-lg">
                {prices?.foil?.marketPrice != null ? (
                  <span className="text-rc-accent-link">
                    ${prices.foil.marketPrice.toFixed(2)}
                  </span>
                ) : (
                  <span className="text-rc-fg-dim">—</span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Codex Entries */}
        {codexLoading && (
          <div className="rc-hint animate-pulse">Loading codex entries…</div>
        )}
        {codexEntries && codexEntries.length > 0 && (
          <div className="border-t border-rc-line/12 pt-4">
            <div className="rc-eyebrow mb-3">Codex entries</div>
            <div className="space-y-3">
              {codexEntries.map((entry) => (
                <div
                  key={entry.id}
                  className="rounded-rc-md border border-rc-line/12 bg-black/30 p-3"
                >
                  <h4 className="m-0 mb-1 font-rc-display text-[19px] leading-[1.1] text-rc-fg-strong">
                    {entry.title}
                  </h4>
                  <div
                    className="whitespace-pre-wrap font-rc-sans text-xs leading-relaxed text-rc-fg-muted"
                    dangerouslySetInnerHTML={{
                      __html: formatCodexContent(entry.content),
                    }}
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Quantity */}
        <div className="border-t border-rc-line/12 pt-2 text-center rc-hint">
          {card.quantity}× in collection
          {card.finish === "Foil" && (
            <span className="ml-1 text-rc-accent-link">(Foil)</span>
          )}
        </div>
      </div>
    </RcDialog>
  );
}
