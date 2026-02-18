"use client";

import { useMemo, useState } from "react";
import { useGameStore } from "@/lib/game/store";
import type { PlayerKey } from "@/lib/game/store";
import {
  isBoudicca,
  isPermanentSilenced,
  BOUDICCA_POWER_BONUS,
} from "@/lib/game/store/boudiccaState";
import type { CellKey, Permanents } from "@/lib/game/store/types";
import { siteHasSilencedToken } from "@/lib/game/store/utils/resourceHelpers";
import { getCardImageUrl } from "@/lib/utils/cdnUrl";

/** Card image URLs - use CDN-aware URL builder (same as all other card art) */
const MORTUARY_IMAGE_URL = getCardImageUrl("bet_mismanaged_mortuary_b_s");
const ATLANTEAN_FATE_IMAGE_URL = getCardImageUrl("alp_atlantean_fate_b_s");
const GARDEN_OF_EDEN_IMAGE_URL = getCardImageUrl("alp_garden_of_eden_b_s");
const BOUDICCA_IMAGE_URL = getCardImageUrl("art_boudicca_b_s");

/** Status effect type for unified display */
interface StatusEffect {
  id: string;
  imageUrl: string;
  title: string;
  description: string;
  controllerSeat: PlayerKey;
  effectType:
    | "mortuary"
    | "atlanteanFate"
    | "gardenOfEden"
    | "counter"
    | "aura"
    | "boudicca";
  isSilenced?: boolean; // Whether this effect is silenced (show strikethrough)
}

interface StatusEffectIconProps {
  effect: StatusEffect;
  expanded: boolean;
}

function StatusEffectIcon({ effect, expanded }: StatusEffectIconProps) {
  const ringColor =
    effect.controllerSeat === "p1"
      ? "ring-blue-400 shadow-blue-400/30"
      : "ring-red-400 shadow-red-400/30";

  return (
    <div
      className={`relative flex items-center gap-2 transition-all duration-200 ${
        expanded ? "bg-slate-800/90 rounded-lg px-2 py-1" : ""
      }`}
    >
      {/* Circular icon with card art */}
      <div
        className={`relative w-6 h-6 rounded-full overflow-hidden ring-2 ${ringColor} bg-slate-900 shadow-md flex-shrink-0 ${
          effect.isSilenced ? "opacity-60" : ""
        }`}
      >
        <img
          src={effect.imageUrl}
          alt={effect.title}
          className="w-full h-full object-cover object-[center_15%] scale-[2]"
        />
        {/* Strikethrough for silenced effects */}
        {effect.isSilenced && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-full h-0.5 bg-red-500 rotate-45 shadow-sm" />
          </div>
        )}
      </div>
      {/* Expanded description */}
      {expanded && (
        <div className="text-white text-xs whitespace-nowrap">
          <div
            className={`font-medium ${effect.isSilenced ? "line-through opacity-70" : ""}`}
          >
            {effect.title}
          </div>
          <div className="text-white/70 text-[10px]">
            {effect.isSilenced ? "Silenced" : effect.description}
          </div>
        </div>
      )}
    </div>
  );
}

interface ClusteredIconProps {
  effects: StatusEffect[];
  isExpanded: boolean;
}

function ClusteredIcon({ effects, isExpanded }: ClusteredIconProps) {
  if (effects.length === 0) return null;

  // Show stacked icons when collapsed (max 3 visible, overlapping)
  if (!isExpanded) {
    const visibleEffects = effects.slice(0, 3);
    const hiddenCount = effects.length - 3;

    return (
      <div className="flex items-center">
        <div className="flex -space-x-2">
          {visibleEffects.map((effect, idx) => {
            const ringColor =
              effect.controllerSeat === "p1" ? "ring-blue-400" : "ring-red-400";
            return (
              <div
                key={effect.id}
                className={`w-6 h-6 rounded-full overflow-hidden ring-2 ${ringColor} bg-slate-900 shadow-md`}
                style={{ zIndex: 10 - idx }}
              >
                <img
                  src={effect.imageUrl}
                  alt={effect.title}
                  className="w-full h-full object-cover object-[center_15%] scale-[2]"
                />
              </div>
            );
          })}
        </div>
        {hiddenCount > 0 && (
          <div className="ml-1 w-5 h-5 rounded-full bg-slate-700 text-white text-[10px] flex items-center justify-center font-medium">
            +{hiddenCount}
          </div>
        )}
      </div>
    );
  }

  // Show expanded list
  return (
    <div className="flex flex-col gap-1">
      {effects.map((effect) => (
        <StatusEffectIcon key={effect.id} effect={effect} expanded />
      ))}
    </div>
  );
}

