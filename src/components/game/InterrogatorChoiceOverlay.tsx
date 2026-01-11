"use client";

import React from "react";
import { useGameStore } from "@/lib/game/store";
import { INTERROGATOR_LIFE_COST } from "@/lib/game/store/types";

/**
 * InterrogatorChoiceOverlay - Shows UI for the Interrogator avatar ability
 *
 * When an ally (minion) controlled by an Interrogator player strikes the enemy avatar,
 * the victim must choose: pay 3 life to prevent the draw, or allow Interrogator to draw a spell.
 *
 * This overlay is shown to the victim player for their decision.
 */
export default function InterrogatorChoiceOverlay() {
  const pending = useGameStore((s) => s.pendingInterrogatorChoice);
  const actorKey = useGameStore((s) => s.actorKey);
  const resolveChoice = useGameStore((s) => s.resolveInterrogatorChoice);
  const players = useGameStore((s) => s.players);
  const avatars = useGameStore((s) => s.avatars);

  if (!pending || pending.phase !== "pending") return null;

  const { interrogatorSeat, victimSeat, attackerName } = pending;

  // Hotseat: actorKey is null, always show victim UI (victim makes the choice)
  // Online: only show UI if we're the victim
  const isVictim = actorKey === null || victimSeat === actorKey;

  // Get current life of the victim
  const victimLife = players[victimSeat]?.life ?? 0;
  const canPay = victimLife >= INTERROGATOR_LIFE_COST;

  // Get Interrogator avatar name for display
  const interrogatorAvatarName =
    avatars[interrogatorSeat]?.card?.name ?? "Interrogator";

  if (!isVictim) {
    // Show waiting status for the Interrogator player
    return (
      <div className="fixed inset-0 z-[200] pointer-events-none">
        <div className="fixed inset-x-0 top-6 z-[201] flex justify-center">
          <div className="px-5 py-3 rounded-full bg-black/90 text-white ring-1 ring-rose-500/50 shadow-lg text-lg flex items-center gap-3">
            <span className="text-rose-400 font-fantaisie">
              🔍 {interrogatorAvatarName}
            </span>
            <span className="opacity-80">
              Waiting for {victimSeat.toUpperCase()} to respond...
            </span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[200] pointer-events-none">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/60 pointer-events-auto" />

      {/* Choice dialog */}
      <div className="fixed inset-0 flex items-center justify-center pointer-events-auto">
        <div className="bg-gradient-to-b from-zinc-900 to-black rounded-xl p-6 max-w-md w-full mx-4 ring-1 ring-rose-500/40 shadow-2xl">
          {/* Header */}
          <div className="text-center mb-6">
            <div className="text-3xl mb-2">🔍</div>
            <h3 className="text-xl font-semibold text-rose-300 font-fantaisie">
              Interrogator&apos;s Demand
            </h3>
            <p className="text-sm text-gray-400 mt-2">
              <span className="text-amber-300">{attackerName}</span> struck your
              Avatar!
            </p>
          </div>

          {/* Ability description */}
          <div className="bg-black/50 rounded-lg p-4 mb-6 border border-rose-500/20">
            <p className="text-sm text-gray-300 text-center">
              <span className="text-rose-300">{interrogatorAvatarName}</span>
              &apos;s ability triggers:
            </p>
            <p className="text-sm text-amber-200 text-center mt-2 italic">
              &ldquo;Draw a spell unless they pay {INTERROGATOR_LIFE_COST}{" "}
              life.&rdquo;
            </p>
          </div>

          {/* Current life display */}
          <div className="text-center mb-4">
            <span className="text-sm text-gray-400">Your current life:</span>
            <span className="ml-2 text-lg font-bold text-white">
              {victimLife}
            </span>
          </div>

          {/* Choice buttons */}
          <div className="flex flex-col gap-3">
            {/* Pay life button */}
            <button
              onClick={() => resolveChoice("pay")}
              disabled={!canPay}
              className={`
                w-full py-3 px-4 rounded-lg font-medium text-sm
                transition-all duration-200
                ${
                  canPay
                    ? "bg-rose-600 hover:bg-rose-500 text-white ring-1 ring-rose-400/50 hover:ring-rose-400"
                    : "bg-gray-700 text-gray-500 cursor-not-allowed"
                }
              `}
            >
              <div className="flex items-center justify-center gap-2">
                <span>💔</span>
                <span>Pay {INTERROGATOR_LIFE_COST} Life to Prevent Draw</span>
              </div>
              {!canPay && (
                <div className="text-xs text-gray-500 mt-1">
                  (Not enough life)
                </div>
              )}
            </button>

            {/* Allow draw button */}
            <button
              onClick={() => resolveChoice("allow")}
              className="
                w-full py-3 px-4 rounded-lg font-medium text-sm
                bg-amber-600 hover:bg-amber-500 text-white
                ring-1 ring-amber-400/50 hover:ring-amber-400
                transition-all duration-200
              "
            >
              <div className="flex items-center justify-center gap-2">
                <span>📜</span>
                <span>
                  Allow {interrogatorSeat.toUpperCase()} to Draw a Spell
                </span>
              </div>
            </button>
          </div>

          {/* Hint */}
          <p className="text-xs text-gray-500 text-center mt-4">
            {canPay
              ? "Choose wisely - a drawn spell could be game-changing!"
              : "You don't have enough life to pay, so you must allow the draw."}
          </p>
        </div>
      </div>
    </div>
  );
}
