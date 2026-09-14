"use client";

import React from "react";
import { RcButton } from "@/components/ui/rc-button";
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
  const currentPlayer = useGameStore((s) => s.currentPlayer);

  const isActive = isDoomsdayCultActive();

  if (!isActive) return null;

  const cults = getActiveDoomsdayCults();

  // Online: the local seat. Hotseat (actorKey === null): whoever is to act.
  const playerKey = actorKey ?? (currentPlayer === 1 ? "p1" : "p2");
  const castableLocations = cults.map((cult) => ({
    ...cult,
    check: canCastFromSpellbookTop(playerKey, cult.at),
  }));

  const canCastAnywhere = castableLocations.some((loc) => loc.check.canCast);

  return (
    <div className="fixed inset-0 z-[150] pointer-events-none">
      {/* Cast from spellbook hint (if player can cast) */}
      {canCastAnywhere && (
        <div className="fixed right-4 bottom-32 z-[151] pointer-events-auto">
          <div className="rounded-rc-md border border-rc-line/18 bg-[rgba(9,13,25,0.9)] p-3 max-w-48 font-rc-sans text-rc-fg shadow-rc-panel">
            <div className="text-xs text-rc-accent-link font-medium mb-1">
              Evil Cast Available
            </div>
            <div className="text-xs text-rc-fg-muted">
              Your top spellbook card is Evil. You can cast it at a Doomsday
              Cult location.
            </div>
            <div className="mt-2 space-y-1">
              {castableLocations
                .filter((loc) => loc.check.canCast)
                .map((loc) => (
                  <RcButton
                    key={loc.at}
                    variant="outline"
                    size="xs"
                    onClick={() => castFromSpellbookTop(playerKey, loc.at)}
                    className="w-full h-6 px-2"
                  >
                    Cast at {loc.at}
                  </RcButton>
                ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
