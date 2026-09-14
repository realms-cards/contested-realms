"use client";

import React from "react";
import { RcButton } from "@/components/ui/rc-button";
import { useGameStore } from "@/lib/game/store";

/**
 * WaveshaperOverlay — compact floating panel for the Waveshaper flood ability.
 *
 * Shows a prompt + Cancel button while the caster picks a site to flood
 * (highlighted on the 3D board via WaveshaperTargetOverlay). The opponent sees
 * a passive "is flooding a site…" status.
 */
export default function WaveshaperOverlay() {
  const pending = useGameStore((s) => s.pendingWaveshaper);
  const actorKey = useGameStore((s) => s.actorKey);
  const cancel = useGameStore((s) => s.cancelWaveshaperFlood);

  if (!pending) return null;
  if (pending.phase !== "selectingTarget") return null;

  const { ownerSeat } = pending;
  const isOwner = actorKey === null || ownerSeat === actorKey;

  return (
    <div className="fixed left-4 bottom-28 z-[201] pointer-events-auto">
      <div
        className="rounded-rc-lg border border-rc-line/18 bg-[rgba(9,13,25,0.9)] backdrop-blur-sm font-rc-sans text-rc-fg shadow-rc-panel overflow-hidden"
        style={{ width: 207 }}
      >
        <div className="px-3 py-2 flex flex-col gap-1">
          <div className="font-rc-display text-rc-accent-link text-sm">
            Waveshaper — Flood
          </div>
          <div className="text-rc-fg-muted text-[11px] leading-tight">
            {isOwner
              ? "Click a highlighted site near your body of water. Minions without submerge there are tapped and skip their next untap."
              : `${ownerSeat.toUpperCase()} is flooding a site…`}
          </div>
          {isOwner && (
            <RcButton
              variant="outline"
              size="xs"
              onClick={cancel}
              className="mt-1 w-full h-6 px-2"
            >
              Cancel
            </RcButton>
          )}
        </div>
      </div>
    </div>
  );
}
