"use client";

import React from "react";
import { useGameStore } from "@/lib/game/store";

/**
 * PathfinderPlayOverlay - Interactive UI for Pathfinder site play ability
 *
 * Pathfinder: Tap → Reveal and play the topmost site of your atlas
 * to an adjacent void or Rubble and move there.
 *
 * Shows the revealed top site and allows the player to select a target tile.
 */
export default function PathfinderPlayOverlay() {
  const pending = useGameStore((s) => s.pendingPathfinderPlay);
  const actorKey = useGameStore((s) => s.actorKey);
  const cancel = useGameStore((s) => s.cancelPathfinderPlay);

  if (!pending) return null;

  const { phase, ownerSeat, topSite, validTargets } = pending;

  // Hotseat: actorKey is null, always show owner UI
  // Online: only show owner UI if we're the owner
  const isOwner = actorKey === null || ownerSeat === actorKey;

  // Get player color class
  const playerColorClass =
    ownerSeat === "p2"
      ? "ring-red-500/50 text-red-400"
      : "ring-blue-500/50 text-blue-400";
  const playerBgClass = ownerSeat === "p2" ? "bg-red-900/20" : "bg-blue-900/20";

  return (
    <div className="fixed inset-0 z-[200] pointer-events-none">
      {/* Top status bar */}
      <div className="fixed inset-x-0 top-6 z-[201] pointer-events-none flex justify-center">
        <div
          className={`pointer-events-auto px-5 py-3 rounded-full bg-black/90 text-white ring-1 ${playerColorClass} shadow-lg text-lg flex items-center gap-3`}
        >
          <span
            className={ownerSeat === "p2" ? "text-red-400" : "text-blue-400"}
          >
            Pathfinder
          </span>
          <span className="opacity-80">
            {phase === "selectingTarget"
              ? isOwner
                ? "Select a tile to play site and move there"
                : "Opponent is selecting a target..."
              : ""}
          </span>
        </div>
      </div>

      {/* Revealed site card and target selection */}
      {phase === "selectingTarget" && isOwner && (
        <div className="fixed inset-x-0 bottom-24 z-[201] pointer-events-none flex justify-center">
          <div
            className={`pointer-events-auto px-6 py-4 rounded-xl bg-black/90 ring-1 ${playerColorClass} shadow-lg flex items-center gap-5`}
          >
            {/* Revealed site info */}
            <div className={`${playerBgClass} rounded-lg px-4 py-2`}>
              <div className="text-xs text-gray-400 mb-1">Revealed Site</div>
              <div className="text-amber-400 font-medium text-lg">
                {topSite?.name || "Unknown"}
              </div>
              {topSite?.subTypes && (
                <div className="text-gray-400 text-xs mt-0.5">
                  {topSite.subTypes}
                </div>
              )}
            </div>

            {/* Instructions */}
            <div className="flex flex-col">
              <span className="text-gray-300 text-sm">
                Click a highlighted tile to play and move
              </span>
              <span className="text-gray-500 text-xs mt-1">
                {validTargets.length} valid target
                {validTargets.length !== 1 ? "s" : ""} (void or Rubble)
              </span>
            </div>

            {/* Cancel button */}
            <button
              onClick={cancel}
              className={`px-4 py-1.5 rounded-full ${
                ownerSeat === "p2"
                  ? "bg-red-900/50 hover:bg-red-800/50 text-red-200"
                  : "bg-blue-900/50 hover:bg-blue-800/50 text-blue-200"
              } text-sm transition-colors`}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Opponent view - just show what's happening */}
      {phase === "selectingTarget" && !isOwner && (
        <div className="fixed inset-x-0 bottom-24 z-[201] pointer-events-none flex justify-center">
          <div
            className={`pointer-events-auto px-6 py-4 rounded-xl bg-black/90 ring-1 ${playerColorClass} shadow-lg flex items-center gap-4`}
          >
            <div className={`${playerBgClass} rounded-lg px-4 py-2`}>
              <div className="text-xs text-gray-400 mb-1">Revealed Site</div>
              <div className="text-amber-400 font-medium">
                {topSite?.name || "Unknown"}
              </div>
            </div>
            <span className="text-gray-400 text-sm">
              Opponent is selecting where to play...
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
