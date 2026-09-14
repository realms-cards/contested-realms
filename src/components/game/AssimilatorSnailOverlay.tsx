"use client";

import React from "react";
import { RcButton } from "@/components/ui/rc-button";
import { useGameStore } from "@/lib/game/store";

export default function AssimilatorSnailOverlay() {
  const pending = useGameStore((s) => s.pendingAssimilatorSnail);
  const actorKey = useGameStore((s) => s.actorKey);
  const selectCorpse = useGameStore((s) => s.selectAssimilatorSnailCorpse);
  const resolve = useGameStore((s) => s.resolveAssimilatorSnail);
  const cancel = useGameStore((s) => s.cancelAssimilatorSnail);

  if (!pending) return null;

  const { phase, activatorSeat, eligibleCorpses, selectedCorpseIndex } =
    pending;
  const isActivator = actorKey === null || activatorSeat === actorKey;

  return (
    <div className="fixed inset-0 z-[200] pointer-events-none">
      {/* Top bar with status */}
      <div className="fixed inset-x-0 top-6 z-[201] pointer-events-none flex justify-center">
        <div className="pointer-events-auto px-5 py-3 rounded-full border border-rc-line/22 bg-[rgba(7,10,20,0.9)] font-rc-sans text-rc-fg shadow-rc-panel text-lg md:text-xl flex items-center gap-3 select-none">
          <span className="font-rc-display text-rc-accent-link">
            Assimilator Snail
          </span>
          <span className="text-rc-fg-muted">
            {phase === "selectingCorpse" &&
              isActivator &&
              "Select a dead minion to banish and copy"}
            {phase === "selectingCorpse" &&
              !isActivator &&
              `${activatorSeat.toUpperCase()} is selecting a dead minion...`}
            {phase === "resolved" && "Transformation complete!"}
          </span>
        </div>
      </div>

      {/* Corpse selection dialog - visible to activator */}
      {phase === "selectingCorpse" && isActivator && (
        <div className="fixed inset-0 flex items-center justify-center pointer-events-auto bg-[rgba(6,10,20,0.7)]">
          <div className="thin-scrollbar rounded-rc-lg border border-rc-line/18 bg-[rgba(9,13,25,0.95)] p-6 max-w-lg w-full mx-4 font-rc-sans text-rc-fg shadow-rc-panel max-h-[80vh] overflow-y-auto">
            <h2 className="mb-4 text-center font-rc-display text-[26px] leading-tight text-rc-fg-strong">
              Choose a Dead Minion
            </h2>
            <p className="text-rc-fg-muted text-center mb-4 text-sm">
              The selected minion will be banished and Assimilator Snail becomes
              a copy of it until your next turn.
            </p>

            {/* Corpse list */}
            <div className="space-y-2 mb-6">
              {eligibleCorpses.map((corpse, idx) => {
                const isSelected = selectedCorpseIndex === idx;
                const attack = corpse.card.attack ?? "?";
                const defense = corpse.card.defence ?? "?";
                return (
                  <button
                    key={`${corpse.card.instanceId ?? corpse.card.cardId}_${idx}`}
                    className={`w-full text-left rounded-rc-md border px-4 py-3 transition-colors ${
                      isSelected
                        ? "border-rc-accent bg-rc-accent/12 shadow-[0_0_14px_rgba(243,207,106,0.25)]"
                        : "border-rc-line/18 bg-black/30 hover:border-rc-accent/60 hover:bg-rc-accent/8"
                    }`}
                    onClick={() => selectCorpse(idx)}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="font-rc-display text-rc-fg-strong">
                          {corpse.card.name}
                        </span>
                        <span className="font-rc-mono tabular-nums text-rc-fg-muted text-sm ml-2">
                          ({attack}/{defense})
                        </span>
                      </div>
                      <span className="text-rc-fg-subtle text-xs">
                        {corpse.fromSeat.toUpperCase()}&apos;s cemetery
                      </span>
                    </div>
                    {corpse.card.text && (
                      <p className="text-rc-fg-muted text-xs mt-1 line-clamp-2">
                        {corpse.card.text}
                      </p>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Action buttons */}
            <div className="flex gap-4 justify-center">
              <RcButton variant="outline" onClick={cancel}>
                Cancel
              </RcButton>
              <RcButton
                onClick={resolve}
                disabled={selectedCorpseIndex === null}
              >
                Banish &amp; Transform
              </RcButton>
            </div>
          </div>
        </div>
      )}

      {/* Opponent waiting indicator */}
      {phase === "selectingCorpse" && !isActivator && (
        <div className="fixed bottom-24 inset-x-0 z-[201] pointer-events-none flex justify-center">
          <div className="rc-toast">
            {activatorSeat.toUpperCase()} is choosing a dead minion for
            Assimilator Snail...
          </div>
        </div>
      )}
    </div>
  );
}
