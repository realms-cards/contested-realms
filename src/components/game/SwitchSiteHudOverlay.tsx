"use client";

import { useGameStore } from "@/lib/game/store";

/**
 * HUD overlay shown when a site is selected for position switching.
 * Similar to CombatHudOverlay, provides instructions and a Cancel button.
 * Also shows "Waiting for approval" state when a request is pending.
 */
export default function SwitchSiteHudOverlay() {
  const switchSiteSource = useGameStore((s) => s.switchSiteSource);
  const setSwitchSiteSource = useGameStore((s) => s.setSwitchSiteSource);
  const switchSitePending = useGameStore((s) => s.switchSitePending);
  const setSwitchSitePending = useGameStore((s) => s.setSwitchSitePending);
  const board = useGameStore((s) => s.board);
  const log = useGameStore((s) => s.log);

  // Show overlay for either source selection or pending approval
  if (!switchSiteSource && !switchSitePending) return null;

  // Pending approval state
  if (switchSitePending) {
    const { source, target } = switchSitePending;
    const sourceCellNo =
      (board.size.h - 1 - source.y) * board.size.w + source.x + 1;
    const targetCellNo =
      (board.size.h - 1 - target.y) * board.size.w + target.x + 1;

    const handleCancel = () => {
      setSwitchSitePending(null);
      log("Site switch request cancelled");
    };

    return (
      <div className="fixed inset-x-0 bottom-36 md:bottom-44 flex justify-center pointer-events-none z-[200]">
        <div className="pointer-events-auto px-5 py-3 rounded-full bg-black/90 text-white ring-1 ring-amber-500/40 shadow-lg text-lg md:text-xl flex items-center gap-3">
          <span className="text-amber-200">
            Moving site <span className="font-fantaisie">#{sourceCellNo}</span>{" "}
            → <span className="font-fantaisie">#{targetCellNo}</span>
          </span>
          <span className="opacity-70">|</span>
          <span className="opacity-80 animate-pulse">
            Waiting for opponent approval...
          </span>
          <button
            className="ml-2 rounded bg-white/15 hover:bg-white/25 px-3 py-1 text-base"
            onClick={handleCancel}
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  // Source selection state (switchSiteSource is guaranteed non-null here due to early return)
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
