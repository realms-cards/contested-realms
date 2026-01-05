"use client";

import Image from "next/image";
import React, { useState } from "react";
import { useGameStore } from "@/lib/game/store";

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
        <div className="pointer-events-auto px-5 py-3 rounded-full bg-black/90 text-white ring-1 ring-amber-500/50 shadow-lg text-lg md:text-xl flex items-center gap-3 select-none">
          <span className="text-amber-400 font-fantaisie">
            🦁 Assorted Animals
          </span>
          <span className="opacity-80">
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
        <div className="fixed inset-0 flex items-center justify-center pointer-events-auto bg-black/70">
          <div className="bg-black/95 rounded-xl p-6 max-w-md w-full mx-4 ring-1 ring-amber-500/30">
            <h2 className="text-2xl font-fantaisie text-amber-400 mb-4 text-center">
              Choose X Value
            </h2>
            <p className="text-gray-400 text-center mb-6">
              How much mana do you want to spend? (Max: {maxMana})
            </p>

            <div className="flex items-center justify-center gap-4 mb-6">
              <button
                onClick={() => setChosenX(Math.max(1, chosenX - 1))}
                className="w-10 h-10 rounded-full bg-amber-600 hover:bg-amber-500 text-white font-bold text-xl"
                disabled={chosenX <= 1}
              >
                -
              </button>
              <span className="text-4xl font-bold text-amber-400 w-16 text-center">
                {chosenX}
              </span>
              <button
                onClick={() => setChosenX(Math.min(maxMana, chosenX + 1))}
                className="w-10 h-10 rounded-full bg-amber-600 hover:bg-amber-500 text-white font-bold text-xl"
                disabled={chosenX >= maxMana}
              >
                +
              </button>
            </div>

            <div className="flex justify-center gap-4">
              <button
                onClick={() => setX(chosenX)}
                className="px-6 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-lg font-medium transition-colors"
              >
                Confirm X = {chosenX}
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

      {/* Card selection area - visible to caster */}
      {phase === "selecting" && isCaster && (
        <div className="fixed inset-0 flex items-center justify-center pointer-events-auto bg-black/70">
          <div className="bg-black/95 rounded-xl p-6 max-w-4xl w-full mx-4 ring-1 ring-amber-500/30 max-h-[90vh] overflow-y-auto">
            <h2 className="text-2xl font-fantaisie text-amber-400 mb-2 text-center">
              Search for Beasts (X = {xValue})
            </h2>
            <p className="text-gray-400 text-center mb-4">
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
                  <button
                    key={`${card.cardId}-${index}`}
                    onClick={() => {
                      if (isSelected) {
                        deselectCard(card.cardId);
                      } else if (canSelect) {
                        selectCard(card);
                      }
                    }}
                    disabled={!isSelected && !canSelect}
                    className={`relative aspect-[2.5/3.5] rounded-lg overflow-hidden transition-all ${
                      isSelected
                        ? "ring-4 ring-amber-500 scale-105 shadow-lg shadow-amber-500/50"
                        : canSelect
                        ? "ring-2 ring-amber-500/30 hover:ring-amber-500 cursor-pointer"
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
                    <div className="absolute top-1 right-1 bg-black/80 text-amber-400 text-xs px-1.5 py-0.5 rounded font-bold">
                      {card.cost}
                    </div>
                    {isSelected && (
                      <div className="absolute inset-0 bg-amber-500/30 flex items-center justify-center">
                        <span className="text-white text-2xl font-bold bg-amber-600 rounded-full w-8 h-8 flex items-center justify-center">
                          ✓
                        </span>
                      </div>
                    )}
                    {isDuplicate && (
                      <div className="absolute bottom-0 inset-x-0 bg-black/70 text-xs text-gray-400 py-1 text-center">
                        Already selected
                      </div>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Action buttons */}
            <div className="flex justify-center gap-4">
              <button
                onClick={resolve}
                className="px-6 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-lg font-medium transition-colors"
              >
                {selectedCards.length > 0
                  ? `Take ${selectedCards.length} Beast${
                      selectedCards.length > 1 ? "s" : ""
                    } (cost ${totalCost})`
                  : "Take nothing"}
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

      {/* Opponent view */}
      {phase === "selecting" && !isCaster && (
        <div className="fixed bottom-24 inset-x-0 z-[201] pointer-events-none flex justify-center">
          <div className="pointer-events-auto px-4 py-2 rounded-lg bg-black/90 text-sm text-amber-300 ring-1 ring-amber-500/30">
            {casterSeat.toUpperCase()} is searching for Beasts with Assorted
            Animals...
          </div>
        </div>
      )}

      {/* Brief result flash on complete */}
      {phase === "complete" && (
        <div className="fixed bottom-24 inset-x-0 z-[201] pointer-events-none flex justify-center">
          <div className="pointer-events-auto px-4 py-2 rounded-lg bg-black/90 text-sm text-amber-300 ring-1 ring-amber-500/30">
            Assorted Animals resolved
          </div>
        </div>
      )}
    </div>
  );
}
