"use client";

import React from "react";
import { useGameStore } from "@/lib/game/store";
import type { PlayerKey } from "@/lib/game/store/types";
import CardWithPreview from "./CardWithPreview";

interface LilithOverlayProps {
  playerNames?: { p1: string; p2: string };
}

export default function LilithOverlay({ playerNames }: LilithOverlayProps) {
  const pending = useGameStore((s) => s.pendingLilithReveal);
  const actorKey = useGameStore((s) => s.actorKey);
  const resolve = useGameStore((s) => s.resolveLilithReveal);
  const cancel = useGameStore((s) => s.cancelLilithReveal);

  if (!pending) return null;

  const { phase, revealedCard, isMinion, lilithOwner } = pending;

  // Helper to get display name for a player
  const getPlayerName = (seat: PlayerKey): string => {
    if (playerNames) {
      return playerNames[seat];
    }
    return seat.toUpperCase();
  };

  const opponentSeat: PlayerKey = lilithOwner === "p1" ? "p2" : "p1";

  // Both players see the reveal, but only Lilith owner can dismiss
  const isOwner = actorKey === null || lilithOwner === actorKey;

  return (
    <div className="fixed inset-0 z-[200] pointer-events-none">
      {/* Top bar with status */}
      <div className="fixed inset-x-0 top-6 z-[201] pointer-events-none flex justify-center">
        <div className="pointer-events-auto px-5 py-3 rounded-full bg-black/90 text-white ring-1 ring-purple-500/50 shadow-lg text-lg md:text-xl flex items-center gap-3 select-none">
          <span className="text-purple-400 font-fantaisie">😈 Lilith</span>
          <span className="opacity-80">
            {phase === "revealing" && "Revealing opponent's top spell..."}
            {phase === "resolving" && "Resolving..."}
            {phase === "complete" &&
              (isMinion
                ? `${revealedCard?.name} is summoned!`
                : `${revealedCard?.name} goes to bottom of deck`)}
          </span>
        </div>
      </div>

      {/* Card reveal area - visible to both players */}
      {phase === "revealing" && (
        <div className="fixed inset-0 flex items-center justify-center pointer-events-auto bg-black/70">
          <div className="bg-black/95 rounded-xl p-6 max-w-md w-full mx-4 ring-1 ring-purple-500/30">
            <h2 className="text-2xl font-fantaisie text-purple-400 mb-4 text-center">
              {revealedCard
                ? isOwner
                  ? "You reveal"
                  : `${getPlayerName(lilithOwner)} reveals`
                : "Waiting for opponent's card..."}
            </h2>

            {/* Revealed card or loading */}
            <div className="flex justify-center mb-4">
              {revealedCard ? (
                <CardWithPreview
                  card={revealedCard}
                  interactive={false}
                  accentColor="purple"
                  size="lg"
                />
              ) : (
                <div className="aspect-[2.5/3.5] w-48 rounded-lg bg-purple-900/30 ring-2 ring-purple-500/50 flex items-center justify-center">
                  <div className="animate-pulse text-purple-400">
                    <svg
                      className="w-12 h-12 animate-spin"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      />
                    </svg>
                  </div>
                </div>
              )}
            </div>

            {/* Card name and result */}
            <div className="text-center">
              {revealedCard ? (
                <>
                  <p className="text-white text-lg font-medium mb-2">
                    {revealedCard.name}
                  </p>
                  <p
                    className={`text-sm mb-4 ${
                      isMinion ? "text-green-400" : "text-yellow-400"
                    }`}
                  >
                    {isMinion
                      ? "🎯 It's a minion! Lilith will summon it."
                      : "📚 Not a minion. Goes to bottom of spellbook."}
                  </p>

                  {/* Action button - only Lilith owner can resolve */}
                  {isOwner && (
                    <button
                      onClick={resolve}
                      className="px-6 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg font-medium transition-colors"
                    >
                      {isMinion ? "Summon" : "Continue"}
                    </button>
                  )}
                  {!isOwner && (
                    <div className="flex flex-col items-center gap-2">
                      <p className="text-gray-400 text-sm">
                        Waiting for {getPlayerName(lilithOwner)} to continue...
                      </p>
                      <button
                        onClick={cancel}
                        className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg font-medium transition-colors text-sm"
                      >
                        Dismiss
                      </button>
                    </div>
                  )}
                </>
              ) : (
                <div className="flex flex-col items-center gap-3">
                  <p className="text-gray-400 text-sm">
                    Requesting card from opponent...
                  </p>
                  <button
                    onClick={cancel}
                    className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg font-medium transition-colors text-sm"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Brief result flash on complete */}
      {phase === "complete" && revealedCard && (
        <div className="fixed bottom-24 inset-x-0 z-[201] pointer-events-none flex justify-center">
          <div
            className={`pointer-events-auto px-4 py-2 rounded-lg bg-black/90 text-sm ring-1 ${
              isMinion
                ? "text-green-300 ring-green-500/30"
                : "text-yellow-300 ring-yellow-500/30"
            }`}
          >
            {isMinion
              ? `Lilith summons ${revealedCard.name}!`
              : `${revealedCard.name} goes to bottom of ${getPlayerName(opponentSeat)}'s spellbook`}
          </div>
        </div>
      )}
    </div>
  );
}
