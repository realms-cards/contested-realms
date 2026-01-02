"use client";

import Image from "next/image";
import React, { useCallback, useEffect } from "react";
import { useGameStore } from "@/lib/game/store";
import type { CardRef, PlayerKey } from "@/lib/game/store/types";

export default function SearingTruthOverlay() {
  const pending = useGameStore((s) => s.pendingSearingTruth);
  const actorKey = useGameStore((s) => s.actorKey);
  const selectSearingTruthTarget = useGameStore(
    (s) => s.selectSearingTruthTarget
  );
  const resolveSearingTruth = useGameStore((s) => s.resolveSearingTruth);
  const cancelSearingTruth = useGameStore((s) => s.cancelSearingTruth);

  // In hotseat mode (actorKey is null), always show caster UI
  // In online mode, only show caster UI if we're the caster
  const isCaster = actorKey === null || pending?.casterSeat === actorKey;

  // Handle selecting a target player
  const handleSelectTarget = useCallback(
    (target: PlayerKey) => {
      if (!isCaster || pending?.phase !== "selectingTarget") return;
      selectSearingTruthTarget(target);
    },
    [isCaster, pending?.phase, selectSearingTruthTarget]
  );

  // Handle confirm/resolve
  const handleResolve = useCallback(() => {
    resolveSearingTruth();
  }, [resolveSearingTruth]);

  // Handle cancel
  const handleCancel = useCallback(() => {
    cancelSearingTruth();
  }, [cancelSearingTruth]);

  // Auto-resolve after a delay in reveal phase
  useEffect(() => {
    if (pending?.phase === "revealing" && isCaster) {
      const timer = setTimeout(() => {
        resolveSearingTruth();
      }, 3000); // 3 second reveal time
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [pending?.phase, isCaster, resolveSearingTruth]);

  if (!pending) return null;

  const phase = pending.phase;
  const targetSeat = pending.targetSeat;
  const revealedCards = pending.revealedCards;
  const damageAmount = pending.damageAmount;

  return (
    <div className="fixed inset-0 z-[200] pointer-events-none">
      {/* Top bar with status */}
      <div className="fixed inset-x-0 top-6 z-[201] pointer-events-none flex justify-center">
        <div className="pointer-events-auto px-5 py-3 rounded-full bg-black/90 text-white ring-1 ring-orange-500/50 shadow-lg text-lg md:text-xl flex items-center gap-3 select-none">
          <span className="text-orange-400 font-fantaisie">🔥 Searing Truth</span>
          <span className="opacity-80">
            {phase === "selectingTarget" &&
              (isCaster
                ? "Select a player to draw and reveal two spells"
                : `${pending.casterSeat.toUpperCase()} is selecting a target...`)}
            {phase === "revealing" &&
              `${targetSeat?.toUpperCase()} reveals - ${damageAmount} damage incoming!`}
            {phase === "resolving" && "Resolving..."}
          </span>
          {isCaster && phase === "selectingTarget" && (
            <button
              className="mx-1 rounded bg-white/15 hover:bg-white/25 px-3 py-1 select-none"
              onClick={handleCancel}
            >
              Cancel
            </button>
          )}
        </div>
      </div>

      {/* Target selection - only for caster */}
      {isCaster && phase === "selectingTarget" && (
        <div className="fixed inset-0 flex items-center justify-center pointer-events-auto bg-black/70">
          <div className="bg-black/95 rounded-xl p-6 max-w-md w-full mx-4 ring-1 ring-orange-500/30">
            <h2 className="text-2xl font-fantaisie text-orange-400 mb-4 text-center">
              Choose Target Player
            </h2>
            <p className="text-white/70 text-sm mb-6 text-center">
              Target will draw and reveal two spells, then take damage equal to
              the higher mana cost.
            </p>

            <div className="flex gap-4 justify-center mb-6">
              <button
                className="px-8 py-4 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold transition-colors text-lg"
                onClick={() => handleSelectTarget("p1")}
              >
                Player 1
              </button>
              <button
                className="px-8 py-4 rounded-lg bg-red-600 hover:bg-red-500 text-white font-bold transition-colors text-lg"
                onClick={() => handleSelectTarget("p2")}
              >
                Player 2
              </button>
            </div>

            <div className="flex justify-center">
              <button
                className="px-6 py-3 rounded-lg bg-white/10 hover:bg-white/20 text-white/80 font-medium transition-colors"
                onClick={handleCancel}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reveal phase - both players see this */}
      {phase === "revealing" && revealedCards.length > 0 && (
        <div className="fixed inset-0 flex items-center justify-center pointer-events-auto bg-black/70">
          <div className="bg-black/95 rounded-xl p-6 max-w-2xl w-full mx-4 ring-1 ring-orange-500/30">
            <h2 className="text-2xl font-fantaisie text-orange-400 mb-2 text-center">
              {targetSeat?.toUpperCase()} Reveals
            </h2>
            <p className="text-white/70 text-sm mb-6 text-center">
              Drawn cards revealed - Highest cost:{" "}
              <span className="text-orange-400 font-bold text-lg">
                {damageAmount}
              </span>{" "}
              damage
            </p>

            {/* Revealed cards */}
            <div className="flex gap-4 justify-center mb-6">
              {revealedCards.map((card, index) => (
                <CardDisplay key={index} card={card} />
              ))}
            </div>

            {/* Damage indicator */}
            <div className="flex justify-center mb-6">
              <div className="px-6 py-3 rounded-lg bg-orange-600/30 border border-orange-500/50 text-orange-300 font-bold text-xl">
                💥 {damageAmount} Damage to {targetSeat?.toUpperCase()}
              </div>
            </div>

            {/* Confirm button for caster */}
            {isCaster && (
              <div className="flex justify-center">
                <button
                  className="px-6 py-3 rounded-lg bg-orange-600 hover:bg-orange-500 text-white font-bold transition-colors"
                  onClick={handleResolve}
                >
                  Confirm Damage
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Opponent view during target selection */}
      {!isCaster && phase === "selectingTarget" && (
        <div className="fixed bottom-24 inset-x-0 z-[201] pointer-events-none flex justify-center">
          <div className="pointer-events-auto px-4 py-2 rounded-lg bg-black/90 text-white/80 text-sm ring-1 ring-orange-500/30">
            <span className="text-orange-300">
              {pending.casterSeat.toUpperCase()}
            </span>{" "}
            is casting Searing Truth...
          </div>
        </div>
      )}
    </div>
  );
}

// Card display component
function CardDisplay({ card }: { card: CardRef }) {
  return (
    <div className="relative aspect-[2.5/3.5] w-40 rounded-lg overflow-hidden ring-2 ring-orange-500/50 shadow-lg shadow-orange-500/20">
      {card.slug ? (
        <Image
          src={`/images/cards/${card.slug}.avif`}
          alt={card.name || "Card"}
          fill
          className="object-cover"
          sizes="160px"
        />
      ) : (
        <div className="w-full h-full bg-gradient-to-br from-orange-800 to-orange-950 flex items-center justify-center p-2">
          <span className="text-white text-sm text-center font-medium">
            {card.name || "Unknown Card"}
          </span>
        </div>
      )}
    </div>
  );
}
