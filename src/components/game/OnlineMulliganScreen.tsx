"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { useSound } from "@/lib/contexts/SoundContext";
import { useVideoOverlay } from "@/lib/contexts/VideoOverlayContext";
import { useGameStore } from "@/lib/game/store";
import type { PlayerKey } from "@/lib/game/store";

interface OnlineMulliganScreenProps {
  myPlayerKey: PlayerKey;
  playerNames: { p1: string; p2: string };
  onStartGame: () => void;
  finalizeLabel?: string;
}

export default function OnlineMulliganScreen({
  myPlayerKey,
  playerNames,
  onStartGame,
  finalizeLabel = "Start Game",
}: OnlineMulliganScreenProps) {
  const { updateScreenType } = useVideoOverlay();
  const zones = useGameStore((s) => s.zones);
  const mulligans = useGameStore((s) => s.mulligans);
  const mulliganWithSelection = useGameStore((s) => s.mulliganWithSelection);
  const finalizeMulligan = useGameStore((s) => s.finalizeMulligan);
  const setPreviewCard = useGameStore((s) => s.setPreviewCard);
  const avatars = useGameStore((s) => s.avatars);

  const [selected, setSelected] = useState<number[]>([]);
  const [done, setDone] = useState<boolean>(false);
  const [submitted, setSubmitted] = useState<boolean>(false);
  const { playCardSelect } = useSound();
  const currentPlayer = useGameStore((s) => s.currentPlayer);
  const scryTop = useGameStore((s) => s.scryTop);

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
  const isSecondSeat = (() => {
    const first = currentPlayer === 1 ? "p1" : "p2";
    return myPlayerKey === (first === "p1" ? "p2" : "p1");
  })();
  const [scryOpen, setScryOpen] = useState<boolean>(false);
  const [scryPile, setScryPile] = useState<"spellbook" | "atlas">("spellbook");
  const [scryReveal, setScryReveal] = useState<boolean>(false);
  const topCard = (zones[myPlayerKey]?.[scryPile] || [])[0];

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
    if (isSecondSeat && !scryOpen) {
      setScryReveal(false);
      setScryOpen(true);
      return;
    }
    if (!submitted) {
      setSubmitted(true);
      setDone(true);
      finalizeMulligan();
      onStartGame();
    }
  };

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

              return (
                <button
                  key={i}
                  className={`relative flex-shrink-0 transition-all duration-200 ${
                    !done && myMulligans > 0
                      ? "hover:scale-105 hover:-translate-y-4"
                      : ""
                  } ${isSelected ? "ring-2 ring-red-400 -translate-y-2" : ""} ${
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
                      src={`/api/images/${card.slug}`}
                      alt={card.name}
                      fill
                      sizes="(max-width: 640px) 96px, 120px"
                      className={`object-contain ${isSite ? "rotate-90" : ""}`}
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
          <div className="text-center py-8 text-gray-400">No cards in hand</div>
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

            {(done || myMulligans === 0) && (
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
      {scryOpen && isSecondSeat && (
        <div className="mt-4 bg-black/30 rounded-xl p-4 ring-1 ring-white/10">
          <div className="flex items-center justify-between mb-3">
            <div className="font-semibold">Second Player Seer</div>
            <div className="text-xs opacity-80">
              Choose a pile and keep on top or put on bottom
            </div>
          </div>
          <div className="flex items-center gap-2 mb-3">
            <button
              className={`rounded px-3 py-1 text-sm ${
                scryPile === "spellbook"
                  ? "bg-white/20"
                  : "bg-white/10 hover:bg-white/20"
              } ${scryReveal ? "opacity-60 cursor-not-allowed" : ""}`}
              onClick={() => {
                if (!scryReveal) setScryPile("spellbook");
              }}
              disabled={scryReveal}
            >
              Spellbook
            </button>
            <button
              className={`rounded px-3 py-1 text-sm ${
                scryPile === "atlas"
                  ? "bg-white/20"
                  : "bg-white/10 hover:bg-white/20"
              } ${scryReveal ? "opacity-60 cursor-not-allowed" : ""}`}
              onClick={() => {
                if (!scryReveal) setScryPile("atlas");
              }}
              disabled={scryReveal}
            >
              Atlas
            </button>
          </div>
          {!scryReveal ? (
            <div className="flex items-center justify-between mt-1">
              <div className="text-xs opacity-70">
                Confirm the pile to reveal its top card
              </div>
              <button
                className="rounded bg-white/15 hover:bg-white/25 px-3 py-1 text-sm"
                onClick={() => setScryReveal(true)}
              >
                Confirm Pile
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <div className="flex-1">
                {topCard ? (
                  <div className="relative w-24 h-36 sm:w-28 sm:h-40 rounded overflow-hidden ring-1 ring-white/20 mx-auto">
                    <Image
                      src={`/api/images/${topCard.slug}`}
                      alt={topCard.name}
                      fill
                      sizes="112px"
                      className={`object-contain ${
                        (topCard.type || "").toLowerCase().includes("site")
                          ? "rotate-90"
                          : ""
                      }`}
                    />
                  </div>
                ) : (
                  <div className="text-xs opacity-70">
                    Selected pile is empty
                  </div>
                )}
              </div>
              <div className="flex flex-col gap-2">
                <button
                  className="rounded bg-white/15 hover:bg-white/25 px-3 py-1 text-sm disabled:opacity-40"
                  disabled={!topCard}
                  onClick={() => {
                    try {
                      playCardSelect();
                    } catch {}
                    scryTop(myPlayerKey, scryPile, "top");
                    setScryOpen(false);
                    if (!submitted) {
                      setSubmitted(true);
                      setDone(true);
                      finalizeMulligan();
                      onStartGame();
                    }
                  }}
                >
                  Keep on Top
                </button>
                <button
                  className="rounded bg-white/15 hover:bg-white/25 px-3 py-1 text-sm disabled:opacity-40"
                  disabled={!topCard}
                  onClick={() => {
                    try {
                      playCardSelect();
                    } catch {}
                    scryTop(myPlayerKey, scryPile, "bottom");
                    setScryOpen(false);
                    if (!submitted) {
                      setSubmitted(true);
                      setDone(true);
                      finalizeMulligan();
                      onStartGame();
                    }
                  }}
                >
                  Put on Bottom
                </button>
                <button
                  className="rounded bg-white/10 hover:bg-white/20 px-3 py-1 text-sm"
                  onClick={() => {
                    setScryOpen(false);
                    if (!submitted) {
                      setSubmitted(true);
                      setDone(true);
                      finalizeMulligan();
                      onStartGame();
                    }
                  }}
                >
                  Skip
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="mt-4 text-xs opacity-60 text-center">
        {submitted
          ? "You are ready. Waiting for other players to finish mulligans…"
          : "Other players are making their mulligan decisions..."}
      </div>
    </div>
  );
}
