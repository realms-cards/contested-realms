"use client";

/**
 * Attack of the Realm Eater - Shared Mana Display
 *
 * Shows the shared mana pool that all players draw from
 * Uses proper element symbols (PNG images) instead of emoji
 */

import Image from "next/image";
import { useAotreStore } from "@/lib/aotre/store";

interface SharedManaDisplayProps {
  compact?: boolean;
}

/** Element configuration with proper PNG icons */
const ELEMENTS = [
  { key: "fire" as const, icon: "/fire.png", color: "bg-red-600" },
  { key: "water" as const, icon: "/water.png", color: "bg-blue-600" },
  { key: "earth" as const, icon: "/earth.png", color: "bg-amber-700" },
  { key: "air" as const, icon: "/air.png", color: "bg-sky-500" },
];

export function SharedManaDisplay({ compact }: SharedManaDisplayProps) {
  const sharedMana = useAotreStore((s) => s.sharedMana);
  const sharedThresholds = useAotreStore((s) => s.sharedThresholds);
  const manaSpentThisRound = useAotreStore((s) => s.manaSpentThisRound);

  // Check if any thresholds are available
  const hasThresholds = ELEMENTS.some(
    (el) => (sharedThresholds[el.key] ?? 0) > 0,
  );

  if (compact) {
    return (
      <div className="flex items-center gap-3">
        {/* Mana display - styled like main game */}
        <div className="flex items-center gap-2 bg-black/40 backdrop-blur-sm rounded-lg px-3 py-1.5 ring-1 ring-white/10">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-white shadow-md">
            <span className="font-fantaisie text-sm font-bold text-gray-900">
              {sharedMana}
            </span>
          </div>
          <div className="flex flex-col">
            <span className="text-[10px] text-gray-400 leading-none">
              Shared
            </span>
            <span className="text-xs text-white font-medium leading-none">
              Mana
            </span>
          </div>
        </div>

        {/* Thresholds - polished style */}
        {hasThresholds && (
          <div className="flex items-center gap-1.5 bg-black/40 backdrop-blur-sm rounded-lg px-2 py-1.5 ring-1 ring-white/10">
            {ELEMENTS.map((el) => {
              const count = sharedThresholds[el.key] ?? 0;
              if (count === 0) return null;
              return (
                <div
                  key={el.key}
                  className="flex items-center gap-0.5"
                  title={`${el.key}: ${count}`}
                >
                  <Image
                    src={el.icon}
                    alt={el.key}
                    width={14}
                    height={14}
                    className="drop-shadow"
                  />
                  <span className="font-fantaisie text-xs text-white">
                    {count}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-4 rounded-xl bg-black/50 backdrop-blur-sm px-5 py-3 ring-1 ring-white/10 shadow-xl">
      {/* Mana Pool with game font */}
      <div className="flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white shadow-lg">
          <span className="font-fantaisie text-xl font-bold text-gray-900">
            {sharedMana}
          </span>
        </div>
        <div>
          <div className="font-fantaisie text-white text-sm">Shared Mana</div>
          {manaSpentThisRound > 0 && (
            <div className="text-xs text-amber-400">
              -{manaSpentThisRound} spent this round
            </div>
          )}
        </div>
      </div>

      {/* Divider */}
      {hasThresholds && <div className="w-px h-8 bg-white/20" />}

      {/* Threshold Display with PNG icons */}
      {hasThresholds && (
        <div className="flex gap-2">
          {ELEMENTS.map((el) => {
            const count = sharedThresholds[el.key] ?? 0;
            if (count === 0) return null;
            return (
              <div
                key={el.key}
                className="flex items-center gap-1 bg-black/30 rounded-lg px-2 py-1"
                title={`${el.key}: ${count}`}
              >
                <Image
                  src={el.icon}
                  alt={el.key}
                  width={18}
                  height={18}
                  className="drop-shadow"
                />
                <span className="font-fantaisie text-sm font-bold text-white">
                  {count}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
