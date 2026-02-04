"use client";

import React, { useCallback, useMemo } from "react";
import { useGameStore } from "@/lib/game/store";
import CardWithPreview, { CardGrid } from "./CardWithPreview";

export default function ShapeshiftOverlay() {
  const pending = useGameStore((s) => s.pendingShapeshift);
  const actorKey = useGameStore((s) => s.actorKey);
  const selectShapeshiftMinion = useGameStore((s) => s.selectShapeshiftMinion);
  const skipShapeshiftSelection = useGameStore(
    (s) => s.skipShapeshiftSelection,
  );
  const resolveShapeshift = useGameStore((s) => s.resolveShapeshift);
  const cancelShapeshift = useGameStore((s) => s.cancelShapeshift);
  const skipShapeshiftAutoResolve = useGameStore(
    (s) => s.skipShapeshiftAutoResolve,
  );

  // In hotseat mode (actorKey is null), always show caster UI
  // In online mode, only show caster UI if we're the caster
  const isCaster = actorKey === null || pending?.casterSeat === actorKey;

  // Check if any revealed cards are minions
  const hasMinionsInRevealed = useMemo(() => {
    if (!pending) return false;
    return pending.revealedCards.some((card) =>
      (card.type || "").toLowerCase().includes("minion"),
    );
  }, [pending]);

  // Handle selecting a minion from revealed cards
  const handleSelectMinion = useCallback(
    (index: number) => {
      if (!isCaster || pending?.phase !== "viewing") return;
      const card = pending.revealedCards[index];
      const cardType = (card?.type || "").toLowerCase();
      if (!cardType.includes("minion")) return;
      selectShapeshiftMinion(index);
    },
    [isCaster, pending, selectShapeshiftMinion],
  );

  // Handle skipping selection (no minion chosen)
  const handleSkip = useCallback(() => {
    if (!isCaster) return;
    skipShapeshiftSelection();
  }, [isCaster, skipShapeshiftSelection]);

  // Handle resolve
  const handleResolve = useCallback(() => {
    resolveShapeshift();
  }, [resolveShapeshift]);

  // Handle cancel (returns spell to hand)
  const handleCancel = useCallback(() => {
    cancelShapeshift();
  }, [cancelShapeshift]);

  // Handle skip auto-resolve (leaves spell on board)
  const handleSkipAutoResolve = useCallback(() => {
    skipShapeshiftAutoResolve();
  }, [skipShapeshiftAutoResolve]);

  if (!pending) return null;

  const phase = pending.phase;

  return (
    <div className="fixed inset-0 z-[200] pointer-events-none">
      {/* Top bar with status */}
      <div className="fixed inset-x-0 top-2 sm:top-6 z-[201] pointer-events-none flex justify-center px-2">
        <div className="pointer-events-auto px-3 sm:px-5 py-2 sm:py-3 rounded-full bg-black/90 text-white ring-1 ring-purple-500/50 shadow-lg text-sm sm:text-lg md:text-xl flex items-center gap-2 sm:gap-3 select-none">
          <span className="text-purple-400 font-fantaisie">Shapeshift</span>
          <span className="opacity-80">
            {phase === "selectingTarget" &&
              (isCaster
                ? "Select an allied minion to transform"
                : `${pending.casterSeat.toUpperCase()} is selecting a minion...`)}
            {phase === "viewing" &&
              (isCaster
                ? hasMinionsInRevealed
                  ? "Choose a minion for the new form"
                  : "No minions found - view your spells"
                : `${pending.casterSeat.toUpperCase()} is choosing a new form...`)}
          </span>
          {isCaster && phase === "selectingTarget" && (
            <>
              <button
                className="mx-1 rounded bg-white/15 hover:bg-white/25 px-3 py-1 select-none"
                onClick={handleSkipAutoResolve}
                title="Leaves spell on board for manual resolution"
              >
                Manual Resolve
              </button>
              <button
                className="mx-1 rounded bg-white/15 hover:bg-white/25 px-3 py-1 select-none"
                onClick={handleCancel}
                title="Returns spell to hand"
              >
                Cancel
              </button>
            </>
          )}
        </div>
      </div>

      {/* Phase: Selecting Target Minion - User clicks on board directly */}
      {/* Top bar shows instructions and cancel button - no blocking overlay needed */}

      {/* Phase: Viewing Spells & Selecting Minion */}
      {isCaster && phase === "viewing" && (
        <div className="fixed inset-0 flex items-center justify-center pointer-events-auto bg-black/70">
          <div className="bg-black/95 rounded-xl p-3 sm:p-6 max-w-4xl w-full mx-2 sm:mx-4 ring-1 ring-purple-500/30 max-h-[90vh] overflow-y-auto">
            {/* Target minion display */}
            {pending.targetMinion && (
              <div className="mb-4 p-3 rounded bg-purple-900/30 ring-1 ring-purple-500/50">
                <p className="text-purple-400 text-sm mb-2 text-center">
                  Transforming:
                </p>
                <div className="flex justify-center">
                  <CardWithPreview
                    card={pending.targetMinion.card}
                    selected={true}
                    interactive={false}
                    accentColor="purple"
                  />
                </div>
              </div>
            )}

            <h2 className="text-xl sm:text-2xl font-fantaisie text-purple-400 mb-2 text-center">
              Your Next {pending.revealedCards.length} Spell
              {pending.revealedCards.length !== 1 ? "s" : ""}
            </h2>
            <p className="text-white/70 text-xs sm:text-sm mb-4 sm:mb-6 text-center">
              {hasMinionsInRevealed
                ? "Click a minion to be the new form. Non-minions cannot be selected."
                : "No minions found. All cards will go to the bottom of your spellbook."}
            </p>

            {/* Card grid */}
            <CardGrid columns={5}>
              {pending.revealedCards.map((card, index) => {
                const isMinion = (card.type || "")
                  .toLowerCase()
                  .includes("minion");
                const isSelected = pending.selectedMinionIndex === index;
                return (
                  <div key={index} className="relative">
                    <CardWithPreview
                      card={card}
                      onClick={
                        isMinion ? () => handleSelectMinion(index) : undefined
                      }
                      selected={isSelected}
                      interactive={isMinion}
                      accentColor={isMinion ? "purple" : undefined}
                    />
                    {!isMinion && (
                      <div className="absolute inset-0 bg-black/50 flex items-center justify-center rounded pointer-events-none">
                        <span className="text-white/60 text-xs text-center px-1">
                          Not a minion
                        </span>
                      </div>
                    )}
                    {isSelected && (
                      <div className="absolute -top-2 -right-2 w-6 h-6 bg-green-500 rounded-full flex items-center justify-center">
                        <span className="text-white text-sm">✓</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </CardGrid>

            {/* Action buttons */}
            <div className="flex gap-3 justify-center mt-6">
              <button
                className="px-6 py-3 rounded-lg bg-white/10 hover:bg-white/20 text-white/80 font-medium transition-colors"
                onClick={handleCancel}
              >
                Cancel
              </button>
              {!hasMinionsInRevealed ? (
                <button
                  className="px-6 py-3 rounded-lg bg-purple-600 hover:bg-purple-500 text-white font-bold transition-colors"
                  onClick={() => {
                    handleSkip();
                    handleResolve();
                  }}
                >
                  Continue (No Minions)
                </button>
              ) : pending.selectedMinionIndex !== null ? (
                <button
                  className="px-6 py-3 rounded-lg bg-green-600 hover:bg-green-500 text-white font-bold transition-colors"
                  onClick={handleResolve}
                >
                  Transform into{" "}
                  {pending.revealedCards[pending.selectedMinionIndex]?.name}
                </button>
              ) : (
                <button
                  className="px-6 py-3 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-bold transition-colors"
                  onClick={() => {
                    handleSkip();
                    handleResolve();
                  }}
                >
                  Skip (No Transform)
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Opponent view - just a waiting indicator */}
      {!isCaster && (phase === "selectingTarget" || phase === "viewing") && (
        <div className="fixed bottom-24 inset-x-0 z-[201] pointer-events-none flex justify-center">
          <div className="pointer-events-auto px-4 py-2 rounded-lg bg-black/90 text-white/80 text-sm ring-1 ring-purple-500/30">
            <span className="text-purple-300">
              {pending.casterSeat.toUpperCase()}
            </span>{" "}
            is casting Shapeshift...
          </div>
        </div>
      )}
    </div>
  );
}
