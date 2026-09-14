"use client";

import React from "react";
import { RcButton } from "@/components/ui/rc-button";
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
        <div className="pointer-events-auto px-5 py-3 rounded-full border border-rc-line/22 bg-[rgba(7,10,20,0.9)] font-rc-sans text-rc-fg shadow-rc-panel text-lg flex items-center gap-3">
          <span className="font-rc-display text-rc-accent-link">Mirror Realm</span>
          <span className="text-rc-fg-muted">
            {phase === "selecting" && isCaster && "Select a nearby site to copy"}
            {phase === "selecting" && !isCaster && `${casterSeat.toUpperCase()} is selecting a site to copy`}
            {phase === "resolving" && "Transforming..."}
          </span>
        </div>
      </div>

      {/* Caster UI */}
      {isCaster && phase === "selecting" && (
        <div className="fixed inset-0 flex items-center justify-center pointer-events-auto bg-[rgba(6,10,20,0.7)]">
          <div className="rounded-rc-lg border border-rc-line/18 bg-[rgba(9,13,25,0.95)] p-6 max-w-2xl w-full mx-4 font-rc-sans text-rc-fg shadow-rc-panel">
            <h3 className="mb-4 font-rc-display text-[22px] leading-tight text-rc-fg-strong">
              Mirror Realm at #{mirrorCellNo}
            </h3>
            <p className="text-rc-fg-muted mb-6">
              Choose a nearby site to copy. Mirror Realm will transform into that site with the same abilities, mana, and thresholds.
            </p>

            {nearbySites.length === 0 ? (
              <div className="text-center py-8">
                <p className="rc-hint mb-4">No nearby sites to copy</p>
                <RcButton variant="outline" onClick={cancel}>
                  Cancel
                </RcButton>
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
                          p-4 rounded-rc-md border transition-colors text-left
                          ${
                            isSelected
                              ? "border-rc-accent bg-rc-accent/12 shadow-[0_0_14px_rgba(243,207,106,0.25)]"
                              : "border-rc-line/18 bg-black/30 hover:border-rc-accent/60 hover:bg-rc-accent/8"
                          }
                        `}
                      >
                        <div className="font-rc-mono tabular-nums text-sm text-rc-fg-muted mb-1">
                          Site #{cellNo}
                        </div>
                        <div className="font-rc-display text-rc-fg-strong">
                          {site?.card?.name || "Unknown"}
                        </div>
                        {isSelected && (
                          <div className="text-xs text-rc-accent-link mt-2">
                            ✓ Selected
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>

                {/* Action buttons */}
                <div className="flex gap-3 justify-end">
                  <RcButton variant="outline" onClick={cancel}>
                    Cancel
                  </RcButton>
                  <RcButton onClick={resolve} disabled={!selectedTarget}>
                    Transform
                  </RcButton>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Opponent waiting indicator */}
      {!isCaster && phase !== "complete" && (
        <div className="fixed bottom-24 inset-x-0 z-[201] pointer-events-none flex justify-center">
          <div className="rc-toast">
            {casterSeat.toUpperCase()} is choosing a site to copy with Mirror Realm...
          </div>
        </div>
      )}
    </div>
  );
}
