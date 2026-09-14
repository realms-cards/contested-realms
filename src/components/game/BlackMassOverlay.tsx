"use client";

import Image from "next/image";
import React, { useState, useCallback, useRef } from "react";
import { RcButton } from "@/components/ui/rc-button";
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
        <div className="pointer-events-auto px-5 py-3 rounded-full border border-rc-line/22 bg-[rgba(7,10,20,0.9)] font-rc-sans text-rc-fg shadow-rc-panel text-lg md:text-xl flex items-center gap-3 select-none">
          <span className="font-rc-display text-rc-accent-link">Black Mass</span>
          <span className="text-rc-fg-muted">
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
        <div className="fixed inset-0 flex items-center justify-center pointer-events-auto bg-[rgba(6,10,20,0.7)]">
          <div className="thin-scrollbar rounded-rc-lg border border-rc-line/18 bg-[rgba(9,13,25,0.95)] p-6 max-w-4xl w-full mx-4 font-rc-sans text-rc-fg shadow-rc-panel max-h-[90vh] overflow-y-auto">
            <h2 className="mb-4 text-center font-rc-display text-[26px] leading-tight text-rc-fg-strong">
              Search Your Top {topSevenCards.length} Spells
            </h2>
            <p className="text-rc-fg-muted text-center mb-2">
              Select up to 3 different Evil minions to draw. Click a card to
              select/deselect.
            </p>

            {/* Allow non-evil toggle */}
            <label className="rc-check flex justify-center mb-4">
              <input
                type="checkbox"
                checked={allowNonEvil}
                onChange={(e) => setAllowNonEvil(e.target.checked)}
                className="w-4 h-4"
              />
              <span>
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
              <RcButton onClick={resolve}>
                {selectedIndices.length > 0
                  ? `Draw ${selectedIndices.length} card${
                      selectedIndices.length > 1 ? "s" : ""
                    }`
                  : "Draw nothing"}
              </RcButton>
              <RcButton variant="outline" onClick={cancel}>
                Cancel
              </RcButton>
            </div>
          </div>
        </div>
      )}

      {/* Opponent view - just show they're searching */}
      {phase === "selecting" && !isCaster && (
        <div className="fixed bottom-24 inset-x-0 z-[201] pointer-events-none flex justify-center">
          <div className="rc-toast pointer-events-auto">
            {casterSeat.toUpperCase()} is searching their spellbook with Black
            Mass...
          </div>
        </div>
      )}

      {/* Brief result flash on complete */}
      {phase === "complete" && (
        <div className="fixed bottom-24 inset-x-0 z-[201] pointer-events-none flex justify-center">
          <div className="rc-toast pointer-events-auto">
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
      className={`relative aspect-[2.5/3.5] rounded-rc-md overflow-hidden transition-all ${
        isSelected
          ? "ring-4 ring-rc-moonlight scale-105 shadow-[0_0_14px_rgba(201,214,234,0.3)]"
          : isEligible
          ? "ring-2 ring-rc-success/35 hover:ring-rc-success cursor-pointer"
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
        <div className="absolute inset-0 bg-rc-moonlight/20 flex items-center justify-center">
          <span className="text-rc-moonlight text-2xl font-bold border border-rc-moonlight/45 bg-[rgba(7,10,20,0.85)] shadow-rc-sm rounded-full w-8 h-8 flex items-center justify-center">
            ✓
          </span>
        </div>
      )}
      {!isEligible && !isSelected && (
        <div className="absolute bottom-0 inset-x-0 bg-[rgba(7,10,20,0.7)] font-rc-sans text-xs text-rc-fg-muted py-1 text-center">
          Not a minion
        </div>
      )}
    </button>
  );
}
