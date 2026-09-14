"use client";

import React, { useCallback, useEffect } from "react";
import { RcButton } from "@/components/ui/rc-button";
import { useGameStore } from "@/lib/game/store";
import { getCellNumber, toCellKey } from "@/lib/game/store/utils/boardHelpers";
import type { GameTransport } from "@/lib/net/transport";

type EarthquakeOverlayProps = {
  transport?: GameTransport | null;
};

export default function EarthquakeOverlay({
  transport: _transport,
}: EarthquakeOverlayProps) {
  const pending = useGameStore((s) => s.pendingEarthquake);
  const actorKey = useGameStore((s) => s.actorKey);
  const board = useGameStore((s) => s.board);

  const selectEarthquakeArea = useGameStore((s) => s.selectEarthquakeArea);
  const performEarthquakeSwap = useGameStore((s) => s.performEarthquakeSwap);
  const resolveEarthquake = useGameStore((s) => s.resolveEarthquake);
  const repickEarthquakeArea = useGameStore((s) => s.repickEarthquakeArea);
  const cancelEarthquake = useGameStore((s) => s.cancelEarthquake);
  const setSwitchSiteSource = useGameStore((s) => s.setSwitchSiteSource);
  const switchSiteSource = useGameStore((s) => s.switchSiteSource);

  const isCaster = pending?.casterSeat === actorKey || !actorKey;

  // Handle tile clicks during selectingArea phase
  const handleTileClick = useCallback(
    (x: number, y: number) => {
      if (!pending || !isCaster) return;

      if (pending.phase === "selectingArea") {
        // Validate that the corner allows a 2x2 area within board
        if (x + 1 < board.size.w && y + 1 < board.size.h) {
          selectEarthquakeArea({ x, y });
        }
      }
    },
    [pending, isCaster, board.size.w, board.size.h, selectEarthquakeArea]
  );

  // Handle site swaps during rearranging phase
  const handleSwapClick = useCallback(
    (x: number, y: number) => {
      if (!pending || !isCaster || pending.phase !== "rearranging") return;
      if (!pending.areaCorner) return;

      const { areaCorner } = pending;
      // Check if click is within the 2x2 area
      const inArea =
        x >= areaCorner.x &&
        x < areaCorner.x + 2 &&
        y >= areaCorner.y &&
        y < areaCorner.y + 2;

      if (!inArea) return;

      if (!switchSiteSource) {
        // First click - set source
        setSwitchSiteSource({ x, y });
      } else {
        // Second click - perform swap
        if (switchSiteSource.x !== x || switchSiteSource.y !== y) {
          performEarthquakeSwap(switchSiteSource, { x, y });
        }
        setSwitchSiteSource(null);
      }
    },
    [
      pending,
      isCaster,
      switchSiteSource,
      setSwitchSiteSource,
      performEarthquakeSwap,
    ]
  );

  // Register click handler for board interaction
  useEffect(() => {
    if (!pending || !isCaster) return;

    const handleBoardClick = (e: CustomEvent<{ x: number; y: number }>) => {
      const { x, y } = e.detail;
      if (pending.phase === "selectingArea") {
        handleTileClick(x, y);
      } else if (pending.phase === "rearranging") {
        handleSwapClick(x, y);
      }
    };

    window.addEventListener(
      "earthquake:tileClick",
      handleBoardClick as EventListener
    );
    return () => {
      window.removeEventListener(
        "earthquake:tileClick",
        handleBoardClick as EventListener
      );
    };
  }, [pending, isCaster, handleTileClick, handleSwapClick]);

  // Clear switch source when exiting rearranging phase
  useEffect(() => {
    if (pending?.phase !== "rearranging") {
      setSwitchSiteSource(null);
    }
  }, [pending?.phase, setSwitchSiteSource]);

  if (!pending) return null;
  const phase = pending.phase;

  // Get affected cells info
  const getAffectedCellsDisplay = () => {
    if (!pending.areaCorner) return "Not selected";
    const cells: string[] = [];
    for (let dx = 0; dx < 2; dx++) {
      for (let dy = 0; dy < 2; dy++) {
        const x = pending.areaCorner.x + dx;
        const y = pending.areaCorner.y + dy;
        if (x < board.size.w && y < board.size.h) {
          const cellKey = toCellKey(x, y);
          const site = board.sites[cellKey];
          const cellNo = getCellNumber(x, y, board.size.w, board.size.h);
          cells.push(
            `#${cellNo}${site ? ` (${site.card?.name || "site"})` : " (void)"}`
          );
        }
      }
    }
    return cells.join(", ");
  };

  return (
    <div className="fixed inset-0 z-[200] pointer-events-none">
      {/* Top bar with status */}
      <div className="fixed inset-x-0 top-6 z-[201] pointer-events-none flex justify-center">
        <div className="pointer-events-auto px-5 py-3 rounded-full border border-rc-line/22 bg-[rgba(7,10,20,0.9)] font-rc-sans text-rc-fg shadow-rc-panel text-lg md:text-xl flex items-center gap-3 select-none">
          <span className="font-rc-display text-rc-accent-link flex items-center gap-1">
            <img src="/earth.png" alt="earth" className="w-5 h-5" /> Earthquake
          </span>
          <span className="text-rc-fg-muted">
            {phase === "selectingArea" &&
              (isCaster
                ? "Click the upper-left tile of the 2×2 area"
                : `${pending.casterSeat.toUpperCase()} is selecting an area...`)}
            {phase === "rearranging" &&
              (isCaster
                ? "Click sites to swap them, then Resolve"
                : `${pending.casterSeat.toUpperCase()} is rearranging sites...`)}
            {phase === "resolving" && "Resolving..."}
          </span>
          {isCaster && phase === "selectingArea" && (
            <RcButton
              variant="outline"
              size="xs"
              className="mx-1"
              onClick={() => cancelEarthquake()}
            >
              Cancel
            </RcButton>
          )}
        </div>
      </div>

      {/* Info panel when area is selected */}
      {(phase === "rearranging" || phase === "resolving") &&
        pending.areaCorner && (
          <div className="fixed bottom-24 inset-x-0 z-[201] pointer-events-none flex justify-center">
            <div className="pointer-events-auto px-6 py-4 rounded-rc-lg border border-rc-line/18 bg-[rgba(9,13,25,0.95)] font-rc-sans text-rc-fg shadow-rc-panel max-w-md">
              <div className="text-sm text-rc-fg-subtle mb-2">Affected Area:</div>
              <div className="text-rc-accent-link text-sm mb-3">
                {getAffectedCellsDisplay()}
              </div>

              {phase === "rearranging" && (
                <>
                  <div className="text-sm text-rc-fg-subtle mb-2">
                    Swaps performed: {pending.swaps.length}
                  </div>

                  {switchSiteSource && (
                    <div className="text-rc-accent-link text-sm mb-3">
                      Selected:{" "}
                      <span className="font-medium font-rc-mono tabular-nums">
                        #
                        {getCellNumber(
                          switchSiteSource.x,
                          switchSiteSource.y,
                          board.size.w,
                          board.size.h
                        )}
                      </span>{" "}
                      - Click another site to swap
                    </div>
                  )}

                  {isCaster && (
                    <div className="flex gap-2 mt-4">
                      <RcButton
                        className="flex-1 h-auto py-2 whitespace-normal"
                        onClick={() => resolveEarthquake()}
                      >
                        Resolve & Burrow
                      </RcButton>
                      <RcButton
                        variant="outline"
                        className="h-auto py-2 whitespace-normal"
                        onClick={() => repickEarthquakeArea()}
                      >
                        Re-pick area
                      </RcButton>
                      <RcButton
                        variant="outline"
                        className="h-auto py-2 whitespace-normal"
                        onClick={() => cancelEarthquake()}
                      >
                        Cancel
                      </RcButton>
                    </div>
                  )}
                </>
              )}

              {phase === "resolving" && (
                <div className="text-center text-rc-accent-link animate-pulse">
                  Burrowing all minions and artifacts...
                </div>
              )}
            </div>
          </div>
        )}

      {/* Highlight overlay for the 2x2 area - shown during rearranging */}
      {phase === "rearranging" && pending.areaCorner && (
        <style jsx global>{`
          /* Highlight the affected 2x2 area cells */
          ${pending.affectedCells
            .map(
              (cellKey) => `
            [data-cell-key="${cellKey}"] {
              box-shadow: inset 0 0 20px rgba(251, 191, 36, 0.5) !important;
            }
          `
            )
            .join("")}
        `}</style>
      )}
    </div>
  );
}
