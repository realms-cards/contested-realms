"use client";

import { useGameStore } from "@/lib/game/store";

export default function CastPlacementBanner() {
  const castPlacementMode = useGameStore((s) => s.castPlacementMode);
  const selectedCard = useGameStore((s) => s.selectedCard);
  const clearSelection = useGameStore((s) => s.clearSelection);
  const setCastSubsurface = useGameStore((s) => s.setCastSubsurface);

  if (!castPlacementMode || !selectedCard) return null;

  const cardName = selectedCard.card.name || "card";
  const isSite = (selectedCard.card.type || "").toLowerCase().includes("site");
  const modeLabel = isSite
    ? ""
    : castPlacementMode === "subsurface"
      ? " to subsurface"
      : " to surface";

  return (
    <div className="absolute bottom-24 left-1/2 -translate-x-1/2 z-40 pointer-events-auto">
      <div className="flex items-center gap-3 bg-zinc-900/90 backdrop-blur rounded-xl ring-1 ring-white/10 shadow-lg px-5 py-3 text-white">
        <span className="text-sm">
          {isSite ? "Playing" : "Casting"} <strong>{cardName}</strong>{modeLabel} — click a tile to place
        </span>
        <button
          className="rounded bg-red-900/50 hover:bg-red-900/70 px-3 py-1 text-sm font-medium transition-colors"
          onClick={() => {
            clearSelection();
            setCastSubsurface(false);
            useGameStore.setState({ castPlacementMode: null });
          }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
