"use client";

import React from "react";
import { useGameStore } from "@/lib/game/store";
import { isEvilMinion } from "@/lib/game/store/mephistophelesState";

/**
 * MephistophelesSummonOverlay - Interactive UI for Mephistopheles Evil minion summoning
 *
 * Phase 1: selectingCard - Shows Evil minions from hand for player to select
 * Phase 2: selectingSite - Shows valid adjacent sites for placement
 *
 * Evil minions are those with Monster, Demon, or Undead subtypes.
 * Adjacent = orthogonal only (shares a border).
 * Voidwalk minions can be placed on void tiles.
 */
export default function MephistophelesSummonOverlay() {
  const pending = useGameStore((s) => s.pendingMephistophelesSummon);
  const actorKey = useGameStore((s) => s.actorKey);
  const zones = useGameStore((s) => s.zones);
  const selectCard = useGameStore((s) => s.selectMephistophelesSummonCard);
  const cancel = useGameStore((s) => s.cancelMephistophelesSummon);

  // Debug: log pending state changes
  React.useEffect(() => {
    if (pending) {
      console.log("[MephistophelesSummonOverlay] pending state:", pending);
    }
  }, [pending]);

  if (!pending) return null;

  const { phase, ownerSeat, selectedCard } = pending;

  // Hotseat: actorKey is null, always show owner UI
  // Online: only show owner UI if we're the owner
  const isOwner = actorKey === null || ownerSeat === actorKey;

  // Get Evil minions from hand
  const hand = zones[ownerSeat]?.hand || [];
  const evilMinionsInHand = hand
    .map((card, index) => ({ card, index }))
    .filter(({ card }) => isEvilMinion(card));

  return (
    <div className="fixed inset-0 z-[200] pointer-events-none">
      {/* Top status bar */}
      <div className="fixed inset-x-0 top-6 z-[201] pointer-events-none flex justify-center">
        <div className="pointer-events-auto px-5 py-3 rounded-full bg-black/90 text-white ring-1 ring-red-500/50 shadow-lg text-lg flex items-center gap-3">
          <span className="text-red-400 font-fantaisie">Mephistopheles</span>
          <span className="opacity-80">
            {phase === "selectingCard"
              ? isOwner
                ? "Select an Evil minion from your hand"
                : "Opponent is selecting a minion..."
              : phase === "selectingSite"
              ? isOwner
                ? `Place ${selectedCard?.name || "minion"} on an adjacent site`
                : `Opponent is placing ${selectedCard?.name || "minion"}...`
              : ""}
          </span>
        </div>
      </div>

      {/* Phase 1: Card Selection */}
      {phase === "selectingCard" && isOwner && (
        <div className="fixed inset-0 flex items-center justify-center pointer-events-auto bg-black/70">
          <div className="bg-black/95 rounded-xl p-6 max-w-2xl w-full mx-4 ring-1 ring-red-500/30">
            <div className="text-center mb-6">
              <h2 className="text-2xl font-fantaisie text-red-400 mb-2">
                Summon Evil Minion
              </h2>
              <p className="text-gray-300 text-sm">
                Select an Evil minion from your hand to summon to an adjacent
                site
              </p>
              <p className="text-gray-500 text-xs mt-1">
                Evil = Monster, Demon, or Undead subtype
              </p>
            </div>

            {evilMinionsInHand.length === 0 ? (
              <div className="text-center text-gray-400 py-8">
                No Evil minions in hand
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 max-h-80 overflow-y-auto">
                {evilMinionsInHand.map(({ card, index }) => (
                  <button
                    key={index}
                    onClick={() => selectCard(index)}
                    className="bg-red-950/30 hover:bg-red-900/50 rounded-lg p-3 text-left transition-colors ring-1 ring-red-900/30 hover:ring-red-500/50"
                  >
                    <div className="text-white font-medium text-sm truncate">
                      {card.name}
                    </div>
                    <div className="text-gray-400 text-xs mt-1">
                      {card.subTypes || "Minion"}
                    </div>
                    {card.cost !== undefined && (
                      <div className="text-blue-400 text-xs mt-1">
                        Cost: {card.cost}
                      </div>
                    )}
                  </button>
                ))}
              </div>
            )}

            <div className="flex justify-center mt-6">
              <button
                onClick={cancel}
                className="px-6 py-2 rounded-full bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Phase 2: Site Selection - show status bar only, tiles are highlighted on board */}
      {phase === "selectingSite" && isOwner && (
        <div className="fixed inset-x-0 bottom-24 z-[201] pointer-events-none flex justify-center">
          <div className="pointer-events-auto px-6 py-3 rounded-xl bg-black/90 ring-1 ring-red-500/50 shadow-lg flex items-center gap-4">
            <span className="text-amber-400 font-medium">
              {selectedCard?.name}
            </span>
            <span className="text-gray-300">
              Click a highlighted tile to summon
            </span>
            <button
              onClick={() => {
                // Go back to card selection
                useGameStore.setState({
                  pendingMephistophelesSummon: {
                    ...pending,
                    phase: "selectingCard",
                    selectedCardIndex: null,
                    selectedCard: null,
                    validTargets: [],
                  },
                });
              }}
              className="px-4 py-1.5 rounded-full bg-gray-700 hover:bg-gray-600 text-gray-200 text-sm transition-colors"
            >
              ← Back
            </button>
            <button
              onClick={cancel}
              className="px-4 py-1.5 rounded-full bg-red-900/50 hover:bg-red-800/50 text-red-200 text-sm transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
