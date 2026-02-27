"use client";

import Image from "next/image";
import React, { useState, useCallback, useRef } from "react";
import { useOverlaySlot, overlaySlotClass } from "@/lib/game/overlayRegistry";
import { useGameStore } from "@/lib/game/store";
import type { CardRef } from "@/lib/game/store/types";

export default function AccusationOverlay() {
  const pending = useGameStore((s) => s.pendingAccusation);
  const actorKey = useGameStore((s) => s.actorKey);
  const selectAccusationCard = useGameStore((s) => s.selectAccusationCard);
  const resolveAccusation = useGameStore((s) => s.resolveAccusation);
  const cancelAccusation = useGameStore((s) => s.cancelAccusation);

  const isActive =
    !!pending && pending.phase !== "complete" && pending.phase !== "resolving";
  const layout = useOverlaySlot("accusation", 10, isActive, "Accusation");

  // Storyline rule: when tiled with a higher-priority overlay, this one is paused
  const summonInterrupting = layout.tiled && !layout.isTop;

  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  // Determine who has control over selection
  // If caster has choice (Evil present), caster chooses
  // Otherwise, victim chooses
  const isCaster = actorKey === null || pending?.casterSeat === actorKey;
  const isVictim = actorKey === null || pending?.victimSeat === actorKey;
  const hasControl =
    !summonInterrupting && (pending?.casterHasChoice ? isCaster : isVictim);

  // Handle selecting a card
  const handleSelectCard = useCallback(
    (index: number) => {
      if (!hasControl || pending?.phase !== "selecting") return;
      setSelectedIndex(index);
      selectAccusationCard(index);
    },
    [hasControl, pending?.phase, selectAccusationCard],
  );

  // Handle confirm/resolve
  const handleResolve = useCallback(() => {
    if (selectedIndex === null) return;
    resolveAccusation();
    setSelectedIndex(null);
  }, [resolveAccusation, selectedIndex]);

  // Handle cancel (only caster can cancel)
  const handleCancel = useCallback(() => {
    cancelAccusation();
    setSelectedIndex(null);
  }, [cancelAccusation]);

  if (!pending) return null;

  const phase = pending.phase;
  const revealedHand = pending.revealedHand;
  const casterHasChoice = pending.casterHasChoice;
  const evilCardIndices = new Set(pending.evilCardIndices);

  // Determine instruction text
  const getInstructionText = () => {
    if (phase === "revealing") {
      return `Revealing ${pending.victimSeat.toUpperCase()}'s hand...`;
    }
    if (phase === "selecting") {
      if (casterHasChoice) {
        return isCaster
          ? "Evil detected! Choose a card to banish."
          : `${pending.casterSeat.toUpperCase()} is choosing a card to banish...`;
      } else {
        return isVictim
          ? "No Evil found. Choose a card to banish."
          : `${pending.victimSeat.toUpperCase()} is choosing a card to banish...`;
      }
    }
    return "Resolving...";
  };

  // ── Minimized pill rendering ──
  if (layout.minimized) {
    return (
      <div className="fixed inset-x-0 top-6 z-[201] pointer-events-none flex justify-center">
        <div className="pointer-events-auto px-4 py-2 rounded-full bg-black/90 text-white ring-1 ring-red-600/50 shadow-lg text-sm flex items-center gap-2 select-none">
          <span className="text-red-500 font-fantaisie">⚖️ Accusation</span>
          <span className="opacity-80 truncate max-w-[200px]">
            {summonInterrupting
              ? "Paused — resolving interrupt..."
              : getInstructionText()}
          </span>
          <button
            className="ml-1 rounded bg-white/15 hover:bg-white/25 px-2 py-0.5 text-xs"
            onClick={layout.toggleMinimize}
            title="Expand overlay"
          >
            ▼
          </button>
        </div>
      </div>
    );
  }

  const slotClass = overlaySlotClass(layout.slot);

  return (
    <div className={`${slotClass} pointer-events-none flex flex-col`}>
      {/* Top bar with status */}
      <div
        className={`${layout.tiled ? "" : "fixed inset-x-0 top-6 z-[201]"} pointer-events-none flex justify-center ${layout.tiled ? "pt-4 px-2" : ""}`}
      >
        <div className="pointer-events-auto px-4 py-2 rounded-full bg-black/90 text-white ring-1 ring-red-600/50 shadow-lg text-sm md:text-base flex items-center gap-2 select-none">
          <span className="text-red-500 font-fantaisie">⚖️ Accusation</span>
          <span className="opacity-80 truncate">
            {summonInterrupting
              ? "Paused — resolving interrupt..."
              : getInstructionText()}
          </span>
          {isCaster && phase === "selecting" && !summonInterrupting && (
            <button
              className="mx-1 rounded bg-white/15 hover:bg-white/25 px-2 py-0.5 select-none text-xs"
              onClick={handleCancel}
            >
              Cancel
            </button>
          )}
          <button
            className="ml-1 rounded bg-white/15 hover:bg-white/25 px-2 py-0.5 text-xs"
            onClick={layout.toggleMinimize}
            title="Minimize overlay"
          >
            ▲
          </button>
        </div>
      </div>

      {/* Main content area */}
      {(phase === "revealing" || phase === "selecting") &&
        revealedHand.length > 0 && (
          <div
            className={`flex-1 flex items-center justify-center pointer-events-auto ${layout.tiled ? "overflow-y-auto p-2" : ""}`}
          >
            <div
              className={`bg-black/95 rounded-xl p-4 md:p-6 w-full mx-2 md:mx-4 ring-1 ring-red-600/30 ${layout.tiled ? "max-h-full" : "max-w-4xl max-h-[90vh]"} overflow-y-auto`}
            >
              <h2
                className={`font-fantaisie text-red-500 mb-2 text-center ${layout.tiled ? "text-lg" : "text-2xl"}`}
              >
                {pending.victimSeat.toUpperCase()}&apos;s Hand Revealed
              </h2>
              <p className="text-white/70 text-sm mb-2 text-center">
                {revealedHand.length} card{revealedHand.length !== 1 ? "s" : ""}{" "}
                in hand
              </p>
              {casterHasChoice && (
                <p className="text-red-400 text-xs sm:text-sm mb-4 text-center font-medium flex items-center justify-center gap-1">
                  <img src="/fire.png" alt="fire" className="w-4 h-4" /> Evil
                  detected - Caster chooses the card to banish
                </p>
              )}
              {!casterHasChoice && (
                <p className="text-amber-400 text-xs sm:text-sm mb-4 text-center">
                  No Evil found - Victim chooses the card to banish
                </p>
              )}

              {/* Card grid — fewer columns when tiled */}
              <div
                className={`grid gap-2 sm:gap-3 mb-4 ${layout.tiled ? "grid-cols-2 sm:grid-cols-3" : "grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6"}`}
              >
                {revealedHand.map((card, index) => (
                  <CardDisplay
                    key={index}
                    card={card}
                    onClick={() => handleSelectCard(index)}
                    selected={selectedIndex === index}
                    interactive={hasControl && phase === "selecting"}
                    isEvil={evilCardIndices.has(index)}
                  />
                ))}
              </div>

              {/* Action buttons */}
              {hasControl && phase === "selecting" && (
                <div className="flex gap-3 justify-center">
                  {isCaster && (
                    <button
                      className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white/80 font-medium transition-colors text-sm"
                      onClick={handleCancel}
                    >
                      Cancel
                    </button>
                  )}
                  <button
                    className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                    onClick={handleResolve}
                    disabled={selectedIndex === null}
                  >
                    Banish Card
                  </button>
                </div>
              )}

              {/* Waiting / paused message */}
              {!hasControl && phase === "selecting" && (
                <div className="text-center text-white/60 text-sm">
                  {summonInterrupting ? (
                    <span className="text-purple-400">
                      ⏸ Paused while The Inquisition summon resolves...
                    </span>
                  ) : (
                    <>
                      Waiting for{" "}
                      {casterHasChoice
                        ? pending.casterSeat.toUpperCase()
                        : pending.victimSeat.toUpperCase()}{" "}
                      to choose...
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
    </div>
  );
}

// Card display component with preview support
function CardDisplay({
  card,
  onClick,
  selected,
  interactive,
  isEvil,
}: {
  card: CardRef;
  onClick?: () => void;
  selected: boolean;
  interactive: boolean;
  isEvil: boolean;
}) {
  const setPreviewCard = useGameStore((s) => s.setPreviewCard);
  const hoverTimerRef = useRef<number | null>(null);

  const handleMouseEnter = useCallback(() => {
    if (hoverTimerRef.current) window.clearTimeout(hoverTimerRef.current);
    hoverTimerRef.current = window.setTimeout(() => {
      setPreviewCard(card);
    }, 200);
  }, [card, setPreviewCard]);

  const handleMouseLeave = useCallback(() => {
    if (hoverTimerRef.current) {
      window.clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
    setPreviewCard(null);
  }, [setPreviewCard]);

  return (
    <div
      onClick={interactive ? onClick : undefined}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className={`relative aspect-[2.5/3.5] rounded-lg overflow-hidden transition-all ${
        interactive
          ? "cursor-pointer hover:ring-2 hover:ring-red-400/50 hover:scale-105"
          : ""
      } ${
        selected
          ? "ring-4 ring-red-500 scale-105 shadow-lg shadow-red-500/30"
          : ""
      } ${isEvil && !selected ? "ring-2 ring-purple-500/50" : ""}`}
    >
      <Image
        src={`/api/images/${card.slug || card.cardId}`}
        alt={card.name || "Card"}
        fill
        className="object-cover"
        sizes="(max-width: 640px) 45vw, (max-width: 1024px) 30vw, 15vw"
        unoptimized
      />
      {isEvil && (
        <div className="absolute top-1 right-1 bg-purple-600 text-white text-xs px-1 rounded">
          Evil
        </div>
      )}
      {selected && (
        <div className="absolute inset-0 bg-red-500/20 flex items-center justify-center">
          <span className="text-3xl">⚖️</span>
        </div>
      )}
    </div>
  );
}
