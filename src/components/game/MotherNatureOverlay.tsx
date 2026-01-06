"use client";

import React from "react";
import { useGameStore } from "@/lib/game/store";
import CardWithPreview from "./CardWithPreview";

export default function MotherNatureOverlay() {
  const pending = useGameStore((s) => s.pendingMotherNatureReveal);
  const actorKey = useGameStore((s) => s.actorKey);
  const acceptSummon = useGameStore((s) => s.acceptMotherNatureSummon);
  const declineSummon = useGameStore((s) => s.declineMotherNatureSummon);

  if (!pending) return null;

  const { phase, revealedCard, isMinion, ownerSeat } = pending;
  const isOwner = actorKey === null || ownerSeat === actorKey;

  return (
    <div className="fixed inset-0 z-[200] pointer-events-none">
      {/* Top bar with status */}
      <div className="fixed inset-x-0 top-6 z-[201] pointer-events-none flex justify-center">
        <div className="pointer-events-auto px-5 py-3 rounded-full bg-black/90 text-white ring-1 ring-green-500/50 shadow-lg text-lg md:text-xl flex items-center gap-3 select-none">
          <span className="text-green-400 font-fantaisie">
            🌿 Mother Nature
          </span>
          <span className="opacity-80">
            {phase === "revealing" && "Revealing your top spell..."}
            {phase === "choosing" && isOwner && "Choose to summon?"}
            {phase === "choosing" &&
              !isOwner &&
              `${ownerSeat.toUpperCase()} is deciding...`}
            {phase === "resolving" && "Resolving..."}
            {phase === "complete" &&
              (isMinion ? `${revealedCard?.name} summoned!` : "Not a minion")}
          </span>
        </div>
      </div>

      {/* Card reveal area */}
      {(phase === "revealing" || phase === "choosing") && revealedCard && (
        <div className="fixed inset-0 flex items-center justify-center pointer-events-auto bg-black/70">
          <div className="bg-black/95 rounded-xl p-6 max-w-md w-full mx-4 ring-1 ring-green-500/30">
            <h2 className="text-2xl font-fantaisie text-green-400 mb-4 text-center">
              {isOwner ? "You reveal" : `${ownerSeat.toUpperCase()} reveals`}
            </h2>

            {/* Revealed card */}
            <div className="flex justify-center mb-4">
              <CardWithPreview
                card={revealedCard}
                interactive={false}
                accentColor="green"
                size="lg"
              />
            </div>

            {/* Card name and result */}
            <div className="text-center mb-4">
              <p className="text-white text-lg font-medium mb-2">
                {revealedCard.name}
              </p>
              <p
                className={`text-sm ${
                  isMinion ? "text-green-400" : "text-yellow-400"
                }`}
              >
                {isMinion
                  ? "🎯 It's a minion! You may summon it."
                  : "📚 Not a minion. Stays on top of spellbook."}
              </p>
            </div>

            {/* Choice buttons for owner when it's a minion */}
            {phase === "choosing" && isMinion && isOwner && (
              <div className="flex justify-center gap-4">
                <button
                  onClick={acceptSummon}
                  className="px-6 py-2 bg-green-600 hover:bg-green-500 text-white rounded-lg font-medium transition-colors"
                >
                  Summon
                </button>
                <button
                  onClick={declineSummon}
                  className="px-6 py-2 bg-gray-600 hover:bg-gray-500 text-white rounded-lg font-medium transition-colors"
                >
                  Decline
                </button>
              </div>
            )}
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
              ? `Mother Nature summons ${revealedCard.name}!`
              : `${revealedCard.name} is not a minion`}
          </div>
        </div>
      )}
    </div>
  );
}
