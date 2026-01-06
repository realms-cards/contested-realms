"use client";

import React from "react";
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
        <div className="pointer-events-auto px-5 py-3 rounded-full bg-black/90 text-white ring-1 ring-cyan-500/50 shadow-lg text-lg md:text-xl flex items-center gap-3 select-none">
          <span className="text-cyan-400 font-fantaisie">🎵 Dhol Chants</span>
          <span className="opacity-80">
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
        <div className="fixed inset-0 flex items-center justify-center pointer-events-auto bg-black/70">
          <div className="bg-black/95 rounded-xl p-6 max-w-lg w-full mx-4 ring-1 ring-cyan-500/30">
            <h2 className="text-2xl font-fantaisie text-cyan-400 mb-4 text-center">
              Dhol Chants - Select Allies to Tap
            </h2>

            <p className="text-gray-400 text-center mb-4">
              Tap nearby allies to reveal that many spells
            </p>

            <div className="space-y-2 max-h-64 overflow-y-auto mb-6">
              {nearbyAllies.map((ally) => {
                const isSelected = selectedAllies.some(
                  (s) => s.at === ally.at && s.index === ally.index
                );
                return (
                  <button
                    key={`${ally.at}-${ally.index}`}
                    onClick={() => toggleAlly(ally.at, ally.index)}
                    className={`w-full p-3 rounded-lg border-2 transition-all text-left ${
                      isSelected
                        ? "border-cyan-500 bg-cyan-900/40"
                        : "border-gray-600 hover:border-cyan-400 bg-gray-800/30"
                    }`}
                  >
                    <span
                      className={isSelected ? "text-cyan-300" : "text-gray-300"}
                    >
                      {ally.name}
                    </span>
                    {isSelected && <span className="float-right">✓</span>}
                  </button>
                );
              })}
            </div>

            <div className="flex justify-center gap-4">
              <button
                onClick={confirmAllies}
                disabled={selectedAllies.length === 0}
                className={`px-6 py-2 rounded-lg font-medium transition-colors ${
                  selectedAllies.length > 0
                    ? "bg-cyan-600 hover:bg-cyan-500 text-white"
                    : "bg-gray-600 text-gray-400 cursor-not-allowed"
                }`}
              >
                Tap {selectedAllies.length} Allies
              </button>
              <button
                onClick={cancel}
                className="px-6 py-2 bg-gray-600 hover:bg-gray-500 text-white rounded-lg font-medium"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Spell selection phase */}
      {phase === "selecting_spell" && isOwner && (
        <div className="fixed inset-0 flex items-center justify-center pointer-events-auto bg-black/70">
          <div className="bg-black/95 rounded-xl p-6 max-w-3xl w-full mx-4 ring-1 ring-cyan-500/30 max-h-[90vh] overflow-y-auto">
            <h2 className="text-2xl font-fantaisie text-cyan-400 mb-4 text-center">
              Select Spell to Cast Free
            </h2>

            <p className="text-gray-400 text-center mb-4">
              Revealed {revealedSpells.length} spells. Choose one to add to hand
              (cast for free).
            </p>

            {revealedSpells.length === 0 ? (
              <p className="text-gray-400 text-center py-8">
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
              <button
                onClick={resolve}
                disabled={!selectedSpell}
                className={`px-6 py-2 rounded-lg font-medium transition-colors ${
                  selectedSpell
                    ? "bg-cyan-600 hover:bg-cyan-500 text-white"
                    : "bg-gray-600 text-gray-400 cursor-not-allowed"
                }`}
              >
                Cast Spell Free
              </button>
              <button
                onClick={cancel}
                className="px-6 py-2 bg-gray-600 hover:bg-gray-500 text-white rounded-lg font-medium"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Opponent view */}
      {!isOwner && phase !== "complete" && (
        <div className="fixed bottom-24 inset-x-0 z-[201] pointer-events-none flex justify-center">
          <div className="pointer-events-auto px-4 py-2 rounded-lg bg-black/90 text-sm text-cyan-300 ring-1 ring-cyan-500/30">
            {casterSeat.toUpperCase()} is resolving Dhol Chants...
          </div>
        </div>
      )}
    </div>
  );
}
