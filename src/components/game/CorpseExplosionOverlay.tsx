"use client";

import React, { useCallback, useEffect, useState } from "react";
import { RcButton } from "@/components/ui/rc-button";
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
        <div className="pointer-events-auto px-5 py-3 rounded-full border border-rc-line/22 bg-[rgba(7,10,20,0.9)] font-rc-sans text-rc-fg shadow-rc-panel text-lg md:text-xl flex items-center gap-3 select-none">
          <span className="font-rc-display text-rc-accent-link flex items-center gap-1">
            <img src="/fire.png" alt="fire" className="w-5 h-5" /> Corpse
            Explosion
          </span>
          <span className="text-rc-fg-muted">
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
            <RcButton
              variant="outline"
              size="xs"
              className="mx-1"
              onClick={() => cancelCorpseExplosion()}
            >
              Cancel
            </RcButton>
          )}
          {phase === "resolved" && (
            <>
              {!reportVisible && (
                <RcButton
                  variant="quiet"
                  size="xs"
                  className="mx-1"
                  onClick={() => setReportVisible(true)}
                >
                  Show Report
                </RcButton>
              )}
              <RcButton
                size="xs"
                className="mx-1"
                onClick={() => dismissCorpseExplosionReport()}
              >
                Dismiss
              </RcButton>
            </>
          )}
        </div>
      </div>

      {/* Corpse picker panel (right side) - during assigningCorpses phase */}
      {phase === "assigningCorpses" && isCaster && (
        <div className="fixed right-4 top-20 bottom-32 z-[201] pointer-events-auto w-56 flex flex-col">
          <div className="rounded-rc-lg border border-rc-line/18 bg-[rgba(9,13,25,0.95)] font-rc-sans text-rc-fg shadow-rc-panel overflow-hidden flex flex-col max-h-full">
            <div className="px-4 py-2 border-b border-rc-line/14 text-sm text-rc-fg-subtle">
              Cemetery — Pick a corpse
            </div>
            <div className="thin-scrollbar overflow-y-auto flex-1 p-2 space-y-1">
              {pending.eligibleCorpses.length === 0 && (
                <div className="rc-hint text-center py-4">
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
                    className={`w-full text-left px-3 py-2 rounded-rc-md border text-sm transition-colors ${
                      isSelected
                        ? "border-rc-accent bg-rc-accent/12 text-rc-fg-strong shadow-[0_0_14px_rgba(243,207,106,0.25)]"
                        : "border-rc-line/18 bg-black/30 text-rc-fg hover:border-rc-accent/60 hover:bg-rc-accent/8"
                    }`}
                    onClick={() => selectCorpse(entry.card, entry.fromSeat)}
                  >
                    <div className="font-rc-display text-rc-fg-strong truncate">
                      {entry.card.name}
                    </div>
                    <div className="text-xs text-rc-fg-subtle flex justify-between">
                      <span className="font-rc-mono tabular-nums">ATK {power}</span>
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
            <div className="pointer-events-auto px-6 py-4 rounded-rc-lg border border-rc-line/18 bg-[rgba(9,13,25,0.95)] font-rc-sans text-rc-fg shadow-rc-panel max-w-lg">
              <div className="text-sm text-rc-fg-subtle mb-2">Target Area:</div>
              <div className="text-rc-fg-strong text-sm mb-3">
                {getAffectedCellsDisplay()}
              </div>

              {/* Assignment list */}
              {pending.assignments.length > 0 && (
                <div className="mb-3 space-y-1">
                  <div className="text-sm text-rc-fg-subtle">
                    Corpses dealt to sites:
                  </div>
                  {pending.assignments.map((a) => {
                    const [cx, cy] = a.cellKey.split(",").map(Number);
                    const cellNo = getCellNumber(cx, cy, board.size.w, board.size.h);
                    return (
                      <div
                        key={a.cellKey}
                        className="flex items-center justify-between text-sm rounded-rc-md border border-rc-line/12 bg-black/30 px-3 py-1"
                      >
                        <span>
                          {a.corpse.name} (ATK {a.power}) → #{cellNo}
                        </span>
                        {isCaster && phase === "assigningCorpses" && (
                          <button
                            className="text-rc-danger hover:text-rc-danger-hover transition-colors text-xs ml-2"
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
                <div className="text-xs text-rc-fg-subtle mb-3">
                  {pending.affectedCells.filter(
                    (c) => !getAssignmentForCell(c),
                  ).length > 0
                    ? `${pending.affectedCells.filter((c) => !getAssignmentForCell(c)).length} tile(s) without corpses`
                    : "All tiles assigned"}
                </div>
              )}

              {phase === "assigningCorpses" && isCaster && (
                <div className="flex gap-2 mt-2">
                  <RcButton
                    className="flex-1 h-auto py-2 whitespace-normal"
                    disabled={pending.assignments.length === 0}
                    onClick={() => resolveCorpseExplosion()}
                  >
                    Resolve ({pending.assignments.length} corpse
                    {pending.assignments.length !== 1 ? "s" : ""})
                  </RcButton>
                  <RcButton
                    variant="outline"
                    className="h-auto py-2 whitespace-normal"
                    onClick={() => repickCorpseExplosionArea()}
                  >
                    Re-pick area
                  </RcButton>
                  <RcButton
                    variant="outline"
                    className="h-auto py-2 whitespace-normal"
                    onClick={() => cancelCorpseExplosion()}
                  >
                    Cancel
                  </RcButton>
                </div>
              )}

              {phase === "resolving" && (
                <div className="text-center text-rc-accent-link animate-pulse">
                  Dealing damage and banishing corpses...
                </div>
              )}
            </div>
          </div>
        )}

      {/* Resolution damage report — hidable, non-obscuring */}
      {phase === "resolved" && pending.resolvedReport && reportVisible && (
        <div className="fixed left-4 top-20 z-[201] pointer-events-auto max-w-sm">
          <div className="rounded-rc-lg border border-rc-line/18 bg-[rgba(9,13,25,0.9)] font-rc-sans text-rc-fg shadow-rc-panel overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2 border-b border-rc-line/14">
              <span className="rc-eyebrow">
                Damage Report
              </span>
              <RcButton
                variant="ghost"
                size="xs"
                className="h-6 px-2"
                onClick={() => setReportVisible(false)}
              >
                Hide
              </RcButton>
            </div>
            <div className="thin-scrollbar p-3 space-y-2 max-h-64 overflow-y-auto">
              {pending.resolvedReport.map((entry) => {
                const [cx, cy] = entry.cellKey.split(",").map(Number);
                const cellNo = getCellNumber(cx, cy, board.size.w, board.size.h);
                const site = board.sites[entry.cellKey];
                return (
                  <div
                    key={entry.cellKey}
                    className="rounded-rc-md border border-rc-line/12 bg-black/30 px-3 py-2"
                  >
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-rc-fg-strong">
                        #{cellNo}
                        {site?.card?.name ? ` (${site.card.name})` : ""}
                      </span>
                      <span className="text-rc-fg-subtle text-xs">
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
                            <span className="font-rc-mono tabular-nums text-rc-danger">
                              {u.damageTaken} dmg
                            </span>
                            <span className="text-rc-fg-subtle">→ {u.name}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-xs text-rc-fg-dim mt-1">
                        No units at this tile
                      </div>
                    )}
                  </div>
                );
              })}
              <div className="text-xs text-rc-fg-subtle text-center pt-1">
                All assigned corpses have been banished.
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
