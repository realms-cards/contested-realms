"use client";

import React, { useCallback } from "react";
import { RcButton } from "@/components/ui/rc-button";
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
        <div className="pointer-events-auto px-3 sm:px-5 py-2 sm:py-3 rounded-full border border-rc-line/22 bg-[rgba(7,10,20,0.9)] font-rc-sans text-rc-fg shadow-rc-panel text-sm sm:text-lg md:text-xl flex items-center gap-2 sm:gap-3 select-none">
          <span className="font-rc-display text-rc-accent-link">Crossroads</span>
          <span className="text-rc-fg-muted">
            {phase === "selecting" &&
              (isOwner
                ? "Choose 1 site to keep on top of your atlas"
                : `${pending.ownerSeat.toUpperCase()} is choosing a site...`)}
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
          <div className="thin-scrollbar rounded-rc-lg border border-rc-line/18 bg-[rgba(9,13,25,0.95)] p-3 sm:p-6 max-w-3xl w-full mx-2 sm:mx-4 font-rc-sans text-rc-fg shadow-rc-panel max-h-[90vh] overflow-y-auto">
            <h2 className="mb-2 text-center font-rc-display text-[22px] sm:text-[26px] leading-tight text-rc-fg-strong">
              Your Next {revealedCards.length} Site
              {revealedCards.length !== 1 ? "s" : ""}
            </h2>
            <p className="text-rc-fg-muted text-xs sm:text-sm mb-4 sm:mb-6 text-center">
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
              <RcButton variant="outline" onClick={handleCancel}>
                Cancel
              </RcButton>
              <RcButton
                onClick={handleResolve}
                disabled={selectedCardIndex === null}
              >
                Confirm
              </RcButton>
            </div>
          </div>
        </div>
      )}

      {/* Opponent view - just a waiting indicator */}
      {!isOwner && phase === "selecting" && (
        <div className="fixed bottom-24 inset-x-0 z-[201] pointer-events-none flex justify-center">
          <div className="rc-toast pointer-events-auto">
            <span className="text-rc-accent-link">
              {pending.ownerSeat.toUpperCase()}
            </span>{" "}
            is choosing a site from Crossroads...
          </div>
        </div>
      )}
    </div>
  );
}
