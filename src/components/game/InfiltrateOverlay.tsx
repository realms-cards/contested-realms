"use client";

import React, { useCallback } from "react";
import { useGameStore } from "@/lib/game/store";
import CardWithPreview from "./CardWithPreview";

export default function InfiltrateOverlay() {
  const pending = useGameStore((s) => s.pendingInfiltrate);
  const actorKey = useGameStore((s) => s.actorKey);
  const resolveInfiltrate = useGameStore((s) => s.resolveInfiltrate);
  const cancelInfiltrate = useGameStore((s) => s.cancelInfiltrate);

  const isCaster = actorKey === null || pending?.casterSeat === actorKey;

  const handleResolve = useCallback(() => {
    resolveInfiltrate();
  }, [resolveInfiltrate]);

  const handleCancel = useCallback(() => {
    cancelInfiltrate();
  }, [cancelInfiltrate]);

  if (!pending) return null;

  return (
    <div className="fixed inset-0 z-[200] pointer-events-none">
      <div className="fixed inset-x-0 top-2 sm:top-6 z-[201] pointer-events-none flex justify-center px-2">
        <div className="pointer-events-auto px-3 sm:px-5 py-2 sm:py-3 rounded-full bg-black/90 text-white ring-1 ring-violet-500/50 shadow-lg text-sm sm:text-lg md:text-xl flex items-center gap-2 sm:gap-3 select-none">
          <span className="text-violet-400 font-fantaisie">Infiltrate</span>
          <span className="opacity-80">
            {pending.phase === "selectingTarget" &&
              (isCaster
                ? "Select an enemy minion to infiltrate"
                : `${pending.casterSeat.toUpperCase()} is selecting a target...`)}
            {pending.phase === "resolving" &&
              (isCaster
                ? pending.targetMinion
                  ? `Confirm infiltrating ${pending.targetMinion.card.name}`
                  : "Choose a target"
                : `${pending.casterSeat.toUpperCase()} is resolving Infiltrate...`)}
          </span>
          {isCaster && pending.phase === "selectingTarget" && (
            <button
              className="mx-1 rounded bg-white/15 hover:bg-white/25 px-3 py-1 select-none"
              onClick={handleCancel}
              title="Returns spell to hand"
            >
              Cancel
            </button>
          )}
        </div>
      </div>

      {isCaster && pending.phase === "resolving" && pending.targetMinion && (
        <div className="fixed inset-0 flex items-center justify-center pointer-events-auto bg-black/70">
          <div className="bg-black/95 rounded-xl p-4 sm:p-6 max-w-xl w-full mx-2 sm:mx-4 ring-1 ring-violet-500/30">
            <h2 className="text-xl sm:text-2xl font-fantaisie text-violet-400 mb-3 text-center">
              Confirm Infiltrate
            </h2>
            <p className="text-white/70 text-xs sm:text-sm mb-5 text-center">
              The target gains Stealth, taps, and you control it until it no longer has Stealth.
            </p>
            <div className="flex justify-center mb-6">
              <CardWithPreview
                card={pending.targetMinion.card}
                selected={true}
                interactive={false}
                accentColor="purple"
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
                className="px-6 py-3 rounded-lg bg-violet-600 hover:bg-violet-500 text-white font-bold transition-colors"
                onClick={handleResolve}
              >
                Infiltrate {pending.targetMinion.card.name}
              </button>
            </div>
          </div>
        </div>
      )}

      {!isCaster && (
        <div className="fixed bottom-24 inset-x-0 z-[201] pointer-events-none flex justify-center">
          <div className="px-4 py-2 rounded-lg bg-black/90 text-sm text-violet-300">
            {pending.casterSeat.toUpperCase()} is resolving Infiltrate...
          </div>
        </div>
      )}
    </div>
  );
}
