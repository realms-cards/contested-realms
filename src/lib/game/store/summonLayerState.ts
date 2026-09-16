import type { StateCreator } from "zustand";
import { hasKeyword, summonLayerOptions, unitsInRealm } from "@/lib/game/cpu/spells";
import type { BurrowAbility, PermanentPosition } from "../types";
import type { GameState, PendingSummonLayer, ServerPatchT, SummonLayer } from "./types";

type SummonLayerSlice = Pick<
  GameState,
  "pendingSummonLayer" | "beginSummonLayer" | "resolveSummonLayer" | "cancelSummonLayer"
>;

/**
 * The position and ability records for a unit entering `layer`, in the shape playSelectedTo sends
 * in its single placement patch. The ability flags describe what the unit can actually do, printed
 * or granted — not merely the layer it entered — because canTransitionState gates every later
 * burrow/submerge/surface move on them.
 */
export function subsurfaceRecords(
  permanentId: string,
  layer: SummonLayer,
  abilities: { canBurrow: boolean; canSubmerge: boolean },
): { position: PermanentPosition; ability: BurrowAbility } {
  return {
    position: { permanentId, state: layer, position: { x: 0, y: -0.25, z: 0 } },
    ability: {
      permanentId,
      canBurrow: abilities.canBurrow,
      canSubmerge: abilities.canSubmerge,
      // Same convention the context menu uses for these records (requiresWaterSite: canSubmerge).
      requiresWaterSite: abilities.canSubmerge,
      abilitySource: layer === "submerged" ? "Submerge" : "Burrowing",
    },
  };
}

/** The freshly summoned unit, the layers it may enter here, and its region abilities — read
 * against the store as it is now, so granted keywords (a nearby ally, a site) are counted. */
export function summonLayerFor(state: GameState, permanentId: string) {
  const unit = unitsInRealm(state).find(
    (candidate) => candidate.target.kind === "permanent" && candidate.target.instanceId === permanentId,
  );
  if (!unit) return null;
  return {
    unit,
    layers: summonLayerOptions(state, unit),
    abilities: {
      canBurrow: hasKeyword(state, unit, "Burrowing"),
      canSubmerge: hasKeyword(state, unit, "Submerge"),
    },
  };
}

/**
 * Asks the summoning player whether a unit with Submerge or Burrowing should enter the subsurface.
 * Deliberately local to the chooser: it is not synced as a custom message (the server's relay
 * whitelist drops unlisted client types) and not snapshotted, so a reload leaves the unit on the
 * surface, which is always legal. The opponent sees only the resulting position patch.
 */
export const createSummonLayerSlice: StateCreator<GameState, [], [], SummonLayerSlice> = (set, get) => ({
  pendingSummonLayer: null,

  beginSummonLayer: ({ permanentId, at, seat }) => {
    const found = summonLayerFor(get(), permanentId);
    // Nothing to ask: it cannot go below here, or it has already left the realm.
    if (!found || !found.layers.length) return;
    const pending: PendingSummonLayer = { permanentId, at, seat, cardName: found.unit.card.name, layers: found.layers };
    set({ pendingSummonLayer: pending });
  },

  resolveSummonLayer: (layer) => {
    const pending = get().pendingSummonLayer;
    if (!pending) return;
    set({ pendingSummonLayer: null });
    if (layer === "surface") return;
    // Re-check at resolution: the unit may have moved, or lost the ally granting the keyword.
    const found = summonLayerFor(get(), pending.permanentId);
    if (!found || !found.layers.includes(layer)) {
      get().log(`${pending.cardName} can no longer go ${layer === "submerged" ? "underwater" : "underground"}.`);
      return;
    }
    const { position, ability } = subsurfaceRecords(pending.permanentId, layer, found.abilities);
    const permanentPositions = { ...get().permanentPositions, [pending.permanentId]: position };
    const permanentAbilities = { ...get().permanentAbilities, [pending.permanentId]: ability };
    set({ permanentPositions, permanentAbilities });
    // Same full-map shape playSelectedTo sends for a subsurface cast.
    get().trySendPatch({ permanentPositions, permanentAbilities } as ServerPatchT);
    get().log(`${pending.cardName} ${layer === "submerged" ? "submerges" : "burrows"} as it is summoned.`);
  },

  cancelSummonLayer: () => set({ pendingSummonLayer: null }),
});
