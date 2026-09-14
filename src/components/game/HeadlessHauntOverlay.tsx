"use client";

import React, { useMemo } from "react";
import { RcButton } from "@/components/ui/rc-button";
import { useGameStore } from "@/lib/game/store";
import { toCellKey, getCellNumber } from "@/lib/game/store/utils/boardHelpers";

/**
 * HeadlessHauntOverlay - Shows UI for Kythera Mechanism tile selection
 *
 * When a player has Kythera Mechanism attached to their avatar, they can choose
 * where their Headless Haunt / Haunless Head moves (or skip the movement entirely).
 *
 * Without Kythera Mechanism, haunts automatically move to random tiles.
 */
export default function HeadlessHauntOverlay() {
  const pending = useGameStore((s) => s.pendingHeadlessHauntMove);
  const actorKey = useGameStore((s) => s.actorKey);
  const boardSize = useGameStore((s) => s.board.size);
  const selectTile = useGameStore((s) => s.selectHeadlessHauntTile);
  const skipMove = useGameStore((s) => s.skipHeadlessHauntMove);
  const resolveMove = useGameStore((s) => s.resolveHeadlessHauntMove);

  // Generate all board tiles
  const boardTiles = useMemo(() => {
    const tiles: Array<{ key: string; x: number; y: number; cellNo: number }> =
      [];
    for (let y = 0; y < boardSize.h; y++) {
      for (let x = 0; x < boardSize.w; x++) {
        tiles.push({
          key: toCellKey(x, y),
          x,
          y,
          cellNo: getCellNumber(x, y, boardSize.w, boardSize.h),
        });
      }
    }
    return tiles;
  }, [boardSize]);

  if (!pending) return null;

  const { phase, ownerSeat, hasKythera, currentIndex, haunts, selectedTile } =
    pending;

  // Only show UI when choosing (Kythera mode)
  if (phase !== "choosing" || !hasKythera) return null;

  const currentHaunt = haunts[currentIndex];
  if (!currentHaunt) return null;

  // Hotseat: actorKey is null, always show caster UI
  // Online: only show caster UI if we're the owner
  const isOwner = actorKey === null || ownerSeat === actorKey;

  // Get current haunt location
  const [curX, curY] = currentHaunt.location.split(",").map(Number);
  const currentCellNo = getCellNumber(curX, curY, boardSize.w, boardSize.h);

  return (
    <div className="fixed inset-0 z-[200] pointer-events-none">
      {/* Top status bar */}
      <div className="fixed inset-x-0 top-6 z-[201] pointer-events-none flex justify-center">
        <div className="pointer-events-auto px-5 py-3 rounded-full border border-rc-line/22 bg-[rgba(7,10,20,0.9)] font-rc-sans text-rc-fg shadow-rc-panel text-lg flex items-center gap-3">
          <span className="font-rc-display text-rc-accent-link">
            {currentHaunt.cardName}
          </span>
          <span className="text-rc-fg-muted">
            {isOwner
              ? `Choose destination tile (currently #${currentCellNo})`
              : `${ownerSeat.toUpperCase()} is choosing movement...`}
          </span>
          {haunts.length > 1 && (
            <span className="font-rc-mono text-xs tabular-nums text-rc-fg-subtle">
              ({currentIndex + 1}/{haunts.length})
            </span>
          )}
        </div>
      </div>

      {/* Owner tile selection UI */}
      {isOwner && (
        <div className="fixed inset-0 flex items-center justify-center pointer-events-auto bg-[rgba(6,10,20,0.6)]">
          <div className="rounded-rc-lg border border-rc-line/18 bg-[rgba(9,13,25,0.95)] p-6 max-w-2xl w-full mx-4 font-rc-sans text-rc-fg shadow-rc-panel">
            <h3 className="mb-4 text-center font-rc-display text-[18px] leading-tight text-rc-fg-strong">
              Kythera Mechanism - Choose Destination
            </h3>
            <p className="text-sm text-rc-fg-muted mb-4 text-center">
              Select a tile to move <strong className="font-rc-display text-rc-accent-link">{currentHaunt.cardName}</strong> to,
              or skip to keep it at #{currentCellNo}
            </p>

            {/* Tile grid */}
            <div
              className="grid gap-1 mb-6"
              style={{
                gridTemplateColumns: `repeat(${boardSize.w}, minmax(0, 1fr))`,
              }}
            >
              {boardTiles.map((tile) => {
                const isCurrent = tile.key === currentHaunt.location;
                const isSelected = tile.key === selectedTile;
                return (
                  <button
                    key={tile.key}
                    onClick={() => selectTile(tile.key)}
                    disabled={isCurrent}
                    className={`
                      aspect-square rounded-rc-sm border font-rc-mono text-xs font-bold tabular-nums transition-all
                      ${
                        isCurrent
                          ? "border-dashed border-rc-accent/50 bg-rc-accent/8 text-rc-accent-link cursor-not-allowed"
                          : isSelected
                          ? "border-rc-accent bg-rc-accent/12 text-rc-fg-strong shadow-[0_0_14px_rgba(243,207,106,0.25)]"
                          : "border-rc-line/18 bg-black/30 text-rc-fg-muted hover:border-rc-accent/60 hover:bg-rc-accent/8 hover:text-rc-fg-strong"
                      }
                    `}
                  >
                    {tile.cellNo}
                  </button>
                );
              })}
            </div>

            {/* Action buttons */}
            <div className="flex gap-3 justify-center">
              <RcButton variant="outline" onClick={skipMove}>
                Skip (Stay at #{currentCellNo})
              </RcButton>
              <RcButton onClick={resolveMove} disabled={!selectedTile}>
                Move to #
                {selectedTile
                  ? boardTiles.find((t) => t.key === selectedTile)?.cellNo
                  : "?"}
              </RcButton>
            </div>
          </div>
        </div>
      )}

      {/* Opponent waiting indicator */}
      {!isOwner && (
        <div className="fixed bottom-24 inset-x-0 z-[201] pointer-events-none flex justify-center">
          <div className="rc-toast animate-pulse">
            {ownerSeat.toUpperCase()} is choosing where to move{" "}
            {currentHaunt.cardName}...
          </div>
        </div>
      )}
    </div>
  );
}
