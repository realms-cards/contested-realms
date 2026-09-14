"use client";

import React from "react";
import { RcButton } from "@/components/ui/rc-button";
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
        <div className="pointer-events-auto px-5 py-3 rounded-full border border-rc-line/22 bg-[rgba(7,10,20,0.9)] font-rc-sans text-rc-fg shadow-rc-panel text-lg flex items-center gap-3">
          <span className="font-rc-display text-rc-accent-link">Mephistopheles</span>
          <span className="text-rc-fg-muted">
            {isCaster
              ? "Confirm avatar replacement?"
              : "Opponent is deciding..."}
          </span>
        </div>
      </div>

      {/* Caster confirmation UI */}
      {isCaster && (
        <div className="fixed inset-0 flex items-center justify-center pointer-events-auto bg-[rgba(6,10,20,0.7)]">
          <div className="rounded-rc-lg border border-rc-line/18 bg-[rgba(9,13,25,0.95)] p-6 max-w-xl w-full mx-4 font-rc-sans text-rc-fg shadow-rc-panel">
            {/* Header */}
            <div className="text-center mb-6">
              <h2 className="mb-2 font-rc-display text-[26px] leading-tight text-rc-fg-strong">
                Mephistopheles
              </h2>
              <p className="text-rc-fg-muted text-sm">
                A Unique Demon and aspirant avatar
              </p>
            </div>

            {/* Card effect description */}
            <div className="rounded-rc-md border border-rc-line/12 bg-black/30 p-4 mb-6 text-sm text-rc-fg space-y-3">
              <p>
                <strong className="text-rc-fg-strong">Cast Effect:</strong>{" "}
                Mephistopheles will replace{" "}
                <span className="font-rc-display text-rc-accent-link">{originalAvatarName}</span> as
                your Avatar. Your original avatar will be banished.
              </p>
              <p className="text-rc-fg-muted text-xs">
                Note: Mephistopheles retains Unique rarity, Demon type, and Air
                element. You won&apos;t be able to play sites normally (no
                tap-to-draw ability), but you can still cast spells.
              </p>
              <hr className="border-rc-line/12" />
              <p>
                <strong className="text-rc-fg-strong">Second Ability:</strong> Once
                on your turn, you may summon an Evil minion from your hand to an
                adjacent site.
                <span className="text-rc-fg-muted text-xs ml-1">
                  (This ability works regardless of whether you replace your
                  avatar)
                </span>
              </p>
            </div>

            {/* Action buttons */}
            <div className="flex gap-4 justify-center">
              <RcButton variant="outline" onClick={cancel}>
                Keep as Minion
              </RcButton>
              <RcButton onClick={resolve}>
                Replace Avatar
              </RcButton>
            </div>

            {/* Helpful note */}
            <p className="text-center text-rc-fg-subtle text-xs mt-4">
              If kept as minion, Mephistopheles stays on the board and you keep
              your original avatar.
            </p>
          </div>
        </div>
      )}

      {/* Opponent waiting indicator */}
      {!isCaster && (
        <div className="fixed bottom-24 inset-x-0 z-[201] pointer-events-none flex justify-center">
          <div className="rc-toast">
            {casterSeat.toUpperCase()} is deciding on Mephistopheles...
          </div>
        </div>
      )}
    </div>
  );
}
