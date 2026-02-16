"use client";

import React from "react";
import { useGameStore } from "@/lib/game/store";

export default function AssimilatorSnailOverlay() {
  const pending = useGameStore((s) => s.pendingAssimilatorSnail);
  const actorKey = useGameStore((s) => s.actorKey);
  const selectCorpse = useGameStore((s) => s.selectAssimilatorSnailCorpse);
  const resolve = useGameStore((s) => s.resolveAssimilatorSnail);
  const cancel = useGameStore((s) => s.cancelAssimilatorSnail);

  if (!pending) return null;

  const { phase, activatorSeat, eligibleCorpses, selectedCorpseIndex } =
    pending;
  const isActivator = actorKey === null || activatorSeat === actorKey;

  return (
    <div className="fixed inset-0 z-[200] pointer-events-none">
      {/* Top bar with status */}
      <div className="fixed inset-x-0 top-6 z-[201] pointer-events-none flex justify-center">
        <div className="pointer-events-auto px-5 py-3 rounded-full bg-black/90 text-white ring-1 ring-purple-500/50 shadow-lg text-lg md:text-xl flex items-center gap-3 select-none">
          <span className="text-purple-400 font-fantaisie">
            Assimilator Snail
          </span>
          <span className="opacity-80">
            {phase === "selectingCorpse" &&
              isActivator &&
              "Select a dead minion to banish and copy"}
            {phase === "selectingCorpse" &&
              !isActivator &&
              `${activatorSeat.toUpperCase()} is selecting a dead minion...`}
            {phase === "resolved" && "Transformation complete!"}
          </span>
        </div>
      </div>

      {/* Corpse selection dialog - visible to activator */}
      {phase === "selectingCorpse" && isActivator && (
        <div className="fixed inset-0 flex items-center justify-center pointer-events-auto bg-black/70">
          <div className="bg-black/95 rounded-xl p-6 max-w-lg w-full mx-4 ring-1 ring-purple-500/30 max-h-[80vh] overflow-y-auto">
            <h2 className="text-2xl font-fantaisie text-purple-400 mb-4 text-center">
              Choose a Dead Minion
            </h2>
            <p className="text-gray-300 text-center mb-4 text-sm">
              The selected minion will be banished and Assimilator Snail becomes
              a copy of it until your next turn.
            </p>

            {/* Corpse list */}
            <div className="space-y-2 mb-6">
              {eligibleCorpses.map((corpse, idx) => {
                const isSelected = selectedCorpseIndex === idx;
                const attack = corpse.card.attack ?? "?";
                const defense = corpse.card.defence ?? "?";
                return (
                  <button
                    key={`${corpse.card.instanceId ?? corpse.card.cardId}_${idx}`}
                    className={`w-full text-left rounded-lg px-4 py-3 transition-colors ${
                      isSelected
                        ? "bg-purple-600/50 ring-2 ring-purple-400"
                        : "bg-white/5 hover:bg-white/10"
                    }`}
                    onClick={() => selectCorpse(idx)}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-white font-medium">
                          {corpse.card.name}
                        </span>
                        <span className="text-gray-400 text-sm ml-2">
                          ({attack}/{defense})
                        </span>
                      </div>
                      <span className="text-gray-500 text-xs">
                        {corpse.fromSeat.toUpperCase()}&apos;s cemetery
                      </span>
                    </div>
                    {corpse.card.text && (
                      <p className="text-gray-400 text-xs mt-1 line-clamp-2">
                        {corpse.card.text}
                      </p>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Action buttons */}
            <div className="flex gap-4 justify-center">
              <button
                onClick={cancel}
                className="px-6 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={resolve}
                disabled={selectedCorpseIndex === null}
                className={`px-6 py-2 rounded-lg font-semibold transition-colors ${
                  selectedCorpseIndex !== null
                    ? "bg-purple-600 hover:bg-purple-500 text-white ring-1 ring-purple-400/50"
                    : "bg-gray-700 text-gray-500 cursor-not-allowed"
                }`}
              >
                Banish &amp; Transform
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Opponent waiting indicator */}
      {phase === "selectingCorpse" && !isActivator && (
        <div className="fixed bottom-24 inset-x-0 z-[201] pointer-events-none flex justify-center">
          <div className="px-4 py-2 rounded-lg bg-black/90 text-sm text-purple-300">
            {activatorSeat.toUpperCase()} is choosing a dead minion for
            Assimilator Snail...
          </div>
        </div>
      )}
    </div>
  );
}
