"use client";

import Image from "next/image";
import React, { useCallback } from "react";
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
        <div className="pointer-events-auto px-3 sm:px-5 py-2 sm:py-3 rounded-full bg-black/90 text-white ring-1 ring-cyan-500/50 shadow-lg text-sm sm:text-lg md:text-xl flex items-center gap-2 sm:gap-3 select-none">
          <span className="text-cyan-400 font-fantaisie">🌊 Kelp Cavern</span>
          <span className="opacity-80">
            {phase === "selecting" &&
              (isOwner
                ? "Select a spell to put on top of your spellbook"
                : `${pending.ownerSeat.toUpperCase()} is selecting a spell...`)}
            {phase === "resolving" && "Resolving..."}
          </span>
          {isOwner && phase === "selecting" && (
            <button
              className="mx-1 rounded bg-white/15 hover:bg-white/25 px-3 py-1 select-none"
              onClick={handleCancel}
            >
              Cancel
            </button>
          )}
        </div>
      </div>

      {/* Main content area - only for owner */}
      {isOwner && phase === "selecting" && (
        <div className="fixed inset-0 flex items-center justify-center pointer-events-auto bg-black/70">
          <div className="bg-black/95 rounded-xl p-3 sm:p-6 max-w-2xl w-full mx-2 sm:mx-4 ring-1 ring-cyan-500/30 max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl sm:text-2xl font-fantaisie text-cyan-400 mb-2 text-center">
              Bottom {pending.revealedCards.length} Spell
              {pending.revealedCards.length !== 1 ? "s" : ""}
            </h2>
            <p className="text-white/70 text-xs sm:text-sm mb-4 sm:mb-6 text-center">
              Click a spell to put it on top of your spellbook. The rest stay at the bottom.
            </p>

            {/* Cards to select from */}
            <div className="mb-6">
              <div className="flex flex-wrap gap-4 justify-center">
                {pending.revealedCards.map((card, index) => (
                  <button
                    key={index}
                    onClick={() => handleSelectCard(index)}
                    className={`relative w-24 h-32 sm:w-32 sm:h-44 rounded-lg overflow-hidden transition-all ${
                      pending.selectedCardIndex === index
                        ? "ring-4 ring-cyan-400 scale-105"
                        : "ring-1 ring-white/20 hover:ring-cyan-400/50 hover:scale-102"
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
                      <div className="absolute inset-0 bg-cyan-500/20 flex items-center justify-center">
                        <span className="text-2xl">✓</span>
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Selected card display */}
            {selectedCard && (
              <div className="mb-6 p-3 rounded bg-cyan-900/30 ring-1 ring-cyan-500/50">
                <p className="text-cyan-400 text-sm text-center">
                  <strong>{selectedCard.name}</strong> will be put on top of your spellbook
                </p>
              </div>
            )}

            {/* Action buttons */}
            <div className="flex gap-3 justify-center">
              <button
                className="px-6 py-3 rounded-lg bg-white/10 hover:bg-white/20 text-white/80 font-medium transition-colors"
                onClick={handleCancel}
              >
                Cancel
              </button>
              <button
                className="px-6 py-3 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                onClick={handleResolve}
                disabled={pending.selectedCardIndex === null}
              >
                Confirm Selection
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Opponent view - just a waiting indicator */}
      {!isOwner && phase === "selecting" && (
        <div className="fixed bottom-24 inset-x-0 z-[201] pointer-events-none flex justify-center">
          <div className="pointer-events-auto px-4 py-2 rounded-lg bg-black/90 text-white/80 text-sm ring-1 ring-cyan-500/30">
            <span className="text-cyan-300">
              {pending.ownerSeat.toUpperCase()}
            </span>{" "}
            is selecting a spell from the bottom of their spellbook...
          </div>
        </div>
      )}
    </div>
  );
}
