"use client";

import React from "react";
import { useGameStore } from "@/lib/game/store";

/**
 * MephistophelesOverlay - Confirmation UI for Mephistopheles avatar replacement
 *
 * When Mephistopheles is cast to the Avatar's location, this overlay appears
 * asking the player to confirm replacing their Avatar with Mephistopheles.
 *
 * If confirmed: Original avatar is banished, Mephistopheles becomes the new Avatar
 * If cancelled: Mephistopheles stays as a regular minion (with summon ability still active)
 */
export default function MephistophelesOverlay() {
  const pending = useGameStore((s) => s.pendingMephistopheles);
  const actorKey = useGameStore((s) => s.actorKey);
  const resolve = useGameStore((s) => s.resolveMephistopheles);
  const cancel = useGameStore((s) => s.cancelMephistopheles);
  const avatars = useGameStore((s) => s.avatars);

  // Debug: log pending state changes
  React.useEffect(() => {
    console.log("[MephistophelesOverlay] pending state:", pending);
  }, [pending]);

  if (!pending) return null;

  const { phase, casterSeat } = pending;

  // Hotseat: actorKey is null, always show caster UI
  // Online: only show caster UI if we're the caster
  const isCaster = actorKey === null || casterSeat === actorKey;
  const originalAvatarName = avatars[casterSeat]?.card?.name || "your Avatar";

  if (phase !== "confirming") return null;

  return (
    <div className="fixed inset-0 z-[200] pointer-events-none">
      {/* Top status bar */}
      <div className="fixed inset-x-0 top-6 z-[201] pointer-events-none flex justify-center">
        <div className="pointer-events-auto px-5 py-3 rounded-full bg-black/90 text-white ring-1 ring-red-500/50 shadow-lg text-lg flex items-center gap-3">
          <span className="text-red-400 font-fantaisie">Mephistopheles</span>
          <span className="opacity-80">
            {isCaster
              ? "Confirm avatar replacement?"
              : "Opponent is deciding..."}
          </span>
        </div>
      </div>

      {/* Caster confirmation UI */}
      {isCaster && (
        <div className="fixed inset-0 flex items-center justify-center pointer-events-auto bg-black/70">
          <div className="bg-black/95 rounded-xl p-6 max-w-xl w-full mx-4 ring-1 ring-red-500/30">
            {/* Header */}
            <div className="text-center mb-6">
              <h2 className="text-2xl font-fantaisie text-red-400 mb-2">
                Mephistopheles
              </h2>
              <p className="text-gray-300 text-sm">
                A Unique Demon and aspirant avatar
              </p>
            </div>

            {/* Card effect description */}
            <div className="bg-red-950/30 rounded-lg p-4 mb-6 text-sm text-gray-200 space-y-3">
              <p>
                <strong className="text-red-400">Cast Effect:</strong>{" "}
                Mephistopheles will replace{" "}
                <span className="text-amber-400">{originalAvatarName}</span> as
                your Avatar. Your original avatar will be banished.
              </p>
              <p className="text-gray-400 text-xs">
                Note: Mephistopheles retains Unique rarity, Demon type, and Air
                element. You won&apos;t be able to play sites normally (no
                tap-to-draw ability), but you can still cast spells.
              </p>
              <hr className="border-red-900/50" />
              <p>
                <strong className="text-red-400">Second Ability:</strong> Once
                on your turn, you may summon an Evil minion from your hand to an
                adjacent site.
                <span className="text-gray-400 text-xs ml-1">
                  (This ability works regardless of whether you replace your
                  avatar)
                </span>
              </p>
            </div>

            {/* Action buttons */}
            <div className="flex gap-4 justify-center">
              <button
                onClick={cancel}
                className="px-6 py-2.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-200 font-medium transition-colors"
              >
                Keep as Minion
              </button>
              <button
                onClick={resolve}
                className="px-6 py-2.5 rounded-lg bg-red-700 hover:bg-red-600 text-white font-medium transition-colors ring-1 ring-red-500/50"
              >
                Replace Avatar
              </button>
            </div>

            {/* Helpful note */}
            <p className="text-center text-gray-500 text-xs mt-4">
              If kept as minion, Mephistopheles stays on the board and you keep
              your original avatar.
            </p>
          </div>
        </div>
      )}

      {/* Opponent waiting indicator */}
      {!isCaster && (
        <div className="fixed bottom-24 inset-x-0 z-[201] pointer-events-none flex justify-center">
          <div className="px-4 py-2 rounded-lg bg-black/90 text-sm text-red-300">
            {casterSeat.toUpperCase()} is deciding on Mephistopheles...
          </div>
        </div>
      )}
    </div>
  );
}
