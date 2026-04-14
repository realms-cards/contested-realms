"use client";

import React, { useCallback } from "react";
import { useGameStore } from "@/lib/game/store";
import CardWithPreview from "./CardWithPreview";

export default function BetrayalOverlay() {
  const pending = useGameStore((s) => s.pendingBetrayal);
  const actorKey = useGameStore((s) => s.actorKey);
  const resolveBetrayal = useGameStore((s) => s.resolveBetrayal);
  const cancelBetrayal = useGameStore((s) => s.cancelBetrayal);

  const isCaster = actorKey === null || pending?.casterSeat === actorKey;

  const handleResolve = useCallback(() => {
    resolveBetrayal();
  }, [resolveBetrayal]);

  const handleCancel = useCallback(() => {
    cancelBetrayal();
  }, [cancelBetrayal]);

  if (!pending) return null;

  return (
    <div className="fixed inset-0 z-[200] pointer-events-none">
      <div className="fixed inset-x-0 top-2 sm:top-6 z-[201] pointer-events-none flex justify-center px-2">
        <div className="pointer-events-auto px-3 sm:px-5 py-2 sm:py-3 rounded-full bg-black/90 text-white ring-1 ring-amber-500/50 shadow-lg text-sm sm:text-lg md:text-xl flex items-center gap-2 sm:gap-3 select-none">
          <span className="text-amber-400 font-fantaisie">Betrayal</span>
          <span className="opacity-80">
            {pending.phase === "selectingTarget" &&
              (isCaster
                ? "Select an enemy minion to betray their owner"
                : `${pending.casterSeat.toUpperCase()} is selecting a target...`)}
            {pending.phase === "resolving" &&
              (isCaster
                ? pending.targetMinion
                  ? `Confirm ${pending.targetMinion.card.name} betraying`
                  : "Choose a target"
                : `${pending.casterSeat.toUpperCase()} is resolving Betrayal...`)}
          </span>
          {isCaster && pending.phase === "selectingTarget" && (
            <button
              className="mx-1 rounded bg-white/15 hover:bg-white/25 px-3 py-1 select-none"
              onClick={handleCancel}
              title="Cancels target selection"
            >
              Cancel
            </button>
          )}
        </div>
      </div>

      {isCaster && pending.phase === "resolving" && pending.targetMinion && (
        <div className="fixed inset-0 flex items-center justify-center pointer-events-auto bg-black/70">
          <div className="bg-black/95 rounded-xl p-4 sm:p-6 max-w-xl w-full mx-2 sm:mx-4 ring-1 ring-amber-500/30">
            <h2 className="text-xl sm:text-2xl font-fantaisie text-amber-400 mb-3 text-center">
              Confirm Betrayal
            </h2>
            <p className="text-white/70 text-xs sm:text-sm mb-5 text-center">
              Gain control of the target enemy minion this turn and untap it.
            </p>
            <div className="flex justify-center mb-6">
              <CardWithPreview
                card={pending.targetMinion.card}
                selected={true}
                interactive={false}
                accentColor="orange"
              />
            </div>
            <div className="flex gap-3 justify-center">
              <button
                className="px-6 py-3 rounded-lg bg-white/10 hover:bg-white/20 text-white/80 font-medium transition-colors"
                onClick={handleCancel}
              >
                Cancel
              </button>
              <button
                className="px-6 py-3 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-bold transition-colors"
                onClick={handleResolve}
              >
                Betray {pending.targetMinion.card.name}
              </button>
            </div>
          </div>
        </div>
      )}

      {!isCaster && (
        <div className="fixed bottom-24 inset-x-0 z-[201] pointer-events-none flex justify-center">
          <div className="px-4 py-2 rounded-lg bg-black/90 text-sm text-amber-300">
            {pending.casterSeat.toUpperCase()} is resolving Betrayal...
          </div>
        </div>
      )}
    </div>
  );
}
