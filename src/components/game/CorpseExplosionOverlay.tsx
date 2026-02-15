"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useGameStore } from "@/lib/game/store";
import { getCellNumber, toCellKey } from "@/lib/game/store/utils/boardHelpers";

export default function CorpseExplosionOverlay() {
  const pending = useGameStore((s) => s.pendingCorpseExplosion);
  const actorKey = useGameStore((s) => s.actorKey);
  const board = useGameStore((s) => s.board);
  const metaByCardId = useGameStore((s) => s.metaByCardId);

  const selectCorpse = useGameStore((s) => s.selectCorpse);
  const assignCorpseToTile = useGameStore((s) => s.assignCorpseToTile);
  const unassignCorpse = useGameStore((s) => s.unassignCorpse);
  const repickCorpseExplosionArea = useGameStore(
    (s) => s.repickCorpseExplosionArea,
  );
  const resolveCorpseExplosion = useGameStore(
    (s) => s.resolveCorpseExplosion,
  );
  const dismissCorpseExplosionReport = useGameStore(
    (s) => s.dismissCorpseExplosionReport,
  );
  const cancelCorpseExplosion = useGameStore(
    (s) => s.cancelCorpseExplosion,
  );

  const [reportVisible, setReportVisible] = useState(true);

  // Reset visibility when entering resolved phase
  useEffect(() => {
    if (pending?.phase === "resolved") {
      setReportVisible(true);
    }
  }, [pending?.phase]);

  const isCaster = pending?.casterSeat === actorKey || !actorKey;

  // Handle tile clicks during assigningCorpses phase
  const handleAssignClick = useCallback(
    (x: number, y: number) => {
      if (!pending || !isCaster || pending.phase !== "assigningCorpses") return;
      if (!pending.areaCorner) return;

      const cellKey = toCellKey(x, y);
      // Check if tile already has assignment — if so, unassign
      if (pending.assignments.some((a) => a.cellKey === cellKey)) {
        unassignCorpse(cellKey);
        return;
      }
      // If a corpse is selected, assign it to this tile
      if (pending.selectedCorpse) {
        assignCorpseToTile(cellKey);
      }
    },
    [pending, isCaster, assignCorpseToTile, unassignCorpse],
  );

  // Register click handler for board interaction
  useEffect(() => {
    if (!pending || !isCaster) return;

    const handleBoardClick = (e: CustomEvent<{ x: number; y: number }>) => {
      const { x, y } = e.detail;
      if (pending.phase === "assigningCorpses") {
        handleAssignClick(x, y);
      }
    };

    window.addEventListener(
      "corpseExplosion:tileClick",
      handleBoardClick as EventListener,
    );
    return () => {
      window.removeEventListener(
        "corpseExplosion:tileClick",
        handleBoardClick as EventListener,
      );
    };
  }, [pending, isCaster, handleAssignClick]);

  if (!pending) return null;
  const phase = pending.phase;

  // Get affected cells display
  const getAffectedCellsDisplay = () => {
    if (!pending.areaCorner) return "Not selected";
    return pending.affectedCells
      .map((cellKey) => {
        const [cx, cy] = cellKey.split(",").map(Number);
        const site = board.sites[cellKey];
        const cellNo = getCellNumber(cx, cy, board.size.w, board.size.h);
        return `#${cellNo}${site ? ` (${site.card?.name || "site"})` : " (void)"}`;
      })
      .join(", ");
  };

  // Get assignment display for a cell
  const getAssignmentForCell = (cellKey: string) => {
    return pending.assignments.find((a) => a.cellKey === cellKey);
  };

  return (
    <div className="fixed inset-0 z-[200] pointer-events-none">
      {/* Top bar with status */}
      <div className="fixed inset-x-0 top-6 z-[201] pointer-events-none flex justify-center">
        <div className="pointer-events-auto px-5 py-3 rounded-full bg-black/90 text-white ring-1 ring-red-500/50 shadow-lg text-lg md:text-xl flex items-center gap-3 select-none">
          <span className="text-red-400 font-fantaisie flex items-center gap-1">
            <img src="/fire.png" alt="fire" className="w-5 h-5" /> Corpse
            Explosion
          </span>
          <span className="opacity-80">
            {phase === "selectingArea" &&
              (isCaster
                ? "Click the upper-left tile of the 2×2 area"
                : `${pending.casterSeat.toUpperCase()} is selecting an area...`)}
            {phase === "assigningCorpses" &&
              (isCaster
                ? pending.selectedCorpse
                  ? `Click a highlighted tile to deal ${pending.selectedCorpse.card.name} there`
                  : "Select a corpse from cemetery, then click a tile"
                : `${pending.casterSeat.toUpperCase()} is assigning corpses...`)}
            {phase === "resolving" && "Resolving..."}
            {phase === "resolved" && "Resolved — review damage report"}
          </span>
          {isCaster && phase === "selectingArea" && (
            <button
              className="mx-1 rounded bg-white/15 hover:bg-white/25 px-3 py-1 select-none"
              onClick={() => cancelCorpseExplosion()}
            >
              Cancel
            </button>
          )}
          {phase === "resolved" && (
            <>
              {!reportVisible && (
                <button
                  className="mx-1 rounded bg-white/15 hover:bg-white/25 px-3 py-1 select-none text-sm"
                  onClick={() => setReportVisible(true)}
                >
                  Show Report
                </button>
              )}
              <button
                className="mx-1 rounded bg-red-600/80 hover:bg-red-500 px-3 py-1 select-none text-sm"
                onClick={() => dismissCorpseExplosionReport()}
              >
                Dismiss
              </button>
            </>
          )}
        </div>
      </div>

      {/* Corpse picker panel (right side) - during assigningCorpses phase */}
      {phase === "assigningCorpses" && isCaster && (
        <div className="fixed right-4 top-20 bottom-32 z-[201] pointer-events-auto w-56 flex flex-col">
          <div className="bg-black/95 rounded-xl ring-1 ring-red-500/30 shadow-lg overflow-hidden flex flex-col max-h-full">
            <div className="px-4 py-2 border-b border-white/10 text-sm text-white/60">
              Cemetery — Pick a corpse
            </div>
            <div className="overflow-y-auto flex-1 p-2 space-y-1">
              {pending.eligibleCorpses.length === 0 && (
                <div className="text-white/40 text-xs text-center py-4">
                  No more corpses available
                </div>
              )}
              {pending.eligibleCorpses.map((entry, idx) => {
                const isSelected =
                  pending.selectedCorpse?.card.instanceId ===
                    entry.card.instanceId &&
                  pending.selectedCorpse?.card.cardId === entry.card.cardId &&
                  pending.selectedCorpse?.fromSeat === entry.fromSeat;
                const meta = metaByCardId[entry.card.cardId];
                const rawAtk = typeof entry.card.attack === "number" && Number.isFinite(entry.card.attack)
                  ? entry.card.attack
                  : typeof meta?.attack === "number" && Number.isFinite(meta.attack)
                    ? meta.attack
                    : 0;
                const power = Math.max(0, rawAtk);
                return (
                  <button
                    key={`${entry.fromSeat}-${entry.card.instanceId || idx}`}
                    className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                      isSelected
                        ? "bg-red-600/40 ring-1 ring-red-400 text-white"
                        : "bg-white/5 hover:bg-white/10 text-white/80"
                    }`}
                    onClick={() => selectCorpse(entry.card, entry.fromSeat)}
                  >
                    <div className="font-medium truncate">
                      {entry.card.name}
                    </div>
                    <div className="text-xs text-white/50 flex justify-between">
                      <span>ATK {power}</span>
                      <span className="uppercase">
                        {entry.fromSeat} cemetery
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Bottom panel with assignments and resolve/cancel buttons */}
      {(phase === "assigningCorpses" || phase === "resolving") &&
        pending.areaCorner && (
          <div className="fixed bottom-24 inset-x-0 z-[201] pointer-events-none flex justify-center">
            <div className="pointer-events-auto px-6 py-4 rounded-xl bg-black/95 text-white ring-1 ring-red-500/30 shadow-lg max-w-lg">
              <div className="text-sm text-white/60 mb-2">Target Area:</div>
              <div className="text-red-300 text-sm mb-3">
                {getAffectedCellsDisplay()}
              </div>

              {/* Assignment list */}
              {pending.assignments.length > 0 && (
                <div className="mb-3 space-y-1">
                  <div className="text-sm text-white/60">
                    Corpses dealt to sites:
                  </div>
                  {pending.assignments.map((a) => {
                    const [cx, cy] = a.cellKey.split(",").map(Number);
                    const cellNo = getCellNumber(cx, cy, board.size.w, board.size.h);
                    return (
                      <div
                        key={a.cellKey}
                        className="flex items-center justify-between text-sm bg-white/5 rounded px-3 py-1"
                      >
                        <span>
                          {a.corpse.name} (ATK {a.power}) → #{cellNo}
                        </span>
                        {isCaster && phase === "assigningCorpses" && (
                          <button
                            className="text-red-400 hover:text-red-300 text-xs ml-2"
                            onClick={() => unassignCorpse(a.cellKey)}
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Unassigned tiles */}
              {phase === "assigningCorpses" && (
                <div className="text-xs text-white/40 mb-3">
                  {pending.affectedCells.filter(
                    (c) => !getAssignmentForCell(c),
                  ).length > 0
                    ? `${pending.affectedCells.filter((c) => !getAssignmentForCell(c)).length} tile(s) without corpses`
                    : "All tiles assigned"}
                </div>
              )}

              {phase === "assigningCorpses" && isCaster && (
                <div className="flex gap-2 mt-2">
                  <button
                    className={`flex-1 py-2 rounded-lg font-medium transition-colors ${
                      pending.assignments.length > 0
                        ? "bg-red-600 hover:bg-red-500 text-white"
                        : "bg-white/10 text-white/30 cursor-not-allowed"
                    }`}
                    disabled={pending.assignments.length === 0}
                    onClick={() => resolveCorpseExplosion()}
                  >
                    Resolve ({pending.assignments.length} corpse
                    {pending.assignments.length !== 1 ? "s" : ""})
                  </button>
                  <button
                    className="px-4 py-2 rounded-lg bg-white/15 hover:bg-white/25 text-white transition-colors"
                    onClick={() => repickCorpseExplosionArea()}
                  >
                    Re-pick area
                  </button>
                  <button
                    className="px-4 py-2 rounded-lg bg-white/15 hover:bg-white/25 text-white transition-colors"
                    onClick={() => cancelCorpseExplosion()}
                  >
                    Cancel
                  </button>
                </div>
              )}

              {phase === "resolving" && (
                <div className="text-center text-red-400 animate-pulse">
                  Dealing damage and banishing corpses...
                </div>
              )}
            </div>
          </div>
        )}

      {/* Resolution damage report — hidable, non-obscuring */}
      {phase === "resolved" && pending.resolvedReport && reportVisible && (
        <div className="fixed left-4 top-20 z-[201] pointer-events-auto max-w-sm">
          <div className="bg-black/90 rounded-xl ring-1 ring-red-500/40 shadow-lg overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2 border-b border-white/10">
              <span className="text-sm text-red-300 font-medium">
                Damage Report
              </span>
              <button
                className="text-white/40 hover:text-white/70 text-xs px-2"
                onClick={() => setReportVisible(false)}
              >
                Hide
              </button>
            </div>
            <div className="p-3 space-y-2 max-h-64 overflow-y-auto">
              {pending.resolvedReport.map((entry) => {
                const [cx, cy] = entry.cellKey.split(",").map(Number);
                const cellNo = getCellNumber(cx, cy, board.size.w, board.size.h);
                const site = board.sites[entry.cellKey];
                return (
                  <div
                    key={entry.cellKey}
                    className="bg-white/5 rounded-lg px-3 py-2"
                  >
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-red-300">
                        #{cellNo}
                        {site?.card?.name ? ` (${site.card.name})` : ""}
                      </span>
                      <span className="text-white/50 text-xs">
                        {entry.corpseName} — ATK {entry.power}
                      </span>
                    </div>
                    {entry.unitsHit.length > 0 ? (
                      <div className="mt-1 space-y-0.5">
                        {entry.unitsHit.map((u, i) => (
                          <div
                            key={i}
                            className="text-xs flex items-center gap-1"
                          >
                            <span className="text-orange-400">
                              {u.damageTaken} dmg
                            </span>
                            <span className="text-white/60">→ {u.name}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-xs text-white/30 mt-1">
                        No units at this tile
                      </div>
                    )}
                  </div>
                );
              })}
              <div className="text-xs text-white/40 text-center pt-1">
                All assigned corpses have been banished.
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
