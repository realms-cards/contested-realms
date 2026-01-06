"use client";

import Image from "next/image";
import React from "react";
import { useGameStore } from "@/lib/game/store";
import {
  parseCellKey,
  getCellNumber,
} from "@/lib/game/store/utils/boardHelpers";

export default function FrontierSettlersOverlay() {
  const pending = useGameStore((s) => s.pendingFrontierSettlers);
  const actorKey = useGameStore((s) => s.actorKey);
  const board = useGameStore((s) => s.board);
  const selectTarget = useGameStore((s) => s.selectFrontierSettlersTarget);
  const resolve = useGameStore((s) => s.resolveFrontierSettlers);
  const cancel = useGameStore((s) => s.cancelFrontierSettlers);

  if (!pending) return null;

  const { phase, ownerSeat, revealedSite, validTargets, selectedTarget } =
    pending;
  const isOwner = actorKey === null || ownerSeat === actorKey;

  return (
    <div className="fixed inset-0 z-[200] pointer-events-none">
      {/* Top bar with status */}
      <div className="fixed inset-x-0 top-6 z-[201] pointer-events-none flex justify-center">
        <div className="pointer-events-auto px-5 py-3 rounded-full bg-black/90 text-white ring-1 ring-green-500/50 shadow-lg text-lg md:text-xl flex items-center gap-3 select-none">
          <span className="text-green-400 font-fantaisie">
            🏕️ Frontier Settlers
          </span>
          <span className="opacity-80">
            {phase === "revealing" && "Revealing top site..."}
            {phase === "selecting_target" &&
              isOwner &&
              (selectedTarget
                ? "Confirm placement"
                : "Select adjacent void or rubble")}
            {phase === "selecting_target" &&
              !isOwner &&
              `${ownerSeat.toUpperCase()} is placing a site...`}
            {phase === "complete" && "Done!"}
          </span>
        </div>
      </div>

      {/* Reveal and target selection - visible to owner */}
      {(phase === "revealing" || phase === "selecting_target") && isOwner && (
        <div className="fixed inset-0 flex items-center justify-center pointer-events-auto bg-black/70">
          <div className="bg-black/95 rounded-xl p-6 max-w-lg w-full mx-4 ring-1 ring-green-500/30">
            <h2 className="text-2xl font-fantaisie text-green-400 mb-4 text-center">
              Frontier Settlers Ability
            </h2>

            {/* Show revealed site */}
            {revealedSite && (
              <div className="flex flex-col items-center mb-6">
                <p className="text-gray-400 text-center mb-3">
                  Revealed from atlas:
                </p>
                <div className="relative w-32 aspect-[2.5/3.5] rounded-lg overflow-hidden ring-2 ring-green-500">
                  <Image
                    src={`/api/images/${
                      revealedSite.slug || revealedSite.cardId
                    }`}
                    alt={revealedSite.name || "Site"}
                    fill
                    className="object-cover"
                    unoptimized
                  />
                </div>
                <p className="mt-2 text-green-400 font-medium">
                  {revealedSite.name || "Site"}
                </p>
              </div>
            )}

            {/* Target selection */}
            {phase === "selecting_target" && (
              <>
                <p className="text-gray-400 text-center mb-4">
                  Select an adjacent tile to place this site:
                </p>
                <div className="grid grid-cols-2 gap-3 mb-6">
                  {validTargets.map((cellKey) => {
                    const { x, y } = parseCellKey(cellKey);
                    const cellNum = getCellNumber(x, y, board.size.w);
                    const existingSite = board.sites[cellKey];
                    const isRubble =
                      existingSite?.card?.name?.toLowerCase() === "rubble";
                    const isSelected = selectedTarget === cellKey;

                    return (
                      <button
                        key={cellKey}
                        onClick={() => selectTarget(cellKey)}
                        className={`p-3 rounded-lg border-2 transition-all ${
                          isSelected
                            ? "border-green-500 bg-green-500/20"
                            : "border-gray-600 hover:border-green-400 bg-gray-800/50"
                        }`}
                      >
                        <div className="text-lg font-bold text-white">
                          Tile #{cellNum}
                        </div>
                        <div className="text-sm text-gray-400">
                          {isRubble ? "🪨 Rubble" : "◻️ Void"}
                        </div>
                      </button>
                    );
                  })}
                </div>

                {/* Action buttons */}
                <div className="flex justify-center gap-4">
                  <button
                    onClick={resolve}
                    disabled={!selectedTarget}
                    className={`px-6 py-2 rounded-lg font-medium transition-colors ${
                      selectedTarget
                        ? "bg-green-600 hover:bg-green-500 text-white"
                        : "bg-gray-600 text-gray-400 cursor-not-allowed"
                    }`}
                  >
                    Place Site & Move
                  </button>
                  <button
                    onClick={cancel}
                    className="px-6 py-2 bg-gray-600 hover:bg-gray-500 text-white rounded-lg font-medium transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Opponent view */}
      {phase === "selecting_target" && !isOwner && (
        <div className="fixed bottom-24 inset-x-0 z-[201] pointer-events-none flex justify-center">
          <div className="pointer-events-auto px-4 py-2 rounded-lg bg-black/90 text-sm text-green-300 ring-1 ring-green-500/30">
            {ownerSeat.toUpperCase()} is using Frontier Settlers to place a
            site...
          </div>
        </div>
      )}
    </div>
  );
}
