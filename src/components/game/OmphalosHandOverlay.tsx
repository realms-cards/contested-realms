"use client";

import Image from "next/image";
import React, { useCallback, useRef, useState } from "react";
import { useGameStore } from "@/lib/game/store";
import type { CardRef, OmphalosHandEntry } from "@/lib/game/store/types";

type OmphalosHandOverlayProps = {
  // Optional: filter to show only this player's Omphalos hands
  playerFilter?: "p1" | "p2" | null;
};

export default function OmphalosHandOverlay({
  playerFilter,
}: OmphalosHandOverlayProps) {
  const omphalosHands = useGameStore((s) => s.omphalosHands);
  const actorKey = useGameStore((s) => s.actorKey);
  const setPendingPrivateHandCast = useGameStore(
    (s) => s.setPendingPrivateHandCast
  );

  const [expanded, setExpanded] = useState<string | null>(null);
  const [selectedCardIndex, setSelectedCardIndex] = useState<number | null>(
    null
  );

  // Filter hands based on player
  const visibleHands = omphalosHands.filter((o) => {
    if (playerFilter) return o.ownerSeat === playerFilter;
    // In hotseat mode, show all; in online mode, show only player's own
    if (actorKey === null) return true;
    return o.ownerSeat === actorKey;
  });

  // Toggle expanded view for an Omphalos hand
  const toggleExpand = useCallback((id: string) => {
    setExpanded((prev) => (prev === id ? null : id));
    setSelectedCardIndex(null);
  }, []);

  // Select a card from Omphalos's hand
  const handleSelectCard = useCallback((index: number) => {
    setSelectedCardIndex((prev) => (prev === index ? null : index));
  }, []);

  // Begin casting the selected card - puts player in targeting mode
  // For Omphalos, minions MUST be summoned at the Omphalos location
  const handleCast = useCallback(
    (omphalos: OmphalosHandEntry, cardIndex: number) => {
      const card = omphalos.hand[cardIndex];
      if (!card) return;

      const cardType = (card.type || "").toLowerCase();
      const isMinion = cardType.includes("minion");

      // Set pending cast - player must now click a tile to complete
      // For minions, they must be cast at the Omphalos location
      setPendingPrivateHandCast({
        kind: "omphalos",
        handId: omphalos.id,
        cardIndex,
        card,
        mustCastAtLocation: isMinion ? omphalos.artifact.at : undefined,
      });
      setSelectedCardIndex(null);
      setExpanded(null);
    },
    [setPendingPrivateHandCast]
  );

  if (visibleHands.length === 0) return null;

  return (
    <div className="fixed bottom-32 right-4 z-[15] pointer-events-auto">
      {visibleHands.map((omphalos) => (
        <OmphalosHandCard
          key={omphalos.id}
          omphalos={omphalos}
          expanded={expanded === omphalos.id}
          onToggleExpand={() => toggleExpand(omphalos.id)}
          selectedCardIndex={
            expanded === omphalos.id ? selectedCardIndex : null
          }
          onSelectCard={handleSelectCard}
          onCast={(cardIndex) => handleCast(omphalos, cardIndex)}
          isOwner={actorKey === null || omphalos.ownerSeat === actorKey}
        />
      ))}
    </div>
  );
}

