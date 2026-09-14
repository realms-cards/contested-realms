"use client";

import React, { useState, useCallback } from "react";
import { RcButton } from "@/components/ui/rc-button";
import { useGameStore } from "@/lib/game/store";
import CardWithPreview, { CardGrid } from "./CardWithPreview";

export default function CommonSenseOverlay() {
  const pending = useGameStore((s) => s.pendingCommonSense);
  const actorKey = useGameStore((s) => s.actorKey);
  const selectCommonSenseCard = useGameStore((s) => s.selectCommonSenseCard);
  const resolveCommonSense = useGameStore((s) => s.resolveCommonSense);
  const cancelCommonSense = useGameStore((s) => s.cancelCommonSense);

  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  // In hotseat mode (actorKey is null), always show caster UI since both players share the screen
  // In online mode, only show caster UI if we're the caster
  const isCaster = actorKey === null || pending?.casterSeat === actorKey;

  // Handle selecting a card
  const handleSelectCard = useCallback(
    (index: number) => {
      if (!isCaster || pending?.phase !== "selecting") return;
      setSelectedIndex(index);
      selectCommonSenseCard(index);
    },
    [isCaster, pending?.phase, selectCommonSenseCard]
  );

  // Handle confirm/resolve
  const handleResolve = useCallback(() => {
    if (selectedIndex === null) return;
    resolveCommonSense();
    setSelectedIndex(null);
  }, [resolveCommonSense, selectedIndex]);

  // Handle cancel
  const handleCancel = useCallback(() => {
    cancelCommonSense();
    setSelectedIndex(null);
  }, [cancelCommonSense]);

  if (!pending) return null;

  const phase = pending.phase;
  const eligibleCards = pending.eligibleCards;

  return (
    <div className="fixed inset-0 z-[200] pointer-events-none">
      {/* Top bar with status */}
      <div className="fixed inset-x-0 top-6 z-[201] pointer-events-none flex justify-center">
        <div className="pointer-events-auto px-5 py-3 rounded-full border border-rc-line/22 bg-[rgba(7,10,20,0.9)] font-rc-sans text-rc-fg shadow-rc-panel text-lg md:text-xl flex items-center gap-3 select-none">
          <span className="font-rc-display text-rc-accent-link">Common Sense</span>
          <span className="text-rc-fg-muted">
            {phase === "selecting" &&
              (isCaster
                ? "Select an Ordinary card to put in your hand"
                : `${pending.casterSeat.toUpperCase()} is searching for Ordinary cards...`)}
            {phase === "resolving" && "Resolving..."}
          </span>
          {isCaster && phase === "selecting" && (
            <RcButton
              variant="outline"
              size="xs"
              className="mx-1"
              onClick={handleCancel}
            >
              Cancel
            </RcButton>
          )}
        </div>
      </div>

      {/* Main content area - only for caster */}
      {isCaster && phase === "selecting" && eligibleCards.length > 0 && (
        <div className="fixed inset-0 flex items-center justify-center pointer-events-auto bg-[rgba(6,10,20,0.7)]">
          <div className="thin-scrollbar rounded-rc-lg border border-rc-line/18 bg-[rgba(9,13,25,0.95)] p-6 max-w-4xl w-full mx-4 font-rc-sans text-rc-fg shadow-rc-panel max-h-[90vh] overflow-y-auto">
            <h2 className="mb-2 text-center font-rc-display text-[26px] leading-tight text-rc-fg-strong">
              {eligibleCards.length} Ordinary Card
              {eligibleCards.length !== 1 ? "s" : ""} Found
            </h2>
            <p className="text-rc-fg-muted text-sm mb-6 text-center">
              Click a card to select it for your hand. Your spellbook will be
              shuffled.
            </p>

            {/* Card grid */}
            <CardGrid columns={6}>
              {eligibleCards.map((card, index) => (
                <CardWithPreview
                  key={index}
                  card={card}
                  onClick={() => handleSelectCard(index)}
                  selected={selectedIndex === index}
                  interactive={true}
                  accentColor="orange"
                />
              ))}
            </CardGrid>

            {/* Action buttons */}
            <div className="flex gap-3 justify-center">
              <RcButton variant="outline" onClick={handleCancel}>
                Cancel
              </RcButton>
              <RcButton
                onClick={handleResolve}
                disabled={selectedIndex === null}
              >
                Confirm Selection
              </RcButton>
            </div>
          </div>
        </div>
      )}

      {/* Opponent view - just a waiting indicator */}
      {!isCaster && phase === "selecting" && (
        <div className="fixed bottom-24 inset-x-0 z-[201] pointer-events-none flex justify-center">
          <div className="rc-toast pointer-events-auto">
            <span className="text-rc-accent-link">
              {pending.casterSeat.toUpperCase()}
            </span>{" "}
            is searching their spellbook...
          </div>
        </div>
      )}
    </div>
  );
}
