"use client";

import React from "react";
import { RcButton } from "@/components/ui/rc-button";
import { PLAYER_COLORS } from "@/lib/game/constants";
import { useGameStore } from "@/lib/game/store";

export default function RaiseDeadOverlay() {
  const pending = useGameStore((s) => s.pendingRaiseDead);
  const actorKey = useGameStore((s) => s.actorKey);
  const resolve = useGameStore((s) => s.resolveRaiseDead);
  const cancel = useGameStore((s) => s.cancelRaiseDead);

  if (!pending) return null;

  const {
    phase,
    casterSeat,
    eligibleMinions,
    selectedMinion,
    selectedFromSeat,
  } = pending;
  const isCaster = actorKey === null || casterSeat === actorKey;

  // Count minions from each graveyard
  const p1Count = eligibleMinions.filter((m) => m.fromSeat === "p1").length;
  const p2Count = eligibleMinions.filter((m) => m.fromSeat === "p2").length;

  return (
    <div className="fixed inset-0 z-[200] pointer-events-none">
      {/* Top bar with status */}
      <div className="fixed inset-x-0 top-6 z-[201] pointer-events-none flex justify-center">
        <div className="pointer-events-auto px-5 py-3 rounded-full border border-rc-line/22 bg-[rgba(7,10,20,0.9)] font-rc-sans text-rc-fg shadow-rc-panel text-lg md:text-xl flex items-center gap-3 select-none">
          <span className="font-rc-display text-rc-accent-link">
            Raise Dead
          </span>
          <span className="text-rc-fg-muted">
            {phase === "confirming" &&
              isCaster &&
              "Summon a random dead minion?"}
            {phase === "confirming" &&
              !isCaster &&
              `${casterSeat.toUpperCase()} is deciding...`}
            {phase === "resolving" && "Summoning..."}
            {phase === "complete" &&
              selectedMinion &&
              `Summoned ${selectedMinion.name}!`}
          </span>
        </div>
      </div>

      {/* Confirmation dialog - visible to caster */}
      {phase === "confirming" && isCaster && (
        <div className="fixed inset-0 flex items-center justify-center pointer-events-auto bg-[rgba(6,10,20,0.7)]">
          <div className="rounded-rc-lg border border-rc-line/18 bg-[rgba(9,13,25,0.95)] p-6 max-w-md w-full mx-4 font-rc-sans text-rc-fg shadow-rc-panel">
            <h2 className="mb-4 text-center font-rc-display text-[26px] leading-tight text-rc-fg-strong">
              Raise Dead
            </h2>
            <p className="text-rc-fg-muted text-center mb-4">
              Found{" "}
              <span className="font-rc-mono tabular-nums text-rc-accent-link font-bold">
                {eligibleMinions.length}
              </span>{" "}
              dead minion(s):
            </p>

            {/* Show breakdown by graveyard */}
            <div className="flex justify-center gap-6 mb-4 text-sm">
              {p1Count > 0 && (
                <div style={{ color: PLAYER_COLORS.p1 }}>
                  P1&apos;s graveyard:{" "}
                  <span className="font-rc-mono tabular-nums font-bold">
                    {p1Count}
                  </span>
                </div>
              )}
              {p2Count > 0 && (
                <div style={{ color: PLAYER_COLORS.p2 }}>
                  P2&apos;s graveyard:{" "}
                  <span className="font-rc-mono tabular-nums font-bold">
                    {p2Count}
                  </span>
                </div>
              )}
            </div>

            <p className="text-rc-fg-muted text-center mb-6 text-sm">
              Auto-resolve will pick a{" "}
              <span className="text-rc-accent-link">random</span> minion from
              all graveyards and summon it under your control.
            </p>

            {/* Action buttons */}
            <div className="flex gap-4 justify-center">
              <RcButton variant="outline" onClick={cancel}>
                Decline (Manual)
              </RcButton>
              <RcButton onClick={resolve}>Auto-Resolve</RcButton>
            </div>

            <p className="text-rc-fg-subtle text-xs text-center mt-4">
              Declining keeps the spell on board for manual resolution.
            </p>
          </div>
        </div>
      )}

      {/* Result display for complete phase */}
      {phase === "complete" && selectedMinion && (
        <div className="fixed inset-0 flex items-center justify-center pointer-events-none">
          <div className="rounded-rc-lg border border-rc-accent/45 bg-[rgba(9,13,25,0.9)] p-6 font-rc-sans text-rc-fg shadow-rc-panel animate-pulse">
            <p className="text-center font-rc-display text-[22px] leading-tight text-rc-fg-strong">
              {selectedMinion.name} rises from the{" "}
              {selectedFromSeat === casterSeat ? "your" : "opponent&apos;s"}{" "}
              graveyard!
            </p>
          </div>
        </div>
      )}

      {/* Opponent waiting indicator */}
      {phase === "confirming" && !isCaster && (
        <div className="fixed bottom-24 inset-x-0 z-[201] pointer-events-none flex justify-center">
          <div className="rc-toast">
            {casterSeat.toUpperCase()} is deciding whether to auto-resolve Raise
            Dead...
          </div>
        </div>
      )}
    </div>
  );
}
