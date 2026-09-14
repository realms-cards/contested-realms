"use client";

import React from "react";
import { RcButton } from "@/components/ui/rc-button";
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
        <div className="pointer-events-auto px-5 py-3 rounded-full border border-rc-line/22 bg-[rgba(7,10,20,0.9)] font-rc-sans text-rc-fg shadow-rc-panel text-lg md:text-xl flex items-center gap-3 select-none">
          <span className="font-rc-display text-rc-accent-link">
            {triggerCardName}
          </span>
          <span className="text-rc-fg-muted">
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
        <div className="fixed inset-0 flex items-center justify-center pointer-events-auto bg-[rgba(6,10,20,0.7)]">
          <div className="rounded-rc-lg border border-rc-line/18 bg-[rgba(9,13,25,0.95)] p-6 max-w-2xl w-full mx-4 font-rc-sans text-rc-fg shadow-rc-panel">
            <h2 className="mb-2 text-center font-rc-display text-[26px] leading-tight text-rc-fg-strong">
              {triggerCardName} Deathrite
            </h2>
            <p className="text-rc-fg-subtle text-sm text-center mb-4">
              {ownerSeat.toUpperCase()}&apos;s spellbook — looking for{" "}
              {formatCardName(targetCardName)}
            </p>

            <p className="text-rc-fg-muted text-center mb-4">
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
                <p className="text-rc-accent-link">
                  Found {pigsToSummon.length} {formatCardName(targetCardName)}{" "}
                  to summon!
                </p>
              ) : (
                <p className="text-rc-fg-muted">
                  No {formatCardName(targetCardName)} found among revealed
                  cards.
                </p>
              )}
              <p className="text-rc-fg-subtle text-sm mt-2">
                Other cards will be put on the bottom in random order.
              </p>
            </div>

            {/* Dismiss button - only owner can resolve */}
            {isOwner ? (
              <div className="flex justify-center">
                <RcButton
                  onClick={resolve}
                  className="h-auto whitespace-normal py-2"
                >
                  {pigsToSummon.length > 0
                    ? `Summon ${formatCardName(targetCardName)} & Continue`
                    : "Continue"}
                </RcButton>
              </div>
            ) : (
              <div className="text-center text-rc-fg-subtle text-sm">
                Waiting for {ownerSeat.toUpperCase()} to continue...
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
