"use client";

import Image from "next/image";
import React, { useCallback, useRef, useState } from "react";
import { useGameStore } from "@/lib/game/store";
import type {
  CardRef,
  MorganaHandEntry,
  OmphalosHandEntry,
} from "@/lib/game/store/types";
import { useTouchDevice } from "@/lib/hooks/useTouchDevice";

type UnitHand =
  | { kind: "morgana"; entry: MorganaHandEntry }
  | { kind: "omphalos"; entry: OmphalosHandEntry };

type UnitHandsOverlayProps = {
  playerFilter?: "p1" | "p2" | null;
};

export default function UnitHandsOverlay({
  playerFilter,
}: UnitHandsOverlayProps) {
  const morganaHands = useGameStore((s) => s.morganaHands);
  const omphalosHands = useGameStore((s) => s.omphalosHands);
  const actorKey = useGameStore((s) => s.actorKey);
  const isTouchDevice = useTouchDevice();
  const setPendingPrivateHandCast = useGameStore(
    (s) => s.setPendingPrivateHandCast
  );

  const [expanded, setExpanded] = useState<string | null>(null);
  const [selectedCardIndex, setSelectedCardIndex] = useState<number | null>(
    null
  );

  // Combine and filter all unit hands
  const allHands: UnitHand[] = [];

  morganaHands.forEach((m) => {
    const show = playerFilter
      ? m.ownerSeat === playerFilter
      : actorKey === null || m.ownerSeat === actorKey;
    if (show) allHands.push({ kind: "morgana", entry: m });
  });

  omphalosHands.forEach((o) => {
    const show = playerFilter
      ? o.ownerSeat === playerFilter
      : actorKey === null || o.ownerSeat === actorKey;
    if (show) allHands.push({ kind: "omphalos", entry: o });
  });

  const toggleExpand = useCallback((id: string) => {
    setExpanded((prev) => (prev === id ? null : id));
    setSelectedCardIndex(null);
  }, []);

  const handleSelectCard = useCallback((index: number) => {
    setSelectedCardIndex((prev) => (prev === index ? null : index));
  }, []);

  const handleCast = useCallback(
    (unitHand: UnitHand, cardIndex: number) => {
      if (unitHand.kind === "morgana") {
        const morgana = unitHand.entry;
        const card = morgana.hand[cardIndex];
        if (!card) return;
        setPendingPrivateHandCast({
          kind: "morgana",
          handId: morgana.id,
          cardIndex,
          card,
        });
      } else {
        const omphalos = unitHand.entry;
        const card = omphalos.hand[cardIndex];
        if (!card) return;
        const cardType = (card.type || "").toLowerCase();
        const isMinion = cardType.includes("minion");
        setPendingPrivateHandCast({
          kind: "omphalos",
          handId: omphalos.id,
          cardIndex,
          card,
          mustCastAtLocation: isMinion ? omphalos.artifact.at : undefined,
        });
      }
      setSelectedCardIndex(null);
      setExpanded(null);
    },
    [setPendingPrivateHandCast]
  );

  if (allHands.length === 0) return null;

  // On mobile, keep same position but ensure it's under the mana/threshold display
  const positionClass = isTouchDevice
    ? "fixed bottom-20 right-4 z-[15] pointer-events-auto flex flex-col gap-1 items-end"
    : "fixed bottom-32 right-4 z-[15] pointer-events-auto flex flex-col gap-1 items-end";

  return (
    <div className={positionClass}>
      {allHands.map((unitHand) => {
        const id =
          unitHand.kind === "morgana" ? unitHand.entry.id : unitHand.entry.id;
        const isOwner =
          actorKey === null ||
          (unitHand.kind === "morgana"
            ? unitHand.entry.ownerSeat === actorKey
            : unitHand.entry.ownerSeat === actorKey);

        return (
          <UnitHandButton
            key={id}
            unitHand={unitHand}
            expanded={expanded === id}
            onToggleExpand={() => toggleExpand(id)}
            selectedCardIndex={expanded === id ? selectedCardIndex : null}
            onSelectCard={handleSelectCard}
            onCast={(cardIndex) => handleCast(unitHand, cardIndex)}
            isOwner={isOwner}
          />
        );
      })}
    </div>
  );
}

