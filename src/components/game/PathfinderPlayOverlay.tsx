"use client";

import Image from "next/image";
import React, { useMemo, useState } from "react";
import CardPreview from "@/components/game/CardPreview";
import { RcButton } from "@/components/ui/rc-button";
import { cardRefToPreview } from "@/lib/game/card-preview.types";
import { PLAYER_COLORS } from "@/lib/game/constants";
import { useGameStore } from "@/lib/game/store";
import { getImageSlug } from "@/lib/utils/cardSlug";

/**
 * PathfinderPlayOverlay - Compact card preview for Pathfinder site play ability
 *
 * Pathfinder: Tap → Reveal and play the topmost site of your atlas
 * to an adjacent void or Rubble and move there.
 *
 * Shows a small floating card preview so the board stays unobstructed
 * while the player selects a target tile. Hover the card image for a
 * full-size readable preview.
 */
export default function PathfinderPlayOverlay() {
  const pending = useGameStore((s) => s.pendingPathfinderPlay);
  const actorKey = useGameStore((s) => s.actorKey);
  const cancel = useGameStore((s) => s.cancelPathfinderPlay);
  const [imageError, setImageError] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  // Compute card image URL
  const cardImageUrl = useMemo(() => {
    if (!pending?.topSite) return null;
    const site = pending.topSite;
    const slug = getImageSlug(site.slug, site.name);
    return `/api/images/${encodeURIComponent(slug)}`;
  }, [pending?.topSite]);

  // Full-size preview data (must be before early returns to satisfy Rules of Hooks)
  const previewData = useMemo(
    () => (pending?.topSite ? cardRefToPreview(pending.topSite) : null),
    [pending?.topSite],
  );

  if (!pending) return null;
  if (pending.phase !== "selectingTarget") return null;

  const { ownerSeat, topSite } = pending;

  // Hotseat: actorKey is null, always show owner UI
  // Online: only show owner UI if we're the owner
  const isOwner = actorKey === null || ownerSeat === actorKey;

  // Seat identity colour (P1 blue / P2 red): ring = 50% alpha border
  const seatRingStyle = { borderColor: `${PLAYER_COLORS[ownerSeat]}80` };

  return (
    <>
      {/* Full-size card preview on hover */}
      {isHovered && (
        <CardPreview card={previewData} anchor="top-right" zIndexClass="z-[200]" />
      )}

      <div className="fixed left-4 bottom-28 z-[201] pointer-events-auto">
      <div
        className="rounded-rc-lg border border-rc-line/18 bg-[rgba(9,13,25,0.9)] backdrop-blur-sm font-rc-sans text-rc-fg shadow-rc-panel overflow-hidden"
        style={{ width: 207, ...seatRingStyle }}
      >
        {/* Card image — landscape preview (sites are stored portrait, rotated 90°) */}
        <div
          className="relative w-full aspect-[4/3]"
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
        >
          {cardImageUrl && !imageError ? (
            <Image
              src={cardImageUrl}
              alt={topSite?.name || "Site"}
              fill
              className="object-contain rotate-90 scale-[1.333] origin-center"
              onError={() => setImageError(true)}
              unoptimized
            />
          ) : (
            <div
              className="w-full h-full bg-black/30 flex items-center justify-center"
            >
              <span className="font-rc-display text-rc-fg text-sm text-center px-3">
                {topSite?.name || "Unknown"}
              </span>
            </div>
          )}
        </div>

        {/* Info strip */}
        <div className="px-3 py-2 flex flex-col gap-1">
          <div className="font-rc-display text-rc-accent-link text-sm truncate">
            {topSite?.name || "Unknown"}
          </div>
          <div className="text-rc-fg-muted text-[11px] leading-tight">
            {isOwner
              ? "Click a highlighted tile"
              : "Opponent selecting target\u2026"}
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
    </>
  );
}
