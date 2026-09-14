"use client";

import React, { useCallback, useMemo } from "react";
import { RcButton } from "@/components/ui/rc-button";
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
      cellNo: getCellNumber(x, y, board.size.w, board.size.h),
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
        <div className="pointer-events-auto px-5 py-3 rounded-full border border-rc-line/22 bg-[rgba(7,10,20,0.9)] font-rc-sans text-rc-fg shadow-rc-panel text-lg flex items-center gap-3">
          <span className="font-rc-display text-rc-accent-link">
            Atlantean Fate
          </span>
          <span className="text-rc-fg-muted">
            {phase === "selectingCorner" &&
              "Click on the board to select the aura area"}
            {phase === "confirming" && "Confirm to apply flood effects"}
          </span>
        </div>
      </div>

      {/* Confirmation panel */}
      {isCaster && phase === "confirming" && previewInfo && (
        <div className="fixed left-6 top-24 z-[201] pointer-events-auto">
          <div className="rounded-rc-lg border border-rc-line/18 bg-[rgba(9,13,25,0.9)] p-4 max-w-sm font-rc-sans text-rc-fg shadow-rc-panel">
            <h3 className="mb-2 font-rc-display text-[18px] leading-tight text-rc-fg-strong">
              Apply Flood Effects?
            </h3>
            <div className="space-y-2 text-sm">
              <p className="text-rc-fg-muted">
                <strong>Area:</strong> {previewInfo.coveredCells.length} tiles
                around intersection
              </p>
              <p className="text-rc-fg-muted">
                <strong>Sites to flood:</strong>{" "}
                {previewInfo.floodCount === 0 ? (
                  <span className="text-rc-fg-subtle">
                    None (no non-ordinary sites)
                  </span>
                ) : (
                  <span className="text-rc-fg-strong">
                    {previewInfo.floodCount} (
                    {previewInfo.sitesToFlood.join(", ")})
                  </span>
                )}
              </p>
            </div>
            <div className="flex gap-2 mt-4">
              <RcButton variant="outline" onClick={handleCancel}>
                Skip
              </RcButton>
              <RcButton
                variant="secondary"
                onClick={handleReplace}
                title="Choose a different position for the aura"
              >
                Re-place
              </RcButton>
              <RcButton className="flex-1" onClick={handleConfirm}>
                Apply
              </RcButton>
            </div>
          </div>
        </div>
      )}

      {/* Opponent waiting indicator */}
      {!isCaster && phase !== "complete" && (
        <div className="fixed bottom-24 inset-x-0 z-[201] pointer-events-none flex justify-center">
          <div className="rc-toast">
            {casterSeat.toUpperCase()} is deciding on Atlantean Fate effects...
          </div>
        </div>
      )}
    </div>
  );
}
