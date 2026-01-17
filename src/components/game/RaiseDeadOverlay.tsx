"use client";

import React from "react";
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
        <div className="pointer-events-auto px-5 py-3 rounded-full bg-black/90 text-white ring-1 ring-green-500/50 shadow-lg text-lg md:text-xl flex items-center gap-3 select-none">
          <span className="text-green-400 font-fantaisie">💀 Raise Dead</span>
          <span className="opacity-80">
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
        <div className="fixed inset-0 flex items-center justify-center pointer-events-auto bg-black/70">
          <div className="bg-black/95 rounded-xl p-6 max-w-md w-full mx-4 ring-1 ring-green-500/30">
            <h2 className="text-2xl font-fantaisie text-green-400 mb-4 text-center">
              Raise Dead
            </h2>
            <p className="text-gray-300 text-center mb-4">
              Found{" "}
              <span className="text-green-400 font-bold">
                {eligibleMinions.length}
              </span>{" "}
              dead minion(s):
            </p>

            {/* Show breakdown by graveyard */}
            <div className="flex justify-center gap-6 mb-4 text-sm">
              {p1Count > 0 && (
                <div className="text-blue-400">
                  P1&apos;s graveyard:{" "}
                  <span className="font-bold">{p1Count}</span>
                </div>
              )}
              {p2Count > 0 && (
                <div className="text-red-400">
                  P2&apos;s graveyard:{" "}
                  <span className="font-bold">{p2Count}</span>
                </div>
              )}
            </div>

            <p className="text-gray-400 text-center mb-6 text-sm">
              Auto-resolve will pick a{" "}
              <span className="text-yellow-400">random</span> minion from all
              graveyards and summon it under your control.
            </p>

            {/* Action buttons */}
            <div className="flex gap-4 justify-center">
              <button
                onClick={cancel}
                className="px-6 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-white transition-colors"
              >
                Decline (Manual)
              </button>
              <button
                onClick={resolve}
                className="px-6 py-2 rounded-lg bg-green-600 hover:bg-green-500 text-white font-semibold transition-colors ring-1 ring-green-400/50"
              >
                Auto-Resolve
              </button>
            </div>

            <p className="text-gray-500 text-xs text-center mt-4">
              Declining will send Raise Dead to graveyard without effect.
            </p>
          </div>
        </div>
      )}

      {/* Result display for complete phase */}
      {phase === "complete" && selectedMinion && (
        <div className="fixed inset-0 flex items-center justify-center pointer-events-none">
          <div className="bg-black/90 rounded-xl p-6 ring-1 ring-green-500/50 animate-pulse">
            <p className="text-xl text-green-400 font-fantaisie text-center">
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
          <div className="px-4 py-2 rounded-lg bg-black/90 text-sm text-green-300">
            {casterSeat.toUpperCase()} is deciding whether to auto-resolve Raise
            Dead...
          </div>
        </div>
      )}
    </div>
  );
}
