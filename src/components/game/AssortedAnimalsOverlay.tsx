"use client";

import Image from "next/image";
import React, { useState, useCallback, useRef } from "react";
import { RcButton } from "@/components/ui/rc-button";
import { useGameStore } from "@/lib/game/store";
import type { CardRef } from "@/lib/game/store/types";

export default function AssortedAnimalsOverlay() {
  const pending = useGameStore((s) => s.pendingAssortedAnimals);
  const actorKey = useGameStore((s) => s.actorKey);
  const setX = useGameStore((s) => s.setAssortedAnimalsX);
  const selectCard = useGameStore((s) => s.selectAssortedAnimalsCard);
  const deselectCard = useGameStore((s) => s.deselectAssortedAnimalsCard);
  const resolve = useGameStore((s) => s.resolveAssortedAnimals);
  const cancel = useGameStore((s) => s.cancelAssortedAnimals);

  const [chosenX, setChosenX] = useState(1);

  if (!pending) return null;

  const { phase, casterSeat, xValue, maxMana, eligibleCards, selectedCards } =
    pending;
  const isCaster = actorKey === null || casterSeat === actorKey;

  const totalCost = selectedCards.reduce((sum, c) => sum + c.cost, 0);
  const remainingBudget = xValue - totalCost;

  return (
    <div className="fixed inset-0 z-[200] pointer-events-none">
      {/* Top bar with status */}
      <div className="fixed inset-x-0 top-6 z-[201] pointer-events-none flex justify-center">
        <div className="pointer-events-auto px-5 py-3 rounded-full border border-rc-line/22 bg-[rgba(7,10,20,0.9)] font-rc-sans text-rc-fg shadow-rc-panel text-lg md:text-xl flex items-center gap-3 select-none">
          <span className="font-rc-display text-rc-accent-link">
            Assorted Animals
          </span>
          <span className="text-rc-fg-muted">
            {phase === "choosing_x" && isCaster && "Choose X value"}
            {phase === "choosing_x" &&
              !isCaster &&
              `${casterSeat.toUpperCase()} is choosing X...`}
            {phase === "loading" && "Searching spellbook..."}
            {phase === "selecting" &&
              isCaster &&
              `Select Beasts (${totalCost}/${xValue} mana used)`}
            {phase === "selecting" &&
              !isCaster &&
              `${casterSeat.toUpperCase()} is selecting Beasts...`}
            {phase === "complete" && "Done!"}
          </span>
        </div>
      </div>

      {/* X value selection - caster chooses how much mana to spend */}
      {phase === "choosing_x" && isCaster && (
        <div className="fixed inset-0 flex items-center justify-center pointer-events-auto bg-[rgba(6,10,20,0.7)]">
          <div className="rounded-rc-lg border border-rc-line/18 bg-[rgba(9,13,25,0.95)] p-6 max-w-md w-full mx-4 font-rc-sans text-rc-fg shadow-rc-panel">
            <h2 className="mb-4 text-center font-rc-display text-[26px] leading-tight text-rc-fg-strong">
              Choose X Value
            </h2>
            <p className="text-rc-fg-muted text-center mb-6">
              How much mana do you want to spend? (Max: {maxMana})
            </p>

            <div className="flex items-center justify-center gap-4 mb-6">
              <RcButton
                variant="quiet"
                size="icon"
                onClick={() => setChosenX(Math.max(1, chosenX - 1))}
                className="h-10 w-10 rounded-full text-xl font-bold"
                disabled={chosenX <= 1}
              >
                -
              </RcButton>
              <span className="font-rc-mono text-4xl font-bold tabular-nums text-rc-accent-link w-16 text-center">
                {chosenX}
              </span>
              <RcButton
                variant="quiet"
                size="icon"
                onClick={() => setChosenX(Math.min(maxMana, chosenX + 1))}
                className="h-10 w-10 rounded-full text-xl font-bold"
                disabled={chosenX >= maxMana}
              >
                +
              </RcButton>
            </div>

            <div className="flex justify-center gap-4">
              <RcButton onClick={() => setX(chosenX)}>
                Confirm X = {chosenX}
              </RcButton>
              <RcButton variant="outline" onClick={cancel}>
                Cancel
              </RcButton>
            </div>
          </div>
        </div>
      )}

      {/* Card selection area - visible to caster */}
      {phase === "selecting" && isCaster && (
        <div className="fixed inset-0 flex items-center justify-center pointer-events-auto bg-[rgba(6,10,20,0.7)]">
          <div className="thin-scrollbar rounded-rc-lg border border-rc-line/18 bg-[rgba(9,13,25,0.95)] p-6 max-w-4xl w-full mx-4 font-rc-sans text-rc-fg shadow-rc-panel max-h-[90vh] overflow-y-auto">
            <h2 className="mb-2 text-center font-rc-display text-[26px] leading-tight text-rc-fg-strong">
              Search for Beasts (X = {xValue})
            </h2>
            <p className="text-rc-fg-muted text-center mb-4">
              Select different Beasts with combined cost ≤ {xValue}. Budget
              remaining: {remainingBudget}
            </p>

            {/* Card grid */}
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3 mb-6">
              {eligibleCards.map((card, index) => {
                const isSelected = selectedCards.some(
                  (c) => c.cardId === card.cardId
                );
                const isDuplicate =
                  !isSelected &&
                  selectedCards.some((c) => c.name === card.name);
                const isAffordable = card.cost <= remainingBudget;
                const canSelect = !isSelected && !isDuplicate && isAffordable;

                return (
                  <CardDisplayWithCost
                    key={`${card.cardId}-${index}`}
                    card={card}
                    onClick={() => {
                      if (isSelected) {
                        deselectCard(card.cardId);
                      } else if (canSelect) {
                        selectCard(card);
                      }
                    }}
                    disabled={!isSelected && !canSelect}
                    isSelected={isSelected}
                    canSelect={canSelect}
                    isDuplicate={isDuplicate}
                  />
                );
              })}
            </div>

            {/* Action buttons */}
            <div className="flex justify-center gap-4">
              <RcButton
                className="h-auto py-2 whitespace-normal"
                onClick={resolve}
              >
                {selectedCards.length > 0
                  ? `Take ${selectedCards.length} Beast${
                      selectedCards.length > 1 ? "s" : ""
                    } (cost ${totalCost})`
                  : "Take nothing"}
              </RcButton>
              <RcButton variant="outline" onClick={cancel}>
                Cancel
              </RcButton>
            </div>
          </div>
        </div>
      )}

      {/* Opponent view */}
      {phase === "selecting" && !isCaster && (
        <div className="fixed bottom-24 inset-x-0 z-[201] pointer-events-none flex justify-center">
          <div className="rc-toast pointer-events-auto">
            {casterSeat.toUpperCase()} is searching for Beasts with Assorted
            Animals...
          </div>
        </div>
      )}

      {/* Brief result flash on complete */}
      {phase === "complete" && (
        <div className="fixed bottom-24 inset-x-0 z-[201] pointer-events-none flex justify-center">
          <div className="rc-toast pointer-events-auto">
            Assorted Animals resolved
          </div>
        </div>
      )}
    </div>
  );
}

