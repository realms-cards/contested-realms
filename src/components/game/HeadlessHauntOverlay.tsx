"use client";

import React, { useMemo } from "react";
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
          cellNo: getCellNumber(x, y, boardSize.w),
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
  const currentCellNo = getCellNumber(curX, curY, boardSize.w);

  return (
    <div className="fixed inset-0 z-[200] pointer-events-none">
      {/* Top status bar */}
      <div className="fixed inset-x-0 top-6 z-[201] pointer-events-none flex justify-center">
        <div className="pointer-events-auto px-5 py-3 rounded-full bg-black/90 text-white ring-1 ring-violet-500/50 shadow-lg text-lg flex items-center gap-3">
          <span className="text-violet-400 font-fantaisie">
            👻 {currentHaunt.cardName}
          </span>
          <span className="opacity-80">
            {isOwner
              ? `Choose destination tile (currently #${currentCellNo})`
              : `${ownerSeat.toUpperCase()} is choosing movement...`}
          </span>
          {haunts.length > 1 && (
            <span className="text-xs opacity-60">
              ({currentIndex + 1}/{haunts.length})
            </span>
          )}
        </div>
      </div>

      {/* Owner tile selection UI */}
      {isOwner && (
        <div className="fixed inset-0 flex items-center justify-center pointer-events-auto bg-black/60">
          <div className="bg-black/95 rounded-xl p-6 max-w-2xl w-full mx-4 ring-1 ring-violet-500/30">
            <h3 className="text-lg font-semibold text-violet-300 mb-4 text-center">
              Kythera Mechanism - Choose Destination
            </h3>
            <p className="text-sm text-gray-400 mb-4 text-center">
              Select a tile to move <strong>{currentHaunt.cardName}</strong> to,
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
                      aspect-square rounded text-xs font-bold transition-all
                      ${
                        isCurrent
                          ? "bg-violet-900/50 text-violet-300 cursor-not-allowed ring-2 ring-violet-500"
                          : isSelected
                          ? "bg-emerald-600 text-white ring-2 ring-emerald-400"
                          : "bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white"
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
              <button
                onClick={skipMove}
                className="px-4 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-200 transition-colors"
              >
                Skip (Stay at #{currentCellNo})
              </button>
              <button
                onClick={resolveMove}
                disabled={!selectedTile}
                className={`
                  px-4 py-2 rounded-lg transition-colors
                  ${
                    selectedTile
                      ? "bg-emerald-600 hover:bg-emerald-500 text-white"
                      : "bg-gray-800 text-gray-500 cursor-not-allowed"
                  }
                `}
              >
                Move to #
                {selectedTile
                  ? boardTiles.find((t) => t.key === selectedTile)?.cellNo
                  : "?"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Opponent waiting indicator */}
      {!isOwner && (
        <div className="fixed bottom-24 inset-x-0 z-[201] pointer-events-none flex justify-center">
          <div className="px-4 py-2 rounded-lg bg-black/90 text-sm text-violet-300 animate-pulse">
            {ownerSeat.toUpperCase()} is choosing where to move{" "}
            {currentHaunt.cardName}...
          </div>
        </div>
      )}
    </div>
  );
}
