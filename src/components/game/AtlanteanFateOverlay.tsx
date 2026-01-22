"use client";

import React, { useCallback, useMemo } from "react";
import { useGameStore } from "@/lib/game/store";
import {
  calculate2x2Area,
  isOrdinarySite,
} from "@/lib/game/store/atlanteanFateState";
import {
  parseCellKey,
  getCellNumber,
} from "@/lib/game/store/utils/boardHelpers";

export default function AtlanteanFateOverlay() {
  const pending = useGameStore((s) => s.pendingAtlanteanFate);
  const actorKey = useGameStore((s) => s.actorKey);
  const board = useGameStore((s) => s.board);
  const resolveAtlanteanFate = useGameStore((s) => s.resolveAtlanteanFate);
  const replaceAtlanteanFate = useGameStore((s) => s.replaceAtlanteanFate);
  const cancelAtlanteanFate = useGameStore((s) => s.cancelAtlanteanFate);

  // Calculate preview info
  const previewInfo = useMemo(() => {
    if (!pending) return null;
    const cornerCell = pending.selectedCorner || pending.previewCorner;
    if (!cornerCell) return null;

    const { x, y } = parseCellKey(cornerCell);
    const coveredCells = calculate2x2Area(x, y, board.size.w, board.size.h);

    // Count non-ordinary sites that will be flooded
    let floodCount = 0;
    const sitesToFlood: string[] = [];
    for (const cellKey of coveredCells) {
      const site = board.sites[cellKey];
      if (site?.card?.name && !isOrdinarySite(site.card.name)) {
        floodCount++;
        sitesToFlood.push(site.card.name);
      }
    }

    return {
      cornerCell,
      cellNo: getCellNumber(x, y, board.size.w),
      coveredCells,
      floodCount,
      sitesToFlood: [...new Set(sitesToFlood)], // unique names
    };
  }, [pending, board]);

  const handleConfirm = useCallback(() => {
    resolveAtlanteanFate();
  }, [resolveAtlanteanFate]);

  const handleReplace = useCallback(() => {
    replaceAtlanteanFate();
  }, [replaceAtlanteanFate]);

  const handleCancel = useCallback(() => {
    cancelAtlanteanFate();
  }, [cancelAtlanteanFate]);

  if (!pending) return null;

  const { phase, casterSeat } = pending;

  // Hotseat: actorKey is null, always show caster UI
  // Online: only show caster UI if we're the caster
  const isCaster = actorKey === null || casterSeat === actorKey;

  return (
    <div className="fixed inset-0 z-[200] pointer-events-none">
      {/* Top status bar */}
      <div className="fixed inset-x-0 top-6 z-[201] pointer-events-none flex justify-center">
        <div className="pointer-events-auto px-5 py-3 rounded-full bg-black/90 text-white ring-1 ring-cyan-500/50 shadow-lg text-lg flex items-center gap-3">
          <span className="text-cyan-400 font-fantaisie">
            🌊 Atlantean Fate
          </span>
          <span className="opacity-80">
            {phase === "selectingCorner" &&
              "Click on the board to select the aura area"}
            {phase === "confirming" && "Confirm to apply flood effects"}
          </span>
        </div>
      </div>

      {/* Confirmation panel */}
      {isCaster && phase === "confirming" && previewInfo && (
        <div className="fixed left-6 top-24 z-[201] pointer-events-auto">
          <div className="bg-black/90 rounded-xl p-4 ring-1 ring-cyan-500/30 max-w-sm">
            <h3 className="text-cyan-400 font-semibold mb-2">
              Apply Flood Effects?
            </h3>
            <div className="space-y-2 text-sm">
              <p className="text-gray-300">
                <strong>Area:</strong> {previewInfo.coveredCells.length} tiles
                around intersection
              </p>
              <p className="text-gray-300">
                <strong>Sites to flood:</strong>{" "}
                {previewInfo.floodCount === 0 ? (
                  <span className="text-gray-400">
                    None (no non-ordinary sites)
                  </span>
                ) : (
                  <span className="text-cyan-300">
                    {previewInfo.floodCount} (
                    {previewInfo.sitesToFlood.join(", ")})
                  </span>
                )}
              </p>
            </div>
            <div className="flex gap-2 mt-4">
              <button
                onClick={handleCancel}
                className="px-3 py-2 rounded bg-gray-600/20 hover:bg-gray-600/30 text-gray-300"
              >
                Skip
              </button>
              <button
                onClick={handleReplace}
                className="px-3 py-2 rounded bg-amber-600/20 hover:bg-amber-600/30 text-amber-300"
                title="Choose a different position for the aura"
              >
                Re-place
              </button>
              <button
                onClick={handleConfirm}
                className="flex-1 px-3 py-2 rounded bg-cyan-600/30 hover:bg-cyan-600/50 text-cyan-300 font-semibold"
              >
                Apply
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Opponent waiting indicator */}
      {!isCaster && phase !== "complete" && (
        <div className="fixed bottom-24 inset-x-0 z-[201] pointer-events-none flex justify-center">
          <div className="px-4 py-2 rounded-lg bg-black/90 text-sm text-cyan-300">
            {casterSeat.toUpperCase()} is deciding on Atlantean Fate effects...
          </div>
        </div>
      )}
    </div>
  );
}
