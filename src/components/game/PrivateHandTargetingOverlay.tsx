"use client";

import Image from "next/image";
import { useGameStore } from "@/lib/game/store";

/**
 * Overlay that displays when the player is in targeting mode
 * for casting a card from Morgana or Omphalos private hands.
 * Shows the card being cast and instructions to click a tile.
 */
export default function PrivateHandTargetingOverlay() {
  const pendingPrivateHandCast = useGameStore((s) => s.pendingPrivateHandCast);
  const setPendingPrivateHandCast = useGameStore(
    (s) => s.setPendingPrivateHandCast
  );

  if (!pendingPrivateHandCast) return null;

  const { card, kind, mustCastAtLocation } = pendingPrivateHandCast;
  const sourceName = kind === "morgana" ? "Morgana le Fay" : "Omphalos";
  const imageId = card.slug || String(card.cardId);

  // Build instruction text
  let instruction = "Click a tile to cast this card";
  if (mustCastAtLocation) {
    instruction = `Click tile ${mustCastAtLocation} to summon this minion`;
  }

  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[200] pointer-events-auto">
      <div className="bg-slate-900/95 border border-purple-500/50 rounded-lg shadow-lg p-3 flex items-center gap-3">
        {/* Card thumbnail */}
        <div className="relative w-12 h-16 rounded overflow-hidden border border-purple-400/30">
          {imageId ? (
            <Image
              src={`/api/images/${imageId}`}
              alt={card.name || "Card"}
              fill
              className="object-cover"
              sizes="48px"
            />
          ) : (
            <div className="w-full h-full bg-purple-900/50 flex items-center justify-center text-xs text-purple-300">
              ?
            </div>
          )}
        </div>

        {/* Info */}
        <div className="flex flex-col">
          <span className="text-purple-300 text-xs">{sourceName}</span>
          <span className="text-white font-medium">
            {card.name || "Unknown"}
          </span>
          <span className="text-slate-400 text-sm">{instruction}</span>
        </div>

        {/* Cancel button */}
        <button
          onClick={() => setPendingPrivateHandCast(null)}
          className="ml-2 px-3 py-1 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded text-sm transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
