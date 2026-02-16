import type { StateCreator } from "zustand";
import type {
  CellKey,
  GameState,
} from "./types";
import { bumpPermanentVersion } from "./utils/permanentHelpers";

export function isHyperparasite(
  cardName: string | null | undefined,
): boolean {
  if (!cardName) return false;
  return cardName.toLowerCase() === "hyperparasite";
}

/**
 * Hyperparasite-specific slice.
 *
 * Generic carry (carryPickUp / carryDrop) handles attachment mechanics.
 * This slice adds Hyperparasite-specific effects:
 *   - forceDropHyperparasiteCarried: auto-drop + untap on silence/destroy/force-move
 *
 * Movement block lives in permanentMovement.ts (checks isCarried attachments).
 * Disable/re-enable (tap/untap) is handled inline in ContextMenu.tsx onClick handlers.
 */

export type HyperparasiteSlice = Pick<
  GameState,
  "forceDropHyperparasiteCarried"
>;

export const createHyperparasiteSlice: StateCreator<
  GameState,
  [],
  [],
  HyperparasiteSlice
> = (set, get) => ({
  /**
   * Force-drop a carried minion — called before force-moves,
   * silence, or destruction of the Hyperparasite or carried minion.
   * Uses generic carry's isCarried/attachedTo mechanism.
   * Returns true if a drop happened.
   */
  forceDropHyperparasiteCarried: (
    instanceId: string,
    _reason: "silence" | "destroy" | "force-move",
  ) => {
    const state = get();

    // Find the Hyperparasite permanent by instanceId
    let carrierAt: CellKey | null = null;
    let carrierIndex = -1;

    for (const [cellKey, perms] of Object.entries(state.permanents)) {
      for (let i = 0; i < perms.length; i++) {
        const p = perms[i];
        const pId = p.instanceId ?? p.card?.instanceId ?? null;
        if (pId === instanceId && isHyperparasite(p.card?.name)) {
          carrierAt = cellKey as CellKey;
          carrierIndex = i;
          break;
        }
      }
      if (carrierAt) break;
    }

    // Also check if instanceId is a carried minion (attached to a Hyperparasite)
    if (!carrierAt) {
      for (const [cellKey, perms] of Object.entries(state.permanents)) {
        for (let i = 0; i < perms.length; i++) {
          const p = perms[i];
          const pId = p.instanceId ?? p.card?.instanceId ?? null;
          if (pId === instanceId && p.isCarried && p.attachedTo) {
            // Find the carrier
            const carrier = perms[p.attachedTo.index];
            if (carrier && isHyperparasite(carrier.card?.name)) {
              carrierAt = cellKey as CellKey;
              carrierIndex = p.attachedTo.index;
              break;
            }
          }
        }
        if (carrierAt) break;
      }
    }

    if (!carrierAt || carrierIndex === -1) return false;

    // Find all carried units attached to this carrier
    const cellPerms = [...(state.permanents[carrierAt] || [])];
    let dropped = false;

    for (let i = 0; i < cellPerms.length; i++) {
      const p = cellPerms[i];
      if (
        p.isCarried &&
        p.attachedTo?.at === carrierAt &&
        p.attachedTo?.index === carrierIndex
      ) {
        // Detach, clear isCarried, and untap (Hyperparasite-specific re-enable)
        cellPerms[i] = bumpPermanentVersion({
          ...p,
          attachedTo: null,
          isCarried: false,
          tapped: false,
        });
        dropped = true;
      }
    }

    if (!dropped) return false;

    const permanents = { ...state.permanents, [carrierAt]: cellPerms };

    set({ permanents } as Partial<GameState> as GameState);

    get().trySendPatch({
      permanents: { [carrierAt]: cellPerms },
    });

    get().log("Hyperparasite force-drops carried minion");

    return true;
  },
});