// Individual Omphalos hand card component
function OmphalosHandCard({
  omphalos,
  expanded,
  onToggleExpand,
  selectedCardIndex,
  onSelectCard,
  onCast,
  isOwner,
}: {
  omphalos: OmphalosHandEntry;
  expanded: boolean;
  onToggleExpand: () => void;
  selectedCardIndex: number | null;
  onSelectCard: (index: number) => void;
  onCast: (cardIndex: number) => void;
  isOwner: boolean;
}) {
  const handCount = omphalos.hand.length;
  const artifactName = omphalos.artifact.card.name || "Omphalos";

  // Determine color based on Omphalos type
  const getOmphalosColor = (name: string) => {
    const nameLower = name.toLowerCase();
    if (nameLower.includes("algor"))
      return {
        bg: "bg-cyan-600",
        ring: "ring-cyan-400",
        text: "text-cyan-300",
      };
    if (nameLower.includes("char"))
      return {
        bg: "bg-orange-600",
        ring: "ring-orange-400",
        text: "text-orange-300",
      };
    if (nameLower.includes("dank"))
      return {
        bg: "bg-teal-600",
        ring: "ring-teal-400",
        text: "text-teal-300",
      };
    if (nameLower.includes("torrid"))
      return { bg: "bg-red-600", ring: "ring-red-400", text: "text-red-300" };
    return {
      bg: "bg-amber-600",
      ring: "ring-amber-400",
      text: "text-amber-300",
    };
  };

  const colors = getOmphalosColor(artifactName);

  return (
    <div className="mb-2">
      {/* Collapsed view - just a button showing card count */}
      <button
        onClick={onToggleExpand}
        className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-all ${
          expanded
            ? `${colors.bg} text-white ring-2 ${colors.ring}`
            : `bg-black/80 text-white/90 hover:bg-black/90 ring-1 ${colors.ring}/50`
        }`}
      >
        <span className={colors.text}>🔮</span>
        <span className="font-medium text-sm">{artifactName}</span>
        <span
          className={`px-2 py-0.5 rounded-full text-xs ${
            expanded ? `${colors.bg} brightness-75` : "bg-black/50"
          }`}
        >
          {handCount}
        </span>
      </button>

      {/* Expanded view - show the cards */}
      {expanded && (
        <div
          className={`mt-2 p-3 bg-black/95 rounded-lg ring-1 ${colors.ring}/50 max-w-md`}
        >
          <p className={`${colors.text} text-xs mb-2 text-center`}>
            {isOwner
              ? handCount > 0
                ? "Click a spell to select, then cast it (minions summoned at Omphalos)"
                : "No spells yet - will draw at end of turn"
              : "Opponent's Omphalos hand (hidden)"}
          </p>

          {isOwner && handCount > 0 ? (
            <>
              <div className="grid grid-cols-3 gap-2">
                {omphalos.hand.map((card, index) => (
                  <CardDisplay
                    key={index}
                    card={card}
                    onClick={() => onSelectCard(index)}
                    selected={selectedCardIndex === index}
                    interactive={true}
                    accentColor={colors.ring}
                  />
                ))}
              </div>

              {selectedCardIndex !== null && (
                <div className="mt-3 flex justify-center">
                  <button
                    onClick={() => onCast(selectedCardIndex)}
                    className={`px-4 py-2 ${colors.bg} hover:brightness-110 text-white font-medium rounded-lg transition-colors`}
                  >
                    Cast{" "}
                    {omphalos.hand[selectedCardIndex]?.name || "Selected Spell"}
                  </button>
                </div>
              )}
            </>
          ) : isOwner ? (
            <p className="text-white/50 text-sm text-center py-4">
              Omphalos will draw a spell at end of turn
            </p>
          ) : (
            <div className="flex justify-center gap-2 py-2">
              {Array.from({ length: handCount }).map((_, i) => (
                <div
                  key={i}
                  className={`w-12 h-16 bg-black/50 rounded border ${colors.ring}/30`}
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
  accentColor,
}: {
  card: CardRef;
  onClick?: () => void;
  selected: boolean;
  interactive: boolean;
  accentColor: string;
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
          ? `cursor-pointer hover:scale-105 hover:ring-2 hover:${accentColor}`
          : ""
      } ${selected ? `ring-2 ${accentColor} scale-105` : ""}`}
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
        <div className="absolute inset-0 bg-white/10 flex items-center justify-center">
          <div className="bg-white text-black font-bold px-1 py-0.5 rounded text-[10px]">
            ✓
          </div>
        </div>
      )}
    </div>
  );
}
