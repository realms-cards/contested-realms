"use client";

import Image from "next/image";
import React from "react";
import { RcButton } from "@/components/ui/rc-button";
import { cardbackAtlasUrl } from "@/lib/assets";
import { PLAYER_COLORS } from "@/lib/game/constants";
import { useGameStore } from "@/lib/game/store";

/**
 * PathfinderPlayOverlay - compact panel for the Pathfinder site play ability
 *
 * Pathfinder: Tap → If able, play the topmost site of your atlas to an adjacent location and
 * move there.
 *
 * The topmost site stays FACE DOWN while the player picks the tile: you choose where it goes,
 * then see what lands there. (Showing it here also let the player peek at their atlas and
 * cancel for free.) A small floating panel keeps the board unobstructed.
 */
export default function PathfinderPlayOverlay() {
  const pending = useGameStore((s) => s.pendingPathfinderPlay);
  const actorKey = useGameStore((s) => s.actorKey);
  const cancel = useGameStore((s) => s.cancelPathfinderPlay);

  if (!pending) return null;
  if (pending.phase !== "selectingTarget") return null;

  const { ownerSeat } = pending;

  // Hotseat: actorKey is null, always show owner UI
  // Online: only show owner UI if we're the owner
  const isOwner = actorKey === null || ownerSeat === actorKey;

  // Seat identity colour (P1 blue / P2 red): ring = 50% alpha border
  const seatRingStyle = { borderColor: `${PLAYER_COLORS[ownerSeat]}80` };

  return (
    <div className="fixed left-4 bottom-28 z-[201] pointer-events-auto">
      <div
        className="rounded-rc-lg border border-rc-line/18 bg-[rgba(9,13,25,0.9)] backdrop-blur-sm font-rc-sans text-rc-fg shadow-rc-panel overflow-hidden"
        style={{ width: 207, ...seatRingStyle }}
      >
        {/* The topmost atlas site, face down */}
        <div className="relative w-full aspect-[4/3]">
          <Image
            src={cardbackAtlasUrl()}
            alt="Topmost site of the atlas, face down"
            fill
            className="object-contain rotate-90 scale-[1.333] origin-center"
            unoptimized
          />
        </div>

        {/* Info strip */}
        <div className="px-3 py-2 flex flex-col gap-1">
          <div className="font-rc-display text-rc-accent-link text-sm truncate">
            Topmost site of the atlas
          </div>
          <div className="text-rc-fg-muted text-[11px] leading-tight">
            {isOwner
              ? "Click a highlighted tile"
              : "Opponent selecting target…"}
          </div>
          {isOwner && (
            <RcButton
              variant="outline"
              size="xs"
              onClick={cancel}
              className="mt-1 w-full h-6 px-2"
            >
              Cancel
            </RcButton>
          )}
        </div>
      </div>
    </div>
  );
}
