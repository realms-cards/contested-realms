"use client";

import React from "react";
import { RcButton } from "@/components/ui/rc-button";
import { useGameStore } from "@/lib/game/store";
import CardWithPreview, { CardGrid } from "./CardWithPreview";

export default function DholChantsOverlay() {
  const pending = useGameStore((s) => s.pendingDholChants);
  const actorKey = useGameStore((s) => s.actorKey);
  const toggleAlly = useGameStore((s) => s.toggleDholChantsAlly);
  const confirmAllies = useGameStore((s) => s.confirmDholChantsAllies);
  const selectSpell = useGameStore((s) => s.selectDholChantsSpell);
  const resolve = useGameStore((s) => s.resolveDholChants);
  const cancel = useGameStore((s) => s.cancelDholChants);

  if (!pending) return null;

  const {
    phase,
    casterSeat,
    nearbyAllies,
    selectedAllies,
    revealedSpells,
    selectedSpell,
  } = pending;
  const isOwner = actorKey === null || casterSeat === actorKey;

  return (
    <div className="fixed inset-0 z-[200] pointer-events-none">
      {/* Top bar with status */}
      <div className="fixed inset-x-0 top-6 z-[201] pointer-events-none flex justify-center">
        <div className="pointer-events-auto px-5 py-3 rounded-full border border-rc-line/22 bg-[rgba(7,10,20,0.9)] font-rc-sans text-rc-fg shadow-rc-panel text-lg md:text-xl flex items-center gap-3 select-none">
          <span className="font-rc-display text-rc-accent-link">Dhol Chants</span>
          <span className="text-rc-fg-muted">
            {phase === "selecting_allies" &&
              `Select allies to tap (${selectedAllies.length} selected)`}
            {phase === "revealing" && "Revealing spells..."}
            {phase === "selecting_spell" &&
              (selectedSpell ? "Confirm spell" : "Select spell to cast free")}
            {phase === "complete" && "Done!"}
          </span>
        </div>
      </div>

      {/* Ally selection phase */}
      {phase === "selecting_allies" && isOwner && (
        <div className="fixed inset-0 flex items-center justify-center pointer-events-auto bg-[rgba(6,10,20,0.7)]">
          <div className="rounded-rc-lg border border-rc-line/18 bg-[rgba(9,13,25,0.95)] p-6 max-w-lg w-full mx-4 font-rc-sans text-rc-fg shadow-rc-panel">
            <h2 className="mb-4 text-center font-rc-display text-[26px] leading-tight text-rc-fg-strong">
              Dhol Chants - Select Allies to Tap
            </h2>

            <p className="text-rc-fg-muted text-center mb-4">
              Tap nearby allies to reveal that many spells
            </p>

            <div className="thin-scrollbar space-y-2 max-h-64 overflow-y-auto mb-6">
              {nearbyAllies.map((ally) => {
                const isSelected = selectedAllies.some(
                  (s) => s.at === ally.at && s.index === ally.index
                );
                return (
                  <button
                    key={`${ally.at}-${ally.index}`}
                    onClick={() => toggleAlly(ally.at, ally.index)}
                    className={`w-full p-3 rounded-rc-md border transition-colors text-left ${
                      isSelected
                        ? "border-rc-accent bg-rc-accent/12 shadow-[0_0_14px_rgba(243,207,106,0.25)]"
                        : "border-rc-line/18 bg-black/30 hover:border-rc-accent/60 hover:bg-rc-accent/8"
                    }`}
                  >
                    <span
                      className={`font-rc-display ${isSelected ? "text-rc-accent-link" : "text-rc-fg-strong"}`}
                    >
                      {ally.name}
                    </span>
                    {isSelected && <span className="float-right text-rc-accent-link">✓</span>}
                  </button>
                );
              })}
            </div>

            <div className="flex justify-center gap-4">
              <RcButton
                onClick={confirmAllies}
                disabled={selectedAllies.length === 0}
              >
                Tap {selectedAllies.length} Allies
              </RcButton>
              <RcButton variant="outline" onClick={cancel}>
                Cancel
              </RcButton>
            </div>
          </div>
        </div>
      )}

      {/* Spell selection phase */}
      {phase === "selecting_spell" && isOwner && (
        <div className="fixed inset-0 flex items-center justify-center pointer-events-auto bg-[rgba(6,10,20,0.7)]">
          <div className="thin-scrollbar rounded-rc-lg border border-rc-line/18 bg-[rgba(9,13,25,0.95)] p-6 max-w-3xl w-full mx-4 font-rc-sans text-rc-fg shadow-rc-panel max-h-[90vh] overflow-y-auto">
            <h2 className="mb-4 text-center font-rc-display text-[26px] leading-tight text-rc-fg-strong">
              Select Spell to Cast Free
            </h2>

            <p className="text-rc-fg-muted text-center mb-4">
              Revealed {revealedSpells.length} spells. Choose one to add to hand
              (cast for free).
            </p>

            {revealedSpells.length === 0 ? (
              <p className="text-rc-fg-subtle text-center py-8">
                No spells revealed
              </p>
            ) : (
              <CardGrid columns={5}>
                {revealedSpells.map((card, idx) => (
                  <CardWithPreview
                    key={`${card.cardId}-${idx}`}
                    card={card}
                    onClick={() => selectSpell(card)}
                    selected={selectedSpell?.cardId === card.cardId}
                    interactive={true}
                    accentColor="cyan"
                  />
                ))}
              </CardGrid>
            )}

            <div className="flex justify-center gap-4">
              <RcButton onClick={resolve} disabled={!selectedSpell}>
                Cast Spell Free
              </RcButton>
              <RcButton variant="outline" onClick={cancel}>
                Cancel
              </RcButton>
            </div>
          </div>
        </div>
      )}

      {/* Opponent view */}
      {!isOwner && phase !== "complete" && (
        <div className="fixed bottom-24 inset-x-0 z-[201] pointer-events-none flex justify-center">
          <div className="rc-toast pointer-events-auto">
            {casterSeat.toUpperCase()} is resolving Dhol Chants...
          </div>
        </div>
      )}
    </div>
  );
}
