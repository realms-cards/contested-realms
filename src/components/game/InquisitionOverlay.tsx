"use client";

import Image from "next/image";
import React, { useState, useCallback, useRef } from "react";
import { useOverlaySlot, overlaySlotClass } from "@/lib/game/overlayRegistry";
import { useGameStore } from "@/lib/game/store";
import type { CardRef } from "@/lib/game/store/types";

export default function InquisitionOverlay() {
  const pending = useGameStore((s) => s.pendingInquisition);
  const actorKey = useGameStore((s) => s.actorKey);
  const selectInquisitionCard = useGameStore((s) => s.selectInquisitionCard);
  const resolveInquisition = useGameStore((s) => s.resolveInquisition);
  const skipInquisition = useGameStore((s) => s.skipInquisition);

  const isActive =
    !!pending && pending.phase !== "complete" && pending.phase !== "resolving";
  const layout = useOverlaySlot("inquisition", 10, isActive, "Inquisition");

  // Storyline rule: when tiled with a higher-priority overlay, this one is paused
  const summonInterrupting = layout.tiled && !layout.isTop;

  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  // Caster always has control (no Evil mechanic like Accusation)
  const isCaster =
    !summonInterrupting &&
    (actorKey === null || pending?.casterSeat === actorKey);

  const handleSelectCard = useCallback(
    (index: number) => {
      if (!isCaster || pending?.phase !== "selecting") return;
      setSelectedIndex(index);
      selectInquisitionCard(index);
    },
    [isCaster, pending?.phase, selectInquisitionCard],
  );

  const handleResolve = useCallback(() => {
    if (selectedIndex === null) return;
    resolveInquisition();
    setSelectedIndex(null);
  }, [resolveInquisition, selectedIndex]);

  const handleSkip = useCallback(() => {
    skipInquisition();
    setSelectedIndex(null);
  }, [skipInquisition]);

  if (!pending) return null;

  const phase = pending.phase;
  const revealedHand = pending.revealedHand;

  const getInstructionText = () => {
    if (phase === "revealing") {
      return `Revealing ${pending.victimSeat.toUpperCase()}'s hand...`;
    }
    if (phase === "selecting") {
      return isCaster
        ? "Choose a card to banish, or skip."
        : `${pending.casterSeat.toUpperCase()} is choosing a card to banish...`;
    }
    return "Resolving...";
  };

  // ── Minimized pill rendering ──
  if (layout.minimized) {
    return (
      <div className="fixed inset-x-0 top-6 z-[201] pointer-events-none flex justify-center">
        <div className="pointer-events-auto px-4 py-2 rounded-full bg-black/90 text-white ring-1 ring-amber-600/50 shadow-lg text-sm flex items-center gap-2 select-none">
          <span className="text-amber-400 font-fantaisie">The Inquisition</span>
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
        <div className="pointer-events-auto px-4 py-2 rounded-full bg-black/90 text-white ring-1 ring-amber-600/50 shadow-lg text-sm md:text-base flex items-center gap-2 select-none">
          <span className="text-amber-400 font-fantaisie">The Inquisition</span>
          <span className="opacity-80 truncate">
            {summonInterrupting
              ? "Paused — resolving interrupt..."
              : getInstructionText()}
          </span>
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
              className={`bg-black/95 rounded-xl p-4 md:p-6 w-full mx-2 md:mx-4 ring-1 ring-amber-600/30 ${layout.tiled ? "max-h-full" : "max-w-4xl max-h-[90vh]"} overflow-y-auto`}
            >
              <h2
                className={`font-fantaisie text-amber-400 mb-2 text-center ${layout.tiled ? "text-lg" : "text-2xl"}`}
              >
                {pending.victimSeat.toUpperCase()}&apos;s Hand Revealed
              </h2>
              <p className="text-white/70 text-sm mb-4 text-center">
                {revealedHand.length} card{revealedHand.length !== 1 ? "s" : ""}{" "}
                in hand &mdash; you may banish one
              </p>

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
                    interactive={isCaster && phase === "selecting"}
                  />
                ))}
              </div>

              {/* Action buttons */}
              {isCaster && phase === "selecting" && (
                <div className="flex gap-3 justify-center">
                  <button
                    className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white/80 font-medium transition-colors text-sm"
                    onClick={handleSkip}
                  >
                    Skip
                  </button>
                  <button
                    className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                    onClick={handleResolve}
                    disabled={selectedIndex === null}
                  >
                    Banish Card
                  </button>
                </div>
              )}

              {/* Waiting / paused message */}
              {!isCaster && phase === "selecting" && (
                <div className="text-center text-white/60 text-sm">
                  {summonInterrupting ? (
                    <span className="text-purple-400">
                      ⏸ Paused while summon resolves...
                    </span>
                  ) : (
                    <>
                      Waiting for {pending.casterSeat.toUpperCase()} to
                      choose...
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

function CardDisplay({
  card,
  onClick,
  selected,
  interactive,
}: {
  card: CardRef;
  onClick?: () => void;
  selected: boolean;
  interactive: boolean;
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
          ? "cursor-pointer hover:ring-2 hover:ring-amber-400/50 hover:scale-105"
          : ""
      } ${
        selected
          ? "ring-4 ring-amber-500 scale-105 shadow-lg shadow-amber-500/30"
          : ""
      }`}
    >
      <Image
        src={`/api/images/${card.slug || card.cardId}`}
        alt={card.name || "Card"}
        fill
        className="object-cover"
        sizes="(max-width: 640px) 45vw, (max-width: 1024px) 30vw, 15vw"
        unoptimized
      />
      {selected && (
        <div className="absolute inset-0 bg-amber-500/20 flex items-center justify-center">
          <span className="text-3xl font-fantaisie text-amber-300">Banish</span>
        </div>
      )}
    </div>
  );
}
