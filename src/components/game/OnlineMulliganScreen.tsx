"use client";

import Image from "next/image";
import { useEffect, useState, useCallback } from "react";
import { useSound } from "@/lib/contexts/SoundContext";
import { useVideoOverlay } from "@/lib/contexts/VideoOverlayContext";
import { useGameStore } from "@/lib/game/store";
import type { PlayerKey } from "@/lib/game/store";
import { buildCardSlug } from "@/lib/utils/cardSlug";

interface OnlineMulliganScreenProps {
  myPlayerKey: PlayerKey;
  playerNames: { p1: string; p2: string };
  onStartGame: () => void;
  finalizeLabel?: string;
  /** Whether to show seer phase (only for constructed matches) */
  showSeerPhase?: boolean;
}

export default function OnlineMulliganScreen({
  myPlayerKey,
  playerNames,
  onStartGame,
  finalizeLabel = "Start Game",
  showSeerPhase = false,
}: OnlineMulliganScreenProps) {
  const { updateScreenType } = useVideoOverlay();
  const zones = useGameStore((s) => s.zones);
  const mulligans = useGameStore((s) => s.mulligans);
  const mulliganWithSelection = useGameStore((s) => s.mulliganWithSelection);
  const finalizeMulligan = useGameStore((s) => s.finalizeMulligan);
  const setPreviewCard = useGameStore((s) => s.setPreviewCard);
  const avatars = useGameStore((s) => s.avatars);
  const currentPlayer = useGameStore((s) => s.currentPlayer);

  // Seer state from store
  const seerState = useGameStore((s) => s.seerState);
  const initSeerState = useGameStore((s) => s.initSeerState);
  const setSeerPile = useGameStore((s) => s.setSeerPile);
  const revealSeerCard = useGameStore((s) => s.revealSeerCard);
  const completeSeer = useGameStore((s) => s.completeSeer);

  const [selected, setSelected] = useState<number[]>([]);
  const [done, setDone] = useState<boolean>(false);
  const [submitted, setSubmitted] = useState<boolean>(false);
  const { playCardSelect, playTurnGong } = useSound();

  // Set screen type for video overlay
  useEffect(() => {
    updateScreenType("game");
    return undefined;
  }, [updateScreenType]);

  const myHand = zones[myPlayerKey]?.hand || [];
  const myMulligans = mulligans[myPlayerKey] || 0;
  const myAvatar = avatars[myPlayerKey]?.card || null;
  const myChampion = avatars[myPlayerKey]?.champion || null;
  const opponentKey: PlayerKey = myPlayerKey === "p1" ? "p2" : "p1";
  const opponentAvatar = avatars[opponentKey]?.card || null;
  const opponentChampion = avatars[opponentKey]?.champion || null;

  const handleCardClick = (index: number) => {
    if (done || myMulligans === 0) return;
    setSelected((prev) =>
      prev.includes(index)
        ? prev.filter((i) => i !== index)
        : prev.length >= 3
        ? prev // Maximum 3 cards can be mulliganed
        : [...prev, index]
    );
  };

  const handleMulligan = () => {
    try {
      playCardSelect();
    } catch {}
    if (selected.length === 0) {
      // Keep current hand
      setDone(true);
    } else {
      mulliganWithSelection(myPlayerKey, selected);
      setSelected([]);
    }
  };

  const handleFinalize = () => {
    if (submitted) return;
    setSubmitted(true);
    setDone(true);
    finalizeMulligan();
    onStartGame();
  };

  // --- Seer Phase Logic ---
  // Second player (who goes second) gets to scry 1 before game starts
  const secondSeat: PlayerKey = currentPlayer === 1 ? "p2" : "p1";
  const isSecondSeat = myPlayerKey === secondSeat;
  const seerComplete = seerState?.setupComplete ?? false;

  // Debug logging for seer phase
  useEffect(() => {
    if (showSeerPhase) {
      console.log("[Seer] Mulligan screen seer state:", {
        showSeerPhase,
        currentPlayer,
        secondSeat,
        myPlayerKey,
        isSecondSeat,
        done,
        myMulligans,
        seerState: seerState
          ? { status: seerState.status, setupComplete: seerState.setupComplete }
          : null,
        seerComplete,
      });
    }
  }, [
    showSeerPhase,
    currentPlayer,
    secondSeat,
    myPlayerKey,
    isSecondSeat,
    done,
    myMulligans,
    seerState,
    seerComplete,
  ]);

  // Initialize seer state when mulligan is done and we're the second seat
  useEffect(() => {
    if (!showSeerPhase) return;
    if (!done && myMulligans > 0) return; // Mulligan not done yet
    if (seerState) return; // Already initialized
    if (!isSecondSeat) return; // Only second seat initializes

    console.log("[Seer] Initializing seer state for", secondSeat);
    initSeerState(secondSeat);
  }, [
    showSeerPhase,
    done,
    myMulligans,
    seerState,
    isSecondSeat,
    secondSeat,
    initSeerState,
  ]);

  // Seer UI state
  const chosenPile = seerState?.chosenPile ?? "spellbook";
  const seerRevealed =
    seerState?.status === "revealed" ||
    seerState?.status === "completed" ||
    seerState?.status === "skipped";
  const seerCompleted = seerState?.setupComplete ?? false;
  const topCard = (zones[secondSeat]?.[chosenPile] || [])[0];

  const handleSeerPileSelect = useCallback(
    (pile: "spellbook" | "atlas") => {
      if (seerRevealed || seerCompleted) return;
      setSeerPile(pile);
    },
    [seerRevealed, seerCompleted, setSeerPile]
  );

  const handleSeerReveal = useCallback(() => {
    if (seerRevealed || seerCompleted) return;
    revealSeerCard();
    try {
      playCardSelect();
    } catch {}
  }, [seerRevealed, seerCompleted, revealSeerCard, playCardSelect]);

  const handleSeerComplete = useCallback(
    (decision: "top" | "bottom" | "skip") => {
      if (seerCompleted) return;
      completeSeer(decision);
      try {
        playTurnGong();
      } catch {}
      // Auto-start the game after seer is complete
      if (!submitted) {
        setSubmitted(true);
        setDone(true);
        finalizeMulligan();
        onStartGame();
      }
    },
    [
      seerCompleted,
      completeSeer,
      playTurnGong,
      submitted,
      finalizeMulligan,
      onStartGame,
    ]
  );

  // Determine if we should show seer UI (after mulligan done, before finalize)
  const showSeerUI =
    showSeerPhase && (done || myMulligans === 0) && !seerComplete;

  // Auto-start for player 1 when seer phase completes (player 2 already auto-starts in handleSeerComplete)
  useEffect(() => {
    if (!showSeerPhase) return;
    if (isSecondSeat) return; // Second seat auto-starts in handleSeerComplete
    if (!seerComplete) return; // Seer not done yet
    if (submitted) return; // Already submitted

    // Player 1: auto-start when seer is complete
    setSubmitted(true);
    setDone(true);
    finalizeMulligan();
    onStartGame();
  }, [
    showSeerPhase,
    isSecondSeat,
    seerComplete,
    submitted,
    finalizeMulligan,
    onStartGame,
  ]);

  return (
    <div className="w-full max-w-[92vw] sm:max-w-4xl bg-zinc-900/80 text-white rounded-2xl ring-1 ring-white/10 p-4 sm:p-6">
      <div className="mb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="text-center sm:text-left">
          <div className="text-lg font-semibold mb-1">Mulligan Phase</div>
          <div className="text-sm opacity-80">
            Playing as:{" "}
            <span className="font-medium text-blue-400">
              {playerNames[myPlayerKey]}
            </span>
          </div>
          <div className="text-xs opacity-60 mt-1">
            Select up to 3 cards to put back. You&apos;ll draw the same number
            from the appropriate pile.
          </div>
        </div>
        {(myAvatar?.slug || opponentAvatar?.slug) && (
          <div className="flex-shrink-0 flex flex-row gap-4 items-center sm:items-end">
            {myAvatar?.slug && (
              <div className="flex flex-col items-center sm:items-end">
                <div className="text-[10px] uppercase tracking-wide opacity-70 mb-1">
                  Your Avatar
                </div>
                <div
                  className="relative aspect-[3/4] w-16 sm:w-20 md:w-24 rounded-lg overflow-hidden ring-1 ring-white/30 shadow-lg"
                  onMouseEnter={() => setPreviewCard(myAvatar)}
                  onMouseLeave={() => setPreviewCard(null)}
                >
                  <Image
                    src={`/api/images/${myAvatar.slug}`}
                    alt={myAvatar.name}
                    fill
                    sizes="(max-width: 640px) 64px, 96px"
                    className="object-contain"
                    unoptimized
                  />
                </div>
                {myChampion &&
                  myAvatar.name?.toLowerCase() === "dragonlord" && (
                    <div className="mt-1 px-2 py-0.5 bg-amber-900/40 rounded text-[10px] text-amber-200 ring-1 ring-amber-500/30">
                      ⚔ {myChampion.name}
                    </div>
                  )}
              </div>
            )}
            {opponentAvatar?.slug && (
              <div className="flex flex-col items-center sm:items-end">
                <div className="text-[10px] uppercase tracking-wide opacity-70 mb-1">
                  Opponent Avatar
                </div>
                <div
                  className="relative aspect-[3/4] w-16 sm:w-20 md:w-24 rounded-lg overflow-hidden ring-1 ring-white/30 shadow-lg"
                  onMouseEnter={() => setPreviewCard(opponentAvatar)}
                  onMouseLeave={() => setPreviewCard(null)}
                >
                  <Image
                    src={`/api/images/${opponentAvatar.slug}`}
                    alt={opponentAvatar.name}
                    fill
                    sizes="(max-width: 640px) 64px, 96px"
                    className="object-contain"
                    unoptimized
                  />
                </div>
                {opponentChampion &&
                  opponentAvatar.name?.toLowerCase() === "dragonlord" && (
                    <div className="mt-1 px-2 py-0.5 bg-amber-900/40 rounded text-[10px] text-amber-200 ring-1 ring-amber-500/30">
                      ⚔ {opponentChampion.name}
                    </div>
                  )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Hide hand section when seer UI is shown to reduce clutter */}
      {!showSeerUI && (
        <div className="bg-black/30 rounded-xl p-4 ring-1 ring-white/10">
          <div className="flex items-center justify-between mb-2">
            <div className="font-semibold">Your Hand</div>
            <div className="text-xs opacity-80">
              Mulligans remaining: {myMulligans}
            </div>
          </div>

          <div className="text-xs opacity-80 mb-3">
            {!done && myMulligans > 0
              ? "Click cards to select for mulligan (max 3)."
              : myMulligans === 0
              ? "Mulligan used. Ready to start game."
              : "Mulligan complete."}
          </div>

          {myHand.length > 0 ? (
            <div className="flex items-center gap-2 overflow-x-auto overflow-y-visible pb-2 pt-10 sm:pt-16 min-h-[160px] sm:min-h-[200px]">
              {myHand.map((card, i) => {
                const isSite = (card.type || "").toLowerCase().includes("site");
                const isSelected = selected.includes(i);
                // Use card slug if available, otherwise build a fallback
                const cardSlug = card.slug || buildCardSlug(card.name, null);

                return (
                  <button
                    key={i}
                    className={`relative flex-shrink-0 transition-all duration-200 ${
                      !done && myMulligans > 0
                        ? "hover:scale-105 hover:-translate-y-4"
                        : ""
                    } ${
                      isSelected ? "ring-2 ring-red-400 -translate-y-2" : ""
                    } ${
                      done || myMulligans === 0
                        ? "cursor-default"
                        : "cursor-pointer"
                    }`}
                    onClick={() => handleCardClick(i)}
                    onMouseEnter={() => setPreviewCard(card)}
                    onMouseLeave={() => setPreviewCard(null)}
                  >
                    <div
                      className={`relative ${
                        isSite
                          ? "aspect-[4/3] w-24 sm:w-32"
                          : "aspect-[3/4] w-20 sm:w-24"
                      } rounded-lg overflow-hidden ring-1 ring-white/20 shadow-lg ${
                        isSelected ? "opacity-70" : ""
                      } ${done || myMulligans === 0 ? "opacity-60" : ""}`}
                    >
                      <Image
                        src={`/api/images/${cardSlug}`}
                        alt={card.name}
                        fill
                        sizes="(max-width: 640px) 96px, 120px"
                        className={`object-contain ${
                          isSite ? "rotate-90" : ""
                        }`}
                        unoptimized
                      />
                      {isSelected && (
                        <div className="absolute inset-0 bg-red-500/30 flex items-center justify-center">
                          <div className="text-white text-xs font-bold bg-red-600 rounded px-2 py-1">
                            MULLIGAN
                          </div>
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-8 text-gray-400">
              No cards in hand
            </div>
          )}

          <div className="flex justify-between items-center mt-4">
            <div className="text-xs opacity-70">
              {selected.length > 0 &&
                `${selected.length} card(s) selected for mulligan`}
            </div>

            <div className="flex gap-2">
              {!done && myMulligans > 0 && (
                <button
                  className="bg-orange-600 hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed rounded px-4 py-2 text-sm font-medium transition-colors"
                  onClick={handleMulligan}
                >
                  {selected.length === 0
                    ? "Keep Hand"
                    : `Mulligan ${selected.length} Cards`}
                </button>
              )}

              {/* Show finalize button only when seer phase is complete (or not needed) */}
              {(done || myMulligans === 0) && !showSeerUI && (
                <button
                  className={`rounded px-3 py-2 sm:px-4 text-sm font-medium transition-colors ${
                    submitted
                      ? "bg-green-700/60 cursor-not-allowed"
                      : "bg-green-600 hover:bg-green-700"
                  }`}
                  onClick={handleFinalize}
                  disabled={submitted}
                  title={
                    submitted
                      ? "Waiting for other players to finish mulligans"
                      : undefined
                  }
                >
                  {submitted ? "Ready — Waiting for others…" : finalizeLabel}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Second Player Seer Phase - shown after mulligan is done */}
      {showSeerUI && (
        <div className="bg-black/30 rounded-xl p-4 ring-1 ring-white/10">
          <div className="text-center mb-4">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-amber-600/20 rounded-full ring-1 ring-amber-500/40 mb-2">
              <span className="text-lg">👁️</span>
              <span className="text-sm font-bold text-amber-300">
                Second Player Seer
              </span>
            </div>
            {isSecondSeat ? (
              <div className="text-xs opacity-80">
                Look at the top card of your Spellbook or Atlas and choose to
                keep it on top or put it on the bottom.
              </div>
            ) : (
              <div className="text-xs opacity-80">
                {playerNames[secondSeat]} is using their Seer ability...
              </div>
            )}
          </div>

          {isSecondSeat ? (
            <>
              {/* Pile Selection */}
              {!seerRevealed && (
                <div className="mb-4">
                  <div className="text-xs font-medium mb-2 text-center opacity-70">
                    Choose a pile to scry:
                  </div>
                  <div className="flex justify-center gap-6">
                    <button
                      className={`flex flex-col items-center gap-2 p-3 rounded-lg transition-all ${
                        chosenPile === "spellbook"
                          ? "bg-blue-600/30 ring-2 ring-blue-400"
                          : "bg-white/5 hover:bg-white/10 ring-1 ring-white/10"
                      }`}
                      onClick={() => handleSeerPileSelect("spellbook")}
                    >
                      {/* Spellbook cardback */}
                      <div className="relative w-16 h-24 rounded overflow-hidden ring-1 ring-white/20">
                        <Image
                          src="/api/assets/cardback_spellbook.png"
                          alt="Spellbook"
                          fill
                          sizes="64px"
                          className="object-cover"
                          unoptimized
                        />
                      </div>
                      <div className="text-xs font-medium">Spellbook</div>
                      <div className="text-[10px] opacity-60">
                        {zones[secondSeat]?.spellbook?.length || 0} cards
                      </div>
                    </button>
                    <button
                      className={`flex flex-col items-center gap-2 p-3 rounded-lg transition-all ${
                        chosenPile === "atlas"
                          ? "bg-green-600/30 ring-2 ring-green-400"
                          : "bg-white/5 hover:bg-white/10 ring-1 ring-white/10"
                      }`}
                      onClick={() => handleSeerPileSelect("atlas")}
                    >
                      {/* Atlas cardback (landscape) */}
                      <div className="relative w-24 h-16 rounded overflow-hidden ring-1 ring-white/20">
                        <Image
                          src="/api/assets/cardback_atlas.png"
                          alt="Atlas"
                          fill
                          sizes="96px"
                          className="object-cover"
                          unoptimized
                        />
                      </div>
                      <div className="text-xs font-medium">Atlas</div>
                      <div className="text-[10px] opacity-60">
                        {zones[secondSeat]?.atlas?.length || 0} cards
                      </div>
                    </button>
                  </div>
                </div>
              )}

              {/* Reveal Button or Card Display */}
              {!seerRevealed ? (
                <div className="text-center">
                  <button
                    className="px-4 py-2 bg-amber-600 hover:bg-amber-700 rounded-lg text-sm font-medium transition-colors"
                    onClick={handleSeerReveal}
                  >
                    Reveal Top Card
                  </button>
                </div>
              ) : (
                <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                  {/* Card Display */}
                  {topCard ? (
                    <div
                      className="relative rounded-lg overflow-hidden ring-2 ring-amber-400/50 shadow-lg"
                      onMouseEnter={() => setPreviewCard(topCard)}
                      onMouseLeave={() => setPreviewCard(null)}
                    >
                      <div
                        className={`relative ${
                          (topCard.type || "").toLowerCase().includes("site")
                            ? "w-32 h-24"
                            : "w-24 h-32"
                        }`}
                      >
                        <Image
                          src={`/api/images/${topCard.slug}`}
                          alt={topCard.name}
                          fill
                          sizes="128px"
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
                    <div className="text-center py-4 text-gray-400 text-sm">
                      Pile is empty
                    </div>
                  )}

                  {/* Decision Buttons */}
                  {topCard && !seerCompleted && (
                    <div className="flex flex-col gap-2">
                      <div className="text-xs font-medium text-center mb-1">
                        {topCard.name}
                      </div>
                      <button
                        className="px-4 py-2 bg-green-600 hover:bg-green-700 rounded-lg text-sm font-medium transition-colors"
                        onClick={() => handleSeerComplete("top")}
                      >
                        Keep on Top
                      </button>
                      <button
                        className="px-4 py-2 bg-amber-600 hover:bg-amber-700 rounded-lg text-sm font-medium transition-colors"
                        onClick={() => handleSeerComplete("bottom")}
                      >
                        Put on Bottom
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Skip Seer Button - always visible */}
              {!seerCompleted && (
                <div className="mt-4 text-center">
                  <button
                    className="px-4 py-1.5 bg-red-600/80 hover:bg-red-700 rounded-lg text-xs font-medium transition-colors"
                    onClick={() => handleSeerComplete("skip")}
                  >
                    Skip Seer
                  </button>
                </div>
              )}
            </>
          ) : (
            /* First player waiting screen */
            <div className="text-center py-4">
              <div className="animate-pulse text-cyan-400 text-2xl">⏳</div>
            </div>
          )}
        </div>
      )}

      <div className="mt-4 text-xs opacity-60 text-center">
        {showSeerUI
          ? isSecondSeat
            ? "Use your Seer ability to look at the top card of a pile."
            : `Waiting for ${playerNames[secondSeat]} to use their Seer ability...`
          : submitted
          ? "You are ready. Waiting for other players to finish mulligans…"
          : "Other players are making their mulligan decisions..."}
      </div>
    </div>
  );
}
