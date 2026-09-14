"use client";

import Image from "next/image";
import { useEffect, useCallback } from "react";
import { RcButton } from "@/components/ui/rc-button";
import { cardbackAtlasUrl, cardbackSpellbookUrl } from "@/lib/assets";
import { useSound } from "@/lib/contexts/SoundContext";
import { useGameStore } from "@/lib/game/store";
import type { PlayerKey } from "@/lib/game/store";

interface SeerScreenProps {
  myPlayerKey: PlayerKey;
  playerNames: { p1: string; p2: string };
  onSeerComplete: () => void;
}

/**
 * Dedicated screen for the Second Player Seer ability.
 *
 * Per Sorcery rules, the second player (who goes second) gets to scry 1 before
 * the game begins - they look at the top card of either their Spellbook or Atlas
 * and choose to keep it on top or put it on the bottom.
 *
 * This screen is shown after mulligan (and after Harbinger portal if applicable),
 * before player 1 starts their first turn.
 *
 * Uses synced seerState from the game store for network synchronization.
 */
export default function SeerScreen({
  myPlayerKey,
  playerNames,
  onSeerComplete,
}: SeerScreenProps) {
  const zones = useGameStore((s) => s.zones);
  const setPreviewCard = useGameStore((s) => s.setPreviewCard);
  const currentPlayer = useGameStore((s) => s.currentPlayer);
  const { playCardSelect } = useSound();

  // Synced seer state from store
  const seerState = useGameStore((s) => s.seerState);
  const initSeerState = useGameStore((s) => s.initSeerState);
  const setSeerPile = useGameStore((s) => s.setSeerPile);
  const revealSeerCard = useGameStore((s) => s.revealSeerCard);
  const completeSeer = useGameStore((s) => s.completeSeer);

  // Determine if this player is the second seat (goes second)
  const secondSeat: PlayerKey = currentPlayer === 1 ? "p2" : "p1";
  const isSecondSeat = myPlayerKey === secondSeat;

  // Initialize seer state if not already done
  useEffect(() => {
    if (!seerState && isSecondSeat) {
      initSeerState(secondSeat);
    }
  }, [seerState, isSecondSeat, secondSeat, initSeerState]);

  // Watch for seer completion (from either player's action)
  useEffect(() => {
    if (seerState?.setupComplete) {
      onSeerComplete();
    }
  }, [seerState?.setupComplete, onSeerComplete]);

  // Derive UI state from synced seerState
  const chosenPile = seerState?.chosenPile ?? "spellbook";
  const isRevealed =
    seerState?.status === "revealed" ||
    seerState?.status === "completed" ||
    seerState?.status === "skipped";
  const isCompleted = seerState?.setupComplete ?? false;

  const topCard = (zones[secondSeat]?.[chosenPile] || [])[0];

  const handlePileSelect = useCallback(
    (pile: "spellbook" | "atlas") => {
      if (isRevealed || isCompleted) return;
      setSeerPile(pile);
    },
    [isRevealed, isCompleted, setSeerPile],
  );

  const handleReveal = useCallback(() => {
    if (isRevealed || isCompleted) return;
    revealSeerCard();
  }, [isRevealed, isCompleted, revealSeerCard]);

  const handleComplete = useCallback(
    (decision: "top" | "bottom" | "skip") => {
      if (isCompleted) return;

      try {
        playCardSelect();
      } catch {}

      completeSeer(decision);
    },
    [isCompleted, playCardSelect, completeSeer],
  );

  // If not the second seat, show waiting screen
  if (!isSecondSeat) {
    return (
      <div className="w-full max-w-md rounded-rc-lg border border-rc-line/18 bg-[rgba(9,13,25,0.9)] p-6 text-center text-rc-fg shadow-rc-panel">
        <div className="mb-2 font-rc-display text-[22px] leading-none text-rc-fg-strong">
          Waiting for Opponent
        </div>
        <div className="mb-4 font-rc-sans text-sm text-rc-fg-muted">
          {playerNames[secondSeat]} is using their Seer ability...
        </div>
        <div
          className="mx-auto h-2.5 w-2.5 animate-rc-blink bg-rc-accent shadow-[0_0_10px_#d4a94a]"
          aria-hidden="true"
        />
      </div>
    );
  }

  return (
    <div className="w-full max-w-2xl rounded-rc-lg border border-rc-line/18 bg-[rgba(9,13,25,0.9)] p-6 text-rc-fg shadow-rc-panel">
      {/* Header */}
      <div className="text-center mb-6">
        <div className="mb-4 inline-flex items-center gap-2">
          <span className="font-rc-display text-[28px] leading-none text-rc-fg-strong">
            Second Player Seer
          </span>
        </div>
        <div className="font-rc-sans text-sm text-rc-fg-muted">
          As the second player, you may look at the top card of your Spellbook
          or Atlas and choose to keep it on top or put it on the bottom.
        </div>
      </div>

      {/* Pile Selection */}
      <div className="mb-4 rounded-rc-md border border-rc-line/12 bg-black/30 p-4">
        <div className="rc-hint mb-3 text-center">
          Choose a pile to scry:
        </div>
        <div className="flex justify-center gap-6">
          <button
            className={`flex flex-col items-center gap-2 rounded-rc-md p-3 transition-all ${
              chosenPile === "spellbook"
                ? "border border-rc-accent bg-rc-accent/12 shadow-[0_0_14px_rgba(243,207,106,0.25)]"
                : "border border-rc-line/12 bg-black/30 hover:border-rc-accent/40"
            } ${isRevealed ? "opacity-60 cursor-not-allowed" : ""}`}
            onClick={() => handlePileSelect("spellbook")}
            disabled={isRevealed}
          >
            <div className="relative w-16 h-24 rounded-rc-sm overflow-hidden ring-1 ring-rc-line/18">
              <Image
                src={cardbackSpellbookUrl()}
                alt="Spellbook"
                fill
                sizes="64px"
                className="object-cover"
                unoptimized
              />
            </div>
            <div className="font-rc-mono text-xs uppercase tracking-[0.14em] text-rc-fg-strong">
              Spellbook
            </div>
            <div className="rc-hint tabular-nums">
              {zones[secondSeat]?.spellbook?.length || 0} cards
            </div>
          </button>
          <button
            className={`flex flex-col items-center gap-2 rounded-rc-md p-3 transition-all ${
              chosenPile === "atlas"
                ? "border border-rc-accent bg-rc-accent/12 shadow-[0_0_14px_rgba(243,207,106,0.25)]"
                : "border border-rc-line/12 bg-black/30 hover:border-rc-accent/40"
            } ${isRevealed ? "opacity-60 cursor-not-allowed" : ""}`}
            onClick={() => handlePileSelect("atlas")}
            disabled={isRevealed}
          >
            <div className="relative w-24 h-16 rounded-rc-sm overflow-hidden ring-1 ring-rc-line/18">
              <Image
                src={cardbackAtlasUrl()}
                alt="Atlas"
                fill
                sizes="96px"
                className="object-contain rotate-90 scale-[1.333] origin-center"
                unoptimized
              />
            </div>
            <div className="font-rc-mono text-xs uppercase tracking-[0.14em] text-rc-fg-strong">
              Atlas
            </div>
            <div className="rc-hint tabular-nums">
              {zones[secondSeat]?.atlas?.length || 0} cards
            </div>
          </button>
        </div>
      </div>

      {/* Reveal / Decision Area */}
      <div className="rounded-rc-md border border-rc-line/12 bg-black/30 p-4">
        {!isRevealed ? (
          <div className="text-center">
            <div className="mb-4 font-rc-sans text-sm text-rc-fg-muted">
              Click below to reveal the top card of your {chosenPile}
            </div>
            <RcButton size="lg" onClick={handleReveal}>
              Reveal Top Card
            </RcButton>
          </div>
        ) : (
          <div className="flex flex-col sm:flex-row items-center gap-6">
            {/* Card Display */}
            <div className="flex-1 flex justify-center">
              {topCard ? (
                <div
                  className="relative overflow-hidden rounded-rc-md shadow-rc-md ring-2 ring-rc-accent/50"
                  onMouseEnter={() => setPreviewCard(topCard)}
                  onMouseLeave={() => setPreviewCard(null)}
                >
                  <div
                    className={`relative ${
                      (topCard.type || "").toLowerCase().includes("site")
                        ? "w-40 h-28 sm:w-48 sm:h-32"
                        : "w-28 h-40 sm:w-32 sm:h-48"
                    }`}
                  >
                    <Image
                      src={`/api/images/${topCard.slug}`}
                      alt={topCard.name}
                      fill
                      sizes="192px"
                      className={`object-contain ${
                        (topCard.type || "").toLowerCase().includes("site")
                          ? "rotate-90"
                          : ""
                      }`}
                      unoptimized
                    />
                  </div>
                </div>
              ) : (
                <div className="rc-hint py-8 text-center">
                  <div>Selected pile is empty</div>
                </div>
              )}
            </div>

            {/* Decision Buttons */}
            <div className="flex flex-col gap-3">
              <div className="mb-2 text-center font-rc-display text-[17px] leading-tight text-rc-fg-strong">
                {topCard ? topCard.name : "No card"}
              </div>
              <RcButton
                size="lg"
                disabled={!topCard || isCompleted}
                onClick={() => handleComplete("top")}
              >
                Keep on Top
              </RcButton>
              <RcButton
                variant="outline"
                size="lg"
                disabled={!topCard || isCompleted}
                onClick={() => handleComplete("bottom")}
              >
                Put on Bottom
              </RcButton>
            </div>
          </div>
        )}
      </div>

      {/* Footer with Skip Seer button */}
      <div className="mt-4 flex flex-col items-center gap-3">
        <div className="rc-hint text-center">
          This ability helps compensate for going second. Use it wisely!
        </div>
        <button
          className="cursor-pointer rounded-rc-md border border-rc-danger/40 px-6 py-2 font-rc-mono text-xs tracking-[0.08em] text-rc-danger transition-colors hover:border-rc-danger hover:text-rc-danger-hover disabled:pointer-events-none disabled:opacity-50"
          disabled={isCompleted}
          onClick={() => handleComplete("skip")}
        >
          Skip Seer
        </button>
      </div>
    </div>
  );
}
