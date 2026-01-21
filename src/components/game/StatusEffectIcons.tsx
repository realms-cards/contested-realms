"use client";

import { useMemo } from "react";
import { useGameStore } from "@/lib/game/store";
import type { PlayerKey } from "@/lib/game/store";
import { siteHasSilencedToken } from "@/lib/game/store/utils/resourceHelpers";

/** Mismanaged Mortuary card image URL (beta set) */
const MORTUARY_IMAGE_URL = "/api/images/bet_mismanaged_mortuary_b_s";

interface StatusEffectIconProps {
  imageUrl: string;
  title: string;
  controllerSeat: PlayerKey;
}

function StatusEffectIcon({
  imageUrl,
  title,
  controllerSeat,
}: StatusEffectIconProps) {
  const ringColor =
    controllerSeat === "p1"
      ? "ring-blue-400 shadow-blue-400/30"
      : "ring-red-400 shadow-red-400/30";

  return (
    <div className="relative group cursor-help" title={title}>
      {/* Tiny circular icon with card art */}
      <div
        className={`w-5 h-5 rounded-full overflow-hidden ring-2 ${ringColor} bg-slate-900 shadow-md`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imageUrl}
          alt="Status Effect"
          className="w-full h-full object-cover object-[center_15%] scale-[2]"
        />
      </div>
      {/* Tooltip on hover */}
      <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1 px-2 py-1 bg-slate-900/95 text-white text-[10px] rounded shadow-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50">
        {title}
      </div>
    </div>
  );
}

/**
 * Displays a single status effect icon for active automatic effects.
 * Shows a tiny round icon next to the user badge at top-right.
 * Ring color indicates which player controls the effect.
 */
export default function PlayerStatusEffects() {
  const mismanagedMortuaries = useGameStore(
    (s) => s.specialSiteState.mismanagedMortuaries,
  );
  const permanents = useGameStore((s) => s.permanents);
  const boardSites = useGameStore((s) => s.board.sites);

  // Find all active mortuaries (non-silenced AND still on the board)
  const activeMortuaries = useMemo(() => {
    return mismanagedMortuaries.filter((m) => {
      // Verify the site is still on the board
      const siteStillExists = !!boardSites[m.cellKey];
      if (!siteStillExists) return false;
      // Check if silenced
      return !siteHasSilencedToken(m.cellKey, permanents);
    });
  }, [mismanagedMortuaries, permanents, boardSites]);

  // XOR logic: cemetery swap is active if exactly one player has an active mortuary
  const p1Mortuaries = activeMortuaries.filter((m) => m.ownerSeat === "p1");
  const p2Mortuaries = activeMortuaries.filter((m) => m.ownerSeat === "p2");
  const p1HasMortuary = p1Mortuaries.length > 0;
  const p2HasMortuary = p2Mortuaries.length > 0;
  const cemeterySwapActive = p1HasMortuary !== p2HasMortuary;

  // Determine controller (who has the active mortuary)
  const controllerSeat: PlayerKey = p1HasMortuary ? "p1" : "p2";

  if (!cemeterySwapActive) return null;

  return (
    <div className="fixed top-4 right-16 z-50 flex items-center gap-2 pointer-events-auto">
      <StatusEffectIcon
        imageUrl={MORTUARY_IMAGE_URL}
        title="Mismanaged Mortuary: Cemeteries Swapped"
        controllerSeat={controllerSeat}
      />
    </div>
  );
}
