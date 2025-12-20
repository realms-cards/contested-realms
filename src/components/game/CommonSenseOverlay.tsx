"use client";

import Image from "next/image";
import React, { useState, useCallback } from "react";
import { useGameStore } from "@/lib/game/store";
import type { CardRef } from "@/lib/game/store/types";

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
        <div className="pointer-events-auto px-5 py-3 rounded-full bg-black/90 text-white ring-1 ring-amber-500/50 shadow-lg text-lg md:text-xl flex items-center gap-3 select-none">
          <span className="text-amber-400 font-fantaisie">🔍 Common Sense</span>
          <span className="opacity-80">
            {phase === "selecting" &&
              (isCaster
                ? "Select an Ordinary card to put in your hand"
                : `${pending.casterSeat.toUpperCase()} is searching for Ordinary cards...`)}
            {phase === "resolving" && "Resolving..."}
          </span>
          {isCaster && phase === "selecting" && (
            <button
              className="mx-1 rounded bg-white/15 hover:bg-white/25 px-3 py-1 select-none"
              onClick={handleCancel}
            >
              Cancel
            </button>
          )}
        </div>
      </div>

      {/* Main content area - only for caster */}
      {isCaster && phase === "selecting" && eligibleCards.length > 0 && (
        <div className="fixed inset-0 flex items-center justify-center pointer-events-auto bg-black/70">
          <div className="bg-black/95 rounded-xl p-6 max-w-4xl w-full mx-4 ring-1 ring-amber-500/30 max-h-[90vh] overflow-y-auto">
            <h2 className="text-2xl font-fantaisie text-amber-400 mb-2 text-center">
              {eligibleCards.length} Ordinary Card
              {eligibleCards.length !== 1 ? "s" : ""} Found
            </h2>
            <p className="text-white/70 text-sm mb-6 text-center">
              Click a card to select it for your hand. Your spellbook will be
              shuffled.
            </p>

            {/* Card grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 mb-6">
              {eligibleCards.map((card, index) => (
                <CardDisplay
                  key={index}
                  card={card}
                  onClick={() => handleSelectCard(index)}
                  selected={selectedIndex === index}
                  interactive={true}
                />
              ))}
            </div>

            {/* Action buttons */}
            <div className="flex gap-3 justify-center">
              <button
                className="px-6 py-3 rounded-lg bg-white/10 hover:bg-white/20 text-white/80 font-medium transition-colors"
                onClick={handleCancel}
              >
                Cancel
              </button>
              <button
                className="px-6 py-3 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                onClick={handleResolve}
                disabled={selectedIndex === null}
              >
                Confirm Selection
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Opponent view - just a waiting indicator */}
      {!isCaster && phase === "selecting" && (
        <div className="fixed bottom-24 inset-x-0 z-[201] pointer-events-none flex justify-center">
          <div className="pointer-events-auto px-4 py-2 rounded-lg bg-black/90 text-white/80 text-sm ring-1 ring-amber-500/30">
            <span className="text-amber-300">
              {pending.casterSeat.toUpperCase()}
            </span>{" "}
            is searching their spellbook...
          </div>
        </div>
      )}
    </div>
  );
}

// Card display component
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
  return (
    <div
      onClick={interactive ? onClick : undefined}
      className={`relative aspect-[2.5/3.5] rounded-lg overflow-hidden transition-all ${
        interactive
          ? "cursor-pointer hover:scale-105 hover:ring-2 hover:ring-amber-400"
          : ""
      } ${selected ? "ring-2 ring-amber-500 scale-105" : ""}`}
    >
      <Image
        src={`/api/images/${card.slug || card.cardId}`}
        alt={card.name || "Card"}
        fill
        className="object-cover"
        unoptimized
      />
      {/* Card name overlay */}
      <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/90 to-transparent p-2">
        <p className="text-white text-xs text-center truncate">{card.name}</p>
      </div>
      {/* Selected indicator */}
      {selected && (
        <div className="absolute inset-0 bg-amber-500/20 flex items-center justify-center">
          <div className="bg-amber-500 text-black font-bold px-2 py-1 rounded text-xs">
            SELECTED
          </div>
        </div>
      )}
    </div>
  );
}
