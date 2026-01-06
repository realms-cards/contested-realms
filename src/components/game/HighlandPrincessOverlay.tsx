"use client";

import React from "react";
import { useGameStore } from "@/lib/game/store";
import CardWithPreview, { CardGrid } from "./CardWithPreview";

export default function HighlandPrincessOverlay() {
  const pending = useGameStore((s) => s.pendingHighlandPrincess);
  const actorKey = useGameStore((s) => s.actorKey);
  const selectCard = useGameStore((s) => s.selectHighlandPrincessCard);
  const resolve = useGameStore((s) => s.resolveHighlandPrincess);
  const cancel = useGameStore((s) => s.cancelHighlandPrincess);

  if (!pending) return null;

  const { phase, ownerSeat, eligibleCards, selectedCard } = pending;
  const isOwner = actorKey === null || ownerSeat === actorKey;

  return (
    <div className="fixed inset-0 z-[200] pointer-events-none">
      {/* Top bar with status */}
      <div className="fixed inset-x-0 top-6 z-[201] pointer-events-none flex justify-center">
        <div className="pointer-events-auto px-5 py-3 rounded-full bg-black/90 text-white ring-1 ring-cyan-500/50 shadow-lg text-lg md:text-xl flex items-center gap-3 select-none">
          <span className="text-cyan-400 font-fantaisie">
            👸 Highland Princess
          </span>
          <span className="opacity-80">
            {phase === "loading" && "Searching spellbook..."}
            {phase === "selecting" && isOwner && "Select an artifact (cost ≤1)"}
            {phase === "selecting" &&
              !isOwner &&
              `${ownerSeat.toUpperCase()} is searching...`}
            {phase === "complete" &&
              (selectedCard ? `Found ${selectedCard.name}!` : "Done")}
          </span>
        </div>
      </div>

      {/* Card selection area - visible to owner */}
      {phase === "selecting" && isOwner && (
        <div className="fixed inset-0 flex items-center justify-center pointer-events-auto bg-black/70">
          <div className="bg-black/95 rounded-xl p-6 max-w-3xl w-full mx-4 ring-1 ring-cyan-500/30 max-h-[90vh] overflow-y-auto">
            <h2 className="text-2xl font-fantaisie text-cyan-400 mb-4 text-center">
              Search for Artifact (Cost ≤1)
            </h2>
            <p className="text-gray-400 text-center mb-4">
              Select an artifact to put into your hand. Spellbook will be
              shuffled.
            </p>

            {/* Card grid */}
            <CardGrid columns={5}>
              {eligibleCards.map((card, index) => (
                <CardWithPreview
                  key={`${card.cardId}-${index}`}
                  card={card}
                  onClick={() => selectCard(card)}
                  selected={selectedCard?.cardId === card.cardId}
                  interactive={true}
                  accentColor="cyan"
                />
              ))}
            </CardGrid>

            {/* Action buttons */}
            <div className="flex justify-center gap-4">
              <button
                onClick={resolve}
                disabled={!selectedCard}
                className={`px-6 py-2 rounded-lg font-medium transition-colors ${
                  selectedCard
                    ? "bg-cyan-600 hover:bg-cyan-500 text-white"
                    : "bg-gray-700 text-gray-400 cursor-not-allowed"
                }`}
              >
                {selectedCard ? `Take ${selectedCard.name}` : "Select a card"}
              </button>
              <button
                onClick={cancel}
                className="px-6 py-2 bg-gray-600 hover:bg-gray-500 text-white rounded-lg font-medium transition-colors"
              >
                Skip
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Opponent view */}
      {phase === "selecting" && !isOwner && (
        <div className="fixed bottom-24 inset-x-0 z-[201] pointer-events-none flex justify-center">
          <div className="pointer-events-auto px-4 py-2 rounded-lg bg-black/90 text-sm text-cyan-300 ring-1 ring-cyan-500/30">
            {ownerSeat.toUpperCase()} is searching for an artifact...
          </div>
        </div>
      )}

      {/* Brief result flash on complete */}
      {phase === "complete" && selectedCard && (
        <div className="fixed bottom-24 inset-x-0 z-[201] pointer-events-none flex justify-center">
          <div className="pointer-events-auto px-4 py-2 rounded-lg bg-black/90 text-sm text-cyan-300 ring-1 ring-cyan-500/30">
            Highland Princess found {selectedCard.name}!
          </div>
        </div>
      )}
    </div>
  );
}
