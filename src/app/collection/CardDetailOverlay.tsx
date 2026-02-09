"use client";

import Image from "next/image";
import { useEffect, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { NumberBadge, type Digit } from "@/components/game/manacost";
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
      return "text-red-400";
    case "water":
      return "text-blue-400";
    case "earth":
      return "text-green-400";
    case "air":
      return "text-cyan-300";
    default:
      return "text-gray-300";
  }
}

/** Rarity color mapping */
function getRarityColor(rarity: string): string {
  switch (rarity.toLowerCase()) {
    case "unique":
      return "text-purple-400";
    case "elite":
      return "text-yellow-400";
    case "exceptional":
      return "text-blue-400";
    case "ordinary":
    default:
      return "text-gray-400";
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
    '<span class="text-amber-300 font-medium">$1</span>',
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

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) onClose();
    },
    [onClose],
  );

  const overlay = (
    <div
      className="fixed inset-0 z-[200] bg-black/95 flex items-center justify-center p-4 overflow-y-auto"
      onClick={handleBackdropClick}
    >
      {/* Close button */}
      <button
        className="fixed top-4 right-4 text-white text-2xl p-2 z-[201] hover:text-gray-300"
        onClick={onClose}
      >
        ✕
      </button>

      <div
        className="bg-gray-900 rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl border border-gray-700"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Card Image */}
        <div className="flex justify-center p-6 bg-gray-950 rounded-t-xl">
          <div
            className={`relative rounded-lg ${
              isSite
                ? "w-[420px] h-[300px] overflow-hidden"
                : "w-[240px] h-[336px]"
            }`}
          >
            <Image
              src={imageUrl}
              alt={cardName}
              fill
              className={`rounded-lg ${
                isSite
                  ? "object-contain rotate-90 scale-[1.4]"
                  : "object-contain"
              }`}
              sizes="320px"
              unoptimized
            />
            {card.finish === "Foil" && (
              <div className="absolute top-2 right-2 bg-yellow-500 text-black text-xs px-2 py-0.5 rounded font-bold z-10">
                FOIL
              </div>
            )}
          </div>
        </div>

        {/* Card Details */}
        <div className="p-6 space-y-4">
          {/* Header: Name, Set, Rarity */}
          <div>
            <h2 className="text-2xl font-bold text-white">{cardName}</h2>
            <div className="flex items-center gap-2 mt-1 text-sm">
              <span className="text-gray-400">{setName}</span>
              {card.meta?.rarity && (
                <span className={getRarityColor(card.meta.rarity)}>
                  {card.meta.rarity}
                </span>
              )}
              {card.meta?.type && (
                <span className="text-gray-500">{card.meta.type}</span>
              )}
            </div>
            {card.card.subTypes && (
              <div className="text-xs text-gray-500 mt-0.5">
                {card.card.subTypes}
              </div>
            )}
          </div>

          {/* Stats Row: Cost, Attack, Life, Elements */}
          <div className="flex flex-wrap items-center gap-3">
            {card.meta?.cost != null && (
              <div className="bg-gray-800 rounded px-3 py-1.5 text-sm flex items-center gap-1.5">
                <span className="text-gray-500">Cost</span>
                {card.meta.cost >= 0 && card.meta.cost <= 9 ? (
                  <NumberBadge
                    value={card.meta.cost as Digit}
                    size={20}
                    strokeWidth={8}
                  />
                ) : (
                  <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-white text-black text-xs font-bold">
                    {card.meta.cost}
                  </span>
                )}
              </div>
            )}
            {card.meta?.attack != null && hasLifeStat(card.meta?.type) && (
              <div className="bg-gray-800 rounded px-3 py-1.5 text-sm">
                <span className="text-gray-500">ATK </span>
                <span className="text-red-400 font-bold">
                  {card.meta.attack}
                </span>
              </div>
            )}
            {hasLifeStat(card.meta?.type) && card.meta?.attack != null && (
              <div className="bg-gray-800 rounded px-3 py-1.5 text-sm">
                <span className="text-gray-500">Health </span>
                <span className="text-green-400 font-bold">
                  {card.meta?.defence ?? card.meta.attack}
                </span>
              </div>
            )}
            {card.card.elements && (
              <div className="bg-gray-800 rounded px-3 py-1.5 text-sm">
                {card.card.elements.split(",").map((el) => (
                  <span
                    key={el.trim()}
                    className={`${getElementColor(el.trim())} font-medium mr-1`}
                  >
                    {el.trim()}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Thresholds */}
          {card.meta?.thresholds && (
            <div className="flex items-center gap-2 text-sm">
              <span className="text-gray-500">Threshold:</span>
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
                      className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-gray-800"
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
            <div className="bg-gray-800/50 rounded-lg p-4 border border-gray-700">
              <p className="text-gray-200 text-sm whitespace-pre-wrap leading-relaxed">
                {card.meta.rulesText}
              </p>
            </div>
          )}

          {/* Notes */}
          {card.notes && (
            <div className="bg-gray-800/30 rounded-lg p-3 border border-gray-700/50">
              <span className="text-gray-500 text-xs uppercase tracking-wide">
                Notes
              </span>
              <p className="text-gray-300 text-sm mt-1">{card.notes}</p>
            </div>
          )}

          {/* Prices */}
          <div className="border-t border-gray-800 pt-4">
            <h3 className="text-sm font-medium text-gray-400 mb-2">
              Market Prices
            </h3>
            <div className="flex gap-4">
              <div className="bg-gray-800 rounded px-4 py-2">
                <div className="text-xs text-gray-500">Standard</div>
                <div className="text-lg font-bold">
                  {prices?.standard?.marketPrice != null ? (
                    <span className="text-green-400">
                      ${prices.standard.marketPrice.toFixed(2)}
                    </span>
                  ) : (
                    <span className="text-gray-600">—</span>
                  )}
                </div>
              </div>
              <div className="bg-gray-800 rounded px-4 py-2">
                <div className="text-xs text-yellow-500">Foil</div>
                <div className="text-lg font-bold">
                  {prices?.foil?.marketPrice != null ? (
                    <span className="text-green-400">
                      ${prices.foil.marketPrice.toFixed(2)}
                    </span>
                  ) : (
                    <span className="text-gray-600">—</span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Codex Entries */}
          {codexLoading && (
            <div className="text-gray-500 text-sm animate-pulse">
              Loading codex entries...
            </div>
          )}
          {codexEntries && codexEntries.length > 0 && (
            <div className="border-t border-gray-800 pt-4">
              <h3 className="text-sm font-medium text-amber-400 mb-3">
                Codex Entries
              </h3>
              <div className="space-y-3">
                {codexEntries.map((entry) => (
                  <div
                    key={entry.id}
                    className="bg-gray-800/50 rounded-lg p-3 border border-gray-700"
                  >
                    <h4 className="font-bold text-amber-300 text-sm mb-1">
                      {entry.title}
                    </h4>
                    <div
                      className="text-gray-300 text-xs whitespace-pre-wrap leading-relaxed"
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
          <div className="text-center text-sm text-gray-500 pt-2 border-t border-gray-800">
            {card.quantity}× in collection
            {card.finish === "Foil" && (
              <span className="ml-1 text-yellow-500">(Foil)</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  if (typeof document === "undefined") return null;
  return createPortal(overlay, document.body);
}
