"use client";

import React from "react";
import { RcButton } from "@/components/ui/rc-button";
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
        <div className="pointer-events-auto px-5 py-3 rounded-full border border-rc-line/22 bg-[rgba(7,10,20,0.9)] font-rc-sans text-rc-fg shadow-rc-panel text-lg md:text-xl flex items-center gap-3 select-none">
          <span className="font-rc-display text-rc-accent-link">Lilith</span>
          <span className="text-rc-fg-muted">
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
        <div className="fixed inset-0 flex items-center justify-center pointer-events-auto bg-[rgba(6,10,20,0.7)]">
          <div className="rounded-rc-lg border border-rc-line/18 bg-[rgba(9,13,25,0.95)] p-6 max-w-md w-full mx-4 font-rc-sans text-rc-fg shadow-rc-panel">
            <h2 className="mb-4 text-center font-rc-display text-[26px] leading-tight text-rc-fg-strong">
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
                <div className="aspect-[2.5/3.5] w-48 rounded-rc-md border border-rc-line/12 bg-black/30 flex items-center justify-center">
                  <div className="animate-pulse text-rc-accent">
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
                  <p className="font-rc-display text-rc-accent-link text-lg mb-2">
                    {revealedCard.name}
                  </p>
                  <p
                    className={`text-sm mb-4 ${
                      isMinion ? "text-rc-success" : "text-rc-warning"
                    }`}
                  >
                    {isMinion
                      ? "It's a minion! Lilith will summon it."
                      : "Not a minion. Goes to bottom of spellbook."}
                  </p>

                  {/* Action button - only Lilith owner can resolve */}
                  {isOwner && (
                    <RcButton onClick={resolve}>
                      {isMinion ? "Summon" : "Continue"}
                    </RcButton>
                  )}
                  {!isOwner && (
                    <div className="flex flex-col items-center gap-2">
                      <p className="text-rc-fg-muted text-sm">
                        Waiting for {getPlayerName(lilithOwner)} to continue...
                      </p>
                      <RcButton variant="outline" size="sm" onClick={cancel}>
                        Dismiss
                      </RcButton>
                    </div>
                  )}
                </>
              ) : (
                <div className="flex flex-col items-center gap-3">
                  <p className="text-rc-fg-muted text-sm">
                    Requesting card from opponent...
                  </p>
                  <RcButton variant="outline" size="sm" onClick={cancel}>
                    Cancel
                  </RcButton>
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
            className="rc-toast pointer-events-auto"
            data-tone={isMinion ? "success" : "warning"}
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
