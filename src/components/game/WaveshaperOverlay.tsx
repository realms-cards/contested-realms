"use client";

import React from "react";
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
        className="rounded-xl bg-black/85 backdrop-blur-sm ring-1 ring-cyan-500/60 shadow-2xl overflow-hidden"
        style={{ width: 207 }}
      >
        <div className="px-3 py-2 flex flex-col gap-1">
          <div className="text-cyan-400 font-medium text-sm">
            Waveshaper — Flood
          </div>
          <div className="text-gray-400 text-[11px] leading-tight">
            {isOwner
              ? "Click a highlighted site near your body of water. Minions without submerge there are tapped and skip their next untap."
              : `${ownerSeat.toUpperCase()} is flooding a site…`}
          </div>
          {isOwner && (
            <button
              onClick={cancel}
              className="mt-1 w-full px-2 py-1 rounded-lg bg-gray-700/60 hover:bg-gray-600/60 text-gray-300 text-xs font-medium transition-colors"
            >
              Cancel
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
