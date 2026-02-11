"use client";

import Image from "next/image";
import React, { useMemo, useState } from "react";
import { useGameStore } from "@/lib/game/store";
import { getImageSlug } from "@/lib/utils/cardSlug";

/**
 * PathfinderPlayOverlay - Compact card preview for Pathfinder site play ability
 *
 * Pathfinder: Tap → Reveal and play the topmost site of your atlas
 * to an adjacent void or Rubble and move there.
 *
 * Shows a small floating card preview so the board stays unobstructed
 * while the player selects a target tile.
 */
export default function PathfinderPlayOverlay() {
  const pending = useGameStore((s) => s.pendingPathfinderPlay);
  const actorKey = useGameStore((s) => s.actorKey);
  const cancel = useGameStore((s) => s.cancelPathfinderPlay);
  const [imageError, setImageError] = useState(false);

  // Compute card image URL
  const cardImageUrl = useMemo(() => {
    if (!pending?.topSite) return null;
    const site = pending.topSite;
    const slug = getImageSlug(site.slug, site.name);
    return `/api/images/${encodeURIComponent(slug)}`;
  }, [pending?.topSite]);

  if (!pending) return null;
  if (pending.phase !== "selectingTarget") return null;

  const { ownerSeat, topSite } = pending;

  // Hotseat: actorKey is null, always show owner UI
  // Online: only show owner UI if we're the owner
  const isOwner = actorKey === null || ownerSeat === actorKey;

  const accentColor =
    ownerSeat === "p2" ? "ring-red-500/60" : "ring-blue-500/60";
  const btnClass =
    ownerSeat === "p2"
      ? "bg-red-900/60 hover:bg-red-800/60 text-red-200"
      : "bg-blue-900/60 hover:bg-blue-800/60 text-blue-200";
  const playerBgClass = ownerSeat === "p2" ? "bg-red-900/30" : "bg-blue-900/30";

  return (
    <div className="fixed left-4 bottom-28 z-[201] pointer-events-auto">
      <div
        className={`rounded-xl bg-black/85 backdrop-blur-sm ring-1 ${accentColor} shadow-2xl overflow-hidden`}
        style={{ width: 180 }}
      >
        {/* Card image — large preview */}
        <div className="relative w-full">
          {cardImageUrl && !imageError ? (
            <Image
              src={cardImageUrl}
              alt={topSite?.name || "Site"}
              width={180}
              height={130}
              className="w-full h-auto object-cover"
              onError={() => setImageError(true)}
              unoptimized
            />
          ) : (
            <div
              className={`w-full aspect-[7/5] ${playerBgClass} flex items-center justify-center`}
            >
              <span className="text-amber-400 font-medium text-sm text-center px-3">
                {topSite?.name || "Unknown"}
              </span>
            </div>
          )}
        </div>

        {/* Info strip */}
        <div className="px-3 py-2 flex flex-col gap-1">
          <div className="text-amber-400 font-medium text-sm truncate">
            {topSite?.name || "Unknown"}
          </div>
          <div className="text-gray-400 text-[11px] leading-tight">
            {isOwner
              ? "Click a highlighted tile"
              : "Opponent selecting target\u2026"}
          </div>
          {isOwner && (
            <button
              onClick={cancel}
              className={`mt-1 w-full px-2 py-1 rounded-lg ${btnClass} text-xs font-medium transition-colors`}
            >
              Cancel
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
