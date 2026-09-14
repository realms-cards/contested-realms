"use client";

import Image from "next/image";
import React, { useMemo, useState } from "react";
import CardPreview from "@/components/game/CardPreview";
import { RcButton } from "@/components/ui/rc-button";
import { cardRefToPreview } from "@/lib/game/card-preview.types";
import { useGameStore } from "@/lib/game/store";
import { getImageSlug } from "@/lib/utils/cardSlug";

/**
 * GeomancerOverlay — compact floating panel for Geomancer abilities.
 *
 * Ability 2: Shows the topmost atlas site. Player clicks highlighted Rubble tiles.
 * Ability 1: After playing an earth site, player clicks highlighted void tiles.
 *
 * Modeled after PathfinderPlayOverlay — landscape card image, hover preview,
 * tile selection via 3D board highlights (GeomancerTargetOverlay).
 */
export default function GeomancerOverlay() {
  const pending = useGameStore((s) => s.pendingGeomancerPlay);
  const pendingFill = useGameStore((s) => s.pendingGeomancerFill);
  const actorKey = useGameStore((s) => s.actorKey);
  const cancel = useGameStore((s) => s.cancelGeomancerPlay);
  const cancelFill = useGameStore((s) => s.cancelGeomancerFill);
  const [imageError, setImageError] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  // Compute card image URL (only for ability 2 which has a topSite)
  const cardImageUrl = useMemo(() => {
    if (!pending?.topSite) return null;
    const site = pending.topSite;
    const slug = getImageSlug(site.slug, site.name);
    return `/api/images/${encodeURIComponent(slug)}`;
  }, [pending?.topSite]);

  // Full-size preview data (must be before early returns for Rules of Hooks)
  const previewData = useMemo(
    () => (pending?.topSite ? cardRefToPreview(pending.topSite) : null),
    [pending?.topSite],
  );

  // ── Ability 1: Fill void with Rubble ──────────────────────────────────────
  if (pendingFill) {
    const { ownerSeat } = pendingFill;
    const isOwner = actorKey === null || ownerSeat === actorKey;

    return (
      <div className="fixed left-4 bottom-28 z-[201] pointer-events-auto">
        <div
          className="rounded-rc-lg border border-rc-line/18 bg-[rgba(9,13,25,0.9)] backdrop-blur-sm font-rc-sans text-rc-fg shadow-rc-panel overflow-hidden"
          style={{ width: 207 }}
        >
          <div className="px-3 py-2 flex flex-col gap-1">
            <div className="font-rc-display text-rc-accent-link text-sm">
              Geomancer — Fill Void
            </div>
            <div className="text-rc-fg-muted text-[11px] leading-tight">
              {isOwner
                ? "Click a highlighted tile to place Rubble"
                : `${ownerSeat.toUpperCase()} is filling a void with Rubble\u2026`}
            </div>
            {isOwner && (
              <RcButton
                variant="outline"
                size="xs"
                onClick={cancelFill}
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

  // ── Ability 2: Replace Rubble with atlas site ─────────────────────────────
  if (!pending) return null;
  if (pending.phase !== "selectingTarget") return null;

  const { ownerSeat, topSite } = pending;
  const isOwner = actorKey === null || ownerSeat === actorKey;

  return (
    <>
      {/* Full-size card preview on hover */}
      {isHovered && (
        <CardPreview card={previewData} anchor="top-right" zIndexClass="z-[200]" />
      )}

      <div className="fixed left-4 bottom-28 z-[201] pointer-events-auto">
        <div
          className="rounded-rc-lg border border-rc-line/18 bg-[rgba(9,13,25,0.9)] backdrop-blur-sm font-rc-sans text-rc-fg shadow-rc-panel overflow-hidden"
          style={{ width: 207 }}
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
              <div className="w-full h-full bg-black/30 flex items-center justify-center">
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
                ? "Click a highlighted Rubble tile"
                : `${ownerSeat.toUpperCase()} is replacing Rubble\u2026`}
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
