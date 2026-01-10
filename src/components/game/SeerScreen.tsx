"use client";

import Image from "next/image";
import { useEffect, useCallback } from "react";
import { useSound } from "@/lib/contexts/SoundContext";
import { useGameStore } from "@/lib/game/store";
import type { PlayerKey } from "@/lib/game/store";
import { cardbackSpellbookUrl, cardbackAtlasUrl } from "@/lib/assets";

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
  const { playCardSelect, playTurnGong } = useSound();

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
    [isRevealed, isCompleted, setSeerPile]
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

      try {
        playTurnGong();
      } catch {}
    },
    [isCompleted, playCardSelect, playTurnGong, completeSeer]
  );

  // If not the second seat, show waiting screen
  if (!isSecondSeat) {
    return (
      <div className="w-full max-w-md bg-zinc-900/80 text-white rounded-2xl ring-1 ring-white/10 p-6 text-center">
        <div className="text-lg font-semibold mb-2">Waiting for Opponent</div>
        <div className="text-sm opacity-80 mb-4">
          {playerNames[secondSeat]} is using their Seer ability...
        </div>
        <div className="animate-pulse text-cyan-400">⏳</div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-2xl bg-zinc-900/90 text-white rounded-2xl ring-1 ring-cyan-500/30 shadow-lg shadow-cyan-500/10 p-6">
      {/* Header */}
      <div className="text-center mb-6">
        <div className="inline-flex items-center gap-2 px-4 py-2 bg-cyan-600/20 rounded-full ring-1 ring-cyan-500/40 mb-4">
          <span className="text-2xl">👁️</span>
          <span className="text-lg font-bold text-cyan-300">
            Second Player Seer
          </span>
        </div>
        <div className="text-sm opacity-80">
          As the second player, you may look at the top card of your Spellbook
          or Atlas and choose to keep it on top or put it on the bottom.
        </div>
      </div>

      {/* Pile Selection */}
      <div className="bg-black/30 rounded-xl p-4 ring-1 ring-white/10 mb-4">
        <div className="text-sm font-medium mb-3 text-center">
          Choose a pile to scry:
        </div>
        <div className="flex justify-center gap-6">
          <button
            className={`flex flex-col items-center gap-2 p-3 rounded-lg transition-all ${
              chosenPile === "spellbook"
                ? "bg-cyan-600/30 ring-2 ring-cyan-400"
                : "bg-white/5 hover:bg-white/10 ring-1 ring-white/10"
            } ${isRevealed ? "opacity-60 cursor-not-allowed" : ""}`}
            onClick={() => handlePileSelect("spellbook")}
            disabled={isRevealed}
          >
            <div className="relative w-16 h-24 rounded overflow-hidden">
              <Image
                src={cardbackSpellbookUrl()}
                alt="Spellbook"
                fill
                sizes="64px"
                className="object-cover"
                unoptimized
              />
            </div>
            <div className="text-sm font-medium">Spellbook</div>
            <div className="text-xs opacity-60">
              {zones[secondSeat]?.spellbook?.length || 0} cards
            </div>
          </button>
          <button
            className={`flex flex-col items-center gap-2 p-3 rounded-lg transition-all ${
              chosenPile === "atlas"
                ? "bg-cyan-600/30 ring-2 ring-cyan-400"
                : "bg-white/5 hover:bg-white/10 ring-1 ring-white/10"
            } ${isRevealed ? "opacity-60 cursor-not-allowed" : ""}`}
            onClick={() => handlePileSelect("atlas")}
            disabled={isRevealed}
          >
            <div className="relative w-24 h-16 rounded overflow-hidden">
              <Image
                src={cardbackAtlasUrl()}
                alt="Atlas"
                fill
                sizes="96px"
                className="object-cover"
                unoptimized
              />
            </div>
            <div className="text-sm font-medium">Atlas</div>
            <div className="text-xs opacity-60">
              {zones[secondSeat]?.atlas?.length || 0} cards
            </div>
          </button>
        </div>
      </div>

      {/* Reveal / Decision Area */}
      <div className="bg-black/30 rounded-xl p-4 ring-1 ring-white/10">
        {!isRevealed ? (
          <div className="text-center">
            <div className="text-sm opacity-70 mb-4">
              Click below to reveal the top card of your {chosenPile}
            </div>
            <button
              className="px-6 py-3 bg-cyan-600 hover:bg-cyan-700 rounded-lg font-medium transition-colors"
              onClick={handleReveal}
            >
              Reveal Top Card
            </button>
          </div>
        ) : (
          <div className="flex flex-col sm:flex-row items-center gap-6">
            {/* Card Display */}
            <div className="flex-1 flex justify-center">
              {topCard ? (
                <div
                  className="relative rounded-lg overflow-hidden ring-2 ring-cyan-400/50 shadow-lg shadow-cyan-500/20"
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
                <div className="text-center py-8 text-gray-400">
                  <div className="text-4xl mb-2">📭</div>
                  <div>Selected pile is empty</div>
                </div>
              )}
            </div>

            {/* Decision Buttons */}
            <div className="flex flex-col gap-3">
              <div className="text-sm font-medium text-center mb-2">
                {topCard ? topCard.name : "No card"}
              </div>
              <button
                className="px-6 py-3 bg-green-600 hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg font-medium transition-colors"
                disabled={!topCard || isCompleted}
                onClick={() => handleComplete("top")}
              >
                Keep on Top
              </button>
              <button
                className="px-6 py-3 bg-amber-600 hover:bg-amber-700 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg font-medium transition-colors"
                disabled={!topCard || isCompleted}
                onClick={() => handleComplete("bottom")}
              >
                Put on Bottom
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Footer with Skip Seer button */}
      <div className="mt-4 flex flex-col items-center gap-3">
        <div className="text-xs opacity-60 text-center">
          This ability helps compensate for going second. Use it wisely!
        </div>
        <button
          className="px-6 py-2 bg-red-600/80 hover:bg-red-700 rounded-lg font-medium transition-colors text-sm"
          disabled={isCompleted}
          onClick={() => handleComplete("skip")}
        >
          Skip Seer
        </button>
      </div>
    </div>
  );
}
