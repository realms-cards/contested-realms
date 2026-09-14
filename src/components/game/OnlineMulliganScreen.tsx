"use client";

import { Icon } from "@iconify/react";
import Image from "next/image";
import { useEffect, useState, useCallback } from "react";
import { RcButton } from "@/components/ui/rc-button";
import { cardbackAtlasUrl } from "@/lib/assets";
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
  const { playCardSelect } = useSound();

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
          : [...prev, index],
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
    [seerRevealed, seerCompleted, setSeerPile],
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
      submitted,
      finalizeMulligan,
      onStartGame,
    ],
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
    // Wait for P1 to finish mulligan before auto-starting
    if (!done && myMulligans > 0) return;

    // Player 1: auto-start when seer is complete AND mulligan is done
    setSubmitted(true);
    setDone(true);
    finalizeMulligan();
    onStartGame();
  }, [
    showSeerPhase,
    isSecondSeat,
    seerComplete,
    submitted,
    done,
    myMulligans,
    finalizeMulligan,
    onStartGame,
  ]);

  return (
    <div className="thin-scrollbar max-h-[90vh] w-full max-w-[98vw] overflow-y-auto rounded-rc-md border border-rc-line/18 bg-[rgba(9,13,25,0.9)] p-2 text-rc-fg shadow-rc-panel sm:max-w-4xl sm:rounded-rc-lg sm:p-6">
      <div className="mb-2 sm:mb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-3">
        <div className="text-center sm:text-left">
          <div className="mb-0.5 font-rc-display text-[22px] leading-none text-rc-fg-strong sm:mb-1 sm:text-[28px]">
            Mulligan Phase
          </div>
          <div className="font-rc-sans text-xs text-rc-fg-muted sm:text-sm">
            Playing as:{" "}
            <span className="font-rc-mono font-medium text-rc-info">
              {playerNames[myPlayerKey]}
            </span>
          </div>
          <div className="rc-hint mt-0.5 sm:mt-1">
            Select up to 3 cards to put back.
          </div>
        </div>
        {(myAvatar?.slug || opponentAvatar?.slug) && (
          <div className="flex-shrink-0 flex flex-row gap-2 sm:gap-4 items-center sm:items-end">
            {myAvatar?.slug && (
              <div className="flex flex-col items-center sm:items-end">
                <div className="mb-0.5 font-rc-mono text-[9px] uppercase tracking-[0.18em] text-rc-accent-link sm:mb-1 sm:text-[10px]">
                  You
                </div>
                <div
                  className="relative aspect-[3/4] w-10 overflow-hidden rounded-rc-sm shadow-rc-md ring-1 ring-rc-line/25 sm:w-20 sm:rounded-rc-md md:w-24"
                  onMouseEnter={() => setPreviewCard(myAvatar)}
                  onMouseLeave={() => setPreviewCard(null)}
                >
                  <Image
                    src={`/api/images/${myAvatar.slug}`}
                    alt={myAvatar.name}
                    fill
                    sizes="(max-width: 640px) 40px, 96px"
                    className="object-contain"
                    unoptimized
                  />
                </div>
                {myChampion &&
                  myAvatar.name?.toLowerCase() === "dragonlord" && (
                    <div className="rc-alert mt-1 flex items-center gap-1 px-2 py-0.5 text-[10px]" data-tone="warning">
                      <Icon icon="game-icons:crossed-swords" width={10} height={10} aria-hidden="true" />
                      {myChampion.name}
                    </div>
                  )}
              </div>
            )}
            {opponentAvatar?.slug && (
              <div className="flex flex-col items-center sm:items-end">
                <div className="mb-0.5 font-rc-mono text-[9px] uppercase tracking-[0.18em] text-rc-accent-link sm:mb-1 sm:text-[10px]">
                  Opp
                </div>
                <div
                  className="relative aspect-[3/4] w-10 overflow-hidden rounded-rc-sm shadow-rc-md ring-1 ring-rc-line/25 sm:w-20 sm:rounded-rc-md md:w-24"
                  onMouseEnter={() => setPreviewCard(opponentAvatar)}
                  onMouseLeave={() => setPreviewCard(null)}
                >
                  <Image
                    src={`/api/images/${opponentAvatar.slug}`}
                    alt={opponentAvatar.name}
                    fill
                    sizes="(max-width: 640px) 40px, 96px"
                    className="object-contain"
                    unoptimized
                  />
                </div>
                {opponentChampion &&
                  opponentAvatar.name?.toLowerCase() === "dragonlord" && (
                    <div className="rc-alert mt-1 flex items-center gap-1 px-2 py-0.5 text-[10px]" data-tone="warning">
                      <Icon icon="game-icons:crossed-swords" width={10} height={10} aria-hidden="true" />
                      {opponentChampion.name}
                    </div>
                  )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Always show hand - players need to see their cards during seer phase */}
      <div className="rounded-rc-sm border border-rc-line/12 bg-black/30 p-2 sm:rounded-rc-md sm:p-4">
        <div className="flex items-center justify-between mb-1 sm:mb-2">
          <div className="font-rc-display text-[18px] leading-none text-rc-fg-strong sm:text-[22px]">Your Hand</div>
          {!showSeerUI && (
            <div className="font-rc-mono text-[10px] tabular-nums text-rc-fg-muted sm:text-xs">
              Mulligans: {myMulligans}
            </div>
          )}
        </div>

        {!showSeerUI && (
          <div className="mb-1 font-rc-sans text-[10px] text-rc-fg-muted sm:mb-3 sm:text-xs">
            {!done && myMulligans > 0
              ? "Tap cards to select (max 3)"
              : myMulligans === 0
                ? "Mulligan used. Ready to start game."
                : "Mulligan complete."}
          </div>
        )}

        {myHand.length > 0 ? (
          <div className="flex flex-wrap justify-center gap-1 sm:gap-2 pb-2 pt-1 sm:pt-4 min-h-[100px] sm:min-h-[200px]">
            {myHand.map((card, i) => {
              const isSite = (card.type || "").toLowerCase().includes("site");
              const isSelected = selected.includes(i);
              // Use card slug if available, otherwise build a fallback
              const cardSlug = card.slug || buildCardSlug(card.name, null);

              return (
                <button
                  key={i}
                  className={`relative flex-shrink-0 transition-all duration-200 ${
                    !done && myMulligans > 0 && !showSeerUI
                      ? "hover:scale-105 sm:hover:-translate-y-4 active:scale-95"
                      : ""
                  } ${
                    isSelected && !showSeerUI
                      ? "ring-2 ring-rc-danger scale-95 sm:-translate-y-2"
                      : ""
                  } ${
                    done || myMulligans === 0 || showSeerUI
                      ? "cursor-default"
                      : "cursor-pointer"
                  }`}
                  onClick={() => !showSeerUI && handleCardClick(i)}
                  onMouseEnter={() => setPreviewCard(card)}
                  onMouseLeave={() => setPreviewCard(null)}
                >
                  <div
                    className={`relative ${
                      isSite
                        ? "aspect-[4/3] w-[72px] sm:w-36"
                        : "aspect-[3/4] w-[54px] sm:w-24"
                    } rounded-rc-sm sm:rounded-rc-md overflow-hidden ring-1 ring-rc-line/18 shadow-rc-md ${
                      isSelected && !showSeerUI ? "opacity-70" : ""
                    } ${done || myMulligans === 0 ? "opacity-60" : ""}`}
                  >
                    <Image
                      src={`/api/images/${cardSlug}`}
                      alt={card.name}
                      fill
                      sizes={
                        isSite
                          ? "(max-width: 640px) 72px, 144px"
                          : "(max-width: 640px) 54px, 96px"
                      }
                      className={`${isSite ? "object-contain rotate-90 scale-[1.333] origin-center" : "object-contain"}`}
                      unoptimized
                    />
                    {isSelected && !showSeerUI && (
                      <div className="absolute inset-0 flex items-center justify-center bg-rc-danger/30">
                        <div className="rounded-rc-sm bg-rc-danger px-1.5 py-0.5 font-rc-mono text-[10px] font-semibold text-rc-fg-strong sm:px-2 sm:py-1">
                          ✕
                        </div>
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="rc-hint py-4 text-center sm:py-8">
            No cards in hand
          </div>
        )}

        {!showSeerUI && (
          <div className="flex flex-col sm:flex-row justify-between items-center gap-2 mt-2 sm:mt-4">
            <div className="rc-hint order-2 sm:order-1">
              {selected.length > 0 && `${selected.length} card(s) selected`}
            </div>

            <div className="flex gap-2 order-1 sm:order-2 w-full sm:w-auto justify-center sm:justify-end">
              {!done && myMulligans > 0 && (
                <RcButton
                  className="flex-1 px-3 sm:flex-none sm:px-4"
                  onClick={handleMulligan}
                >
                  {selected.length === 0
                    ? "Keep Hand"
                    : `Mulligan ${selected.length}`}
                </RcButton>
              )}

              {/* Show finalize button only when seer phase is complete (or not needed) */}
              {(done || myMulligans === 0) && (
                <RcButton
                  variant={submitted ? "quiet" : "default"}
                  className={`flex-1 px-3 sm:flex-none ${
                    submitted
                      ? "cursor-not-allowed font-rc-mono text-xs tracking-[0.08em] disabled:opacity-100"
                      : ""
                  }`}
                  onClick={handleFinalize}
                  disabled={submitted}
                  title={
                    submitted
                      ? "Waiting for other players to finish mulligans"
                      : undefined
                  }
                >
                  {submitted ? "Waiting…" : finalizeLabel}
                </RcButton>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Second Player Seer Phase - shown after mulligan is done */}
      {showSeerUI && (
        <div className="rounded-rc-md border border-rc-line/12 bg-black/30 p-4">
          <div className="text-center mb-4">
            <div className="mb-2 inline-flex items-center gap-2 px-3 py-1.5">
              <span className="rc-eyebrow">
                Second Player Seer
              </span>
            </div>
            {isSecondSeat ? (
              <div className="font-rc-sans text-xs text-rc-fg-muted">
                Look at the top card of your Spellbook or Atlas and choose to
                keep it on top or put it on the bottom.
              </div>
            ) : (
              <div className="font-rc-sans text-xs text-rc-fg-muted">
                {playerNames[secondSeat]} is using their Seer ability...
              </div>
            )}
          </div>

          {isSecondSeat ? (
            <>
              {/* Pile Selection */}
              {!seerRevealed && (
                <div className="mb-4">
                  <div className="rc-hint mb-2 text-center">
                    Choose a pile to scry:
                  </div>
                  <div className="flex justify-center gap-6">
                    <button
                      className={`flex cursor-pointer flex-col items-center gap-2 rounded-rc-md p-3 transition-all ${
                        chosenPile === "spellbook"
                          ? "border border-rc-accent bg-rc-accent/12 shadow-[0_0_14px_rgba(243,207,106,0.25)]"
                          : "border border-rc-line/12 bg-black/30 hover:border-rc-accent/40"
                      }`}
                      onClick={() => handleSeerPileSelect("spellbook")}
                    >
                      {/* Spellbook cardback */}
                      <div className="relative w-16 h-24 rounded-rc-sm overflow-hidden ring-1 ring-rc-line/18">
                        <Image
                          src="/api/assets/cardback_spellbook.png"
                          alt="Spellbook"
                          fill
                          sizes="64px"
                          className="object-cover"
                          unoptimized
                        />
                      </div>
                      <div className="font-rc-mono text-xs uppercase tracking-[0.14em] text-rc-fg-strong">Spellbook</div>
                      <div className="rc-hint tabular-nums">
                        {zones[secondSeat]?.spellbook?.length || 0} cards
                      </div>
                    </button>
                    <button
                      className={`flex cursor-pointer flex-col items-center gap-2 rounded-rc-md p-3 transition-all ${
                        chosenPile === "atlas"
                          ? "border border-rc-accent bg-rc-accent/12 shadow-[0_0_14px_rgba(243,207,106,0.25)]"
                          : "border border-rc-line/12 bg-black/30 hover:border-rc-accent/40"
                      }`}
                      onClick={() => handleSeerPileSelect("atlas")}
                    >
                      {/* Atlas cardback (landscape) */}
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
                      <div className="font-rc-mono text-xs uppercase tracking-[0.14em] text-rc-fg-strong">Atlas</div>
                      <div className="rc-hint tabular-nums">
                        {zones[secondSeat]?.atlas?.length || 0} cards
                      </div>
                    </button>
                  </div>
                </div>
              )}

              {/* Reveal Button or Card Display */}
              {!seerRevealed ? (
                <div className="text-center">
                  <RcButton onClick={handleSeerReveal}>
                    Reveal Top Card
                  </RcButton>
                </div>
              ) : (
                <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                  {/* Card Display */}
                  {topCard ? (
                    <div
                      className="relative overflow-hidden rounded-rc-md shadow-rc-md ring-2 ring-rc-accent/50"
                      onMouseEnter={() => setPreviewCard(topCard)}
                      onMouseLeave={() => setPreviewCard(null)}
                    >
                      <div
                        className={`relative ${
                          (topCard.type || "").toLowerCase().includes("site")
                            ? "aspect-[4/3] w-32 sm:w-40"
                            : "w-24 h-32"
                        }`}
                      >
                        <Image
                          src={`/api/images/${topCard.slug}`}
                          alt={topCard.name}
                          fill
                          sizes={
                            (topCard.type || "").toLowerCase().includes("site")
                              ? "160px"
                              : "128px"
                          }
                          className={`${
                            (topCard.type || "").toLowerCase().includes("site")
                              ? "object-contain rotate-90 scale-[1.333] origin-center"
                              : "object-contain"
                          }`}
                          unoptimized
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="rc-hint py-4 text-center">
                      Pile is empty
                    </div>
                  )}

                  {/* Decision Buttons */}
                  {topCard && !seerCompleted && (
                    <div className="flex flex-col gap-2">
                      <div className="mb-1 text-center font-rc-display text-[17px] leading-tight text-rc-fg-strong">
                        {topCard.name}
                      </div>
                      <RcButton onClick={() => handleSeerComplete("top")}>
                        Keep on Top
                      </RcButton>
                      <RcButton
                        variant="quiet"
                        onClick={() => handleSeerComplete("bottom")}
                      >
                        Put on Bottom
                      </RcButton>
                    </div>
                  )}
                </div>
              )}

              {/* Skip Seer Button - always visible */}
              {!seerCompleted && (
                <div className="mt-4 text-center">
                  <button
                    className="cursor-pointer rounded-rc-md border border-rc-danger/40 px-4 py-1.5 font-rc-mono text-xs tracking-[0.08em] text-rc-danger transition-colors hover:border-rc-danger hover:text-rc-danger-hover"
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
              <div className="mx-auto h-2.5 w-2.5 animate-rc-blink bg-rc-accent shadow-[0_0_10px_#d4a94a]" aria-hidden="true" />
            </div>
          )}
        </div>
      )}

      <div className="rc-hint mt-4 text-center">
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
