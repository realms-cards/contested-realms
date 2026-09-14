"use client";

import Image from "next/image";
import React, { useCallback } from "react";
import { RcButton } from "@/components/ui/rc-button";
import { useGameStore } from "@/lib/game/store";

export default function KelpCavernOverlay() {
  const pending = useGameStore((s) => s.pendingKelpCavern);
  const actorKey = useGameStore((s) => s.actorKey);
  const selectKelpCavernCard = useGameStore((s) => s.selectKelpCavernCard);
  const resolveKelpCavern = useGameStore((s) => s.resolveKelpCavern);
  const cancelKelpCavern = useGameStore((s) => s.cancelKelpCavern);

  // In hotseat mode (actorKey is null), always show owner UI since both players share the screen
  // In online mode, only show owner UI if we're the owner
  const isOwner = actorKey === null || pending?.ownerSeat === actorKey;

  // Handle selecting a card
  const handleSelectCard = useCallback(
    (index: number) => {
      if (!isOwner || pending?.phase !== "selecting") return;
      selectKelpCavernCard(index);
    },
    [isOwner, pending?.phase, selectKelpCavernCard],
  );

  // Handle confirm/resolve
  const handleResolve = useCallback(() => {
    resolveKelpCavern();
  }, [resolveKelpCavern]);

  // Handle cancel
  const handleCancel = useCallback(() => {
    cancelKelpCavern();
  }, [cancelKelpCavern]);

  if (!pending) return null;

  const phase = pending.phase;
  const selectedCard =
    pending.selectedCardIndex !== null
      ? pending.revealedCards[pending.selectedCardIndex]
      : null;

  return (
    <div className="fixed inset-0 z-[200] pointer-events-none">
      {/* Top bar with status */}
      <div className="fixed inset-x-0 top-2 sm:top-6 z-[201] pointer-events-none flex justify-center px-2">
        <div className="pointer-events-auto px-3 sm:px-5 py-2 sm:py-3 rounded-full border border-rc-line/22 bg-[rgba(7,10,20,0.9)] font-rc-sans text-rc-fg shadow-rc-panel text-sm sm:text-lg md:text-xl flex items-center gap-2 sm:gap-3 select-none">
          <span className="font-rc-display text-rc-accent-link">Kelp Cavern</span>
          <span className="text-rc-fg-muted">
            {phase === "selecting" &&
              (isOwner
                ? "Select a spell to put on top of your spellbook"
                : `${pending.ownerSeat.toUpperCase()} is selecting a spell...`)}
            {phase === "resolving" && "Resolving..."}
          </span>
          {isOwner && phase === "selecting" && (
            <RcButton
              variant="outline"
              size="xs"
              className="mx-1"
              onClick={handleCancel}
            >
              Cancel
            </RcButton>
          )}
        </div>
      </div>

      {/* Main content area - only for owner */}
      {isOwner && phase === "selecting" && (
        <div className="fixed inset-0 flex items-center justify-center pointer-events-auto bg-[rgba(6,10,20,0.7)]">
          <div className="thin-scrollbar rounded-rc-lg border border-rc-line/18 bg-[rgba(9,13,25,0.95)] p-3 sm:p-6 max-w-2xl w-full mx-2 sm:mx-4 font-rc-sans text-rc-fg shadow-rc-panel max-h-[90vh] overflow-y-auto">
            <h2 className="mb-2 text-center font-rc-display text-[22px] sm:text-[26px] leading-tight text-rc-fg-strong">
              Bottom {pending.revealedCards.length} Spell
              {pending.revealedCards.length !== 1 ? "s" : ""}
            </h2>
            <p className="text-rc-fg-muted text-xs sm:text-sm mb-4 sm:mb-6 text-center">
              Click a spell to put it on top of your spellbook. The rest stay at the bottom.
            </p>

            {/* Cards to select from */}
            <div className="mb-6">
              <div className="flex flex-wrap gap-4 justify-center">
                {pending.revealedCards.map((card, index) => (
                  <button
                    key={index}
                    onClick={() => handleSelectCard(index)}
                    className={`relative w-24 h-32 sm:w-32 sm:h-44 rounded-rc-md overflow-hidden transition-all ${
                      pending.selectedCardIndex === index
                        ? "ring-4 ring-rc-accent scale-105 shadow-[0_0_14px_rgba(243,207,106,0.25)]"
                        : "ring-1 ring-rc-line/25 hover:ring-rc-accent/60 hover:scale-102"
                    }`}
                  >
                    <Image
                      src={`/api/images/${card.slug || card.cardId}`}
                      alt={card.name || "Card"}
                      fill
                      className="object-cover"
                      unoptimized
                    />
                    {pending.selectedCardIndex === index && (
                      <div className="absolute inset-0 bg-rc-accent/20 flex items-center justify-center">
                        <span className="text-2xl text-rc-fg-strong">✓</span>
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Selected card display */}
            {selectedCard && (
              <div className="mb-6 p-3 rounded-rc-md border border-rc-accent/35 bg-rc-accent/8">
                <p className="text-rc-fg text-sm text-center">
                  <strong className="font-rc-display text-rc-accent-link">{selectedCard.name}</strong> will be put on top of your spellbook
                </p>
              </div>
            )}

            {/* Action buttons */}
            <div className="flex gap-3 justify-center">
              <RcButton variant="outline" onClick={handleCancel}>
                Cancel
              </RcButton>
              <RcButton
                onClick={handleResolve}
                disabled={pending.selectedCardIndex === null}
              >
                Confirm Selection
              </RcButton>
            </div>
          </div>
        </div>
      )}

      {/* Opponent view - just a waiting indicator */}
      {!isOwner && phase === "selecting" && (
        <div className="fixed bottom-24 inset-x-0 z-[201] pointer-events-none flex justify-center">
          <div className="rc-toast pointer-events-auto">
            <span className="text-rc-fg-strong">
              {pending.ownerSeat.toUpperCase()}
            </span>{" "}
            is selecting a spell from the bottom of their spellbook...
          </div>
        </div>
      )}
    </div>
  );
}
