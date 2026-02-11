"use client";

import React from "react";
import { useGameStore } from "@/lib/game/store";
import { isEvilMinion } from "@/lib/game/store/mephistophelesState";

/**
 * MephistophelesSummonOverlay - Interactive UI for Mephistopheles Evil minion summoning
 *
 * Phase 1: selectingCard - Full-screen modal to pick an Evil minion from hand
 * Phase 2: selectingSite - Compact floating panel; tiles are highlighted on the 3D board
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

  // Phase 1: Card Selection — full-screen modal (user picks from list, not the board)
  if (phase === "selectingCard" && isOwner) {
    return (
      <div className="fixed inset-0 z-[200] flex items-center justify-center pointer-events-auto bg-black/70">
        <div className="bg-black/95 rounded-xl p-6 max-w-2xl w-full mx-4 ring-1 ring-red-500/30">
          <div className="text-center mb-6">
            <h2 className="text-2xl font-fantaisie text-red-400 mb-2">
              Summon Evil Minion
            </h2>
            <p className="text-gray-300 text-sm">
              Select an Evil minion from your hand to summon to an adjacent site
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
    );
  }

  // Phase 2: Site Selection — compact floating panel so the board stays visible
  if (phase === "selectingSite" && isOwner) {
    return (
      <div className="fixed left-4 bottom-28 z-[201] pointer-events-auto">
        <div
          className="rounded-xl bg-black/85 backdrop-blur-sm ring-1 ring-red-500/60 shadow-2xl overflow-hidden"
          style={{ width: 180 }}
        >
          {/* Minion name */}
          <div className="px-3 pt-3 pb-1">
            <div className="text-red-400 font-medium text-sm truncate">
              {selectedCard?.name || "Evil Minion"}
            </div>
            {selectedCard?.subTypes && (
              <div className="text-gray-500 text-[10px] truncate">
                {selectedCard.subTypes}
              </div>
            )}
          </div>

          {/* Instructions */}
          <div className="px-3 py-1">
            <div className="text-gray-400 text-[11px] leading-tight">
              Click a highlighted tile
            </div>
          </div>

          {/* Buttons */}
          <div className="px-3 pb-3 pt-1 flex flex-col gap-1.5">
            <button
              onClick={() => {
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
              className="w-full px-2 py-1 rounded-lg bg-gray-700/60 hover:bg-gray-600/60 text-gray-200 text-xs font-medium transition-colors"
            >
              ← Back
            </button>
            <button
              onClick={cancel}
              className="w-full px-2 py-1 rounded-lg bg-red-900/60 hover:bg-red-800/60 text-red-200 text-xs font-medium transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Opponent view — compact indicator
  if (!isOwner && (phase === "selectingCard" || phase === "selectingSite")) {
    return (
      <div className="fixed left-4 bottom-28 z-[201] pointer-events-none">
        <div className="rounded-xl bg-black/85 backdrop-blur-sm ring-1 ring-red-500/40 shadow-lg px-3 py-2">
          <div className="text-red-400 font-medium text-sm">Mephistopheles</div>
          <div className="text-gray-400 text-[11px]">
            {phase === "selectingCard"
              ? "Opponent selecting minion\u2026"
              : `Opponent placing ${selectedCard?.name || "minion"}\u2026`}
          </div>
        </div>
      </div>
    );
  }

  return null;
}
