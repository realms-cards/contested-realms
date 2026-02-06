"use client";

import React, { useCallback } from "react";
import { useGameStore } from "@/lib/game/store";
import CardWithPreview, { CardGrid } from "./CardWithPreview";

export default function CrossroadsOverlay() {
  const pending = useGameStore((s) => s.pendingCrossroads);
  const actorKey = useGameStore((s) => s.actorKey);
  const selectCrossroadsCard = useGameStore((s) => s.selectCrossroadsCard);
  const resolveCrossroads = useGameStore((s) => s.resolveCrossroads);
  const cancelCrossroads = useGameStore((s) => s.cancelCrossroads);

  // In hotseat mode (actorKey is null), always show owner UI since both players share the screen
  // In online mode, only show owner UI if we're the owner
  const isOwner = actorKey === null || pending?.ownerSeat === actorKey;

  const handleSelectCard = useCallback(
    (index: number) => {
      if (!isOwner || pending?.phase !== "selecting") return;
      selectCrossroadsCard(index);
    },
    [isOwner, pending?.phase, selectCrossroadsCard],
  );

  const handleResolve = useCallback(() => {
    resolveCrossroads();
  }, [resolveCrossroads]);

  const handleCancel = useCallback(() => {
    cancelCrossroads();
  }, [cancelCrossroads]);

  if (!pending) return null;

  const { phase, revealedCards, selectedCardIndex } = pending;

  return (
    <div className="fixed inset-0 z-[200] pointer-events-none">
      {/* Top bar with status */}
      <div className="fixed inset-x-0 top-2 sm:top-6 z-[201] pointer-events-none flex justify-center px-2">
        <div className="pointer-events-auto px-3 sm:px-5 py-2 sm:py-3 rounded-full bg-black/90 text-white ring-1 ring-amber-500/50 shadow-lg text-sm sm:text-lg md:text-xl flex items-center gap-2 sm:gap-3 select-none">
          <span className="text-amber-400 font-fantaisie">Crossroads</span>
          <span className="opacity-80">
            {phase === "selecting" &&
              (isOwner
                ? "Choose 1 site to keep on top of your atlas"
                : `${pending.ownerSeat.toUpperCase()} is choosing a site...`)}
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
          <div className="bg-black/95 rounded-xl p-3 sm:p-6 max-w-3xl w-full mx-2 sm:mx-4 ring-1 ring-amber-500/30 max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl sm:text-2xl font-fantaisie text-amber-400 mb-2 text-center">
              Your Next {revealedCards.length} Site
              {revealedCards.length !== 1 ? "s" : ""}
            </h2>
            <p className="text-white/70 text-xs sm:text-sm mb-4 sm:mb-6 text-center">
              Choose 1 site to keep on top of your atlas. The rest go to the
              bottom.
            </p>

            {/* Cards to select from */}
            <CardGrid columns={4}>
              {revealedCards.map((card, idx) => (
                <CardWithPreview
                  key={idx}
                  card={card}
                  onClick={() => handleSelectCard(idx)}
                  selected={selectedCardIndex === idx}
                  interactive={true}
                  accentColor="orange"
                  showName
                  size="md"
                />
              ))}
            </CardGrid>

            {/* Action buttons */}
            <div className="flex gap-3 justify-center mt-6">
              <button
                className="px-6 py-3 rounded-lg bg-white/10 hover:bg-white/20 text-white/80 font-medium transition-colors"
                onClick={handleCancel}
              >
                Cancel
              </button>
              <button
                className="px-6 py-3 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-bold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                onClick={handleResolve}
                disabled={selectedCardIndex === null}
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Opponent view - just a waiting indicator */}
      {!isOwner && phase === "selecting" && (
        <div className="fixed bottom-24 inset-x-0 z-[201] pointer-events-none flex justify-center">
          <div className="pointer-events-auto px-4 py-2 rounded-lg bg-black/90 text-white/80 text-sm ring-1 ring-amber-500/30">
            <span className="text-amber-300">
              {pending.ownerSeat.toUpperCase()}
            </span>{" "}
            is choosing a site from Crossroads...
          </div>
        </div>
      )}
    </div>
  );
}
