"use client";

import React from "react";
import { useGameStore } from "@/lib/game/store";

export default function AutoResolveConfirmOverlay() {
  const pending = useGameStore((s) => s.pendingAutoResolve);
  const actorKey = useGameStore((s) => s.actorKey);
  const confirm = useGameStore((s) => s.confirmAutoResolve);
  const cancel = useGameStore((s) => s.cancelAutoResolve);

  if (!pending) return null;

  const { kind, ownerSeat, sourceName, effectDescription } = pending;

  // Only show overlay to the owner
  if (actorKey !== null && ownerSeat !== actorKey) return null;

  // Icons removed for visual consistency — rely on color theming instead

  // Get color based on kind
  const getColor = () => {
    switch (kind) {
      case "omphalos_draw":
        return "purple";
      case "morgana_genesis":
        return "blue";
      case "headless_haunt_move":
        return "gray";
      case "pith_imp_steal":
        return "red";
      case "lilith_reveal":
        return "pink";
      default:
        return "yellow";
    }
  };

  const color = getColor();

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center pointer-events-auto bg-black/70">
      <div
        className={`bg-black/95 rounded-xl p-6 max-w-md w-full mx-4 ring-1 ring-${color}-500/30`}
      >
        <h2
          className={`text-2xl font-fantaisie text-${color}-400 mb-4 text-center`}
        >
          {sourceName}
        </h2>
        <p className="text-gray-300 text-center mb-4">{effectDescription}</p>

        <p className="text-gray-400 text-center mb-6 text-sm">
          Auto-resolve will execute this ability automatically.
          <br />
          <span className="text-yellow-400">
            Decline if the card is silenced or you want manual control.
          </span>
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
            onClick={confirm}
            className={`px-6 py-2 rounded-lg bg-${color}-600 hover:bg-${color}-500 text-white font-semibold transition-colors ring-1 ring-${color}-400/50`}
          >
            Auto-Resolve
          </button>
        </div>

        <p className="text-gray-500 text-xs text-center mt-4">
          Declining will skip the automatic effect.
        </p>
      </div>
    </div>
  );
}
