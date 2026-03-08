"use client";

import Image from "next/image";
import React, { useCallback, useRef, useState } from "react";
import { useGameStore } from "@/lib/game/store";
import type { CardRef, MorganaHandEntry } from "@/lib/game/store/types";

type MorganaHandOverlayProps = {
  // Optional: filter to show only this player's Morgana hands
  playerFilter?: "p1" | "p2" | null;
};

export default function MorganaHandOverlay({
  playerFilter,
}: MorganaHandOverlayProps) {
  const morganaHands = useGameStore((s) => s.morganaHands);
  const actorKey = useGameStore((s) => s.actorKey);
  const setPendingPrivateHandCast = useGameStore(
    (s) => s.setPendingPrivateHandCast
  );

  const [expanded, setExpanded] = useState<string | null>(null);
  const [selectedCardIndex, setSelectedCardIndex] = useState<number | null>(
    null
  );

  // Filter hands based on player
  const visibleHands = morganaHands.filter((m) => {
    if (playerFilter) return m.ownerSeat === playerFilter;
    // In hotseat mode, show all; in online mode, show only player's own
    if (actorKey === null) return true;
    return m.ownerSeat === actorKey;
  });

  // Toggle expanded view for a Morgana hand
  const toggleExpand = useCallback((id: string) => {
    setExpanded((prev) => (prev === id ? null : id));
    setSelectedCardIndex(null);
  }, []);

  // Select a card from Morgana's hand
  const handleSelectCard = useCallback((index: number) => {
    setSelectedCardIndex((prev) => (prev === index ? null : index));
  }, []);

  // Begin casting the selected card - puts player in targeting mode
  const handleCast = useCallback(
    (morgana: MorganaHandEntry, cardIndex: number) => {
      const card = morgana.hand[cardIndex];
      if (!card) return;

      // Set pending cast - player must now click a tile to complete
      setPendingPrivateHandCast({
        kind: "morgana",
        handId: morgana.id,
        cardIndex,
        card,
      });
      setSelectedCardIndex(null);
      setExpanded(null);
    },
    [setPendingPrivateHandCast]
  );

  if (visibleHands.length === 0) return null;

  return (
    <div className="fixed bottom-32 right-4 z-[15] pointer-events-auto">
      {visibleHands.map((morgana) => (
        <MorganaHandCard
          key={morgana.id}
          morgana={morgana}
          expanded={expanded === morgana.id}
          onToggleExpand={() => toggleExpand(morgana.id)}
          selectedCardIndex={expanded === morgana.id ? selectedCardIndex : null}
          onSelectCard={handleSelectCard}
          onCast={(cardIndex) => handleCast(morgana, cardIndex)}
          isOwner={actorKey === null || morgana.ownerSeat === actorKey}
        />
      ))}
    </div>
  );
}

// Individual Morgana hand card component
function MorganaHandCard({
  morgana,
  expanded,
  onToggleExpand,
  selectedCardIndex,
  onSelectCard,
  onCast,
  isOwner,
}: {
  morgana: MorganaHandEntry;
  expanded: boolean;
  onToggleExpand: () => void;
  selectedCardIndex: number | null;
  onSelectCard: (index: number) => void;
  onCast: (cardIndex: number) => void;
  isOwner: boolean;
}) {
  const handCount = morgana.hand.length;

  return (
    <div className="mb-2">
      {/* Collapsed view - just a button showing card count */}
      <button
        onClick={onToggleExpand}
        className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-all ${
          expanded
            ? "bg-purple-600 text-white ring-2 ring-purple-400"
            : "bg-black/80 text-white/90 hover:bg-black/90 ring-1 ring-purple-500/50"
        }`}
      >
        <span className="text-purple-300">&#x2726;</span>
        <span className="font-medium">Morgana&apos;s Hand</span>
        <span
          className={`px-2 py-0.5 rounded-full text-sm ${
            expanded ? "bg-purple-800" : "bg-purple-900/50"
          }`}
        >
          {handCount}
        </span>
      </button>

      {/* Expanded view - show the cards */}
      {expanded && (
        <div className="mt-2 p-3 bg-black/95 rounded-lg ring-1 ring-purple-500/50 max-w-md">
          <p className="text-purple-300 text-xs mb-2 text-center">
            {isOwner
              ? "Click a spell to select, then cast it"
              : "Opponent's Morgana hand (hidden)"}
          </p>

          {isOwner && handCount > 0 ? (
            <>
              <div className="grid grid-cols-3 gap-2">
                {morgana.hand.map((card, index) => (
                  <CardDisplay
                    key={index}
                    card={card}
                    onClick={() => onSelectCard(index)}
                    selected={selectedCardIndex === index}
                    interactive={true}
                  />
                ))}
              </div>

              {selectedCardIndex !== null && (
                <div className="mt-3 flex justify-center">
                  <button
                    onClick={() => onCast(selectedCardIndex)}
                    className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white font-medium rounded-lg transition-colors"
                  >
                    Cast{" "}
                    {morgana.hand[selectedCardIndex]?.name || "Selected Spell"}
                  </button>
                </div>
              )}
            </>
          ) : isOwner ? (
            <p className="text-white/50 text-sm text-center py-4">
              No spells remaining
            </p>
          ) : (
            <div className="flex justify-center gap-2 py-2">
              {Array.from({ length: handCount }).map((_, i) => (
                <div
                  key={i}
                  className="w-12 h-16 bg-purple-900/50 rounded border border-purple-500/30"
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Card display component with hover preview
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
          ? "cursor-pointer hover:scale-105 hover:ring-2 hover:ring-purple-400"
          : ""
      } ${selected ? "ring-2 ring-purple-500 scale-105" : ""}`}
    >
      <Image
        src={`/api/images/${card.slug || card.cardId}`}
        alt={card.name || "Card"}
        fill
        className="object-cover"
        unoptimized
      />
      {/* Card name overlay */}
      <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/90 to-transparent p-1">
        <p className="text-white text-[10px] text-center truncate">
          {card.name}
        </p>
      </div>
      {/* Selected indicator */}
      {selected && (
        <div className="absolute inset-0 bg-purple-500/20 flex items-center justify-center">
          <div className="bg-purple-500 text-white font-bold px-1 py-0.5 rounded text-[10px]">
            ✓
          </div>
        </div>
      )}
    </div>
  );
}
