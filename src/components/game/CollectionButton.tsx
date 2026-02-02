"use client";

import { Gem } from "lucide-react";
import { useState, useEffect } from "react";
import PileSearchDialog from "@/components/game/PileSearchDialog";
import { isImposter } from "@/lib/game/avatarAbilities";
import { useGameStore, type PlayerKey, type CardRef } from "@/lib/game/store";
import { isAvatarCard } from "@/lib/game/store/imposterMaskState";

export type CollectionButtonProps = {
  mySeat: PlayerKey | null;
};

export default function CollectionButton({ mySeat }: CollectionButtonProps) {
  const zones = useGameStore((s) => s.zones);
  const avatars = useGameStore((s) => s.avatars);
  const imposterMasks = useGameStore((s) => s.imposterMasks);
  const setDragFromPile = useGameStore((s) => s.setDragFromPile);
  const drawFromPileToHand = useGameStore((s) => s.drawFromPileToHand);
  const maskWith = useGameStore((s) => s.maskWith);
  const actorKey = useGameStore((s) => s.actorKey);

  const [searchOpen, setSearchOpen] = useState(false);

  // Use actorKey if available (online), otherwise mySeat (offline)
  const myKey = actorKey || mySeat || "p1";

  // Listen for custom event from context menu to open mask dialog
  useEffect(() => {
    const handleOpenMaskDialog = (e: CustomEvent<{ seat: PlayerKey }>) => {
      if (e.detail.seat === myKey) {
        setSearchOpen(true);
      }
    };

    window.addEventListener(
      "imposter:openMaskDialog",
      handleOpenMaskDialog as EventListener,
    );
    return () => {
      window.removeEventListener(
        "imposter:openMaskDialog",
        handleOpenMaskDialog as EventListener,
      );
    };
  }, [myKey]);

  const [isHovered, setIsHovered] = useState(false);
  const collection = zones[myKey]?.collection || [];
  const count = collection.length;

  // Check if player has Imposter avatar (either currently displayed or original if masked)
  const myAvatar = avatars[myKey]?.card;
  const myMaskState = imposterMasks[myKey];
  const originalAvatar = myMaskState?.originalAvatar ?? myAvatar;
  const hasImposter = isImposter(originalAvatar?.name);

  // Don't render if no collection
  if (count === 0) return null;

  const handleClick = () => {
    setSearchOpen(true);
  };

  const handleSelect = (card: CardRef) => {
    setDragFromPile({ who: myKey, from: "collection", card });
    drawFromPileToHand();
    setSearchOpen(false);
  };

  // Handle masking with an avatar from collection (Imposter ability)
  const handleMask = (card: CardRef) => {
    if (maskWith(myKey, card)) {
      setSearchOpen(false);
    }
  };

  return (
    <>
      <div
        className="relative"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        <button
          className="rounded bg-amber-600/80 hover:bg-amber-500 p-1.5 ring-1 ring-white/10 shadow-lg transition-colors"
          onClick={handleClick}
          aria-label="Open collection"
          title={`Collection (${count} cards)`}
        >
          <Gem className="w-4 h-4 text-white" />
        </button>

        {/* Card count tooltip on hover */}
        {isHovered && (
          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-black/80 rounded text-xs text-white whitespace-nowrap pointer-events-none">
            Collection ({count} cards)
          </div>
        )}
      </div>

      {/* Search dialog */}
      {searchOpen && (
        <PileSearchDialog
          pileName="Collection"
          cards={collection}
          onSelectCard={handleSelect}
          onClose={() => setSearchOpen(false)}
          onMaskCard={hasImposter ? handleMask : undefined}
          canMask={hasImposter ? isAvatarCard : undefined}
        />
      )}
    </>
  );
}
