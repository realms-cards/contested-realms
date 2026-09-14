"use client";

import { Skull } from "lucide-react";
import { useState } from "react";
import PileSearchDialog from "@/components/game/PileSearchDialog";
import { RcButton } from "@/components/ui/rc-button";
import { useGameStore, type PlayerKey, type CardRef } from "@/lib/game/store";

export type BanishedButtonProps = {
  mySeat: PlayerKey | null;
};

export default function BanishedButton({ mySeat }: BanishedButtonProps) {
  const zones = useGameStore((s) => s.zones);
  const actorKey = useGameStore((s) => s.actorKey);
  const moveFromBanishedToZone = useGameStore(
    (s) => s.moveFromBanishedToZone,
  );

  const [searchOpen, setSearchOpen] = useState(false);
  const [pendingCard, setPendingCard] = useState<CardRef | null>(null);
  const [isHovered, setIsHovered] = useState(false);

  const myKey = actorKey || mySeat || "p1";
  const banished = zones[myKey]?.banished || [];
  const count = banished.length;

  if (count === 0) return null;

  const handleSelect = (card: CardRef) => {
    setPendingCard(card);
  };

  const handleConfirm = () => {
    if (!pendingCard?.instanceId) return;
    moveFromBanishedToZone(myKey, pendingCard.instanceId, "hand");
    setPendingCard(null);
    setSearchOpen(false);
  };

  const handleCancel = () => {
    setPendingCard(null);
  };

  return (
    <>
      <div
        className="relative"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        <RcButton
          variant="quiet"
          size="icon-xs"
          className="h-[30px] w-[30px] rounded-rc-sm shadow-rc-md"
          onClick={() => setSearchOpen(true)}
          aria-label="Open banished zone"
          title={`Banished (${count} cards)`}
        >
          <Skull className="w-4 h-4" />
        </RcButton>

        {isHovered && (
          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 rounded-rc-sm border border-rc-line/22 bg-[rgba(7,10,20,0.85)] font-rc-mono text-xs text-rc-fg whitespace-nowrap pointer-events-none">
            Banished ({count} cards)
          </div>
        )}
      </div>

      {searchOpen && !pendingCard && (
        <PileSearchDialog
          pileName="Banished"
          cards={banished}
          onSelectCard={handleSelect}
          onClose={() => setSearchOpen(false)}
        />
      )}

      {pendingCard && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(6,10,20,0.6)]">
          <div className="rounded-rc-lg border border-rc-line/18 bg-[rgba(9,13,25,0.95)] p-6 font-rc-sans text-rc-fg shadow-rc-panel max-w-sm w-full mx-4">
            <p className="mb-1 font-rc-sans text-sm text-rc-fg">Return to hand?</p>
            <p className="mb-4 font-rc-display text-[20px] leading-tight text-rc-fg-strong">
              {pendingCard.name}
            </p>
            <div className="flex gap-3 justify-end">
              <RcButton
                variant="outline"
                onClick={handleCancel}
              >
                Cancel
              </RcButton>
              <RcButton
                onClick={handleConfirm}
              >
                Return to Hand
              </RcButton>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
