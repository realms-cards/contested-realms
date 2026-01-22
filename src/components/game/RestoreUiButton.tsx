"use client";

import { CornerDownLeft, Eye } from "lucide-react";
import { useColorBlind } from "@/lib/contexts/ColorBlindContext";
import { useGameStore, type PlayerKey } from "@/lib/game/store";

interface RestoreUiButtonProps {
  /** The player key to determine button color */
  myPlayerKey?: PlayerKey | null;
  /** Whether the current user can control the turn (is current player and not spectator) */
  canEndTurn?: boolean;
}

/**
 * A minimal button group that appears at the top of the screen when UI is hidden.
 * Shows eye icon to restore UI and enter icon for end turn.
 */
export default function RestoreUiButton({
  myPlayerKey,
  canEndTurn = false,
}: RestoreUiButtonProps) {
  const uiHidden = useGameStore((s) => s.uiHidden);
  const setUiHidden = useGameStore((s) => s.setUiHidden);
  const requestEndTurn = useGameStore((s) => s.requestEndTurn);
  const { enabled: colorBlindEnabled } = useColorBlind();

  if (!uiHidden) return null;

  // Determine icon color based on player key (no background)
  let iconClass = "text-purple-400 hover:text-purple-300"; // Default for spectators
  if (myPlayerKey === "p1") {
    iconClass = colorBlindEnabled
      ? "text-sky-400 hover:text-sky-300"
      : "text-blue-400 hover:text-blue-300";
  } else if (myPlayerKey === "p2") {
    iconClass = colorBlindEnabled
      ? "text-amber-400 hover:text-amber-300"
      : "text-red-400 hover:text-red-300";
  }

  return (
    <div className="fixed top-2 left-2 z-50 flex items-center gap-1">
      <button
        className="p-1 transition-all hover:scale-110"
        onClick={() => setUiHidden(false)}
        title="Show UI (U)"
      >
        <Eye className={`w-3 h-3 ${iconClass}`} />
      </button>
      {canEndTurn && (
        <button
          className="p-1 transition-all hover:scale-110"
          onClick={() => requestEndTurn()}
          title="End Turn (Enter)"
        >
          <CornerDownLeft className={`w-3 h-3 ${iconClass}`} />
        </button>
      )}
    </div>
  );
}
