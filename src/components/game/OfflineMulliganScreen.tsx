"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { useSound } from "@/lib/contexts/SoundContext";
import { useVideoOverlay } from "@/lib/contexts/VideoOverlayContext";
import { useGameStore, type PlayerKey } from "@/lib/game/store";
import { buildCardSlug } from "@/lib/utils/cardSlug";

interface OfflineMulliganScreenProps {
  myPlayerKey: PlayerKey;
  playerNames: { p1: string; p2: string };
  onStartGame: () => void;
  finalizeLabel?: string;
}

export default function OfflineMulliganScreen({
  myPlayerKey,
  playerNames,
  onStartGame,
  finalizeLabel = "Start Game",
}: OfflineMulliganScreenProps) {
  const { updateScreenType } = useVideoOverlay();
  const zones = useGameStore((s) => s.zones);
  const mulligans = useGameStore((s) => s.mulligans);
  const mulliganWithSelection = useGameStore((s) => s.mulliganWithSelection);
  const setPreviewCard = useGameStore((s) => s.setPreviewCard);
  const avatars = useGameStore((s) => s.avatars);

  const [selected, setSelected] = useState<number[]>([]);
  const [done, setDone] = useState<boolean>(false);
  const [submitted, setSubmitted] = useState<boolean>(false);
  const { playCardSelect } = useSound();

  // Set screen type for video overlay (no RTC in offline)
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
    onStartGame();
  };

  return (
    <div className="w-full max-w-4xl rounded-rc-lg border border-rc-line/18 bg-[rgba(9,13,25,0.9)] p-6 text-rc-fg shadow-rc-panel">
      <div className="mb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="text-center sm:text-left">
          <div className="mb-1 font-rc-display text-[28px] leading-none text-rc-fg-strong">Mulligan Phase</div>
          <div className="font-rc-sans text-sm text-rc-fg-muted">
            Playing as:{" "}
            <span className="font-rc-mono font-medium text-rc-info">
              {playerNames[myPlayerKey]}
            </span>
          </div>
        </div>
        {(myAvatar?.slug || opponentAvatar?.slug) && (
          <div className="flex-shrink-0 flex flex-row gap-4 items-center sm:items-end">
            {myAvatar?.slug && (
              <div className="flex flex-col items-center sm:items-end">
                <div className="mb-1 font-rc-mono text-[10px] uppercase tracking-[0.18em] text-rc-accent-link">
                  Your Avatar
                </div>
                <div
                  className="relative aspect-[3/4] w-16 overflow-hidden rounded-rc-md shadow-rc-md ring-1 ring-rc-line/25 sm:w-20 md:w-24"
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
                    <div className="rc-alert mt-1 px-2 py-0.5 text-[10px]" data-tone="warning">
                      ⚔ {myChampion.name}
                    </div>
                  )}
              </div>
            )}
            {opponentAvatar?.slug && (
              <div className="flex flex-col items-center sm:items-end">
                <div className="mb-1 font-rc-mono text-[10px] uppercase tracking-[0.18em] text-rc-accent-link">
                  Opponent Avatar
                </div>
                <div
                  className="relative aspect-[3/4] w-16 overflow-hidden rounded-rc-md shadow-rc-md ring-1 ring-rc-line/25 sm:w-20 md:w-24"
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
                    <div className="rc-alert mt-1 px-2 py-0.5 text-[10px]" data-tone="warning">
                      ⚔ {opponentChampion.name}
                    </div>
                  )}
              </div>
            )}
          </div>
        )}

        <div className="rc-hint mt-1">
          Select up to 3 cards to put back. You&apos;ll draw the same number
          from the appropriate pile.
        </div>
      </div>

      <div className="rounded-rc-md border border-rc-line/12 bg-black/30 p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="font-rc-display text-[22px] leading-none text-rc-fg-strong">Your Hand</div>
          <div className="font-rc-mono text-xs tabular-nums text-rc-fg-muted">
            Mulligans remaining: {myMulligans}
          </div>
        </div>

        <div className="mb-3 font-rc-sans text-xs text-rc-fg-muted">
          {!done && myMulligans > 0
            ? "Click cards to select for mulligan (max 3)."
            : myMulligans === 0
            ? "Mulligan used. Ready to start game."
            : "Mulligan complete."}
        </div>

        {myHand.length > 0 ? (
          <div className="flex items-center gap-2 overflow-x-auto overflow-y-visible pb-2 pt-16 min-h-[200px]">
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
                  } ${isSelected ? "ring-2 ring-rc-danger -translate-y-2" : ""} ${
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
                      isSite ? "aspect-[4/3] w-32" : "aspect-[3/4] w-24"
                    } rounded-rc-md overflow-hidden ring-1 ring-rc-line/18 shadow-rc-md ${
                      isSelected ? "opacity-70" : ""
                    } ${done || myMulligans === 0 ? "opacity-60" : ""}`}
                  >
                    <Image
                      src={`/api/images/${cardSlug}`}
                      alt={card.name}
                      fill
                      sizes="120px"
                      className={`object-contain ${isSite ? "rotate-90" : ""}`}
                      unoptimized
                    />
                    {isSelected && (
                      <div className="absolute inset-0 flex items-center justify-center bg-rc-danger/30">
                        <div className="rounded-rc-sm bg-rc-danger px-2 py-1 font-rc-mono text-[10px] font-semibold tracking-[0.14em] text-rc-fg-strong">
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
          <div className="rc-hint py-8 text-center">No cards in hand</div>
        )}

        <div className="flex justify-between items-center mt-4">
          <div className="rc-hint">
            {selected.length > 0 &&
              `${selected.length} card(s) selected for mulligan`}
          </div>

          <div className="flex gap-2">
            {!done && myMulligans > 0 && (
              <button
                className="cursor-pointer rounded-rc-md border border-rc-accent-press bg-gradient-to-b from-rc-accent-hover to-rc-accent px-4 py-2 font-rc-sans text-sm font-medium text-rc-accent-fg shadow-rc-sm transition-transform hover:-translate-y-px disabled:pointer-events-none disabled:opacity-50"
                onClick={handleMulligan}
              >
                {selected.length === 0
                  ? "Keep Hand"
                  : `Mulligan ${selected.length} Cards`}
              </button>
            )}

            {(done || myMulligans === 0) && (
              <button
                className={
                  submitted
                    ? "cursor-not-allowed rounded-rc-md border border-rc-line/22 bg-black/35 px-4 py-2 font-rc-mono text-xs tracking-[0.08em] text-rc-fg-muted"
                    : "cursor-pointer rounded-rc-md border border-rc-accent-press bg-gradient-to-b from-rc-accent-hover to-rc-accent px-4 py-2 font-rc-sans text-sm font-medium text-rc-accent-fg shadow-rc-sm transition-transform hover:-translate-y-px disabled:pointer-events-none disabled:opacity-50"
                }
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

      <div className="rc-hint mt-4 text-center">
        {submitted
          ? "You are ready. Waiting for other players to finish mulligans…"
          : "Other players are making their mulligan decisions..."}
      </div>
    </div>
  );
}