function UnitHandButton({
  unitHand,
  expanded,
  onToggleExpand,
  selectedCardIndex,
  onSelectCard,
  onCast,
  isOwner,
}: {
  unitHand: UnitHand;
  expanded: boolean;
  onToggleExpand: () => void;
  selectedCardIndex: number | null;
  onSelectCard: (index: number) => void;
  onCast: (cardIndex: number) => void;
  isOwner: boolean;
}) {
  const hand =
    unitHand.kind === "morgana" ? unitHand.entry.hand : unitHand.entry.hand;
  const handCount = hand.length;

  // Get card image slug for the source permanent
  const sourceSlug =
    unitHand.kind === "morgana"
      ? unitHand.entry.minion.card.slug ||
        String(unitHand.entry.minion.card.cardId)
      : unitHand.entry.artifact.card.slug ||
        String(unitHand.entry.artifact.card.cardId);

  const sourceName =
    unitHand.kind === "morgana"
      ? unitHand.entry.minion.card.name || "Morgana"
      : unitHand.entry.artifact.card.name || "Omphalos";

  // Color scheme based on type
  const colors =
    unitHand.kind === "morgana"
      ? {
          ring: "ring-purple-500",
          bg: "bg-purple-600",
          text: "text-purple-300",
        }
      : getOmphalosColors(sourceName);

  return (
    <div className="flex flex-col items-end">
      {/* Compact button with card image */}
      <button
        data-omphalos-hand={unitHand.kind === "omphalos" ? unitHand.entry.id : undefined}
        onClick={onToggleExpand}
        className={`flex items-center gap-1.5 p-1 pr-2 rounded-lg transition-all ${
          expanded
            ? `${colors.bg} text-white ring-2 ${colors.ring}`
            : `bg-black/80 text-white/90 hover:bg-black/90 ring-1 ${colors.ring}/50`
        }`}
        title={sourceName}
      >
        {/* Card image thumbnail */}
        <div className="relative w-8 h-10 rounded overflow-hidden flex-shrink-0">
          <Image
            src={`/api/images/${sourceSlug}`}
            alt={sourceName}
            fill
            className="object-cover"
            sizes="32px"
            unoptimized
          />
        </div>
        {/* Card count badge */}
        <span
          className={`px-1.5 py-0.5 rounded-full text-xs font-medium ${
            expanded ? "bg-white/20" : "bg-black/50"
          }`}
        >
          {handCount}
        </span>
      </button>

      {/* Expanded view */}
      {expanded && (
        <div
          className={`mt-1 p-3 bg-black/95 rounded-lg ring-1 ${colors.ring}/50 max-w-xs`}
        >
          <p className={`${colors.text} text-xs mb-2 text-center`}>
            {isOwner
              ? handCount > 0
                ? "Select a card, then cast it"
                : unitHand.kind === "omphalos"
                ? "Will draw at end of turn"
                : "No spells remaining"
              : "Opponent's hand (hidden)"}
          </p>

          {isOwner && handCount > 0 ? (
            <>
              <div className="grid grid-cols-3 gap-2">
                {hand.map((card, index) => (
                  <CardDisplay
                    key={index}
                    card={card}
                    onClick={() => onSelectCard(index)}
                    selected={selectedCardIndex === index}
                    interactive={true}
                    ringColor={colors.ring}
                  />
                ))}
              </div>

              {selectedCardIndex !== null && (
                <div className="mt-3 flex justify-center">
                  <button
                    onClick={() => onCast(selectedCardIndex)}
                    className={`px-3 py-1.5 ${colors.bg} hover:brightness-110 text-white text-sm font-medium rounded-lg transition-colors`}
                  >
                    Cast {hand[selectedCardIndex]?.name || "Card"}
                  </button>
                </div>
              )}
            </>
          ) : isOwner ? (
            <p className="text-white/50 text-sm text-center py-2">
              {unitHand.kind === "omphalos" ? "Draws at end of turn" : "Empty"}
            </p>
          ) : (
            <div className="flex justify-center gap-1 py-2">
              {Array.from({ length: handCount }).map((_, i) => (
                <div
                  key={i}
                  className={`w-8 h-10 bg-black/50 rounded border ${colors.ring}/30`}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function getOmphalosColors(name: string) {
  const nameLower = name.toLowerCase();
  if (nameLower.includes("algor"))
    return { ring: "ring-cyan-400", bg: "bg-cyan-600", text: "text-cyan-300" };
  if (nameLower.includes("char"))
    return {
      ring: "ring-orange-400",
      bg: "bg-orange-600",
      text: "text-orange-300",
    };
  if (nameLower.includes("dank"))
    return { ring: "ring-teal-400", bg: "bg-teal-600", text: "text-teal-300" };
  if (nameLower.includes("torrid"))
    return { ring: "ring-red-400", bg: "bg-red-600", text: "text-red-300" };
  return { ring: "ring-amber-400", bg: "bg-amber-600", text: "text-amber-300" };
}

function CardDisplay({
  card,
  onClick,
  selected,
  interactive,
  ringColor,
}: {
  card: CardRef;
  onClick?: () => void;
  selected: boolean;
  interactive: boolean;
  ringColor: string;
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
      className={`relative aspect-[2.5/3.5] rounded overflow-hidden transition-all ${
        interactive
          ? `cursor-pointer hover:scale-105 hover:ring-2 hover:${ringColor}`
          : ""
      } ${selected ? `ring-2 ${ringColor} scale-105` : ""}`}
    >
      <Image
        src={`/api/images/${card.slug || card.cardId}`}
        alt={card.name || "Card"}
        fill
        className="object-cover"
        unoptimized
      />
      <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/90 to-transparent p-0.5">
        <p className="text-white text-[9px] text-center truncate">
          {card.name}
        </p>
      </div>
      {selected && (
        <div className="absolute inset-0 bg-white/10 flex items-center justify-center">
          <div className="bg-white text-black font-bold px-1 py-0.5 rounded text-[9px]">
            ✓
          </div>
        </div>
      )}
    </div>
  );
}
