"use client";

import React from "react";
import { RcButton } from "@/components/ui/rc-button";
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
      <div className="fixed inset-0 z-[200] flex items-center justify-center pointer-events-auto bg-[rgba(6,10,20,0.7)]">
        <div className="rounded-rc-lg border border-rc-line/18 bg-[rgba(9,13,25,0.95)] p-6 max-w-2xl w-full mx-4 font-rc-sans text-rc-fg shadow-rc-panel">
          <div className="text-center mb-6">
            <h2 className="mb-2 font-rc-display text-[26px] leading-tight text-rc-fg-strong">
              Summon Evil Minion
            </h2>
            <p className="text-rc-fg-muted text-sm">
              Select an Evil minion from your hand to summon to an adjacent site
            </p>
            <p className="text-rc-fg-subtle text-xs mt-1">
              Evil = Monster, Demon, or Undead subtype
            </p>
          </div>

          {evilMinionsInHand.length === 0 ? (
            <div className="text-rc-fg-subtle text-center py-8">
              No Evil minions in hand
            </div>
          ) : (
            <div className="thin-scrollbar grid grid-cols-2 sm:grid-cols-3 gap-3 max-h-80 overflow-y-auto">
              {evilMinionsInHand.map(({ card, index }) => (
                <button
                  key={index}
                  onClick={() => selectCard(index)}
                  className="rounded-rc-md border border-rc-line/18 bg-black/30 p-3 text-left transition-colors hover:border-rc-accent/60 hover:bg-rc-accent/8"
                >
                  <div className="font-rc-display text-rc-fg-strong text-sm truncate">
                    {card.name}
                  </div>
                  <div className="text-rc-fg-muted text-xs mt-1">
                    {card.subTypes || "Minion"}
                  </div>
                  {card.cost !== undefined && (
                    <div className="font-rc-mono tabular-nums text-rc-info text-xs mt-1">
                      Cost: {card.cost}
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}

          <div className="flex justify-center mt-6">
            <RcButton variant="outline" size="sm" onClick={cancel}>
              Cancel
            </RcButton>
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
          className="rounded-rc-lg border border-rc-line/22 bg-[rgba(7,10,20,0.85)] backdrop-blur-sm font-rc-sans shadow-rc-panel overflow-hidden"
          style={{ width: 180 }}
        >
          {/* Minion name */}
          <div className="px-3 pt-3 pb-1">
            <div className="font-rc-display text-rc-accent-link text-sm truncate">
              {selectedCard?.name || "Evil Minion"}
            </div>
            {selectedCard?.subTypes && (
              <div className="text-rc-fg-subtle text-[10px] truncate">
                {selectedCard.subTypes}
              </div>
            )}
          </div>

          {/* Instructions */}
          <div className="px-3 py-1">
            <div className="text-rc-fg-muted text-[11px] leading-tight">
              Click a highlighted tile
            </div>
          </div>

          {/* Buttons */}
          <div className="px-3 pb-3 pt-1 flex flex-col gap-1.5">
            <RcButton
              variant="quiet"
              size="xs"
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
              className="w-full h-6 px-2"
            >
              ← Back
            </RcButton>
            <RcButton
              variant="outline"
              size="xs"
              onClick={cancel}
              className="w-full h-6 px-2"
            >
              Cancel
            </RcButton>
          </div>
        </div>
      </div>
    );
  }

  // Opponent view — compact indicator
  if (!isOwner && (phase === "selectingCard" || phase === "selectingSite")) {
    return (
      <div className="fixed left-4 bottom-28 z-[201] pointer-events-none">
        <div className="rounded-rc-lg border border-rc-line/22 bg-[rgba(7,10,20,0.85)] backdrop-blur-sm font-rc-sans shadow-rc-panel px-3 py-2">
          <div className="font-rc-display text-rc-accent-link text-sm">Mephistopheles</div>
          <div className="text-rc-fg-muted text-[11px]">
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
