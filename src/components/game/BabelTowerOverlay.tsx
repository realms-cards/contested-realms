"use client";

import Image from "next/image";
import React, { useMemo, useState } from "react";
import { RcButton } from "@/components/ui/rc-button";
import { PLAYER_COLORS } from "@/lib/game/constants";
import { useGameStore } from "@/lib/game/store";
import { getImageSlug } from "@/lib/utils/cardSlug";

/**
 * BabelTowerOverlay - Interactive UI for Apex of Babel placement choice
 *
 * When Apex of Babel is played and Base of Babel exists on the board,
 * the player can choose to:
 * 1. Play Apex to a void tile (normal site placement)
 * 2. Merge Apex onto Base to create Tower of Babel (2 mana site)
 *
 * If only void tiles exist (no Base on board), normal placement proceeds automatically.
 */
export default function BabelTowerOverlay() {
  const pending = useGameStore((s) => s.pendingBabelPlacement);
  const actorKey = useGameStore((s) => s.actorKey);
  const selectTarget = useGameStore((s) => s.selectBabelTarget);
  const cancel = useGameStore((s) => s.cancelBabelPlacement);
  const board = useGameStore((s) => s.board);
  const [imageError, setImageError] = useState(false);

  // Compute Apex card image URL
  const apexImageUrl = useMemo(() => {
    if (!pending?.apex) return null;
    const apex = pending.apex;
    const slug = getImageSlug(apex.slug, apex.name);
    return `/api/images/${encodeURIComponent(slug)}`;
  }, [pending?.apex]);

  // Get Base of Babel cell info for display (must be before early return)
  const baseCellInfo = useMemo(() => {
    if (!pending) return null;
    const validBaseCells = pending.validBaseCells;
    if (validBaseCells.length === 0) return null;
    const cellKey = validBaseCells[0];
    const site = board.sites[cellKey];
    const [x, y] = cellKey.split(",").map(Number);
    const cellNo = y * board.size.w + x + 1;
    return { cellKey, site, cellNo };
  }, [pending, board]);

  if (!pending) return null;

  const {
    phase,
    casterSeat,
    apex,
    validVoidCells,
    validBaseCells: _validBaseCells,
  } = pending;

  // Hotseat: actorKey is null, always show caster UI
  // Online: only show caster UI if we're the caster
  const isCaster = actorKey === null || casterSeat === actorKey;

  // Seat identity colour (P1 blue / P2 red): ring = 50% alpha border, text = solid
  const seatRingStyle = { borderColor: `${PLAYER_COLORS[casterSeat]}80` };
  const seatTextStyle = { color: PLAYER_COLORS[casterSeat] };

  return (
    <div className="fixed inset-0 z-[200] pointer-events-none">
      {/* Top status bar */}
      <div className="fixed inset-x-0 top-6 z-[201] pointer-events-none flex justify-center">
        <div
          className="pointer-events-auto px-5 py-3 rounded-full border border-rc-line/22 bg-[rgba(7,10,20,0.9)] font-rc-sans text-rc-fg shadow-rc-panel text-lg flex items-center gap-3"
          style={seatRingStyle}
        >
          <span className="font-rc-display text-rc-accent-link">
            Tower of Babel
          </span>
          <span className="text-rc-fg-muted">
            {phase === "selectingTarget"
              ? isCaster
                ? "Choose where to play Apex of Babel"
                : "Opponent is choosing..."
              : ""}
          </span>
        </div>
      </div>

      {/* Caster choice UI */}
      {phase === "selectingTarget" && isCaster && (
        <div className="fixed inset-0 flex items-center justify-center pointer-events-auto bg-[rgba(6,10,20,0.7)]">
          <div
            className="rounded-rc-lg border border-rc-line/18 bg-[rgba(9,13,25,0.95)] p-6 max-w-2xl w-full mx-4 font-rc-sans text-rc-fg shadow-rc-panel"
            style={seatRingStyle}
          >
            {/* Apex card display */}
            <div className="flex items-center gap-4 mb-6">
              <div className="relative flex-shrink-0">
                {apexImageUrl && !imageError ? (
                  <Image
                    src={apexImageUrl}
                    alt={apex?.name || "Apex of Babel"}
                    width={105}
                    height={75}
                    className="rounded-rc-md shadow-rc-md ring-1 ring-rc-line/25"
                    onError={() => setImageError(true)}
                    unoptimized
                  />
                ) : (
                  <div className="w-[105px] h-[75px] rounded-rc-md border border-rc-line/12 bg-black/30 flex items-center justify-center">
                    <span className="font-rc-display text-rc-fg text-sm text-center px-2">
                      {apex?.name || "Apex of Babel"}
                    </span>
                  </div>
                )}
              </div>
              <div>
                <div className="mb-1 font-rc-display text-[22px] leading-tight text-rc-fg-strong">
                  {apex?.name || "The Apex of Babel"}
                </div>
                <div className="text-rc-fg-muted text-sm">
                  You may play this onto Base of Babel to create the Tower!
                </div>
              </div>
            </div>

            {/* Choice buttons */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Option 1: Merge with Base */}
              {baseCellInfo && (
                <button
                  onClick={() => selectTarget(baseCellInfo.cellKey, true)}
                  className="p-4 rounded-rc-md border border-rc-accent/45 bg-rc-accent/8 hover:border-rc-accent hover:bg-rc-accent/12 transition-colors text-left"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-rc-accent-link font-medium text-lg">
                      Build Tower of Babel
                    </span>
                  </div>
                  <div className="text-rc-fg-muted text-sm mb-2">
                    Merge with Base of Babel at #{baseCellInfo.cellNo}
                  </div>
                  <div className="text-rc-accent-link/80 text-xs">
                    Creates a single site that provides <strong>2 mana</strong>.
                    <br />
                    Both Unique and Exceptional rarity.
                    <br />
                    Gain +1 mana this turn (Genesis bonus).
                  </div>
                </button>
              )}

              {/* Option 2: Normal placement */}
              <button
                onClick={() => {
                  // Pick the first valid void cell for normal placement
                  if (validVoidCells.length > 0) {
                    selectTarget(validVoidCells[0], false);
                  }
                }}
                disabled={validVoidCells.length === 0}
                className={`p-4 rounded-rc-md border ${
                  validVoidCells.length > 0
                    ? "border-rc-line/18 bg-black/30 hover:bg-rc-accent/8"
                    : "border-rc-line/10 bg-black/20 cursor-not-allowed opacity-50"
                } transition-colors text-left`}
                style={validVoidCells.length > 0 ? seatRingStyle : undefined}
              >
                <div className="flex items-center gap-2 mb-2">
                  <span className="font-medium text-lg" style={seatTextStyle}>
                    Play Normally
                  </span>
                </div>
                <div className="text-rc-fg-muted text-sm mb-2">
                  Play to an empty tile (void)
                </div>
                <div className="text-rc-fg-muted text-xs">
                  Standard site placement.
                  <br />
                  Provides 1 mana as normal.
                  <br />
                  {validVoidCells.length} void tile
                  {validVoidCells.length !== 1 ? "s" : ""} available
                </div>
              </button>
            </div>

            {/* Cancel button */}
            <div className="flex justify-center mt-4">
              <RcButton variant="outline" size="sm" onClick={cancel}>
                Cancel
              </RcButton>
            </div>
          </div>
        </div>
      )}

      {/* Opponent waiting indicator */}
      {phase === "selectingTarget" && !isCaster && (
        <div className="fixed bottom-24 inset-x-0 z-[201] pointer-events-none flex justify-center">
          <div
            className="pointer-events-auto px-6 py-4 rounded-rc-lg border border-rc-line/22 bg-[rgba(7,10,20,0.9)] font-rc-sans shadow-rc-panel flex items-center gap-4"
            style={seatRingStyle}
          >
            <div className="relative flex-shrink-0">
              {apexImageUrl && !imageError ? (
                <Image
                  src={apexImageUrl}
                  alt={apex?.name || "Apex of Babel"}
                  width={84}
                  height={60}
                  className="rounded-rc-md shadow-rc-md ring-1 ring-rc-line/25"
                  onError={() => setImageError(true)}
                  unoptimized
                />
              ) : (
                <div className="w-[84px] h-[60px] rounded-rc-md border border-rc-line/12 bg-black/30 flex items-center justify-center">
                  <span className="font-rc-display text-rc-fg text-xs text-center px-1">
                    {apex?.name || "Unknown"}
                  </span>
                </div>
              )}
            </div>
            <div className="flex flex-col">
              <div className="font-rc-display text-rc-fg-strong">
                {apex?.name || "The Apex of Babel"}
              </div>
              <span className="text-rc-fg-muted text-sm">
                Opponent is choosing where to play...
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
