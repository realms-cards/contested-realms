"use client";

import Image from "next/image";
import { RcButton } from "@/components/ui/rc-button";
import { useGameStore } from "@/lib/game/store";

/**
 * Overlay that displays when the player is in targeting mode
 * for casting a card from Morgana or Omphalos private hands.
 * Shows the card being cast and instructions to click a tile.
 */
export default function PrivateHandTargetingOverlay() {
  const pendingPrivateHandCast = useGameStore((s) => s.pendingPrivateHandCast);
  const setPendingPrivateHandCast = useGameStore(
    (s) => s.setPendingPrivateHandCast,
  );

  if (!pendingPrivateHandCast) return null;

  const { card, kind, mustCastAtLocation } = pendingPrivateHandCast;
  const sourceName =
    kind === "morgana"
      ? "Morgana le Fay"
      : kind === "piracy"
        ? "Plunder"
        : "Omphalos";
  const imageId = card.slug || String(card.cardId);

  // Build instruction text
  let instruction = "Click a tile to cast this card";
  if (kind === "piracy") {
    instruction = "Click a tile to cast this pirated spell (ignores threshold)";
  }
  if (mustCastAtLocation) {
    instruction = "Click the Omphalos tile to summon this minion";
  }

  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[200] pointer-events-auto">
      <div className="rounded-rc-md border border-rc-line/18 bg-[rgba(9,13,25,0.95)] font-rc-sans text-rc-fg shadow-rc-panel p-3 flex items-center gap-3">
        {/* Card thumbnail */}
        <div className="relative w-12 h-16 rounded-rc-sm overflow-hidden shadow-rc-md ring-1 ring-rc-line/25">
          {imageId ? (
            <Image
              src={`/api/images/${imageId}`}
              alt={card.name || "Card"}
              fill
              className="object-cover"
              sizes="48px"
            />
          ) : (
            <div className="w-full h-full rounded-rc-sm border border-rc-line/12 bg-black/30 flex items-center justify-center text-xs text-rc-fg-subtle">
              ?
            </div>
          )}
        </div>

        {/* Info */}
        <div className="flex flex-col">
          <span className="font-rc-display text-rc-accent-link text-xs">{sourceName}</span>
          <span className="font-rc-display text-rc-fg-strong">
            {card.name || "Unknown"}
          </span>
          <span className="text-rc-fg-muted text-sm">{instruction}</span>
        </div>

        {/* Cancel button */}
        <RcButton
          variant="outline"
          size="xs"
          onClick={() => setPendingPrivateHandCast(null)}
          className="ml-2"
        >
          Cancel
        </RcButton>
      </div>
    </div>
  );
}
