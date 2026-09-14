"use client";

import { RcButton } from "@/components/ui/rc-button";
import { useGameStore } from "@/lib/game/store";
import { getCellNumber } from "@/lib/game/store/utils/boardHelpers";

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
  const pendingEarthquake = useGameStore((s) => s.pendingEarthquake);

  // During earthquake rearranging, the EarthquakeOverlay handles its own UI
  if (pendingEarthquake?.phase === "rearranging") return null;

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
      <div className="fixed inset-x-0 bottom-14 lg:bottom-44 flex justify-center pointer-events-none z-[200] px-3">
        <div className="pointer-events-auto px-4 py-2 lg:px-5 lg:py-3 rounded-rc-lg lg:rounded-full border border-rc-accent/40 bg-[rgba(7,10,20,0.9)] font-rc-sans text-rc-fg shadow-rc-panel text-sm lg:text-xl flex flex-wrap items-center justify-center gap-2 lg:gap-3 max-w-[95vw]">
          <span className="text-rc-spark">
            Moving site <span className="font-rc-mono tabular-nums">#{sourceCellNo}</span>{" "}
            → <span className="font-rc-mono tabular-nums">#{targetCellNo}</span>
          </span>
          <span className="text-rc-fg-dim">|</span>
          <span className="text-rc-fg-muted animate-pulse">
            Waiting for opponent approval...
          </span>
          <RcButton
            variant="outline"
            size="xs"
            className="ml-2"
            onClick={handleCancel}
          >
            Cancel
          </RcButton>
        </div>
      </div>
    );
  }

  // Source selection state (switchSiteSource is guaranteed non-null here due to early return)
  if (!switchSiteSource) return null;
  const { x, y } = switchSiteSource;
  const cellNo = getCellNumber(x, y, board.size.w, board.size.h);

  const handleCancel = () => {
    setSwitchSiteSource(null);
    log("Site switch cancelled");
  };

  return (
    <div className="fixed inset-x-0 bottom-14 lg:bottom-44 flex justify-center pointer-events-none z-[200] px-3">
      <div className="pointer-events-auto px-4 py-2 lg:px-5 lg:py-3 rounded-rc-lg lg:rounded-full border border-rc-accent/40 bg-[rgba(7,10,20,0.9)] font-rc-sans text-rc-fg shadow-rc-panel text-sm lg:text-xl flex flex-wrap items-center justify-center gap-2 lg:gap-3 max-w-[95vw]">
        <span className="text-rc-spark">
          Site <span className="font-rc-mono tabular-nums">#{cellNo}</span> selected
        </span>
        <span className="text-rc-fg-dim">→</span>
        <span className="text-rc-fg-muted">
          Click a void or another site to move/swap
        </span>
        <RcButton
          variant="outline"
          size="xs"
          className="ml-2"
          onClick={handleCancel}
        >
          Cancel
        </RcButton>
        <span className="rc-hint ml-1">(Esc)</span>
      </div>
    </div>
  );
}
