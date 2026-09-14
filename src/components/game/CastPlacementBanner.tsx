"use client";

import { RcButton } from "@/components/ui/rc-button";
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
      <div className="rc-toast flex items-center gap-3 rounded-rc-lg px-5 py-3" data-tone="info">
        <span className="font-rc-sans text-sm text-rc-fg">
          {isSite ? "Playing" : "Casting"} <strong className="font-rc-display font-normal text-rc-fg-strong">{cardName}</strong>{modeLabel} — click a tile to place
        </span>
        <RcButton
          variant="quiet"
          size="sm"
          className="h-[30px] px-3 text-sm"
          onClick={() => {
            clearSelection();
            setCastSubsurface(false);
            useGameStore.setState({ castPlacementMode: null });
          }}
        >
          Cancel
        </RcButton>
      </div>
    </div>
  );
}
