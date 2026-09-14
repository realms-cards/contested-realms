"use client";

import React from "react";
import { RcButton } from "@/components/ui/rc-button";
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
        <div className="pointer-events-auto px-5 py-3 rounded-full border border-rc-line/22 bg-[rgba(7,10,20,0.9)] font-rc-sans text-rc-fg shadow-rc-panel text-lg md:text-xl flex items-center gap-3 select-none">
          <span className="font-rc-display text-rc-accent-link">
            Mother Nature
          </span>
          <span className="text-rc-fg-muted">
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
        <div className="fixed inset-0 flex items-center justify-center pointer-events-auto bg-[rgba(6,10,20,0.7)]">
          <div className="rounded-rc-lg border border-rc-line/18 bg-[rgba(9,13,25,0.95)] p-6 max-w-md w-full mx-4 font-rc-sans text-rc-fg shadow-rc-panel">
            <h2 className="mb-4 text-center font-rc-display text-[26px] leading-tight text-rc-fg-strong">
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
              <p className="font-rc-display text-rc-accent-link text-lg mb-2">
                {revealedCard.name}
              </p>
              <p
                className={`text-sm ${
                  isMinion ? "text-rc-success" : "text-rc-warning"
                }`}
              >
                {isMinion
                  ? "It's a minion! You may summon it."
                  : "Not a minion. Stays on top of spellbook."}
              </p>
            </div>

            {/* Choice buttons for owner when it's a minion */}
            {phase === "choosing" && isMinion && isOwner && (
              <div className="flex justify-center gap-4">
                <RcButton onClick={acceptSummon}>
                  Summon
                </RcButton>
                <RcButton variant="outline" onClick={declineSummon}>
                  Decline
                </RcButton>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Brief result flash on complete */}
      {phase === "complete" && revealedCard && (
        <div className="fixed bottom-24 inset-x-0 z-[201] pointer-events-none flex justify-center">
          <div
            className="rc-toast pointer-events-auto"
            data-tone={isMinion ? "success" : "warning"}
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
