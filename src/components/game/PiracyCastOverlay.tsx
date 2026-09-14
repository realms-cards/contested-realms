"use client";

import Image from "next/image";
import React from "react";
import { useGameStore } from "@/lib/game/store";

/**
 * Captain Baldassare / Sea Raider: "You may cast each of those spells once
 * this turn, ignoring threshold requirements."
 *
 * The pirated spells sit in the DEFENDER's cemetery. This panel lists the ones
 * the local player is still allowed to cast, and hands off to the shared
 * private-hand targeting flow so the player picks a tile the same way they do
 * for Morgana and Omphalos casts.
 */
export default function PiracyCastOverlay() {
  const piracyGrants = useGameStore((s) => s.piracyGrants);
  const actorKey = useGameStore((s) => s.actorKey);
  const currentPlayer = useGameStore((s) => s.currentPlayer);
  const turn = useGameStore((s) => s.turn);
  const setPendingPrivateHandCast = useGameStore(
    (s) => s.setPendingPrivateHandCast,
  );
  const pendingPrivateHandCast = useGameStore((s) => s.pendingPrivateHandCast);

  // Online: our own seat. Hotseat (actorKey === null): whoever is to act.
  const seat = actorKey ?? (currentPlayer === 1 ? "p1" : "p2");

  const available = piracyGrants.filter(
    (g) => !g.used && g.granteeSeat === seat && g.turn === turn,
  );

  // Hide while the player is already picking a tile, so the two panels don't
  // stack on top of each other.
  if (available.length === 0 || pendingPrivateHandCast) return null;

  const sourceName = available[0].sourceName;

  return (
    <div className="fixed right-4 bottom-56 z-[151] pointer-events-auto">
      <div className="rounded-rc-md border border-rc-line/18 bg-[rgba(9,13,25,0.9)] p-3 max-w-56 font-rc-sans text-rc-fg shadow-rc-panel">
        <div className="text-xs text-rc-accent-link font-medium mb-1">
          {sourceName} — Plunder
        </div>
        <div className="text-xs text-rc-fg-muted mb-2">
          Cast these from your opponent&apos;s cemetery this turn, ignoring
          threshold.
        </div>
        <div className="space-y-1">
          {available.map((grant) => {
            const imageId = grant.card.slug || String(grant.card.cardId);
            return (
              <button
                key={grant.id}
                onClick={() =>
                  setPendingPrivateHandCast({
                    kind: "piracy",
                    handId: grant.id,
                    cardIndex: 0,
                    card: grant.card,
                  })
                }
                className="w-full flex items-center gap-2 px-2 py-1 text-xs rounded-rc-sm border border-rc-line/18 bg-black/30 hover:border-rc-accent/60 hover:bg-rc-accent/8 text-rc-fg transition-colors text-left"
                title={`Cast ${grant.card.name} (cost ${grant.card.cost ?? 0})`}
              >
                <span className="relative w-6 h-8 shrink-0 rounded-rc-sm overflow-hidden ring-1 ring-rc-line/25">
                  {imageId ? (
                    <Image
                      src={`/api/images/${imageId}`}
                      alt={grant.card.name || "Card"}
                      fill
                      className="object-cover"
                      sizes="24px"
                    />
                  ) : null}
                </span>
                <span className="truncate font-rc-display text-rc-fg-strong">{grant.card.name}</span>
                <span className="ml-auto font-rc-mono tabular-nums text-rc-fg-muted">
                  {grant.card.cost ?? 0}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
