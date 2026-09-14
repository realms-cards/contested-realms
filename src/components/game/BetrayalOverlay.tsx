"use client";

import React, { useCallback } from "react";
import { RcButton } from "@/components/ui/rc-button";
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
        <div className="pointer-events-auto px-3 sm:px-5 py-2 sm:py-3 rounded-full border border-rc-line/22 bg-[rgba(7,10,20,0.9)] font-rc-sans text-rc-fg shadow-rc-panel text-sm sm:text-lg md:text-xl flex items-center gap-2 sm:gap-3 select-none">
          <span className="font-rc-display text-rc-accent-link">Betrayal</span>
          <span className="text-rc-fg-muted">
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
            <RcButton
              variant="outline"
              size="xs"
              className="mx-1"
              onClick={handleCancel}
              title="Cancels target selection"
            >
              Cancel
            </RcButton>
          )}
        </div>
      </div>

      {isCaster && pending.phase === "resolving" && pending.targetMinion && (
        <div className="fixed inset-0 flex items-center justify-center pointer-events-auto bg-[rgba(6,10,20,0.7)]">
          <div className="rounded-rc-lg border border-rc-line/18 bg-[rgba(9,13,25,0.95)] p-4 sm:p-6 max-w-xl w-full mx-2 sm:mx-4 font-rc-sans text-rc-fg shadow-rc-panel">
            <h2 className="mb-3 text-center font-rc-display text-[22px] sm:text-[26px] leading-tight text-rc-fg-strong">
              Confirm Betrayal
            </h2>
            <p className="text-rc-fg-muted text-xs sm:text-sm mb-5 text-center">
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
              <RcButton variant="outline" onClick={handleCancel}>
                Cancel
              </RcButton>
              <RcButton
                onClick={handleResolve}
                className="h-auto whitespace-normal py-2"
              >
                Betray {pending.targetMinion.card.name}
              </RcButton>
            </div>
          </div>
        </div>
      )}

      {!isCaster && (
        <div className="fixed bottom-24 inset-x-0 z-[201] pointer-events-none flex justify-center">
          <div className="rc-toast">
            {pending.casterSeat.toUpperCase()} is resolving Betrayal...
          </div>
        </div>
      )}
    </div>
  );
}
