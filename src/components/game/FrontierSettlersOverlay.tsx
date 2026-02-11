"use client";

import Image from "next/image";
import React from "react";
import { useGameStore } from "@/lib/game/store";
import {
  parseCellKey,
  getCellNumber,
} from "@/lib/game/store/utils/boardHelpers";

/**
 * FrontierSettlersOverlay — compact floating panel for Frontier Settlers ability.
 *
 * Shows the revealed site card and target tile buttons without blocking the
 * board view. Mobile-friendly layout anchored to the bottom-left.
 */
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

  // Opponent view — small indicator
  if (!isOwner && phase === "selecting_target") {
    return (
      <div className="fixed left-4 bottom-28 z-[201] pointer-events-none">
        <div className="rounded-xl bg-black/85 backdrop-blur-sm ring-1 ring-green-500/40 shadow-lg px-3 py-2">
          <div className="text-green-400 font-medium text-sm">
            Frontier Settlers
          </div>
          <div className="text-gray-400 text-[11px]">
            {ownerSeat.toUpperCase()} is placing a site…
          </div>
        </div>
      </div>
    );
  }

  // Owner view — compact floating panel
  if (!isOwner || (phase !== "revealing" && phase !== "selecting_target"))
    return null;

  return (
    <div className="fixed left-4 bottom-28 z-[201] pointer-events-auto">
      <div
        className="rounded-xl bg-black/85 backdrop-blur-sm ring-1 ring-green-500/60 shadow-2xl overflow-hidden"
        style={{ width: 190 }}
      >
        {/* Revealed site card image */}
        {revealedSite && (
          <div className="relative w-full">
            <Image
              src={`/api/images/${revealedSite.slug || revealedSite.cardId}`}
              alt={revealedSite.name || "Site"}
              width={190}
              height={136}
              className="w-full h-auto object-cover"
              unoptimized
            />
          </div>
        )}

        <div className="px-3 py-2 flex flex-col gap-1.5">
          {/* Site name */}
          <div className="text-green-400 font-medium text-sm truncate">
            {revealedSite?.name || "Site"}
          </div>

          {/* Target selection */}
          {phase === "selecting_target" && (
            <>
              <div className="text-gray-400 text-[11px] leading-tight">
                Select a tile:
              </div>
              <div className="flex flex-wrap gap-1">
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
                      className={`px-2 py-1 rounded text-[11px] font-medium transition-colors ${
                        isSelected
                          ? "bg-green-600 text-white ring-1 ring-green-400"
                          : "bg-gray-700/60 hover:bg-gray-600/60 text-gray-300"
                      }`}
                    >
                      #{cellNum} {isRubble ? "🪨" : "◻️"}
                    </button>
                  );
                })}
              </div>

              {/* Action buttons */}
              <button
                onClick={resolve}
                disabled={!selectedTarget}
                className={`w-full mt-1 px-2 py-1 rounded-lg text-xs font-medium transition-colors ${
                  selectedTarget
                    ? "bg-green-600 hover:bg-green-500 text-white"
                    : "bg-gray-700 text-gray-500 cursor-not-allowed"
                }`}
              >
                Place & Move
              </button>
            </>
          )}

          {/* Revealing phase — just waiting */}
          {phase === "revealing" && (
            <div className="text-gray-400 text-[11px]">
              Revealing from atlas…
            </div>
          )}

          <button
            onClick={cancel}
            className="w-full px-2 py-1 rounded-lg bg-gray-700/60 hover:bg-gray-600/60 text-gray-300 text-xs font-medium transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
