"use client";

import React from "react";
import { useGameStore } from "@/lib/game/store";
import { getCellNumber } from "@/lib/game/store/utils/boardHelpers";

export default function MirrorRealmOverlay() {
  const pending = useGameStore((s) => s.pendingMirrorRealm);
  const actorKey = useGameStore((s) => s.actorKey);
  const boardSize = useGameStore((s) => s.board.size);
  const sites = useGameStore((s) => s.board.sites);
  const selectTarget = useGameStore((s) => s.selectMirrorRealmTarget);
  const resolve = useGameStore((s) => s.resolveMirrorRealm);
  const cancel = useGameStore((s) => s.cancelMirrorRealm);

  if (!pending) return null;

  const { phase, casterSeat, nearbySites, selectedTarget, mirrorRealmCell } = pending;

  // Hotseat: actorKey is null, always show caster UI
  // Online: only show caster UI if we're the caster
  const isCaster = actorKey === null || casterSeat === actorKey;

  const mirrorCellNo = getCellNumber(
    ...mirrorRealmCell.split(",").map(Number) as [number, number],
    boardSize.w, boardSize.h
  );

  return (
    <div className="fixed inset-0 z-[200] pointer-events-none">
      {/* Top status bar */}
      <div className="fixed inset-x-0 top-6 z-[201] pointer-events-none flex justify-center">
        <div className="pointer-events-auto px-5 py-3 rounded-full bg-black/90 text-white ring-1 ring-purple-500/50 shadow-lg text-lg flex items-center gap-3">
          <span className="text-purple-400 font-fantaisie">🪞 Mirror Realm</span>
          <span className="opacity-80">
            {phase === "selecting" && isCaster && "Select a nearby site to copy"}
            {phase === "selecting" && !isCaster && `${casterSeat.toUpperCase()} is selecting a site to copy`}
            {phase === "resolving" && "Transforming..."}
          </span>
        </div>
      </div>

      {/* Caster UI */}
      {isCaster && phase === "selecting" && (
        <div className="fixed inset-0 flex items-center justify-center pointer-events-auto bg-black/70">
          <div className="bg-black/95 rounded-xl p-6 max-w-2xl w-full mx-4 ring-1 ring-purple-500/30">
            <h3 className="text-xl font-bold text-purple-300 mb-4">
              Mirror Realm at #{mirrorCellNo}
            </h3>
            <p className="text-gray-300 mb-6">
              Choose a nearby site to copy. Mirror Realm will transform into that site with the same abilities, mana, and thresholds.
            </p>

            {nearbySites.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-gray-400 mb-4">No nearby sites to copy</p>
                <button
                  onClick={cancel}
                  className="px-6 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-white transition-colors"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <>
                {/* Site selection grid */}
                <div className="grid grid-cols-3 gap-3 mb-6">
                  {nearbySites.map((cellKey) => {
                    const site = sites[cellKey];
                    const cellNo = getCellNumber(
                      ...cellKey.split(",").map(Number) as [number, number],
                      boardSize.w, boardSize.h
                    );
                    const isSelected = selectedTarget === cellKey;

                    return (
                      <button
                        key={cellKey}
                        onClick={() => selectTarget(cellKey)}
                        className={`
                          p-4 rounded-lg border-2 transition-all text-left
                          ${
                            isSelected
                              ? "border-purple-500 bg-purple-500/20 ring-2 ring-purple-400/50"
                              : "border-gray-600 bg-gray-800/50 hover:border-purple-400/50 hover:bg-gray-700/50"
                          }
                        `}
                      >
                        <div className="text-sm text-gray-400 mb-1">
                          Site #{cellNo}
                        </div>
                        <div className="font-semibold text-white">
                          {site?.card?.name || "Unknown"}
                        </div>
                        {isSelected && (
                          <div className="text-xs text-purple-300 mt-2">
                            ✓ Selected
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>

                {/* Action buttons */}
                <div className="flex gap-3 justify-end">
                  <button
                    onClick={cancel}
                    className="px-6 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-white transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={resolve}
                    disabled={!selectedTarget}
                    className={`
                      px-6 py-2 rounded-lg font-semibold transition-colors
                      ${
                        selectedTarget
                          ? "bg-purple-600 hover:bg-purple-500 text-white"
                          : "bg-gray-700 text-gray-500 cursor-not-allowed"
                      }
                    `}
                  >
                    Transform
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Opponent waiting indicator */}
      {!isCaster && phase !== "complete" && (
        <div className="fixed bottom-24 inset-x-0 z-[201] pointer-events-none flex justify-center">
          <div className="px-4 py-2 rounded-lg bg-black/90 text-sm text-purple-300">
            {casterSeat.toUpperCase()} is choosing a site to copy with Mirror Realm...
          </div>
        </div>
      )}
    </div>
  );
}
