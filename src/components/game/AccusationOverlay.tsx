"use client";

import { Icon } from "@iconify/react";
import Image from "next/image";
import React, { useState, useCallback, useRef } from "react";
import { Badge } from "@/components/ui/badge";
import { RcButton } from "@/components/ui/rc-button";
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
        <div className="pointer-events-auto px-4 py-2 rounded-full border border-rc-line/22 bg-[rgba(7,10,20,0.9)] font-rc-sans text-rc-fg shadow-rc-panel text-sm flex items-center gap-2 select-none">
          <span className="font-rc-display text-rc-accent-link">Accusation</span>
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
          <span className="font-rc-display text-rc-accent-link">Accusation</span>
          <span className="text-rc-fg-muted truncate">
            {summonInterrupting
              ? "Paused — resolving interrupt..."
              : getInstructionText()}
          </span>
          {isCaster && phase === "selecting" && !summonInterrupting && (
            <RcButton
              variant="outline"
              size="xs"
              className="mx-1 h-6 px-2"
              onClick={handleCancel}
            >
              Cancel
            </RcButton>
          )}
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
              <p className="text-rc-fg-muted text-sm mb-2 text-center">
                {revealedHand.length} card{revealedHand.length !== 1 ? "s" : ""}{" "}
                in hand
              </p>
              {casterHasChoice && (
                <p className="text-rc-danger text-xs sm:text-sm mb-4 text-center font-medium flex items-center justify-center gap-1">
                  <img src="/fire.png" alt="fire" className="w-4 h-4" /> Evil
                  detected - Caster chooses the card to banish
                </p>
              )}
              {!casterHasChoice && (
                <p className="text-rc-accent-link text-xs sm:text-sm mb-4 text-center">
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
                    <RcButton
                      variant="outline"
                      size="sm"
                      onClick={handleCancel}
                    >
                      Cancel
                    </RcButton>
                  )}
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
              {!hasControl && phase === "selecting" && (
                <div className="text-center text-rc-fg-subtle text-sm">
                  {summonInterrupting ? (
                    <span className="text-rc-accent-link">
                      Paused while The Inquisition summon resolves...
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
      className={`relative aspect-[2.5/3.5] rounded-rc-md overflow-hidden transition-all ${
        interactive
          ? "cursor-pointer hover:ring-2 hover:ring-rc-accent/60 hover:scale-105"
          : ""
      } ${
        selected
          ? "ring-4 ring-rc-accent scale-105 shadow-[0_0_14px_rgba(243,207,106,0.25)]"
          : ""
      } ${isEvil && !selected ? "ring-2 ring-rc-danger/60" : ""}`}
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
        <Badge
          tone="danger"
          className="absolute top-1 right-1 bg-[rgba(7,10,20,0.85)]"
        >
          Evil
        </Badge>
      )}
      {selected && (
        <div className="absolute inset-0 bg-rc-accent/12 flex items-center justify-center">
          <Icon
            icon="game-icons:scales"
            width={32}
            height={32}
            className="text-rc-accent-link"
          />
        </div>
      )}
    </div>
  );
}
