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
      <div className="bg-black/90 rounded-lg p-3 ring-1 ring-cyan-500/50 max-w-56">
        <div className="text-xs text-cyan-400 font-medium mb-1">
          {sourceName} — Plunder
        </div>
        <div className="text-xs text-gray-400 mb-2">
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
                className="w-full flex items-center gap-2 px-2 py-1 text-xs bg-cyan-900/40 hover:bg-cyan-800/50 text-cyan-200 rounded transition-colors text-left"
                title={`Cast ${grant.card.name} (cost ${grant.card.cost ?? 0})`}
              >
                <span className="relative w-6 h-8 shrink-0 rounded overflow-hidden border border-cyan-400/30">
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
                <span className="truncate">{grant.card.name}</span>
                <span className="ml-auto opacity-70">
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
