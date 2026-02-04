"use client";

import Image from "next/image";
import { useEffect, useCallback } from "react";
import { useGameStore } from "@/lib/game/store";

export function RiverGenesisOverlay() {
  const pending = useGameStore((s) => s.pendingRiverGenesis);
  const actorKey = useGameStore((s) => s.actorKey);
  const currentPlayer = useGameStore((s) => s.currentPlayer);
  const completeRiverGenesis = useGameStore((s) => s.completeRiverGenesis);
  const _cancelRiverGenesis = useGameStore((s) => s.cancelRiverGenesis);

  // Determine if we're the owner (the one who can make the choice)
  const isOwner =
    pending &&
    (actorKey
      ? pending.ownerSeat === actorKey
      : pending.ownerSeat === (currentPlayer === 1 ? "p1" : "p2"));

  const handleKeepOnTop = useCallback(() => {
    completeRiverGenesis("keep");
  }, [completeRiverGenesis]);

  const handleMoveToBottom = useCallback(() => {
    completeRiverGenesis("bottom");
  }, [completeRiverGenesis]);

  // Handle escape key to keep on top (default action)
  useEffect(() => {
    if (!isOwner) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        handleKeepOnTop();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOwner, handleKeepOnTop]);

  if (!pending) return null;

  const { siteName, topSpell } = pending;

  // If we're not the owner, show a waiting message
  if (!isOwner) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90">
        <div className="flex flex-col items-center gap-4">
          <p className="text-gray-400 text-sm">
            Opponent is looking at their next spell...
          </p>
          <div className="w-48 h-64 bg-gray-800/50 rounded-lg animate-pulse flex items-center justify-center">
            <span className="text-gray-600">?</span>
          </div>
        </div>
      </div>
    );
  }

  // No spell to show (should not happen if beginRiverGenesis guards properly)
  if (!topSpell) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90">
        <div className="flex flex-col items-center gap-4">
          <p className="text-gray-400 text-sm">
            {siteName} Genesis: No spells in spellbook
          </p>
          <button
            onClick={handleKeepOnTop}
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded text-white text-sm"
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  // Build the card image URL
  const cardSlug = topSpell.slug;
  const imageUrl = cardSlug
    ? `/api/images/${cardSlug}`
    : "/api/assets/cardback_spellbook.png";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90">
      <div className="flex flex-col items-center gap-6 max-w-md">
        {/* Title */}
        <div className="text-center">
          <h2 className="text-lg font-semibold text-cyan-400">{siteName}</h2>
          <p className="text-gray-400 text-sm mt-1">
            Genesis: Look at your next spell
          </p>
        </div>

        {/* Card display */}
        <div className="relative w-48 h-64 rounded-lg overflow-hidden shadow-2xl border-2 border-cyan-500/50">
          <Image
            src={imageUrl}
            alt={topSpell.name}
            fill
            className="object-cover"
            unoptimized
          />
        </div>

        {/* Card name */}
        <p className="text-white font-medium">{topSpell.name}</p>

        {/* Choice buttons */}
        <div className="flex gap-4">
          <button
            onClick={handleKeepOnTop}
            className="px-6 py-3 bg-cyan-700 hover:bg-cyan-600 rounded-lg text-white font-medium transition-colors"
          >
            Keep on Top
          </button>
          <button
            onClick={handleMoveToBottom}
            className="px-6 py-3 bg-amber-700 hover:bg-amber-600 rounded-lg text-white font-medium transition-colors"
          >
            Move to Bottom
          </button>
        </div>

        <p className="text-gray-600 text-xs">Press Esc to keep on top</p>
      </div>
    </div>
  );
}
