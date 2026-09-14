"use client";

import Image from "next/image";
import { useEffect, useCallback } from "react";
import { RcButton } from "@/components/ui/rc-button";
import { useGameStore } from "@/lib/game/store";

export function RiverGenesisOverlay() {
  const pending = useGameStore((s) => s.pendingRiverGenesis);
  const actorKey = useGameStore((s) => s.actorKey);
  const currentPlayer = useGameStore((s) => s.currentPlayer);
  const completeRiverGenesis = useGameStore((s) => s.completeRiverGenesis);
  const _cancelRiverGenesis = useGameStore((s) => s.cancelRiverGenesis);

  // Determine if we're the owner (the one who can make the choice)
  const isOwner =
    pending &&
    (actorKey
      ? pending.ownerSeat === actorKey
      : pending.ownerSeat === (currentPlayer === 1 ? "p1" : "p2"));

  const handleKeepOnTop = useCallback(() => {
    completeRiverGenesis("keep");
  }, [completeRiverGenesis]);

  const handleMoveToBottom = useCallback(() => {
    completeRiverGenesis("bottom");
  }, [completeRiverGenesis]);

  // Handle escape key to keep on top (default action)
  useEffect(() => {
    if (!isOwner) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        handleKeepOnTop();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOwner, handleKeepOnTop]);

  if (!pending) return null;

  const { siteName, topSpell } = pending;

  // If we're not the owner, show a waiting message
  if (!isOwner) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(6,10,20,0.9)]">
        <div className="flex flex-col items-center gap-4 font-rc-sans">
          <p className="text-rc-fg-muted text-sm">
            Opponent is looking at their next spell...
          </p>
          <div className="w-48 h-64 rounded-rc-md border border-rc-line/12 bg-black/30 animate-pulse flex items-center justify-center">
            <span className="text-rc-fg-subtle">?</span>
          </div>
        </div>
      </div>
    );
  }

  // No spell to show (should not happen if beginRiverGenesis guards properly)
  if (!topSpell) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(6,10,20,0.9)]">
        <div className="flex flex-col items-center gap-4 font-rc-sans">
          <p className="text-rc-fg-muted text-sm">
            {siteName} Genesis: No spells in spellbook
          </p>
          <RcButton variant="outline" size="sm" onClick={handleKeepOnTop}>
            Close
          </RcButton>
        </div>
      </div>
    );
  }

  // Build the card image URL
  const cardSlug = topSpell.slug;
  const imageUrl = cardSlug
    ? `/api/images/${cardSlug}`
    : "/api/assets/cardback_spellbook.png";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(6,10,20,0.9)]">
      <div className="flex flex-col items-center gap-6 max-w-md font-rc-sans text-rc-fg">
        {/* Title */}
        <div className="text-center">
          <h2 className="font-rc-display text-[18px] leading-tight text-rc-fg-strong">{siteName}</h2>
          <p className="text-rc-fg-muted text-sm mt-1">
            Genesis: Look at your next spell
          </p>
        </div>

        {/* Card display */}
        <div className="relative w-48 h-64 rounded-rc-md overflow-hidden shadow-rc-md ring-1 ring-rc-line/25">
          <Image
            src={imageUrl}
            alt={topSpell.name}
            fill
            className="object-cover"
            unoptimized
          />
        </div>

        {/* Card name */}
        <p className="font-rc-display text-rc-accent-link">{topSpell.name}</p>

        {/* Choice buttons */}
        <div className="flex gap-4">
          <RcButton onClick={handleKeepOnTop}>
            Keep on Top
          </RcButton>
          <RcButton variant="outline" onClick={handleMoveToBottom}>
            Move to Bottom
          </RcButton>
        </div>

        <p className="text-rc-fg-subtle text-xs">Press Esc to keep on top</p>
      </div>
    </div>
  );
}
