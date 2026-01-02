"use client";

import Image from "next/image";
import React, { useState, useCallback } from "react";
import { useGameStore } from "@/lib/game/store";
import type { CardRef } from "@/lib/game/store/types";

export default function AccusationOverlay() {
  const pending = useGameStore((s) => s.pendingAccusation);
  const actorKey = useGameStore((s) => s.actorKey);
  const selectAccusationCard = useGameStore((s) => s.selectAccusationCard);
  const resolveAccusation = useGameStore((s) => s.resolveAccusation);
  const cancelAccusation = useGameStore((s) => s.cancelAccusation);

  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  // Determine who has control over selection
  // If caster has choice (Evil present), caster chooses
  // Otherwise, victim chooses
  const isCaster = actorKey === null || pending?.casterSeat === actorKey;
  const isVictim = actorKey === null || pending?.victimSeat === actorKey;
  const hasControl = pending?.casterHasChoice ? isCaster : isVictim;

  // Handle selecting a card
  const handleSelectCard = useCallback(
    (index: number) => {
      if (!hasControl || pending?.phase !== "selecting") return;
      setSelectedIndex(index);
      selectAccusationCard(index);
    },
    [hasControl, pending?.phase, selectAccusationCard]
  );

  // Handle confirm/resolve
  const handleResolve = useCallback(() => {
    if (selectedIndex === null) return;
    resolveAccusation();
    setSelectedIndex(null);
  }, [resolveAccusation, selectedIndex]);

  // Handle cancel (only caster can cancel)
  const handleCancel = useCallback(() => {
    cancelAccusation();
    setSelectedIndex(null);
  }, [cancelAccusation]);

  if (!pending) return null;

  const phase = pending.phase;
  const revealedHand = pending.revealedHand;
  const casterHasChoice = pending.casterHasChoice;
  const evilCardIndices = new Set(pending.evilCardIndices);

  // Determine instruction text
  const getInstructionText = () => {
    if (phase === "revealing") {
      return `Revealing ${pending.victimSeat.toUpperCase()}'s hand...`;
    }
    if (phase === "selecting") {
      if (casterHasChoice) {
        return isCaster
          ? "Evil detected! Choose a card to banish."
          : `${pending.casterSeat.toUpperCase()} is choosing a card to banish...`;
      } else {
        return isVictim
          ? "No Evil found. Choose a card to banish."
          : `${pending.victimSeat.toUpperCase()} is choosing a card to banish...`;
      }
    }
    return "Resolving...";
  };

  return (
    <div className="fixed inset-0 z-[200] pointer-events-none">
      {/* Top bar with status */}
      <div className="fixed inset-x-0 top-6 z-[201] pointer-events-none flex justify-center">
        <div className="pointer-events-auto px-5 py-3 rounded-full bg-black/90 text-white ring-1 ring-red-600/50 shadow-lg text-lg md:text-xl flex items-center gap-3 select-none">
          <span className="text-red-500 font-fantaisie">⚖️ Accusation</span>
          <span className="opacity-80">{getInstructionText()}</span>
          {isCaster && phase === "selecting" && (
            <button
              className="mx-1 rounded bg-white/15 hover:bg-white/25 px-3 py-1 select-none"
              onClick={handleCancel}
            >
              Cancel
            </button>
          )}
        </div>
      </div>

      {/* Main content area */}
      {(phase === "revealing" || phase === "selecting") &&
        revealedHand.length > 0 && (
          <div className="fixed inset-0 flex items-center justify-center pointer-events-auto bg-black/70">
            <div className="bg-black/95 rounded-xl p-6 max-w-4xl w-full mx-4 ring-1 ring-red-600/30 max-h-[90vh] overflow-y-auto">
              <h2 className="text-2xl font-fantaisie text-red-500 mb-2 text-center">
                {pending.victimSeat.toUpperCase()}&apos;s Hand Revealed
              </h2>
              <p className="text-white/70 text-sm mb-2 text-center">
                {revealedHand.length} card{revealedHand.length !== 1 ? "s" : ""}{" "}
                in hand
              </p>
              {casterHasChoice && (
                <p className="text-red-400 text-sm mb-6 text-center font-medium">
                  🔥 Evil detected - Caster chooses the card to banish
                </p>
              )}
              {!casterHasChoice && (
                <p className="text-amber-400 text-sm mb-6 text-center">
                  No Evil found - Victim chooses the card to banish
                </p>
              )}

              {/* Card grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 mb-6">
                {revealedHand.map((card, index) => (
                  <CardDisplay
                    key={index}
                    card={card}
                    onClick={() => handleSelectCard(index)}
                    selected={selectedIndex === index}
                    interactive={hasControl && phase === "selecting"}
                    isEvil={evilCardIndices.has(index)}
                  />
                ))}
              </div>

              {/* Action buttons */}
              {hasControl && phase === "selecting" && (
                <div className="flex gap-3 justify-center">
                  {isCaster && (
                    <button
                      className="px-6 py-3 rounded-lg bg-white/10 hover:bg-white/20 text-white/80 font-medium transition-colors"
                      onClick={handleCancel}
                    >
                      Cancel
                    </button>
                  )}
                  <button
                    className="px-6 py-3 rounded-lg bg-red-600 hover:bg-red-500 text-white font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    onClick={handleResolve}
                    disabled={selectedIndex === null}
                  >
                    Banish Card
                  </button>
                </div>
              )}

              {/* Waiting message for non-controller */}
              {!hasControl && phase === "selecting" && (
                <div className="text-center text-white/60 text-sm">
                  Waiting for{" "}
                  {casterHasChoice
                    ? pending.casterSeat.toUpperCase()
                    : pending.victimSeat.toUpperCase()}{" "}
                  to choose...
                </div>
              )}
            </div>
          </div>
        )}
    </div>
  );
}

// Card display component
function CardDisplay({
  card,
  onClick,
  selected,
  interactive,
  isEvil,
}: {
  card: CardRef;
  onClick?: () => void;
  selected: boolean;
  interactive: boolean;
  isEvil: boolean;
}) {
  return (
    <div
      onClick={interactive ? onClick : undefined}
      className={`relative aspect-[2.5/3.5] rounded-lg overflow-hidden transition-all ${
        interactive
          ? "cursor-pointer hover:ring-2 hover:ring-red-400/50 hover:scale-105"
          : ""
      } ${selected ? "ring-4 ring-red-500 scale-105 shadow-lg shadow-red-500/30" : ""} ${
        isEvil && !selected ? "ring-2 ring-purple-500/50" : ""
      }`}
    >
      {card.slug ? (
        <Image
          src={`/images/cards/${card.slug}.avif`}
          alt={card.name || "Card"}
          fill
          className="object-cover"
          sizes="(max-width: 640px) 45vw, (max-width: 1024px) 30vw, 15vw"
        />
      ) : (
        <div className="w-full h-full bg-gradient-to-br from-red-800 to-red-950 flex items-center justify-center p-2">
          <span className="text-white text-xs text-center font-medium">
            {card.name || "Unknown Card"}
          </span>
        </div>
      )}
      {isEvil && (
        <div className="absolute top-1 right-1 bg-purple-600 text-white text-xs px-1 rounded">
          Evil
        </div>
      )}
      {selected && (
        <div className="absolute inset-0 bg-red-500/20 flex items-center justify-center">
          <span className="text-3xl">⚖️</span>
        </div>
      )}
    </div>
  );
}
