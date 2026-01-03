"use client";

import { useEffect, useCallback } from "react";
import { useGameStore } from "@/lib/game/store";
import type { AnimistCastMode } from "@/lib/game/store/types";

export function AnimistCastChoiceOverlay() {
  const pending = useGameStore((s) => s.pendingAnimistCast);
  const actorKey = useGameStore((s) => s.actorKey);
  const currentPlayer = useGameStore((s) => s.currentPlayer);
  const resolveAnimistCast = useGameStore((s) => s.resolveAnimistCast);
  const cancelAnimistCast = useGameStore((s) => s.cancelAnimistCast);

  // Determine if we're the caster:
  // - In online mode: actorKey must match casterSeat
  // - In offline mode (actorKey is null): allow the current player
  const isCaster =
    pending &&
    (actorKey
      ? pending.casterSeat === actorKey
      : (pending.casterSeat === "p1" ? 1 : 2) === currentPlayer);

  const handleChoice = useCallback(
    (mode: AnimistCastMode) => {
      resolveAnimistCast(mode);
    },
    [resolveAnimistCast]
  );

  // Handle escape key to cancel
  useEffect(() => {
    if (!isCaster) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        cancelAnimistCast();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isCaster, cancelAnimistCast]);

  if (!pending || pending.status !== "choosing") return null;

  // If we're not the caster, show a waiting message
  if (!isCaster) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90">
        <div className="flex flex-col items-center gap-4">
          <p className="text-gray-400 text-sm">
            Opponent is choosing how to cast {pending.card.name}...
          </p>
          <div className="flex gap-4">
            <div className="px-6 py-3 bg-gray-700/50 rounded-lg opacity-50 animate-pulse">
              <span className="text-gray-400">Magic</span>
            </div>
            <div className="px-6 py-3 bg-gray-700/50 rounded-lg opacity-50 animate-pulse">
              <span className="text-gray-400">Spirit</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90">
      <div className="flex flex-col items-center gap-6 max-w-md text-center">
        <div className="flex flex-col gap-2">
          <h2 className="text-xl font-bold text-emerald-400">
            Animist&apos;s Gift
          </h2>
          <p className="text-gray-300">
            How would you like to cast{" "}
            <span className="text-amber-400 font-semibold">
              {pending.card.name}
            </span>
            ?
          </p>
        </div>

        <div className="flex gap-6">
          {/* Cast as Magic */}
          <button
            onClick={() => handleChoice("magic")}
            className="flex flex-col items-center gap-3 px-8 py-6 bg-purple-900/60 hover:bg-purple-800/80 border border-purple-500/50 hover:border-purple-400 rounded-xl transition-all hover:scale-105 focus:outline-none focus:ring-2 focus:ring-purple-400"
          >
            <span className="text-lg font-semibold text-purple-200">Magic</span>
            <span className="text-xs text-purple-400">
              Cast normally as a spell
            </span>
          </button>

          {/* Cast as Spirit */}
          <button
            onClick={() => handleChoice("spirit")}
            className="flex flex-col items-center gap-3 px-8 py-6 bg-emerald-900/60 hover:bg-emerald-800/80 border border-emerald-500/50 hover:border-emerald-400 rounded-xl transition-all hover:scale-105 focus:outline-none focus:ring-2 focus:ring-emerald-400"
          >
            <span className="text-lg font-semibold text-emerald-200">
              Spirit
            </span>
            <span className="text-xs text-emerald-400">
              Power: {pending.manaCost}
            </span>
          </button>
        </div>

        <p className="text-gray-500 text-xs">
          Spirits have power equal to the spell&apos;s mana cost (
          {pending.manaCost})
        </p>

        <button
          onClick={cancelAnimistCast}
          className="text-gray-500 hover:text-gray-300 text-sm underline"
        >
          Cancel (Esc)
        </button>
      </div>
    </div>
  );
}
