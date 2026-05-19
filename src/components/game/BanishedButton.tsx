"use client";

import { Skull } from "lucide-react";
import { useState } from "react";
import PileSearchDialog from "@/components/game/PileSearchDialog";
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
        <button
          className="rounded bg-purple-700/80 hover:bg-purple-600 p-1.5 ring-1 ring-white/10 shadow-lg transition-colors"
          onClick={() => setSearchOpen(true)}
          aria-label="Open banished zone"
          title={`Banished (${count} cards)`}
        >
          <Skull className="w-4 h-4 text-white" />
        </button>

        {isHovered && (
          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-black/80 rounded text-xs text-white whitespace-nowrap pointer-events-none">
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-zinc-900 border border-purple-700/50 rounded-lg shadow-2xl p-6 max-w-sm w-full mx-4">
            <p className="text-white text-sm mb-1">Return to hand?</p>
            <p className="text-purple-300 font-semibold mb-4">
              {pendingCard.name}
            </p>
            <div className="flex gap-3 justify-end">
              <button
                className="px-4 py-2 rounded bg-zinc-700 hover:bg-zinc-600 text-white text-sm transition-colors"
                onClick={handleCancel}
              >
                Cancel
              </button>
              <button
                className="px-4 py-2 rounded bg-purple-700 hover:bg-purple-600 text-white text-sm font-medium transition-colors"
                onClick={handleConfirm}
              >
                Return to Hand
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
