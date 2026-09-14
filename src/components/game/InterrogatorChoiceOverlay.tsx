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
          <div className="px-5 py-3 rounded-full border border-rc-line/22 bg-[rgba(7,10,20,0.9)] font-rc-sans text-rc-fg shadow-rc-panel text-lg flex items-center gap-3">
            <span className="font-rc-display text-rc-accent-link">
              {interrogatorAvatarName}
            </span>
            <span className="text-rc-fg-muted">
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
      <div className="fixed inset-0 bg-[rgba(6,10,20,0.6)] pointer-events-auto" />

      {/* Choice dialog */}
      <div className="fixed inset-0 flex items-center justify-center pointer-events-auto">
        <div className="rounded-rc-lg border border-rc-line/18 bg-[rgba(9,13,25,0.95)] p-6 max-w-md w-full mx-4 font-rc-sans text-rc-fg shadow-rc-panel">
          {/* Header */}
          <div className="text-center mb-6">
            <h3 className="font-rc-display text-[22px] leading-tight text-rc-fg-strong">
              Interrogator&apos;s Demand
            </h3>
            <p className="text-sm text-rc-fg-muted mt-2">
              <span className="font-rc-display text-rc-accent-link">{attackerName}</span> struck your
              Avatar!
            </p>
          </div>

          {/* Ability description */}
          <div className="rounded-rc-md border border-rc-line/12 bg-black/30 p-4 mb-6">
            <p className="text-sm text-rc-fg-muted text-center">
              <span className="font-rc-display text-rc-accent-link">{interrogatorAvatarName}</span>
              &apos;s ability triggers:
            </p>
            <p className="text-sm text-rc-accent-link text-center mt-2 italic">
              &ldquo;Draw a spell unless they pay {INTERROGATOR_LIFE_COST}{" "}
              life.&rdquo;
            </p>
          </div>

          {/* Current life display */}
          <div className="text-center mb-4">
            <span className="text-sm text-rc-fg-muted">Your current life:</span>
            <span className="ml-2 font-rc-mono text-lg font-bold tabular-nums text-rc-fg-strong">
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
                w-full py-3 px-4 rounded-rc-md border font-medium text-sm
                transition-colors duration-200
                ${
                  canPay
                    ? "border-rc-line/18 bg-black/30 text-rc-fg-strong hover:border-rc-accent/60 hover:bg-rc-accent/8"
                    : "border-rc-line/10 bg-black/20 text-rc-fg-subtle cursor-not-allowed opacity-50"
                }
              `}
            >
              <div className="flex items-center justify-center gap-2">
                <span>Pay {INTERROGATOR_LIFE_COST} Life to Prevent Draw</span>
              </div>
              {!canPay && (
                <div className="text-xs text-rc-fg-subtle mt-1">
                  (Not enough life)
                </div>
              )}
            </button>

            {/* Allow draw button */}
            <button
              onClick={() => resolveChoice("allow")}
              className="
                w-full py-3 px-4 rounded-rc-md border font-medium text-sm
                border-rc-accent/45 bg-rc-accent/8 text-rc-accent-link
                hover:border-rc-accent hover:bg-rc-accent/12
                transition-colors duration-200
              "
            >
              <div className="flex items-center justify-center gap-2">
                <span>
                  Allow {interrogatorSeat.toUpperCase()} to Draw a Spell
                </span>
              </div>
            </button>
          </div>

          {/* Hint */}
          <p className="text-xs text-rc-fg-subtle text-center mt-4">
            {canPay
              ? "Choose wisely - a drawn spell could be game-changing!"
              : "You don't have enough life to pay, so you must allow the draw."}
          </p>
        </div>
      </div>
    </div>
  );
}
