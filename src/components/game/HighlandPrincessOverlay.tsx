"use client";

import React from "react";
import { RcButton } from "@/components/ui/rc-button";
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
        <div className="pointer-events-auto px-5 py-3 rounded-full border border-rc-line/22 bg-[rgba(7,10,20,0.9)] font-rc-sans text-rc-fg shadow-rc-panel text-lg md:text-xl flex items-center gap-3 select-none">
          <span className="font-rc-display text-rc-accent-link">
            Highland Princess
          </span>
          <span className="text-rc-fg-muted">
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
        <div className="fixed inset-0 flex items-center justify-center pointer-events-auto bg-[rgba(6,10,20,0.7)]">
          <div className="thin-scrollbar rounded-rc-lg border border-rc-line/18 bg-[rgba(9,13,25,0.95)] p-6 max-w-3xl w-full mx-4 max-h-[90vh] overflow-y-auto font-rc-sans text-rc-fg shadow-rc-panel">
            <h2 className="mb-4 text-center font-rc-display text-[26px] leading-tight text-rc-fg-strong">
              Search for Artifact (Cost ≤1)
            </h2>
            <p className="text-rc-fg-muted text-center mb-4">
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
              <RcButton
                onClick={resolve}
                disabled={!selectedCard}
                className="h-auto whitespace-normal py-2"
              >
                {selectedCard ? `Take ${selectedCard.name}` : "Select a card"}
              </RcButton>
              <RcButton variant="outline" onClick={cancel}>
                Skip
              </RcButton>
            </div>
          </div>
        </div>
      )}

      {/* Opponent view */}
      {phase === "selecting" && !isOwner && (
        <div className="fixed bottom-24 inset-x-0 z-[201] pointer-events-none flex justify-center">
          <div className="rc-toast pointer-events-auto">
            {ownerSeat.toUpperCase()} is searching for an artifact...
          </div>
        </div>
      )}

      {/* Brief result flash on complete */}
      {phase === "complete" && selectedCard && (
        <div className="fixed bottom-24 inset-x-0 z-[201] pointer-events-none flex justify-center">
          <div className="rc-toast pointer-events-auto">
            Highland Princess found {selectedCard.name}!
          </div>
        </div>
      )}
    </div>
  );
}
