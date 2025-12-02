"use client";

import { useGameStore } from "@/lib/game/store";

/**
 * HUD overlay shown when a site is selected for position switching.
 * Similar to CombatHudOverlay, provides instructions and a Cancel button.
 */
export default function SwitchSiteHudOverlay() {
  const switchSiteSource = useGameStore((s) => s.switchSiteSource);
  const setSwitchSiteSource = useGameStore((s) => s.setSwitchSiteSource);
  const board = useGameStore((s) => s.board);
  const log = useGameStore((s) => s.log);

  if (!switchSiteSource) return null;

  const { x, y } = switchSiteSource;
  const cellNo = (board.size.h - 1 - y) * board.size.w + x + 1;

  const handleCancel = () => {
    setSwitchSiteSource(null);
    log("Site switch cancelled");
  };

  return (
    <div className="fixed inset-x-0 bottom-36 md:bottom-44 flex justify-center pointer-events-none z-[200]">
      <div className="pointer-events-auto px-5 py-3 rounded-full bg-black/90 text-white ring-1 ring-amber-500/40 shadow-lg text-lg md:text-xl flex items-center gap-3">
        <span className="text-amber-200">
          Site <span className="font-fantaisie">#{cellNo}</span> selected
        </span>
        <span className="opacity-70">→</span>
        <span className="opacity-80">
          Click a void or another site to move/swap
        </span>
        <button
          className="ml-2 rounded bg-white/15 hover:bg-white/25 px-3 py-1 text-base"
          onClick={handleCancel}
        >
          Cancel
        </button>
        <span className="text-xs opacity-50 ml-1">(Esc)</span>
      </div>
    </div>
  );
}
