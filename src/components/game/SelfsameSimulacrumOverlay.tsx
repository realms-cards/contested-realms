"use client";

import React from "react";
import { useGameStore } from "@/lib/game/store";

export default function SelfsameSimulacrumOverlay() {
  const pending = useGameStore((s) => s.pendingSelfsameSimulacrum);
  const actorKey = useGameStore((s) => s.actorKey);
  const selectTarget = useGameStore((s) => s.selectSelfsameSimulacrumTarget);
  const resolve = useGameStore((s) => s.resolveSelfsameSimulacrum);
  const cancel = useGameStore((s) => s.cancelSelfsameSimulacrum);

  if (!pending) return null;

  const { phase, ownerSeat, nearbyMinions, selectedIndex } = pending;
  const isOwner = actorKey === null || ownerSeat === actorKey;

  return (
    <div className="fixed inset-0 z-[200] pointer-events-none">
      {/* Top status bar */}
      <div className="fixed inset-x-0 top-6 z-[201] pointer-events-none flex justify-center">
        <div className="pointer-events-auto px-5 py-3 rounded-full bg-black/90 text-white ring-1 ring-cyan-500/50 shadow-lg text-lg md:text-xl flex items-center gap-3 select-none">
          <span className="text-cyan-400 font-fantaisie">Selfsame Simulacrum</span>
          <span className="opacity-80">
            {phase === "selecting" && isOwner && "Choose a nearby minion to copy"}
            {phase === "selecting" &&
              !isOwner &&
              `${ownerSeat.toUpperCase()} is choosing a minion to copy...`}
            {phase === "complete" && "Transformation complete!"}
          </span>
        </div>
      </div>

      {/* Owner selection dialog */}
      {phase === "selecting" && isOwner && (
        <div className="fixed inset-0 flex items-center justify-center pointer-events-auto bg-black/70">
          <div className="bg-black/95 rounded-xl p-6 max-w-lg w-full mx-4 ring-1 ring-cyan-500/30 max-h-[80vh] overflow-y-auto">
            <h2 className="text-2xl font-fantaisie text-cyan-400 mb-2 text-center">
              Choose a Nearby Minion
            </h2>
            <p className="text-gray-400 text-center mb-5 text-sm">
              Selfsame Simulacrum will become a basic copy (no abilities) of the
              chosen minion. Cancel to keep it as the Simulacrum.
            </p>

            <div className="space-y-2 mb-6">
              {nearbyMinions.map((entry, idx) => {
                const isSelected = selectedIndex === idx;
                const attack = entry.card.attack ?? "?";
                const defense = entry.card.defence ?? "?";
                const ownerLabel = entry.owner === 1 ? "P1" : "P2";
                return (
                  <button
                    key={`${entry.card.instanceId ?? entry.card.cardId}_${idx}`}
                    className={`w-full text-left rounded-lg px-4 py-3 transition-colors ${
                      isSelected
                        ? "bg-cyan-600/50 ring-2 ring-cyan-400"
                        : "bg-white/5 hover:bg-white/10"
                    }`}
                    onClick={() => selectTarget(idx)}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-white font-medium">
                          {entry.card.name}
                        </span>
                        <span className="text-gray-400 text-sm ml-2">
                          ({attack}/{defense})
                        </span>
                      </div>
                      <span className="text-gray-500 text-xs">
                        {ownerLabel}&apos;s minion
                      </span>
                    </div>
                    {entry.card.text && (
                      <p className="text-gray-500 text-xs mt-1 line-clamp-2 italic">
                        Will be lost (basic copy has no abilities)
                      </p>
                    )}
                  </button>
                );
              })}
            </div>

            <div className="flex gap-4 justify-center">
              <button
                onClick={cancel}
                className="px-6 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-white transition-colors"
              >
                Keep as Simulacrum
              </button>
              <button
                onClick={resolve}
                disabled={selectedIndex === null}
                className={`px-6 py-2 rounded-lg font-semibold transition-colors ${
                  selectedIndex !== null
                    ? "bg-cyan-600 hover:bg-cyan-500 text-white ring-1 ring-cyan-400/50"
                    : "bg-gray-700 text-gray-500 cursor-not-allowed"
                }`}
              >
                Copy Minion
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Opponent waiting indicator */}
      {phase === "selecting" && !isOwner && (
        <div className="fixed bottom-24 inset-x-0 z-[201] pointer-events-none flex justify-center">
          <div className="px-4 py-2 rounded-lg bg-black/90 text-sm text-cyan-300">
            {ownerSeat.toUpperCase()} is choosing a minion for Selfsame
            Simulacrum...
          </div>
        </div>
      )}
    </div>
  );
}
