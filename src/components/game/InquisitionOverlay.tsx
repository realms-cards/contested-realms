"use client";

import Image from "next/image";
import React, { useState, useCallback, useRef } from "react";
import { RcButton } from "@/components/ui/rc-button";
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
        <div className="pointer-events-auto px-4 py-2 rounded-full border border-rc-line/22 bg-[rgba(7,10,20,0.9)] font-rc-sans text-rc-fg shadow-rc-panel text-sm flex items-center gap-2 select-none">
          <span className="font-rc-display text-rc-accent-link">The Inquisition</span>
          <span className="text-rc-fg-muted truncate max-w-[200px]">
            {summonInterrupting
              ? "Paused — resolving interrupt..."
              : getInstructionText()}
          </span>
          <RcButton
            variant="quiet"
            size="xs"
            className="ml-1 h-6 px-2"
            onClick={layout.toggleMinimize}
            title="Expand overlay"
          >
            ▼
          </RcButton>
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
        <div className="pointer-events-auto px-4 py-2 rounded-full border border-rc-line/22 bg-[rgba(7,10,20,0.9)] font-rc-sans text-rc-fg shadow-rc-panel text-sm md:text-base flex items-center gap-2 select-none">
          <span className="font-rc-display text-rc-accent-link">The Inquisition</span>
          <span className="text-rc-fg-muted truncate">
            {summonInterrupting
              ? "Paused — resolving interrupt..."
              : getInstructionText()}
          </span>
          <RcButton
            variant="quiet"
            size="xs"
            className="ml-1 h-6 px-2"
            onClick={layout.toggleMinimize}
            title="Minimize overlay"
          >
            ▲
          </RcButton>
        </div>
      </div>

      {/* Main content area */}
      {(phase === "revealing" || phase === "selecting") &&
        revealedHand.length > 0 && (
          <div
            className={`flex-1 flex items-center justify-center pointer-events-auto ${layout.tiled ? "overflow-y-auto p-2" : ""}`}
          >
            <div
              className={`thin-scrollbar rounded-rc-lg border border-rc-line/18 bg-[rgba(9,13,25,0.95)] p-4 md:p-6 w-full mx-2 md:mx-4 font-rc-sans text-rc-fg shadow-rc-panel ${layout.tiled ? "max-h-full" : "max-w-4xl max-h-[90vh]"} overflow-y-auto`}
            >
              <h2
                className={`font-rc-display leading-tight text-rc-fg-strong mb-2 text-center ${layout.tiled ? "text-[18px]" : "text-[26px]"}`}
              >
                {pending.victimSeat.toUpperCase()}&apos;s Hand Revealed
              </h2>
              <p className="text-rc-fg-muted text-sm mb-4 text-center">
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
                  <RcButton variant="outline" size="sm" onClick={handleSkip}>
                    Skip
                  </RcButton>
                  <RcButton
                    size="sm"
                    onClick={handleResolve}
                    disabled={selectedIndex === null}
                  >
                    Banish Card
                  </RcButton>
                </div>
              )}

              {/* Waiting / paused message */}
              {!isCaster && phase === "selecting" && (
                <div className="text-center text-rc-fg-subtle text-sm">
                  {summonInterrupting ? (
                    <span className="text-rc-accent-link">
                      Paused while summon resolves...
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
      className={`relative aspect-[2.5/3.5] rounded-rc-md overflow-hidden transition-all ${
        interactive
          ? "cursor-pointer hover:ring-2 hover:ring-rc-accent/50 hover:scale-105"
          : ""
      } ${
        selected
          ? "ring-4 ring-rc-accent scale-105 shadow-[0_0_14px_rgba(243,207,106,0.25)]"
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
        <div className="absolute inset-0 bg-rc-accent/20 flex items-center justify-center">
          <span className="font-rc-display text-[30px] text-rc-spark">Banish</span>
        </div>
      )}
    </div>
  );
}