// Card display with cost badge and preview support
function CardDisplayWithCost({
  card,
  onClick,
  disabled,
  isSelected,
  canSelect,
  isDuplicate,
}: {
  card: CardRef & { cost: number };
  onClick: () => void;
  disabled: boolean;
  isSelected: boolean;
  canSelect: boolean;
  isDuplicate: boolean;
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
          ? "ring-4 ring-rc-accent scale-105 shadow-[0_0_14px_rgba(243,207,106,0.25)]"
          : canSelect
          ? "ring-2 ring-rc-line/25 hover:ring-rc-accent cursor-pointer"
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
      {/* Cost badge */}
      <div className="absolute top-1 right-1 rounded-rc-sm border border-rc-line/22 bg-[rgba(7,10,20,0.85)] font-rc-mono text-xs font-bold tabular-nums text-rc-accent-link px-1.5 py-0.5">
        {card.cost}
      </div>
      {isSelected && (
        <div className="absolute inset-0 bg-rc-accent/12 flex items-center justify-center">
          <span className="text-rc-spark text-2xl font-bold border border-rc-accent/60 bg-[rgba(7,10,20,0.85)] shadow-rc-sm rounded-full w-8 h-8 flex items-center justify-center">
            ✓
          </span>
        </div>
      )}
      {isDuplicate && (
        <div className="absolute bottom-0 inset-x-0 bg-[rgba(7,10,20,0.85)] text-xs text-rc-fg-muted py-1 text-center">
          Already selected
        </div>
      )}
    </button>
  );
}
