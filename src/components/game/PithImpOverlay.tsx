"use client";

import Image from "next/image";
import React, { useCallback, useState, useEffect } from "react";
import { useGameStore } from "@/lib/game/store";
import type { PithImpHandEntry } from "@/lib/game/store/types";

type NotificationData = {
  stolenCard: PithImpHandEntry["hand"][0] | null;
  ownerSeat: PithImpHandEntry["ownerSeat"];
  victimSeat: PithImpHandEntry["victimSeat"];
};

export default function PithImpOverlay() {
  const pithImpHands = useGameStore((s) => s.pithImpHands);
  const actorKey = useGameStore((s) => s.actorKey);

  // Track newly stolen cards to show notification
  const [notification, setNotification] = useState<NotificationData | null>(
    null
  );
  const [prevHandsCount, setPrevHandsCount] = useState(0);

  // Show notification when a new card is stolen
  useEffect(() => {
    if (pithImpHands.length > prevHandsCount) {
      // New card was stolen - show notification for the newest one
      const newest = pithImpHands[pithImpHands.length - 1];
      if (newest) {
        setNotification({
          stolenCard: newest.hand[0] || null,
          ownerSeat: newest.ownerSeat,
          victimSeat: newest.victimSeat,
        });
        // Auto-dismiss after 4 seconds
        const timer = setTimeout(() => setNotification(null), 4000);
        return () => clearTimeout(timer);
      }
    }
    setPrevHandsCount(pithImpHands.length);
    return undefined;
  }, [pithImpHands, prevHandsCount]);

  const dismissNotification = useCallback(() => {
    setNotification(null);
  }, []);

  // Determine if current player is the owner or victim
  const isOwner = notification?.ownerSeat === actorKey;
  const isVictim = notification?.victimSeat === actorKey;

  if (!notification) return null;

  const hasCard = notification.stolenCard !== null;

  return (
    <div className="fixed inset-0 z-[200] pointer-events-none flex items-center justify-center">
      <div
        className="pointer-events-auto bg-black/95 rounded-xl p-6 shadow-2xl border-2 border-purple-500/50 max-w-sm animate-in fade-in zoom-in duration-300"
        onClick={dismissNotification}
      >
        {/* Header */}
        <div className="flex items-center gap-3 mb-4">
          <span className="text-3xl">🦇</span>
          <div>
            <h3 className="text-purple-300 font-bold text-lg">
              {hasCard ? "Pith Imp Steals!" : "Pith Imp Enters"}
            </h3>
            <p className="text-white/70 text-sm">
              {hasCard
                ? isOwner
                  ? "You stole a card from your opponent!"
                  : isVictim
                  ? "Your opponent stole a card from you!"
                  : `${notification.ownerSeat.toUpperCase()} stole from ${notification.victimSeat.toUpperCase()}`
                : isOwner
                ? "No spells to steal from opponent's hand"
                : "No spells in your hand to steal"}
            </p>
          </div>
        </div>

        {/* Card display - both owner and victim see the card */}
        {hasCard && notification.stolenCard && (
          <div className="flex justify-center mb-4">
            <div className="relative w-32 aspect-[2.5/3.5] rounded-lg overflow-hidden ring-2 ring-purple-400 shadow-lg">
              <Image
                src={`/api/images/${
                  notification.stolenCard.slug || notification.stolenCard.cardId
                }`}
                alt={notification.stolenCard.name || "Stolen Card"}
                fill
                className="object-cover"
                unoptimized
              />
              <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/90 to-transparent p-2">
                <p className="text-white text-xs text-center font-medium truncate">
                  {notification.stolenCard.name}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Info text */}
        <p className="text-white/60 text-xs text-center">
          {hasCard
            ? isOwner
              ? "This card is hidden under your Pith Imp. It will return to your opponent if the Imp leaves the realm."
              : isVictim
              ? "Your card is hidden under the opponent's Pith Imp. It will return when the Imp leaves the realm."
              : "Click to dismiss"
            : "The Pith Imp enters the realm but finds no spells to steal."}
        </p>

        {/* Dismiss hint */}
        <p className="text-purple-400/50 text-xs text-center mt-3">
          Click anywhere to dismiss
        </p>
      </div>
    </div>
  );
}

// Compact indicator for permanents with stolen cards underneath
export function StolenCardIndicator({
  minionInstanceId,
  minionAt,
}: {
  minionInstanceId: string | null;
  minionAt: string;
}) {
  const pithImpHands = useGameStore((s) => s.pithImpHands);
  const actorKey = useGameStore((s) => s.actorKey);

  // Find stolen cards for this minion
  const stolen = pithImpHands.filter(
    (h) =>
      h.minion.at === minionAt ||
      (minionInstanceId && h.minion.instanceId === minionInstanceId)
  );

  if (stolen.length === 0) return null;

  const isOwner = stolen[0]?.ownerSeat === actorKey || actorKey === null;
  const totalCards = stolen.reduce((sum, h) => sum + h.hand.length, 0);

  return (
    <div className="absolute -bottom-2 -right-2 z-10">
      <div className="relative">
        {/* Stacked card backs indicator */}
        <div className="w-6 h-8 rounded bg-gradient-to-br from-purple-700 to-purple-900 border border-purple-400 shadow-lg flex items-center justify-center">
          <span className="text-xs">🔮</span>
        </div>
        {/* Count badge */}
        {totalCards > 1 && (
          <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-purple-500 text-white text-[10px] flex items-center justify-center font-bold">
            {totalCards}
          </div>
        )}
        {/* Tooltip on hover */}
        <div className="absolute bottom-full right-0 mb-1 hidden group-hover:block">
          <div className="bg-black/90 text-white text-xs px-2 py-1 rounded whitespace-nowrap">
            {isOwner
              ? `Stolen: ${stolen
                  .flatMap((h) => h.hand)
                  .map((c) => c.name)
                  .join(", ")}`
              : `${totalCards} hidden card${totalCards > 1 ? "s" : ""}`}
          </div>
        </div>
      </div>
    </div>
  );
}
