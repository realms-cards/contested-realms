"use client";

import React from "react";
import { useGameStore } from "@/lib/game/store";
import CardWithPreview from "./CardWithPreview";

export default function PigsOfTheSounderOverlay() {
  const pending = useGameStore((s) => s.pendingPigsOfTheSounder);
  const actorKey = useGameStore((s) => s.actorKey);
  const resolve = useGameStore((s) => s.resolvePigsOfTheSounder);

  if (!pending) return null;

  const {
    phase,
    ownerSeat,
    revealedCards,
    pigsToSummon,
    triggerCardName,
    targetCardName,
  } = pending;
  const isOwner = actorKey === null || ownerSeat === actorKey;

  // Show reveal to BOTH players since it's a public reveal
  const showReveal = phase === "revealing" || phase === "summoning";

  // Format target card name for display (capitalize each word)
  const formatCardName = (name: string) =>
    name.replace(/\b\w/g, (c) => c.toUpperCase());

  return (
    <div className="fixed inset-0 z-[200] pointer-events-none">
      {/* Top bar with status */}
      <div className="fixed inset-x-0 top-6 z-[201] pointer-events-none flex justify-center">
        <div className="pointer-events-auto px-5 py-3 rounded-full bg-black/90 text-white ring-1 ring-pink-500/50 shadow-lg text-lg md:text-xl flex items-center gap-3 select-none">
          <span className="text-pink-400 font-fantaisie">
            🐷 {triggerCardName}
          </span>
          <span className="opacity-80">
            {phase === "revealing" &&
              `${ownerSeat.toUpperCase()} reveals top 5 spells`}
            {phase === "summoning" &&
              `Summoning ${pigsToSummon.length} ${formatCardName(
                targetCardName
              )}...`}
            {phase === "complete" && "Done!"}
          </span>
        </div>
      </div>

      {/* Reveal display - shown to BOTH players */}
      {showReveal && (
        <div className="fixed inset-0 flex items-center justify-center pointer-events-auto bg-black/70">
          <div className="bg-black/95 rounded-xl p-6 max-w-2xl w-full mx-4 ring-1 ring-pink-500/30">
            <h2 className="text-2xl font-fantaisie text-pink-400 mb-2 text-center">
              {triggerCardName} Deathrite
            </h2>
            <p className="text-gray-500 text-sm text-center mb-4">
              {ownerSeat.toUpperCase()}&apos;s spellbook — looking for{" "}
              {formatCardName(targetCardName)}
            </p>

            <p className="text-gray-400 text-center mb-4">
              Revealed {revealedCards.length} cards:
            </p>

            {/* Show revealed cards */}
            <div className="flex flex-wrap justify-center gap-3 mb-6">
              {revealedCards.map((card, idx) => {
                const isTarget =
                  (card.name || "").toLowerCase() === targetCardName;
                return (
                  <CardWithPreview
                    key={`${card.cardId}-${idx}`}
                    card={card}
                    interactive={false}
                    selected={isTarget}
                    accentColor="pink"
                    size="sm"
                  />
                );
              })}
            </div>

            {/* Summary */}
            <div className="text-center mb-6">
              {pigsToSummon.length > 0 ? (
                <p className="text-pink-300">
                  Found {pigsToSummon.length} {formatCardName(targetCardName)}{" "}
                  to summon!
                </p>
              ) : (
                <p className="text-gray-400">
                  No {formatCardName(targetCardName)} found among revealed
                  cards.
                </p>
              )}
              <p className="text-gray-500 text-sm mt-2">
                Other cards will be put on the bottom in random order.
              </p>
            </div>

            {/* Dismiss button - only owner can resolve */}
            {isOwner ? (
              <div className="flex justify-center">
                <button
                  onClick={resolve}
                  className="px-6 py-2 bg-pink-600 hover:bg-pink-500 text-white rounded-lg font-medium transition-colors"
                >
                  {pigsToSummon.length > 0
                    ? `Summon ${formatCardName(targetCardName)} & Continue`
                    : "Continue"}
                </button>
              </div>
            ) : (
              <div className="text-center text-gray-500 text-sm">
                Waiting for {ownerSeat.toUpperCase()} to continue...
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
