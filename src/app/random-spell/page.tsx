"use client";

import { Info, RefreshCw } from "lucide-react";
import Image from "next/image";
import { useCallback, useEffect, useState } from "react";

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
    <div className="min-h-screen bg-zinc-950 text-white flex flex-col items-center justify-center p-4">
      <h1 className="text-2xl md:text-3xl font-bold mb-6 text-center">
        Random Spell
      </h1>

      {loading && (
        <div className="flex items-center gap-2 text-zinc-400">
          <RefreshCw className="w-5 h-5 animate-spin" />
          <span>Drawing a random spell...</span>
        </div>
      )}

      {error && (
        <div className="text-red-400 mb-4 text-center">
          <p>{error}</p>
          <button
            onClick={fetchRandomSpell}
            className="mt-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 rounded"
          >
            Try Again
          </button>
        </div>
      )}

      {spell && !loading && (
        <div className="flex flex-col items-center gap-4 max-w-lg w-full">
          {/* Card Image */}
          <div className="relative aspect-[3/4] w-72 md:w-80 rounded-lg overflow-hidden ring-2 ring-white/10 shadow-2xl">
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
          <div className="flex items-center gap-3">
            <button
              onClick={fetchRandomSpell}
              className="flex items-center gap-2 px-5 py-2.5 bg-purple-600 hover:bg-purple-500 rounded-lg font-medium transition-colors"
              title="Draw another random spell"
            >
              <RefreshCw className="w-4 h-4" />
              Draw again
            </button>
            <button
              onClick={() => setShowInfo((v) => !v)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg font-medium transition-colors ${
                showInfo
                  ? "bg-zinc-600 hover:bg-zinc-500"
                  : "bg-zinc-800 hover:bg-zinc-700"
              }`}
              title={showInfo ? "Hide card details" : "Show card details"}
            >
              <Info className="w-4 h-4" />
              {showInfo ? "Hide Info" : "Show Info"}
            </button>
          </div>

          {/* Card Info (collapsible) */}
          {showInfo && (
            <div className="text-center space-y-2 animate-in fade-in slide-in-from-top-2 duration-200">
              <h2 className="text-xl md:text-2xl font-semibold">
                {spell.name}
              </h2>
              <p className="text-zinc-400 text-sm">
                {spell.type}
                {spell.subTypes && ` — ${spell.subTypes}`}
              </p>
              <div className="flex items-center justify-center gap-4 text-sm text-zinc-500">
                <span>{spell.set}</span>
                {spell.rarity && (
                  <>
                    <span>•</span>
                    <span>{spell.rarity}</span>
                  </>
                )}
              </div>

              {/* Stats */}
              <div className="flex items-center justify-center gap-4 text-sm mt-2">
                {spell.cost !== null && (
                  <span className="px-2 py-1 bg-amber-900/50 rounded">
                    Cost: {spell.cost}
                  </span>
                )}
                {spell.attack !== null && (
                  <span className="px-2 py-1 bg-red-900/50 rounded">
                    ATK: {spell.attack}
                  </span>
                )}
                {spell.defence !== null && (
                  <span className="px-2 py-1 bg-blue-900/50 rounded">
                    DEF: {spell.defence}
                  </span>
                )}
              </div>

              {/* Thresholds */}
              {spell.thresholds && (
                <div className="flex items-center justify-center gap-2 text-sm mt-2">
                  {Object.entries(spell.thresholds)
                    .filter(([, v]) => v > 0)
                    .map(([element, count]) => (
                      <span
                        key={element}
                        className="px-2 py-1 bg-zinc-800 rounded capitalize"
                      >
                        {element}: {count}
                      </span>
                    ))}
                </div>
              )}

              {/* Rules Text */}
              {spell.rulesText && (
                <div className="mt-4 p-3 bg-zinc-900/60 rounded-lg text-sm text-zinc-300 text-left whitespace-pre-wrap max-w-sm mx-auto">
                  {spell.rulesText}
                </div>
              )}

              {/* Artist */}
              {spell.artist && (
                <p className="text-xs text-zinc-600 mt-2">
                  Art by {spell.artist}
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
