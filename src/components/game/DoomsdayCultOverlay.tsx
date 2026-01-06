"use client";

import React from "react";
import { useGameStore } from "@/lib/game/store";

export default function DoomsdayCultOverlay() {
  // Subscribe to permanents to trigger re-render when Doomsday Cult enters/leaves
  const _permanents = useGameStore((s) => s.permanents);
  const isDoomsdayCultActive = useGameStore((s) => s.isDoomsdayCultActive);
  const canCastFromSpellbookTop = useGameStore(
    (s) => s.canCastFromSpellbookTop
  );
  const castFromSpellbookTop = useGameStore((s) => s.castFromSpellbookTop);
  const getActiveDoomsdayCults = useGameStore((s) => s.getActiveDoomsdayCults);
  const actorKey = useGameStore((s) => s.actorKey);

  const isActive = isDoomsdayCultActive();

  if (!isActive) return null;

  const cults = getActiveDoomsdayCults();

  // Get current player's cast eligibility for each cult location
  const playerKey = actorKey || "p1";
  const castableLocations = cults.map((cult) => ({
    ...cult,
    check: canCastFromSpellbookTop(playerKey, cult.at),
  }));

  const canCastAnywhere = castableLocations.some((loc) => loc.check.canCast);

  return (
    <div className="fixed inset-0 z-[150] pointer-events-none">
      {/* Cast from spellbook hint (if player can cast) */}
      {canCastAnywhere && actorKey && (
        <div className="fixed right-4 bottom-32 z-[151] pointer-events-auto">
          <div className="bg-black/90 rounded-lg p-3 ring-1 ring-green-500/50 max-w-48">
            <div className="text-xs text-green-400 font-medium mb-1">
              Evil Cast Available
            </div>
            <div className="text-xs text-gray-400">
              Your top spellbook card is Evil. You can cast it at a Doomsday
              Cult location.
            </div>
            <div className="mt-2 space-y-1">
              {castableLocations
                .filter((loc) => loc.check.canCast)
                .map((loc) => (
                  <button
                    key={loc.at}
                    onClick={() => castFromSpellbookTop(playerKey, loc.at)}
                    className="w-full px-2 py-1 text-xs bg-green-900/50 hover:bg-green-800/50 text-green-300 rounded transition-colors"
                  >
                    Cast at {loc.at}
                  </button>
                ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
