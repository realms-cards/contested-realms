"use client";

import Image from "next/image";
import React, { useState, useCallback, useRef } from "react";
import { useGameStore } from "@/lib/game/store";
import type { CardRef } from "@/lib/game/store/types";

export default function BlackMassOverlay() {
  const pending = useGameStore((s) => s.pendingBlackMass);
  const actorKey = useGameStore((s) => s.actorKey);
  const selectCard = useGameStore((s) => s.selectBlackMassCard);
  const deselectCard = useGameStore((s) => s.deselectBlackMassCard);
  const resolve = useGameStore((s) => s.resolveBlackMass);
  const cancel = useGameStore((s) => s.cancelBlackMass);

  // Toggle to allow selecting any minion (for cards that make others Evil)
  const [allowNonEvil, setAllowNonEvil] = useState(false);

  if (!pending) return null;

  const {
    phase,
    casterSeat,
    topSevenCards,
    eligibleIndices,
    allMinionIndices,
    selectedIndices,
  } = pending;
  const isCaster = actorKey === null || casterSeat === actorKey;

  // Use all minions if toggle is on, otherwise just evil ones
  const effectiveEligible = allowNonEvil
    ? allMinionIndices || eligibleIndices
    : eligibleIndices;

  return (
    <div className="fixed inset-0 z-[200] pointer-events-none">
      {/* Top bar with status */}
      <div className="fixed inset-x-0 top-6 z-[201] pointer-events-none flex justify-center">
        <div className="pointer-events-auto px-5 py-3 rounded-full bg-black/90 text-white ring-1 ring-purple-500/50 shadow-lg text-lg md:text-xl flex items-center gap-3 select-none">
          <span className="text-purple-400 font-fantaisie">🖤 Black Mass</span>
          <span className="opacity-80">
            {phase === "loading" && "Searching spellbook..."}
            {phase === "selecting" &&
              isCaster &&
              `Select up to 3 Evil minions (${selectedIndices.length}/3)`}
            {phase === "selecting" &&
              !isCaster &&
              `${casterSeat.toUpperCase()} is selecting Evil minions...`}
            {phase === "resolving" && "Drawing cards..."}
            {phase === "complete" && "Done!"}
          </span>
        </div>
      </div>

      {/* Card selection area - visible to caster */}
      {phase === "selecting" && isCaster && (
        <div className="fixed inset-0 flex items-center justify-center pointer-events-auto bg-black/70">
          <div className="bg-black/95 rounded-xl p-6 max-w-4xl w-full mx-4 ring-1 ring-purple-500/30 max-h-[90vh] overflow-y-auto">
            <h2 className="text-2xl font-fantaisie text-purple-400 mb-4 text-center">
              Search Your Top {topSevenCards.length} Spells
            </h2>
            <p className="text-gray-400 text-center mb-2">
              Select up to 3 different Evil minions to draw. Click a card to
              select/deselect.
            </p>

            {/* Allow non-evil toggle */}
            <label className="flex items-center justify-center gap-2 mb-4 cursor-pointer text-sm">
              <input
                type="checkbox"
                checked={allowNonEvil}
                onChange={(e) => setAllowNonEvil(e.target.checked)}
                className="w-4 h-4 accent-purple-500"
              />
              <span className="text-gray-400">
                Allow selecting non-Evil minions (for cards that grant Evil)
              </span>
            </label>

            {/* Card grid */}
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-7 gap-2 mb-6">
              {topSevenCards.map((card, index) => {
                const isEligible = effectiveEligible.includes(index);
                const isSelected = selectedIndices.includes(index);

                return (
                  <BlackMassCardDisplay
                    key={`${card.cardId}-${index}`}
                    card={card}
                    onClick={() => {
                      if (isSelected) {
                        deselectCard(index);
                      } else if (isEligible && selectedIndices.length < 3) {
                        selectCard(index);
                      }
                    }}
                    disabled={!isEligible && !isSelected}
                    isSelected={isSelected}
                    isEligible={isEligible}
                  />
                );
              })}
            </div>

            {/* Action buttons */}
            <div className="flex justify-center gap-4">
              <button
                onClick={resolve}
                className="px-6 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg font-medium transition-colors"
              >
                {selectedIndices.length > 0
                  ? `Draw ${selectedIndices.length} card${
                      selectedIndices.length > 1 ? "s" : ""
                    }`
                  : "Draw nothing"}
              </button>
              <button
                onClick={cancel}
                className="px-6 py-2 bg-gray-600 hover:bg-gray-500 text-white rounded-lg font-medium transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Opponent view - just show they're searching */}
      {phase === "selecting" && !isCaster && (
        <div className="fixed bottom-24 inset-x-0 z-[201] pointer-events-none flex justify-center">
          <div className="pointer-events-auto px-4 py-2 rounded-lg bg-black/90 text-sm text-purple-300 ring-1 ring-purple-500/30">
            {casterSeat.toUpperCase()} is searching their spellbook with Black
            Mass...
          </div>
        </div>
      )}

      {/* Brief result flash on complete */}
      {phase === "complete" && (
        <div className="fixed bottom-24 inset-x-0 z-[201] pointer-events-none flex justify-center">
          <div className="pointer-events-auto px-4 py-2 rounded-lg bg-black/90 text-sm text-purple-300 ring-1 ring-purple-500/30">
            Black Mass resolved
          </div>
        </div>
      )}
    </div>
  );
}

// Card display with preview support for Black Mass
function BlackMassCardDisplay({
  card,
  onClick,
  disabled,
  isSelected,
  isEligible,
}: {
  card: CardRef;
  onClick: () => void;
  disabled: boolean;
  isSelected: boolean;
  isEligible: boolean;
}) {
  const setPreviewCard = useGameStore((s) => s.setPreviewCard);
  const hoverTimerRef = useRef<number | null>(null);

  const handleMouseEnter = useCallback(() => {
    if (hoverTimerRef.current) window.clearTimeout(hoverTimerRef.current);
    hoverTimerRef.current = window.setTimeout(() => {
      setPreviewCard(card);
    }, 200);
  }, [card, setPreviewCard]);

  const handleMouseLeave = useCallback(() => {
    if (hoverTimerRef.current) {
      window.clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
    setPreviewCard(null);
  }, [setPreviewCard]);

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className={`relative aspect-[2.5/3.5] rounded-lg overflow-hidden transition-all ${
        isSelected
          ? "ring-4 ring-purple-500 scale-105 shadow-lg shadow-purple-500/50"
          : isEligible
          ? "ring-2 ring-green-500/50 hover:ring-green-500 cursor-pointer"
          : "opacity-50 cursor-not-allowed grayscale"
      }`}
    >
      <Image
        src={`/api/images/${card.slug || card.cardId}`}
        alt={card.name || "Card"}
        fill
        className="object-cover"
        unoptimized
      />
      {isSelected && (
        <div className="absolute inset-0 bg-purple-500/30 flex items-center justify-center">
          <span className="text-white text-2xl font-bold bg-purple-600 rounded-full w-8 h-8 flex items-center justify-center">
            ✓
          </span>
        </div>
      )}
      {!isEligible && !isSelected && (
        <div className="absolute bottom-0 inset-x-0 bg-black/70 text-xs text-gray-400 py-1 text-center">
          Not a minion
        </div>
      )}
    </button>
  );
}