/**
 * Displays status effect icons for active board-altering effects.
 * Shows clustered icons that expand on hover to reveal details.
 * Tracks: Mismanaged Mortuary (cemetery swap), Atlantean Fate (flood zones),
 * and other persistent game-state-modifying effects.
 */
export default function PlayerStatusEffects() {
  const [isHovered, setIsHovered] = useState(false);

  const mismanagedMortuaries = useGameStore(
    (s) => s.specialSiteState.mismanagedMortuaries,
  );
  const atlanteanFateAuras = useGameStore(
    (s) => s.specialSiteState.atlanteanFateAuras,
  );
  const gardenOfEdenLocations = useGameStore((s) => s.gardenOfEdenLocations);
  const permanents = useGameStore((s) => s.permanents);
  const boardSites = useGameStore((s) => s.board.sites);

  // Collect all active status effects
  const activeEffects = useMemo(() => {
    const effects: StatusEffect[] = [];

    // --- Mismanaged Mortuary ---
    // Find all active mortuaries (non-silenced AND still on the board)
    const activeMortuaries = mismanagedMortuaries.filter((m) => {
      const siteStillExists = !!boardSites[m.cellKey];
      if (!siteStillExists) return false;
      return !siteHasSilencedToken(m.cellKey, permanents);
    });

    // XOR logic: cemetery swap is active if exactly one player has an active mortuary
    const p1Mortuaries = activeMortuaries.filter((m) => m.ownerSeat === "p1");
    const p2Mortuaries = activeMortuaries.filter((m) => m.ownerSeat === "p2");
    const p1HasMortuary = p1Mortuaries.length > 0;
    const p2HasMortuary = p2Mortuaries.length > 0;
    const cemeterySwapActive = p1HasMortuary !== p2HasMortuary;

    if (cemeterySwapActive) {
      const controllerSeat: PlayerKey = p1HasMortuary ? "p1" : "p2";
      effects.push({
        id: "mortuary-swap",
        imageUrl: MORTUARY_IMAGE_URL,
        title: "Cemeteries Swapped",
        description: "Mismanaged Mortuary active",
        controllerSeat,
        effectType: "mortuary",
      });
    }

    // --- Garden of Eden (draw limit) ---
    // Check for any active Garden of Eden (affects both players)
    for (const seat of ["p1", "p2"] as PlayerKey[]) {
      const entry = gardenOfEdenLocations[seat];
      if (!entry) continue;

      // Check if site still exists on board
      const siteStillExists = !!boardSites[entry.cellKey];
      if (!siteStillExists) continue;

      // Check if silenced
      const isSilenced = siteHasSilencedToken(entry.cellKey, permanents);

      effects.push({
        id: `garden-of-eden-${seat}`,
        imageUrl: GARDEN_OF_EDEN_IMAGE_URL,
        title: "Garden of Eden",
        description: isSilenced
          ? "Effect suppressed"
          : "Draw limit: 1 card/turn",
        controllerSeat: seat,
        effectType: "gardenOfEden",
        isSilenced,
      });
    }

    // --- Atlantean Fate Auras ---
    // Show all active auras (even with 0 flooded sites)
    // Check if each aura is silenced (has Silenced token on its permanent)
    for (const aura of atlanteanFateAuras) {
      // Check if aura still exists on board (has a permanent)
      const permsAtAura = permanents[aura.permanentAt] || [];
      const auraStillExists = permsAtAura.some(
        (p) => String(p.card?.name || "").toLowerCase() === "atlantean fate",
      );
      if (!auraStillExists) continue;

      // Check if aura is silenced
      const isSilenced = permsAtAura.some(
        (p) => String(p.card?.name || "").toLowerCase() === "silenced",
      );

      const floodCount = aura.floodedSites.length;
      const description = isSilenced
        ? "Effect suppressed"
        : floodCount > 0
          ? `${floodCount} site${floodCount !== 1 ? "s" : ""} flooded`
          : "Active (no sites flooded)";

      effects.push({
        id: `atlantean-fate-${aura.id}`,
        imageUrl: ATLANTEAN_FATE_IMAGE_URL,
        title: "Atlantean Fate",
        description,
        controllerSeat: aura.ownerSeat,
        effectType: "atlanteanFate",
        isSilenced,
      });
    }

    // --- Boudicca Passive Aura ---
    // "Other allies have +3 power while successfully attacking sites."
    // Show icon whenever Boudicca is on the board
    for (const [cellKey, cellPerms] of Object.entries(permanents)) {
      const perms = cellPerms || [];
      for (let idx = 0; idx < perms.length; idx++) {
        const perm = perms[idx];
        if (perm.attachedTo) continue;
        if (!isBoudicca(perm.card?.name)) continue;
        const ownerSeat: PlayerKey = perm.owner === 1 ? "p1" : "p2";
        const isSilenced = isPermanentSilenced(
          permanents as Permanents,
          cellKey as CellKey,
          idx,
        );
        effects.push({
          id: `boudicca-${cellKey}-${perm.instanceId || "b"}`,
          imageUrl: BOUDICCA_IMAGE_URL,
          title: "Boudicca",
          description: isSilenced
            ? "Effect suppressed"
            : `Allies get +${BOUDICCA_POWER_BONUS} power attacking sites`,
          controllerSeat: ownerSeat,
          effectType: "boudicca",
          isSilenced,
        });
      }
    }

    // --- Cards with Counters (tracking effects) ---
    // Scan permanents for cards with counters that might indicate tracking
    for (const [cellKey, cellPerms] of Object.entries(permanents)) {
      for (const perm of cellPerms || []) {
        if (perm.counters && perm.counters > 0) {
          const cardName = perm.card?.name || "Unknown";
          const cardNameLower = cardName.toLowerCase();

          // Track cards that have game-state-altering counter tracking
          // Add specific cards here as needed (e.g., "Counting Core")
          if (
            cardNameLower.includes("counting") ||
            cardNameLower.includes("core")
          ) {
            const ownerSeat: PlayerKey = perm.owner === 1 ? "p1" : "p2";
            effects.push({
              id: `counter-${cellKey}-${perm.instanceId || cardName}`,
              imageUrl: getCardImageUrl(perm.card?.slug || "unknown"),
              title: cardName,
              description: `${perm.counters} counter${perm.counters !== 1 ? "s" : ""}`,
              controllerSeat: ownerSeat,
              effectType: "counter",
            });
          }
        }
      }
    }

    return effects;
  }, [
    mismanagedMortuaries,
    atlanteanFateAuras,
    gardenOfEdenLocations,
    permanents,
    boardSites,
  ]);

  if (activeEffects.length === 0) return null;

  return (
    <div
      className="fixed top-4 right-16 z-50 pointer-events-auto cursor-pointer"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div
        className={`transition-all duration-200 ${
          isHovered
            ? "bg-slate-900/95 rounded-xl p-2 shadow-xl border border-slate-700/50"
            : ""
        }`}
      >
        {/* Header when expanded */}
        {isHovered && activeEffects.length > 1 && (
          <div className="text-white/50 text-[10px] uppercase tracking-wider mb-2 px-1">
            Active Effects ({activeEffects.length})
          </div>
        )}
        <ClusteredIcon effects={activeEffects} isExpanded={isHovered} />
      </div>
    </div>
  );
}
