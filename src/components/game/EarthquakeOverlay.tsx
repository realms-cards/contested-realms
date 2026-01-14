"use client";

import React, { useCallback, useEffect } from "react";
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
          const cellNo = getCellNumber(x, y, board.size.w);
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
        <div className="pointer-events-auto px-5 py-3 rounded-full bg-black/90 text-white ring-1 ring-amber-500/50 shadow-lg text-lg md:text-xl flex items-center gap-3 select-none">
          <span className="text-amber-400 font-fantaisie flex items-center gap-1">
            <img src="/earth.png" alt="earth" className="w-5 h-5" /> Earthquake
          </span>
          <span className="opacity-80">
            {phase === "selectingArea" &&
              (isCaster
                ? "Click a tile to select 2×2 area"
                : `${pending.casterSeat.toUpperCase()} is selecting an area...`)}
            {phase === "rearranging" &&
              (isCaster
                ? "Click sites to swap them, then Resolve"
                : `${pending.casterSeat.toUpperCase()} is rearranging sites...`)}
            {phase === "resolving" && "Resolving..."}
          </span>
          {isCaster && phase === "selectingArea" && (
            <button
              className="mx-1 rounded bg-white/15 hover:bg-white/25 px-3 py-1 select-none"
              onClick={() => cancelEarthquake()}
            >
              Cancel
            </button>
          )}
        </div>
      </div>

      {/* Info panel when area is selected */}
      {(phase === "rearranging" || phase === "resolving") &&
        pending.areaCorner && (
          <div className="fixed bottom-24 inset-x-0 z-[201] pointer-events-none flex justify-center">
            <div className="pointer-events-auto px-6 py-4 rounded-xl bg-black/95 text-white ring-1 ring-amber-500/30 shadow-lg max-w-md">
              <div className="text-sm text-white/60 mb-2">Affected Area:</div>
              <div className="text-amber-300 text-sm mb-3">
                {getAffectedCellsDisplay()}
              </div>

              {phase === "rearranging" && (
                <>
                  <div className="text-sm text-white/60 mb-2">
                    Swaps performed: {pending.swaps.length}
                  </div>

                  {switchSiteSource && (
                    <div className="text-cyan-400 text-sm mb-3">
                      Selected:{" "}
                      <span className="font-medium">
                        #
                        {getCellNumber(
                          switchSiteSource.x,
                          switchSiteSource.y,
                          board.size.w
                        )}
                      </span>{" "}
                      - Click another site to swap
                    </div>
                  )}

                  {isCaster && (
                    <div className="flex gap-2 mt-4">
                      <button
                        className="flex-1 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-medium transition-colors"
                        onClick={() => resolveEarthquake()}
                      >
                        Resolve & Burrow
                      </button>
                      <button
                        className="px-4 py-2 rounded-lg bg-white/15 hover:bg-white/25 text-white transition-colors"
                        onClick={() => cancelEarthquake()}
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                </>
              )}

              {phase === "resolving" && (
                <div className="text-center text-amber-400 animate-pulse">
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
